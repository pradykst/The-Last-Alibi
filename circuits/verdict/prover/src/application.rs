use ark_bn254::{Bn254, Fr};
use ark_circom::{CircomBuilder, CircomConfig};
use ark_groth16::{Groth16, ProvingKey, VerifyingKey};
use ark_serialize::{CanonicalDeserialize, CanonicalSerialize};
use ark_snark::SNARK;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::error::Error;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_STDIN_BYTES: usize = 16 * 1024;
const PROOF_BYTES: usize = 128;
const QUERY_PUBLIC_FIELDS: usize = 7;
const VERDICT_PUBLIC_FIELDS: usize = 8;
const BN254_SCALAR_MODULUS_LE: [u8; 32] = [
    0x01, 0x00, 0x00, 0xf0, 0x93, 0xf5, 0xe1, 0x43, 0x91, 0x70, 0xb9, 0x79, 0x48, 0xe8, 0x33, 0x28,
    0x5d, 0x58, 0x81, 0x81, 0xb6, 0x45, 0x50, 0xb8, 0x29, 0xa0, 0x31, 0xe1, 0x72, 0x4e, 0x64, 0x30,
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CaseOpening {
    suspect: u8,
    room: u8,
    weapon: u8,
    time: u8,
    salt_hex: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QueryWitness {
    case: CaseOpening,
    session_id_hex: String,
    level_id_hex: String,
    query_nonce: String,
    predicate_id: u8,
    result: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VerdictWitness {
    case: CaseOpening,
    accusation: CaseOpening,
    session_id_hex: String,
    attempt_nonce: String,
    verdict_blob_id_hex: String,
    verdict: bool,
    verdict_salt_hex: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VerificationInput {
    proof_hex: String,
    public_inputs_hex: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProofOutput {
    status: &'static str,
    circuit: &'static str,
    circuit_version: &'static str,
    proof_hex: String,
    public_inputs_hex: String,
    verifier_identity_sha256: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VerificationOutput {
    status: &'static str,
    circuit: &'static str,
    verified: bool,
    verifier_identity_sha256: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactManifest {
    warning: &'static str,
    circuit: &'static str,
    circuit_version: &'static str,
    generated_at_unix_seconds: u64,
    randomness_source: &'static str,
    proving_key_file: String,
    proving_key_sha256: String,
    verifying_key_file: String,
    verifying_key_sha256: String,
    sui_verifier_identity_sha256: String,
    r1cs_sha256: String,
    wasm_sha256: String,
    public_input_fields: usize,
}

fn sanitized_error(message: &'static str) -> Box<dyn Error> {
    message.into()
}

fn read_stdin<T: for<'de> Deserialize<'de>>() -> Result<T, Box<dyn Error>> {
    let mut input = String::new();
    io::stdin()
        .take((MAX_STDIN_BYTES + 1) as u64)
        .read_to_string(&mut input)?;
    if input.len() > MAX_STDIN_BYTES {
        return Err(sanitized_error("input exceeds the permitted size"));
    }
    serde_json::from_str(&input).map_err(|_| sanitized_error("input schema is invalid"))
}

fn decode_hex_exact(
    value: &str,
    expected: usize,
    label: &'static str,
) -> Result<Vec<u8>, Box<dyn Error>> {
    if value.len() != expected * 2 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(sanitized_error(label));
    }
    let bytes = hex::decode(value).map_err(|_| sanitized_error(label))?;
    if bytes.len() != expected {
        return Err(sanitized_error(label));
    }
    Ok(bytes)
}

fn canonical_scalar(value: &str, label: &'static str) -> Result<[u8; 32], Box<dyn Error>> {
    let bytes: [u8; 32] = decode_hex_exact(value, 32, label)?
        .try_into()
        .map_err(|_| sanitized_error(label))?;
    for index in (0..32).rev() {
        if bytes[index] < BN254_SCALAR_MODULUS_LE[index] {
            return Ok(bytes);
        }
        if bytes[index] > BN254_SCALAR_MODULUS_LE[index] {
            return Err(sanitized_error(label));
        }
    }
    Err(sanitized_error(label))
}

fn scalar_limbs(bytes: &[u8; 32]) -> (u128, u128) {
    let low = u128::from_le_bytes(bytes[0..16].try_into().expect("fixed slice"));
    let high = u128::from_le_bytes(bytes[16..32].try_into().expect("fixed slice"));
    (low, high)
}

fn validate_case(
    opening: &CaseOpening,
    label: &'static str,
) -> Result<(u128, u128), Box<dyn Error>> {
    if opening.suspect > 3 || opening.room > 3 || opening.weapon > 1 || opening.time > 1 {
        return Err(sanitized_error(label));
    }
    Ok(scalar_limbs(&canonical_scalar(&opening.salt_hex, label)?))
}

fn parse_u64(value: &str, label: &'static str) -> Result<u64, Box<dyn Error>> {
    if value.is_empty()
        || (value.len() > 1 && value.starts_with('0'))
        || !value.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(sanitized_error(label));
    }
    value.parse::<u64>().map_err(|_| sanitized_error(label))
}

fn query_builder(
    wasm: &str,
    r1cs: &str,
    input: &QueryWitness,
) -> Result<CircomBuilder<Fr>, Box<dyn Error>> {
    let (salt_low, salt_high) = validate_case(&input.case, "case opening is invalid")?;
    let session = decode_hex_exact(&input.session_id_hex, 32, "session ID is invalid")?;
    let level = decode_hex_exact(&input.level_id_hex, 32, "level ID is invalid")?;
    if input.predicate_id >= 12 {
        return Err(sanitized_error("predicate is invalid"));
    }
    let dimension = if input.predicate_id < 4 {
        0
    } else if input.predicate_id < 8 {
        1
    } else if input.predicate_id < 10 {
        2
    } else {
        3
    };
    let value = if input.predicate_id < 4 {
        input.predicate_id
    } else if input.predicate_id < 8 {
        input.predicate_id - 4
    } else if input.predicate_id < 10 {
        input.predicate_id - 8
    } else {
        input.predicate_id - 10
    };
    let mut builder = CircomBuilder::<Fr>::new(CircomConfig::<Fr>::new(wasm, r1cs)?);
    builder.push_input("case_suspect", input.case.suspect);
    builder.push_input("case_room", input.case.room);
    builder.push_input("case_weapon", input.case.weapon);
    builder.push_input("case_time", input.case.time);
    builder.push_input("case_salt_low", salt_low);
    builder.push_input("case_salt_high", salt_high);
    for byte in session {
        builder.push_input("session_id", byte);
    }
    for byte in level {
        builder.push_input("level_id", byte);
    }
    builder.push_input(
        "query_nonce",
        parse_u64(&input.query_nonce, "query nonce is invalid")?,
    );
    builder.push_input("predicate_id", input.predicate_id);
    builder.push_input("predicate_dimension", dimension);
    builder.push_input("predicate_value", value);
    builder.push_input("result_bit", u8::from(input.result));
    Ok(builder)
}

fn verdict_builder(
    wasm: &str,
    r1cs: &str,
    input: &VerdictWitness,
) -> Result<CircomBuilder<Fr>, Box<dyn Error>> {
    let (case_salt_low, case_salt_high) = validate_case(&input.case, "case opening is invalid")?;
    let (accusation_salt_low, accusation_salt_high) =
        validate_case(&input.accusation, "accusation opening is invalid")?;
    let (verdict_salt_low, verdict_salt_high) = scalar_limbs(&canonical_scalar(
        &input.verdict_salt_hex,
        "verdict salt is invalid",
    )?);
    let session = decode_hex_exact(&input.session_id_hex, 32, "session ID is invalid")?;
    let blob = decode_hex_exact(&input.verdict_blob_id_hex, 32, "verdict blob ID is invalid")?;
    let mut builder = CircomBuilder::<Fr>::new(CircomConfig::<Fr>::new(wasm, r1cs)?);
    builder.push_input("case_suspect", input.case.suspect);
    builder.push_input("case_room", input.case.room);
    builder.push_input("case_weapon", input.case.weapon);
    builder.push_input("case_time", input.case.time);
    builder.push_input("case_salt_low", case_salt_low);
    builder.push_input("case_salt_high", case_salt_high);
    builder.push_input("accusation_suspect", input.accusation.suspect);
    builder.push_input("accusation_room", input.accusation.room);
    builder.push_input("accusation_weapon", input.accusation.weapon);
    builder.push_input("accusation_time", input.accusation.time);
    builder.push_input("accusation_salt_low", accusation_salt_low);
    builder.push_input("accusation_salt_high", accusation_salt_high);
    for byte in session {
        builder.push_input("session_id", byte);
    }
    builder.push_input(
        "attempt_nonce",
        parse_u64(&input.attempt_nonce, "attempt nonce is invalid")?,
    );
    for byte in blob {
        builder.push_input("verdict_blob_id", byte);
    }
    builder.push_input("verdict_bit", u8::from(input.verdict));
    builder.push_input("verdict_salt_low", verdict_salt_low);
    builder.push_input("verdict_salt_high", verdict_salt_high);
    Ok(builder)
}

fn serialize<T: CanonicalSerialize>(value: &T) -> Result<Vec<u8>, Box<dyn Error>> {
    let mut bytes = Vec::new();
    value.serialize_compressed(&mut bytes)?;
    Ok(bytes)
}

fn serialize_public_inputs(fields: &[Fr], expected: usize) -> Result<Vec<u8>, Box<dyn Error>> {
    if fields.len() != expected {
        return Err(sanitized_error("circuit public-input count is invalid"));
    }
    let mut bytes = Vec::with_capacity(expected * 32);
    for field in fields {
        field.serialize_compressed(&mut bytes)?;
    }
    if bytes.len() != expected * 32 {
        return Err(sanitized_error("public-input serialization is invalid"));
    }
    Ok(bytes)
}

fn proving_key(path: &str) -> Result<ProvingKey<Bn254>, Box<dyn Error>> {
    let bytes = fs::read(path)?;
    ProvingKey::<Bn254>::deserialize_compressed(bytes.as_slice())
        .map_err(|_| sanitized_error("proving-key artifact is invalid"))
}

fn verifying_key(path: &str) -> Result<(VerifyingKey<Bn254>, Vec<u8>), Box<dyn Error>> {
    let bytes = fs::read(path)?;
    let key = VerifyingKey::<Bn254>::deserialize_compressed(bytes.as_slice())
        .map_err(|_| sanitized_error("verifying-key artifact is invalid"))?;
    Ok((key, bytes))
}

fn prove(
    circuit: ark_circom::CircomCircuit<Fr>,
    pk: &ProvingKey<Bn254>,
    circuit_name: &'static str,
    expected_fields: usize,
) -> Result<ProofOutput, Box<dyn Error>> {
    let fields = circuit
        .get_public_inputs()
        .ok_or_else(|| sanitized_error("circuit did not expose public inputs"))?;
    let proof = Groth16::<Bn254>::prove(pk, circuit, &mut OsRng)?;
    let prepared = Groth16::<Bn254>::process_vk(&pk.vk)?;
    if !Groth16::<Bn254>::verify_with_processed_vk(&prepared, &fields, &proof)? {
        return Err(sanitized_error("generated proof did not verify"));
    }
    let proof_bytes = serialize(&proof)?;
    if proof_bytes.len() != PROOF_BYTES {
        return Err(sanitized_error("proof serialization is invalid"));
    }
    Ok(ProofOutput {
        status: "ok",
        circuit: circuit_name,
        circuit_version: "1",
        proof_hex: hex::encode(proof_bytes),
        public_inputs_hex: hex::encode(serialize_public_inputs(&fields, expected_fields)?),
        verifier_identity_sha256: hex::encode(Sha256::digest(serialize(&pk.vk)?)),
    })
}

fn verify(
    path: &str,
    circuit: &'static str,
    expected_fields: usize,
    input: VerificationInput,
) -> Result<VerificationOutput, Box<dyn Error>> {
    let (vk, vk_bytes) = verifying_key(path)?;
    let proof_bytes = decode_hex_exact(&input.proof_hex, PROOF_BYTES, "proof is malformed")?;
    let public_bytes = decode_hex_exact(
        &input.public_inputs_hex,
        expected_fields * 32,
        "public inputs are malformed",
    )?;
    let proof = ark_groth16::Proof::<Bn254>::deserialize_compressed(proof_bytes.as_slice())
        .map_err(|_| sanitized_error("proof is malformed"))?;
    let mut fields = Vec::with_capacity(expected_fields);
    for scalar in public_bytes.chunks_exact(32) {
        fields.push(
            Fr::deserialize_compressed(scalar)
                .map_err(|_| sanitized_error("public inputs are malformed"))?,
        );
    }
    let prepared = Groth16::<Bn254>::process_vk(&vk)?;
    let verified =
        Groth16::<Bn254>::verify_with_processed_vk(&prepared, &fields, &proof).unwrap_or(false);
    Ok(VerificationOutput {
        status: "ok",
        circuit,
        verified,
        verifier_identity_sha256: hex::encode(Sha256::digest(vk_bytes)),
    })
}

fn sha256_file(path: &Path) -> Result<String, Box<dyn Error>> {
    Ok(hex::encode(Sha256::digest(fs::read(path)?)))
}

fn generate_parameters(
    circuit: ark_circom::CircomCircuit<Fr>,
    circuit_name: &'static str,
    public_fields: usize,
    wasm: &str,
    r1cs: &str,
    output: &Path,
) -> Result<ArtifactManifest, Box<dyn Error>> {
    let parameters =
        Groth16::<Bn254>::generate_random_parameters_with_reduction(circuit, &mut OsRng)?;
    let pk_bytes = serialize(&parameters)?;
    let vk_bytes = serialize(&parameters.vk)?;
    let pk_name = format!("{circuit_name}-v1.pk");
    let vk_name = format!("{circuit_name}-v1.vk");
    fs::write(output.join(&pk_name), &pk_bytes)?;
    fs::write(output.join(&vk_name), &vk_bytes)?;
    let generated_at_unix_seconds = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    Ok(ArtifactManifest {
        warning: "Hackathon/testnet single-party trusted setup. Non-production. No multiparty ceremony occurred.",
        circuit: circuit_name,
        circuit_version: "1",
        generated_at_unix_seconds,
        randomness_source: "operating-system CSPRNG via rand::rngs::OsRng",
        proving_key_file: pk_name,
        proving_key_sha256: hex::encode(Sha256::digest(&pk_bytes)),
        verifying_key_file: vk_name,
        verifying_key_sha256: hex::encode(Sha256::digest(&vk_bytes)),
        sui_verifier_identity_sha256: hex::encode(Sha256::digest(&vk_bytes)),
        r1cs_sha256: sha256_file(Path::new(r1cs))?,
        wasm_sha256: sha256_file(Path::new(wasm))?,
        public_input_fields: public_fields,
    })
}

fn synthetic_query() -> QueryWitness {
    QueryWitness {
        case: CaseOpening {
            suspect: 0,
            room: 0,
            weapon: 0,
            time: 0,
            salt_hex: "01".to_owned() + &"00".repeat(31),
        },
        session_id_hex: "11".repeat(32),
        level_id_hex: "22".repeat(32),
        query_nonce: "0".to_owned(),
        predicate_id: 0,
        result: true,
    }
}

fn synthetic_verdict() -> VerdictWitness {
    VerdictWitness {
        case: CaseOpening {
            suspect: 0,
            room: 0,
            weapon: 0,
            time: 0,
            salt_hex: "01".to_owned() + &"00".repeat(31),
        },
        accusation: CaseOpening {
            suspect: 0,
            room: 0,
            weapon: 0,
            time: 0,
            salt_hex: "02".to_owned() + &"00".repeat(31),
        },
        session_id_hex: "11".repeat(32),
        attempt_nonce: "0".to_owned(),
        verdict_blob_id_hex: "33".repeat(32),
        verdict: true,
        verdict_salt_hex: "03".to_owned() + &"00".repeat(31),
    }
}

fn setup(arguments: &[String]) -> Result<(), Box<dyn Error>> {
    if arguments.len() != 7 {
        return Err(sanitized_error(
            "setup-testnet expects query wasm/r1cs, verdict wasm/r1cs, and output directory",
        ));
    }
    let output = PathBuf::from(&arguments[6]);
    fs::create_dir_all(&output)?;
    let query = generate_parameters(
        query_builder(&arguments[2], &arguments[3], &synthetic_query())?.setup(),
        "query",
        QUERY_PUBLIC_FIELDS,
        &arguments[2],
        &arguments[3],
        &output,
    )?;
    let verdict = generate_parameters(
        verdict_builder(&arguments[4], &arguments[5], &synthetic_verdict())?.setup(),
        "verdict",
        VERDICT_PUBLIC_FIELDS,
        &arguments[4],
        &arguments[5],
        &output,
    )?;
    fs::write(
        output.join("query-v1.manifest.json"),
        serde_json::to_vec_pretty(&query)?,
    )?;
    fs::write(
        output.join("verdict-v1.manifest.json"),
        serde_json::to_vec_pretty(&verdict)?,
    )?;
    println!("{}", serde_json::to_string(&[query, verdict])?);
    Ok(())
}

pub fn handles(command: &str) -> bool {
    matches!(
        command,
        "setup-testnet" | "prove-query" | "verify-query" | "prove-verdict" | "verify-verdict"
    )
}

pub fn run(arguments: &[String]) -> Result<(), Box<dyn Error>> {
    match arguments.get(1).map(String::as_str) {
        Some("setup-testnet") => setup(arguments),
        Some("prove-query") if arguments.len() == 5 => {
            let input = read_stdin::<QueryWitness>()?;
            let pk = proving_key(&arguments[4])?;
            let output = prove(
                query_builder(&arguments[2], &arguments[3], &input)?.build()?,
                &pk,
                "query",
                QUERY_PUBLIC_FIELDS,
            )?;
            println!("{}", serde_json::to_string(&output)?);
            Ok(())
        }
        Some("verify-query") if arguments.len() == 3 => {
            println!(
                "{}",
                serde_json::to_string(&verify(
                    &arguments[2],
                    "query",
                    QUERY_PUBLIC_FIELDS,
                    read_stdin()?
                )?)?
            );
            Ok(())
        }
        Some("prove-verdict") if arguments.len() == 5 => {
            let input = read_stdin::<VerdictWitness>()?;
            let pk = proving_key(&arguments[4])?;
            let output = prove(
                verdict_builder(&arguments[2], &arguments[3], &input)?.build()?,
                &pk,
                "verdict",
                VERDICT_PUBLIC_FIELDS,
            )?;
            println!("{}", serde_json::to_string(&output)?);
            Ok(())
        }
        Some("verify-verdict") if arguments.len() == 3 => {
            println!(
                "{}",
                serde_json::to_string(&verify(
                    &arguments[2],
                    "verdict",
                    VERDICT_PUBLIC_FIELDS,
                    read_stdin()?
                )?)?
            );
            Ok(())
        }
        _ => Err(sanitized_error("application prover command is invalid")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn circuit_path(parts: &[&str]) -> String {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let root = manifest.parent().expect("circuit root");
        parts
            .iter()
            .fold(root.to_path_buf(), |path, part| path.join(part))
            .to_string_lossy()
            .into_owned()
    }

    fn query_paths() -> (String, String, String) {
        (
            circuit_path(&["build", "query", "query_js", "query.wasm"]),
            circuit_path(&["build", "query", "query.r1cs"]),
            circuit_path(&["artifacts", "testnet-v1", "query-v1.pk"]),
        )
    }

    fn verdict_paths() -> (String, String, String) {
        (
            circuit_path(&["build", "verdict", "verdict_js", "verdict.wasm"]),
            circuit_path(&["build", "verdict", "verdict.r1cs"]),
            circuit_path(&["artifacts", "testnet-v1", "verdict-v1.pk"]),
        )
    }

    fn opening(suspect: u8, room: u8, weapon: u8, time: u8, salt: u8) -> CaseOpening {
        CaseOpening {
            suspect,
            room,
            weapon,
            time,
            salt_hex: format!("{salt:02x}{}", "00".repeat(31)),
        }
    }

    fn query(predicate_id: u8, result: bool) -> QueryWitness {
        QueryWitness {
            case: opening(1, 2, 1, 0, 7),
            session_id_hex: "11".repeat(32),
            level_id_hex: "22".repeat(32),
            query_nonce: "9".to_owned(),
            predicate_id,
            result,
        }
    }

    fn prove_query(
        input: &QueryWitness,
    ) -> (ark_groth16::Proof<Bn254>, Vec<Fr>, ProvingKey<Bn254>) {
        let (wasm, r1cs, pk_path) = query_paths();
        let pk = proving_key(&pk_path).expect("query key");
        let circuit = query_builder(&wasm, &r1cs, input)
            .expect("query builder")
            .build()
            .expect("query circuit");
        let fields = circuit.get_public_inputs().expect("query fields");
        let proof = Groth16::<Bn254>::prove(&pk, circuit, &mut OsRng).expect("query proof");
        (proof, fields, pk)
    }

    #[test]
    fn every_registered_predicate_dimension_builds_its_actual_result() {
        let (wasm, r1cs, _) = query_paths();
        let expected = [
            false, true, false, false, false, false, true, false, false, true, true, false,
        ];
        for (predicate_id, result) in expected.into_iter().enumerate() {
            let circuit = query_builder(&wasm, &r1cs, &query(predicate_id as u8, result))
                .expect("query builder")
                .build()
                .expect("query circuit");
            let fields = circuit.get_public_inputs().expect("query fields");
            assert_eq!(fields.len(), QUERY_PUBLIC_FIELDS);
            assert_eq!(fields[6], Fr::from(u8::from(result)));
        }
    }

    #[test]
    fn valid_yes_and_no_queries_prove_and_public_binding_mutations_fail() {
        let (yes_proof, yes_fields, yes_pk) = prove_query(&query(1, true));
        assert!(
            Groth16::<Bn254>::verify(&yes_pk.vk, &yes_fields, &yes_proof)
                .expect("YES query verification")
        );
        for index in [0usize, 2, 4, 6] {
            let mut altered = yes_fields.clone();
            altered[index] += Fr::from(1u64);
            assert!(
                !Groth16::<Bn254>::verify(&yes_pk.vk, &altered, &yes_proof)
                    .expect("negative query verification")
            );
        }
        let (no_proof, no_fields, no_pk) = prove_query(&query(0, false));
        assert!(
            Groth16::<Bn254>::verify(&no_pk.vk, &no_fields, &no_proof)
                .expect("NO query verification")
        );
    }
    fn verdict(verdict: bool) -> VerdictWitness {
        VerdictWitness {
            case: opening(2, 1, 0, 1, 9),
            accusation: if verdict {
                opening(2, 1, 0, 1, 10)
            } else {
                opening(3, 1, 0, 1, 10)
            },
            session_id_hex: "44".repeat(32),
            attempt_nonce: "17".to_owned(),
            verdict_blob_id_hex: "55".repeat(32),
            verdict,
            verdict_salt_hex: "0b".to_owned() + &"00".repeat(31),
        }
    }

    fn prove_verdict(
        input: &VerdictWitness,
    ) -> (ark_groth16::Proof<Bn254>, Vec<Fr>, ProvingKey<Bn254>) {
        let (wasm, r1cs, pk_path) = verdict_paths();
        let pk = proving_key(&pk_path).expect("verdict key");
        let circuit = verdict_builder(&wasm, &r1cs, input)
            .expect("verdict builder")
            .build()
            .expect("verdict circuit");
        let fields = circuit.get_public_inputs().expect("verdict fields");
        let proof = Groth16::<Bn254>::prove(&pk, circuit, &mut OsRng).expect("verdict proof");
        (proof, fields, pk)
    }

    #[test]
    fn arbitrary_non_fixture_yes_and_no_verdicts_prove_and_bind_public_inputs() {
        let (yes_proof, yes_fields, yes_pk) = prove_verdict(&verdict(true));
        assert!(
            Groth16::<Bn254>::verify(&yes_pk.vk, &yes_fields, &yes_proof)
                .expect("YES verdict verification")
        );
        for index in [2usize, 4, 6] {
            let mut altered = yes_fields.clone();
            altered[index] += Fr::from(1u64);
            assert!(
                !Groth16::<Bn254>::verify(&yes_pk.vk, &altered, &yes_proof)
                    .expect("negative verdict verification")
            );
        }
        let (no_proof, no_fields, no_pk) = prove_verdict(&verdict(false));
        assert!(
            Groth16::<Bn254>::verify(&no_pk.vk, &no_fields, &no_proof)
                .expect("NO verdict verification")
        );
    }
    #[test]
    fn malformed_witnesses_fail_before_proving() {
        let (wasm, r1cs, _) = query_paths();
        let malformed = QueryWitness {
            case: opening(4, 0, 0, 0, 1),
            ..query(0, false)
        };
        assert!(query_builder(&wasm, &r1cs, &malformed).is_err());
    }
}

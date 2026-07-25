use ark_bn254::{Bn254, Fr};
use ark_circom::{CircomBuilder, CircomConfig};
use ark_groth16::{Groth16, ProvingKey};
use ark_serialize::CanonicalSerialize;
use ark_snark::SNARK;
use rand::SeedableRng;
use rand_chacha::ChaCha20Rng;
use sha2::{Digest, Sha256};
use std::error::Error;
use std::fmt::Write as _;
use std::fs;

const PARAMETER_SEED: [u8; 32] = *b"alibi-z1-verdict-setup-v1!!!!!!!";
const YES_PROOF_SEED: [u8; 32] = *b"alibi-z1-verdict-proof-yes-v1!!!";
const NO_PROOF_SEED: [u8; 32] = *b"alibi-z1-verdict-proof-no-v1!!!!";
const WRONG_KEY_SEED: [u8; 32] = *b"alibi-z1-wrong-key-setup-v1!!!!!";

const CASE_SUSPECT: u64 = 3;
const CASE_ROOM: u64 = 2;
const CASE_WEAPON: u64 = 1;
const CASE_TIME: u64 = 0;
const CASE_SALT_LOW: u128 = 0x1234_5678_90ab_cdef;
const ACCUSATION_SALT_LOW: u128 = 0x0102_0304_0506_0708;
const YES_VERDICT_SALT_LOW: u128 = 0x9988_7766_5544_3322;
const NO_VERDICT_SALT_LOW: u128 = 0xaabb_ccdd_eeff_0011;
const ATTEMPT_NONCE: u64 = 0;
const SESSION_ID: [u8; 32] = [
    0x81, 0x5d, 0xf4, 0x99, 0x79, 0xfa, 0x95, 0x1b, 0xb3, 0x8c, 0x69, 0xb0, 0x31, 0x9a, 0x9a, 0x6d,
    0x3a, 0xf7, 0x8f, 0x43, 0xec, 0xa3, 0x70, 0x1a, 0x69, 0x6f, 0x81, 0x4e, 0x96, 0x70, 0x09, 0x99,
];

// Raw bytes decoded from the canonical URL-safe Walrus content blob ID
// M4hsZGQ1oCktdzegB6HnI6Mi28S2nqOPHxK-W7_4BUk.
// Walrus interprets these bytes as a big-endian u256; Sui BCS serializes
// that numeric value in little-endian order.
const VERDICT_BLOB_ID: [u8; 32] = [
    0x33, 0x88, 0x6c, 0x64, 0x64, 0x35, 0xa0, 0x29, 0x2d, 0x77, 0x37, 0xa0, 0x07, 0xa1, 0xe7, 0x23,
    0xa3, 0x22, 0xdb, 0xc4, 0xb6, 0x9e, 0xa3, 0x8f, 0x1f, 0x12, 0xbe, 0x5b, 0xbf, 0xf8, 0x05, 0x49,
];

#[derive(Clone, Copy)]
struct Accusation {
    suspect: u64,
    room: u64,
    weapon: u64,
    time: u64,
}

struct Fixture {
    proof: Vec<u8>,
    public_inputs: Vec<u8>,
    case_commitment: Vec<u8>,
    accusation_commitment: Vec<u8>,
    session_attempt_domain_commitment: Vec<u8>,
    verdict_commitment: Vec<u8>,
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn serialize_compressed<T: CanonicalSerialize>(value: &T) -> Result<Vec<u8>, Box<dyn Error>> {
    let mut bytes = Vec::new();
    value.serialize_compressed(&mut bytes)?;
    Ok(bytes)
}

fn verdict_builder(
    wasm: &str,
    r1cs: &str,
    accusation: Accusation,
    verdict: u64,
    verdict_salt_low: u128,
) -> Result<CircomBuilder<Fr>, Box<dyn Error>> {
    let config = CircomConfig::<Fr>::new(wasm, r1cs)?;
    let mut builder = CircomBuilder::new(config);
    builder.push_input("case_suspect", CASE_SUSPECT);
    builder.push_input("case_room", CASE_ROOM);
    builder.push_input("case_weapon", CASE_WEAPON);
    builder.push_input("case_time", CASE_TIME);
    builder.push_input("case_salt_low", CASE_SALT_LOW);
    builder.push_input("case_salt_high", 0u64);

    builder.push_input("accusation_suspect", accusation.suspect);
    builder.push_input("accusation_room", accusation.room);
    builder.push_input("accusation_weapon", accusation.weapon);
    builder.push_input("accusation_time", accusation.time);
    builder.push_input("accusation_salt_low", ACCUSATION_SALT_LOW);
    builder.push_input("accusation_salt_high", 0u64);

    for byte in SESSION_ID {
        builder.push_input("session_id", u64::from(byte));
    }
    builder.push_input("attempt_nonce", ATTEMPT_NONCE);
    for byte in VERDICT_BLOB_ID {
        builder.push_input("verdict_blob_id", u64::from(byte));
    }
    builder.push_input("verdict_bit", verdict);
    builder.push_input("verdict_salt_low", verdict_salt_low);
    builder.push_input("verdict_salt_high", 0u64);
    Ok(builder)
}

fn commitment_from_public_inputs(public_inputs: &[u8], first_field: usize) -> Vec<u8> {
    let mut commitment = Vec::with_capacity(32);
    let low_offset = first_field * 32;
    let high_offset = (first_field + 1) * 32;
    commitment.extend_from_slice(&public_inputs[low_offset..low_offset + 16]);
    commitment.extend_from_slice(&public_inputs[high_offset..high_offset + 16]);
    commitment
}

fn create_fixture(
    parameters: &ProvingKey<Bn254>,
    builder: CircomBuilder<Fr>,
    proof_seed: [u8; 32],
) -> Result<Fixture, Box<dyn Error>> {
    let circuit = builder.build()?;
    let public_fields = circuit
        .get_public_inputs()
        .ok_or("verdict circuit did not expose public inputs")?;
    if public_fields.len() != 8 {
        return Err(format!(
            "expected eight public inputs, found {}",
            public_fields.len()
        )
        .into());
    }

    let mut proof_rng = ChaCha20Rng::from_seed(proof_seed);
    let proof = Groth16::<Bn254>::prove(parameters, circuit, &mut proof_rng)?;
    let prepared = Groth16::<Bn254>::process_vk(&parameters.vk)?;
    if !Groth16::<Bn254>::verify_with_processed_vk(&prepared, &public_fields, &proof)? {
        return Err("verdict proof failed Arkworks verification".into());
    }

    let proof_bytes = serialize_compressed(&proof)?;
    let mut public_input_bytes = Vec::with_capacity(256);
    for field in &public_fields {
        field.serialize_compressed(&mut public_input_bytes)?;
    }
    if proof_bytes.len() != 128 || public_input_bytes.len() != 256 {
        return Err(format!(
            "unexpected serialization lengths: proof={}, inputs={}",
            proof_bytes.len(),
            public_input_bytes.len()
        )
        .into());
    }
    for field in public_input_bytes.chunks_exact(32) {
        if field[16..].iter().any(|byte| *byte != 0) {
            return Err("a public-input limb exceeded 128 bits".into());
        }
    }

    Ok(Fixture {
        case_commitment: commitment_from_public_inputs(&public_input_bytes, 0),
        accusation_commitment: commitment_from_public_inputs(&public_input_bytes, 2),
        session_attempt_domain_commitment: commitment_from_public_inputs(&public_input_bytes, 4),
        verdict_commitment: commitment_from_public_inputs(&public_input_bytes, 6),
        proof: proof_bytes,
        public_inputs: public_input_bytes,
    })
}

fn write_fixture(manifest: &mut String, name: &str, fixture: &Fixture, comma: bool) {
    let suffix = if comma { "," } else { "" };
    writeln!(manifest, "  \"{name}\": {{").unwrap();
    writeln!(
        manifest,
        "    \"proof_points_hex\": \"{}\",",
        hex::encode(&fixture.proof)
    )
    .unwrap();
    writeln!(
        manifest,
        "    \"public_inputs_hex\": \"{}\",",
        hex::encode(&fixture.public_inputs)
    )
    .unwrap();
    writeln!(
        manifest,
        "    \"case_commitment_hex\": \"{}\",",
        hex::encode(&fixture.case_commitment)
    )
    .unwrap();
    writeln!(
        manifest,
        "    \"accusation_commitment_hex\": \"{}\",",
        hex::encode(&fixture.accusation_commitment)
    )
    .unwrap();
    writeln!(
        manifest,
        "    \"session_attempt_domain_commitment_hex\": \"{}\",",
        hex::encode(&fixture.session_attempt_domain_commitment)
    )
    .unwrap();
    writeln!(
        manifest,
        "    \"verdict_commitment_hex\": \"{}\",",
        hex::encode(&fixture.verdict_commitment)
    )
    .unwrap();
    writeln!(
        manifest,
        "    \"proof_points_sha256\": \"{}\",",
        sha256_hex(&fixture.proof)
    )
    .unwrap();
    writeln!(
        manifest,
        "    \"public_inputs_sha256\": \"{}\"",
        sha256_hex(&fixture.public_inputs)
    )
    .unwrap();
    writeln!(manifest, "  }}{suffix}").unwrap();
}

pub fn run(wasm: &str, r1cs: &str) -> Result<(), Box<dyn Error>> {
    let setup_builder = verdict_builder(
        wasm,
        r1cs,
        Accusation {
            suspect: CASE_SUSPECT,
            room: CASE_ROOM,
            weapon: CASE_WEAPON,
            time: CASE_TIME,
        },
        1,
        YES_VERDICT_SALT_LOW,
    )?;
    let setup_circuit = setup_builder.setup();
    let mut setup_rng = ChaCha20Rng::from_seed(PARAMETER_SEED);
    let parameters =
        Groth16::<Bn254>::generate_random_parameters_with_reduction(setup_circuit, &mut setup_rng)?;

    let yes = create_fixture(
        &parameters,
        verdict_builder(
            wasm,
            r1cs,
            Accusation {
                suspect: CASE_SUSPECT,
                room: CASE_ROOM,
                weapon: CASE_WEAPON,
                time: CASE_TIME,
            },
            1,
            YES_VERDICT_SALT_LOW,
        )?,
        YES_PROOF_SEED,
    )?;
    let no = create_fixture(
        &parameters,
        verdict_builder(
            wasm,
            r1cs,
            Accusation {
                suspect: 2,
                room: CASE_ROOM,
                weapon: CASE_WEAPON,
                time: CASE_TIME,
            },
            0,
            NO_VERDICT_SALT_LOW,
        )?,
        NO_PROOF_SEED,
    )?;

    let wrong_setup_builder = verdict_builder(
        wasm,
        r1cs,
        Accusation {
            suspect: CASE_SUSPECT,
            room: CASE_ROOM,
            weapon: CASE_WEAPON,
            time: CASE_TIME,
        },
        1,
        YES_VERDICT_SALT_LOW,
    )?;
    let mut wrong_setup_rng = ChaCha20Rng::from_seed(WRONG_KEY_SEED);
    let wrong_parameters = Groth16::<Bn254>::generate_random_parameters_with_reduction(
        wrong_setup_builder.setup(),
        &mut wrong_setup_rng,
    )?;
    let wrong_key = create_fixture(
        &wrong_parameters,
        verdict_builder(
            wasm,
            r1cs,
            Accusation {
                suspect: CASE_SUSPECT,
                room: CASE_ROOM,
                weapon: CASE_WEAPON,
                time: CASE_TIME,
            },
            1,
            YES_VERDICT_SALT_LOW,
        )?,
        YES_PROOF_SEED,
    )?;

    let verifying_key = serialize_compressed(&parameters.vk)?;
    let wrong_verifying_key = serialize_compressed(&wrong_parameters.vk)?;
    let r1cs_bytes = fs::read(r1cs)?;
    let wasm_bytes = fs::read(wasm)?;
    let verifier_identity = Sha256::digest(&verifying_key);

    let mut manifest = String::new();
    writeln!(manifest, "{{")?;
    writeln!(
        manifest,
        "  \"warning\": \"TEST/DEVELOPMENT PARAMETERS ONLY. INSECURE FOR PRODUCTION. NO TRUSTED-SETUP CEREMONY HAS BEEN PERFORMED.\","
    )?;
    writeln!(
        manifest,
        "  \"parameter_seed_hex\": \"{}\",",
        hex::encode(PARAMETER_SEED)
    )?;
    writeln!(
        manifest,
        "  \"verifying_key_hex\": \"{}\",",
        hex::encode(&verifying_key)
    )?;
    writeln!(
        manifest,
        "  \"verifying_key_sha256\": \"{}\",",
        sha256_hex(&verifying_key)
    )?;
    writeln!(
        manifest,
        "  \"verdict_verifier_id_hex\": \"{}\",",
        hex::encode(verifier_identity)
    )?;
    writeln!(
        manifest,
        "  \"wrong_verifying_key_hex\": \"{}\",",
        hex::encode(&wrong_verifying_key)
    )?;
    writeln!(
        manifest,
        "  \"wrong_verifying_key_sha256\": \"{}\",",
        sha256_hex(&wrong_verifying_key)
    )?;
    writeln!(
        manifest,
        "  \"r1cs_sha256\": \"{}\",",
        sha256_hex(&r1cs_bytes)
    )?;
    writeln!(
        manifest,
        "  \"wasm_sha256\": \"{}\",",
        sha256_hex(&wasm_bytes)
    )?;
    writeln!(
        manifest,
        "  \"public_input_layout\": \"case.low,case.high,accusation.low,accusation.high,session_attempt.low,session_attempt.high,verdict.low,verdict.high; u128 limbs; each scalar 32-byte little-endian\","
    )?;
    writeln!(
        manifest,
        "  \"session_id_hex\": \"{}\",",
        hex::encode(SESSION_ID)
    )?;
    writeln!(manifest, "  \"attempt_nonce\": {ATTEMPT_NONCE},")?;
    writeln!(
        manifest,
        "  \"verdict_blob_id_base64url\": \"M4hsZGQ1oCktdzegB6HnI6Mi28S2nqOPHxK-W7_4BUk\","
    )?;
    writeln!(
        manifest,
        "  \"verdict_blob_id_raw_hex\": \"{}\",",
        hex::encode(VERDICT_BLOB_ID)
    )?;
    write_fixture(&mut manifest, "yes", &yes, true);
    write_fixture(&mut manifest, "no", &no, true);
    write_fixture(&mut manifest, "wrong_key_yes", &wrong_key, false);
    writeln!(manifest, "}}")?;

    fs::create_dir_all("artifacts/z1-verdict")?;
    fs::write("artifacts/z1-verdict/fixtures.json", manifest)?;
    println!("Arkworks YES, NO, and wrong-key verdict proofs verified and serialized");
    println!("vk_bytes={}", verifying_key.len());
    println!("proof_bytes={}", yes.proof.len());
    println!("public_input_bytes={}", yes.public_inputs.len());
    println!("verdict_verifier_id={}", hex::encode(verifier_identity));
    Ok(())
}

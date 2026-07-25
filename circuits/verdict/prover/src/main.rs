mod verdict;

use ark_bn254::{Bn254, Fr};
use ark_circom::{CircomBuilder, CircomConfig};
use ark_groth16::Groth16;
use ark_serialize::CanonicalSerialize;
use ark_snark::SNARK;
use rand::SeedableRng;
use rand_chacha::ChaCha20Rng;
use sha2::{Digest, Sha256};
use std::env;
use std::error::Error;
use std::fmt::Write as _;
use std::fs;

const DEVELOPMENT_SEED: [u8; 32] = *b"alibi-z1-dev-setup-seed-v1!!!!!!";

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn quoted_hex(bytes: &[u8]) -> String {
    format!("\"{}\"", hex::encode(bytes))
}

fn main() -> Result<(), Box<dyn Error>> {
    let arguments = env::args().collect::<Vec<_>>();
    if arguments.len() == 4 && arguments[1] == "verdict" {
        return verdict::run(&arguments[2], &arguments[3]);
    }

    if arguments.len() != 4 || arguments[1] != "smoke" {
        return Err("usage: alibi-verdict-prover <smoke|verdict> <wasm> <r1cs>".into());
    }

    let config = CircomConfig::<Fr>::new(&arguments[2], &arguments[3])?;
    let mut builder = CircomBuilder::new(config);
    builder.push_input("left", 3u64);
    builder.push_input("right", 11u64);

    let setup_circuit = builder.setup();
    let mut rng = ChaCha20Rng::from_seed(DEVELOPMENT_SEED);
    let parameters =
        Groth16::<Bn254>::generate_random_parameters_with_reduction(setup_circuit, &mut rng)?;

    let proof_circuit = builder.build()?;
    let public_inputs = proof_circuit
        .get_public_inputs()
        .ok_or("smoke circuit did not expose public inputs")?;
    let proof = Groth16::<Bn254>::prove(&parameters, proof_circuit, &mut rng)?;
    let prepared = Groth16::<Bn254>::process_vk(&parameters.vk)?;
    let verified = Groth16::<Bn254>::verify_with_processed_vk(&prepared, &public_inputs, &proof)?;
    if !verified {
        return Err("deterministic smoke proof failed Arkworks verification".into());
    }

    let mut verifying_key = Vec::new();
    parameters.vk.serialize_compressed(&mut verifying_key)?;
    let mut proof_points = Vec::new();
    proof.serialize_compressed(&mut proof_points)?;
    let mut public_input_bytes = Vec::new();
    for public_input in &public_inputs {
        public_input.serialize_compressed(&mut public_input_bytes)?;
    }

    if proof_points.len() != 128 {
        return Err(format!("unexpected BN254 proof length: {}", proof_points.len()).into());
    }
    if public_input_bytes.len() != public_inputs.len() * 32 {
        return Err("public inputs were not serialized as 32-byte scalars".into());
    }

    let mut manifest = String::new();
    writeln!(manifest, "{{")?;
    writeln!(
        manifest,
        "  \"warning\": \"TEST/DEVELOPMENT PARAMETERS ONLY. INSECURE FOR PRODUCTION. NO TRUSTED-SETUP CEREMONY HAS BEEN PERFORMED.\","
    )?;
    writeln!(
        manifest,
        "  \"seed_hex\": {},",
        quoted_hex(&DEVELOPMENT_SEED)
    )?;
    writeln!(
        manifest,
        "  \"verifying_key_hex\": {},",
        quoted_hex(&verifying_key)
    )?;
    writeln!(
        manifest,
        "  \"proof_points_hex\": {},",
        quoted_hex(&proof_points)
    )?;
    writeln!(
        manifest,
        "  \"public_inputs_hex\": {},",
        quoted_hex(&public_input_bytes)
    )?;
    writeln!(
        manifest,
        "  \"verifying_key_sha256\": \"{}\",",
        sha256_hex(&verifying_key)
    )?;
    writeln!(
        manifest,
        "  \"proof_points_sha256\": \"{}\",",
        sha256_hex(&proof_points)
    )?;
    writeln!(
        manifest,
        "  \"public_inputs_sha256\": \"{}\"",
        sha256_hex(&public_input_bytes)
    )?;
    writeln!(manifest, "}}")?;

    fs::create_dir_all("artifacts/z1-smoke")?;
    fs::write("artifacts/z1-smoke/native-smoke.json", manifest)?;
    println!("Arkworks smoke proof verified and serialized");
    println!("vk_bytes={}", verifying_key.len());
    println!("proof_bytes={}", proof_points.len());
    println!("public_input_bytes={}", public_input_bytes.len());
    Ok(())
}

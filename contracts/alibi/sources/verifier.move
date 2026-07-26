module alibi::verifier;

use std::hash;
use sui::bcs;
use sui::groth16;
use sui::hash::blake2b256;

use alibi::query_verifying_key;
use alibi::verdict_verifying_key;

const EInvalidPredicate: u64 = 20;
const EInvalidCommitment: u64 = 21;
const EInvalidProof: u64 = 22;
const EInvalidVerifierIdentity: u64 = 23;

const COMMITMENT_LENGTH: u64 = 32;
const PROOF_LENGTH: u64 = 128;
const QUERY_PUBLIC_INPUT_LENGTH: u64 = 224;
const QUERY_SESSION_DOMAIN: vector<u8> =
    b"the-last-alibi::query::session-context::v1";
const BN254_SCALAR_MODULUS_LE: vector<u8> =
    x"010000f093f5e1439170b97948e833285d588181b64550b829a031e1724e6430";

/// Unforgeable, single-use authorization for one proof-backed query result.
public struct QueryProofReceipt {
    receipt_version: u16,
    session: ID,
    level: ID,
    predicate_id: u8,
    query_nonce: u64,
    pre_candidate_mask: u64,
    result: bool,
    verifier_identity: vector<u8>,
}

/// Unforgeable, single-use authorization for one proof-backed terminal verdict.
public struct VerdictProofReceipt {
    receipt_version: u16,
    session: ID,
    level: ID,
    attempt_nonce: u64,
    case_commitment: vector<u8>,
    accusation_commitment: vector<u8>,
    session_attempt_domain_commitment: vector<u8>,
    verdict_commitment: vector<u8>,
    encrypted_verdict_blob_id: u256,
    verifier_identity: vector<u8>,
    verifier_status: u8,
}

/// Verifies a registered-query statement under the pinned hackathon/testnet key.
public fun verify_query_proof(
    receipt_version: u16,
    session: ID,
    level: ID,
    case_commitment: vector<u8>,
    predicate_id: u8,
    query_nonce: u64,
    pre_candidate_mask: u64,
    result: bool,
    expected_verifier_identity: vector<u8>,
    proof: vector<u8>,
): QueryProofReceipt {
    assert_canonical_field_commitment(&case_commitment);
    assert!(predicate_id < 12, EInvalidPredicate);
    assert!(proof.length() == PROOF_LENGTH, EInvalidProof);
    let verifier_identity = query_verifier_identity();
    assert!(expected_verifier_identity == verifier_identity, EInvalidVerifierIdentity);
    assert!(hash::sha2_256(query_verifying_key::bytes()) == verifier_identity, EInvalidVerifierIdentity);
    let public_input_bytes = query_public_inputs(
        &case_commitment,
        session,
        level,
        predicate_id,
        query_nonce,
        result,
    );
    let curve = groth16::bn254();
    let prepared_key = groth16::prepare_verifying_key(&curve, &query_verifying_key::bytes());
    let proof_points = groth16::proof_points_from_bytes(proof);
    let public_inputs = groth16::public_proof_inputs_from_bytes(public_input_bytes);
    assert!(
        groth16::verify_groth16_proof(&curve, &prepared_key, &public_inputs, &proof_points),
        EInvalidProof,
    );
    QueryProofReceipt {
        receipt_version,
        session,
        level,
        predicate_id,
        query_nonce,
        pre_candidate_mask,
        result,
        verifier_identity,
    }
}

/// Returns the immutable registered-query verifier identity.
public fun query_verifier_identity(): vector<u8> {
    query_verifying_key::identity()
}

/// Verifies the Z1 accusation-verdict statement under the application-pinned key.
/// The four commitments are encoded as eight little-endian u128 public scalars.
public(package) fun verify_verdict_proof(
    receipt_version: u16,
    session: ID,
    level: ID,
    attempt_nonce: u64,
    case_commitment: vector<u8>,
    accusation_commitment: vector<u8>,
    session_attempt_domain_commitment: vector<u8>,
    verdict_commitment: vector<u8>,
    encrypted_verdict_blob_id: u256,
    proof: vector<u8>,
): VerdictProofReceipt {
    assert_canonical_field_commitment(&case_commitment);
    assert_canonical_field_commitment(&accusation_commitment);
    assert_commitment_length(&session_attempt_domain_commitment);
    assert_canonical_field_commitment(&verdict_commitment);
    assert!(proof.length() == PROOF_LENGTH, EInvalidProof);

    let verifier_identity = verdict_verifier_identity();
    let derived_identity = hash::sha2_256(verdict_verifying_key::bytes());
    assert!(derived_identity == verifier_identity, EInvalidVerifierIdentity);

    let public_input_bytes = verdict_public_inputs(
        &case_commitment,
        &accusation_commitment,
        &session_attempt_domain_commitment,
        &verdict_commitment,
    );
    let curve = groth16::bn254();
    let verifying_key = verdict_verifying_key::bytes();
    let prepared_key = groth16::prepare_verifying_key(&curve, &verifying_key);
    let proof_points = groth16::proof_points_from_bytes(proof);
    let public_inputs = groth16::public_proof_inputs_from_bytes(public_input_bytes);
    assert!(
        groth16::verify_groth16_proof(&curve, &prepared_key, &public_inputs, &proof_points),
        EInvalidProof,
    );

    VerdictProofReceipt {
        receipt_version,
        session,
        level,
        attempt_nonce,
        case_commitment,
        accusation_commitment,
        session_attempt_domain_commitment,
        verdict_commitment,
        encrypted_verdict_blob_id,
        verifier_identity,
        verifier_status: 1,
    }
}

/// Returns the immutable identity expected by the Z1 level configuration.
public fun verdict_verifier_identity(): vector<u8> {
    verdict_verifying_key::identity()
}

public(package) fun consume(
    receipt: QueryProofReceipt,
): (u16, ID, ID, u8, u64, u64, bool, vector<u8>) {
    let QueryProofReceipt {
        receipt_version,
        session,
        level,
        predicate_id,
        query_nonce,
        pre_candidate_mask,
        result,
        verifier_identity,
    } = receipt;
    (
        receipt_version,
        session,
        level,
        predicate_id,
        query_nonce,
        pre_candidate_mask,
        result,
        verifier_identity,
    )
}

public(package) fun consume_verdict(
    receipt: VerdictProofReceipt,
): (
    u16,
    ID,
    ID,
    u64,
    vector<u8>,
    vector<u8>,
    vector<u8>,
    vector<u8>,
    u256,
    vector<u8>,
    u8,
) {
    let VerdictProofReceipt {
        receipt_version,
        session,
        level,
        attempt_nonce,
        case_commitment,
        accusation_commitment,
        session_attempt_domain_commitment,
        verdict_commitment,
        encrypted_verdict_blob_id,
        verifier_identity,
        verifier_status,
    } = receipt;
    (
        receipt_version,
        session,
        level,
        attempt_nonce,
        case_commitment,
        accusation_commitment,
        session_attempt_domain_commitment,
        verdict_commitment,
        encrypted_verdict_blob_id,
        verifier_identity,
        verifier_status,
    )
}

fun query_public_inputs(
    case_commitment: &vector<u8>,
    session: ID,
    level: ID,
    predicate_id: u8,
    query_nonce: u64,
    result: bool,
): vector<u8> {
    let domain_commitment = session_query_domain_commitment(session, level, query_nonce);
    let predicate_commitment = registered_predicate_commitment(predicate_id);
    assert_canonical_field_commitment(case_commitment);
    assert_canonical_field_commitment(&predicate_commitment);
    let mut public_inputs = vector[];
    append_commitment_limbs(&mut public_inputs, case_commitment);
    append_commitment_limbs(&mut public_inputs, &domain_commitment);
    append_commitment_limbs(&mut public_inputs, &predicate_commitment);
    public_inputs.push_back(if (result) { 1 } else { 0 });
    let mut padding = 0u64;
    while (padding < 31) {
        public_inputs.push_back(0);
        padding = padding + 1;
    };
    assert!(public_inputs.length() == QUERY_PUBLIC_INPUT_LENGTH, EInvalidCommitment);
    public_inputs
}

fun session_query_domain_commitment(session: ID, level: ID, query_nonce: u64): vector<u8> {
    let mut input = QUERY_SESSION_DOMAIN;
    input.push_back(0);
    input.push_back(0);
    input.append(bcs::to_bytes(&session));
    input.append(bcs::to_bytes(&level));
    input.append(bcs::to_bytes(&query_nonce));
    input.append(bcs::to_bytes(&1u16));
    input.append(bcs::to_bytes(&1u16));
    assert!(input.length() == 120, EInvalidCommitment);
    blake2b256(&input)
}

fun registered_predicate_commitment(predicate_id: u8): vector<u8> {
    if (predicate_id == 0) x"da5c234e63ff5bd28a72a3097f982bc218292f9af7b07b9bcfcf11ae72096226"
    else if (predicate_id == 1) x"5a5d6ac0bcadd7fdefc851f470b9fed01bd2fbce94d654816b80c4856c2a9028"
    else if (predicate_id == 2) x"550801df7e0ee73e2b9ad9c083a759abce34183017baa6ed134182e9a0a18025"
    else if (predicate_id == 3) x"2d40e3d3bd91fc747989e837e99698c5f79d53dce8aea4fdd65abf5b6ee25427"
    else if (predicate_id == 4) x"8d20390c86fbbb649c71202f4ca1ac529988e05df385aab24f33962a35d15627"
    else if (predicate_id == 5) x"de9918ebb0014e6f03fdc77ec61263d559cc6396df2f0096b225373757beb10f"
    else if (predicate_id == 6) x"c572d76de43218e66afda165f1646c7db1d57186554f00bb266f6b085c48a409"
    else if (predicate_id == 7) x"be9becefa040c3df5aa5c238019198f1ee1bd63cc35912980c8bd480fbb1d219"
    else if (predicate_id == 8) x"95e2f969d97d995ee5ff4a552e19f757304df573fb594be5af2ce2dd0c6a581f"
    else if (predicate_id == 9) x"98957819800f26590e5e79a951f9f61ca07d26c90384169f809875b5707fd009"
    else if (predicate_id == 10) x"ce6f1cdbacf383b02d316318d91cc44784ebec5f9f682d86d8e56b9fd8f02921"
    else if (predicate_id == 11) x"1aa48b79f4c5be7edd3fb68f7c57a5eec562d62023c2d4294e5d65b925a97820"
    else abort EInvalidPredicate
}
fun verdict_public_inputs(
    case_commitment: &vector<u8>,
    accusation_commitment: &vector<u8>,
    session_attempt_domain_commitment: &vector<u8>,
    verdict_commitment: &vector<u8>,
): vector<u8> {
    let mut public_inputs = vector[];
    append_commitment_limbs(&mut public_inputs, case_commitment);
    append_commitment_limbs(&mut public_inputs, accusation_commitment);
    append_commitment_limbs(&mut public_inputs, session_attempt_domain_commitment);
    append_commitment_limbs(&mut public_inputs, verdict_commitment);
    assert!(public_inputs.length() == 256, EInvalidCommitment);
    public_inputs
}

fun append_commitment_limbs(output: &mut vector<u8>, commitment: &vector<u8>) {
    assert_commitment_length(commitment);
    append_limb_scalar(output, commitment, 0);
    append_limb_scalar(output, commitment, 16);
}

fun append_limb_scalar(output: &mut vector<u8>, commitment: &vector<u8>, start: u64) {
    let mut index = 0;
    while (index < 16) {
        output.push_back(*commitment.borrow(start + index));
        index = index + 1;
    };
    index = 0;
    while (index < 16) {
        output.push_back(0);
        index = index + 1;
    };
}

fun assert_commitment_length(commitment: &vector<u8>) {
    assert!(commitment.length() == COMMITMENT_LENGTH, EInvalidCommitment);
}

fun assert_canonical_field_commitment(commitment: &vector<u8>) {
    assert_commitment_length(commitment);
    let modulus = BN254_SCALAR_MODULUS_LE;
    let mut index = COMMITMENT_LENGTH;
    while (index > 0) {
        index = index - 1;
        let value_byte = *commitment.borrow(index);
        let modulus_byte = *modulus.borrow(index);
        if (value_byte < modulus_byte) return;
        if (value_byte > modulus_byte) abort EInvalidCommitment;
    };
    // Equality with the modulus is also non-canonical.
    abort EInvalidCommitment
}

#[test_only]
public fun query_public_inputs_for_testing(
    case_commitment: vector<u8>,
    session: ID,
    level: ID,
    predicate_id: u8,
    query_nonce: u64,
    result: bool,
): vector<u8> {
    query_public_inputs(&case_commitment, session, level, predicate_id, query_nonce, result)
}

#[test_only]
public fun registered_predicate_commitment_for_testing(predicate_id: u8): vector<u8> {
    registered_predicate_commitment(predicate_id)
}
#[test_only]
public fun verdict_public_inputs_for_testing(
    case_commitment: vector<u8>,
    accusation_commitment: vector<u8>,
    session_attempt_domain_commitment: vector<u8>,
    verdict_commitment: vector<u8>,
): vector<u8> {
    verdict_public_inputs(
        &case_commitment,
        &accusation_commitment,
        &session_attempt_domain_commitment,
        &verdict_commitment,
    )
}

#[test_only]
public fun mint_verified_verdict_receipt_for_testing(
    receipt_version: u16,
    session: ID,
    level: ID,
    attempt_nonce: u64,
    case_commitment: vector<u8>,
    accusation_commitment: vector<u8>,
    session_attempt_domain_commitment: vector<u8>,
    verdict_commitment: vector<u8>,
    encrypted_verdict_blob_id: u256,
    verifier_identity: vector<u8>,
): VerdictProofReceipt {
    VerdictProofReceipt {
        receipt_version,
        session,
        level,
        attempt_nonce,
        case_commitment,
        accusation_commitment,
        session_attempt_domain_commitment,
        verdict_commitment,
        encrypted_verdict_blob_id,
        verifier_identity,
        verifier_status: 1,
    }
}

#[test_only]
public fun mint_unverified_verdict_receipt_for_testing(
    receipt_version: u16,
    session: ID,
    level: ID,
    attempt_nonce: u64,
    case_commitment: vector<u8>,
    accusation_commitment: vector<u8>,
    session_attempt_domain_commitment: vector<u8>,
    verdict_commitment: vector<u8>,
    encrypted_verdict_blob_id: u256,
    verifier_identity: vector<u8>,
): VerdictProofReceipt {
    VerdictProofReceipt {
        receipt_version,
        session,
        level,
        attempt_nonce,
        case_commitment,
        accusation_commitment,
        session_attempt_domain_commitment,
        verdict_commitment,
        encrypted_verdict_blob_id,
        verifier_identity,
        verifier_status: 0,
    }
}

#[test_only]
public fun mint_receipt_for_testing(
    receipt_version: u16,
    session: ID,
    level: ID,
    predicate_id: u8,
    query_nonce: u64,
    pre_candidate_mask: u64,
    result: bool,
    verifier_identity: vector<u8>,
): QueryProofReceipt {
    QueryProofReceipt {
        receipt_version,
        session,
        level,
        predicate_id,
        query_nonce,
        pre_candidate_mask,
        result,
        verifier_identity,
    }
}

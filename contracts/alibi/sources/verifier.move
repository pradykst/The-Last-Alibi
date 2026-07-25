module alibi::verifier;

use std::hash;
use sui::groth16;

use alibi::verdict_verifying_key;

const EVerifierUnavailable: u64 = 20;
const EInvalidCommitment: u64 = 21;
const EInvalidProof: u64 = 22;
const EInvalidVerifierIdentity: u64 = 23;

const COMMITMENT_LENGTH: u64 = 32;
const PROOF_LENGTH: u64 = 128;
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

/// Z1 will replace this fail-closed boundary with native Groth16 verification.
public fun verify_query_proof(
    _receipt_version: u16,
    _session: ID,
    _level: ID,
    _predicate_id: u8,
    _query_nonce: u64,
    _pre_candidate_mask: u64,
    _result: bool,
    _expected_verifier_identity: vector<u8>,
    _proof: vector<u8>,
): QueryProofReceipt {
    abort EVerifierUnavailable
}

/// Verifies the Z1 accusation-verdict statement under the application-pinned key.
/// The four commitments are encoded as eight little-endian u128 public scalars.
public fun verify_verdict_proof(
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

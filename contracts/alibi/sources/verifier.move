module alibi::verifier;

const EVerifierUnavailable: u64 = 20;

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

/// Z1 must replace this fail-closed body with native Groth16 verification.
///
/// The proof statement has exactly four logical 32-byte public inputs:
/// case commitment, accusation commitment, session-attempt domain commitment,
/// and verdict commitment. No caller assertion or boolean can authorize a verdict.
public fun verify_verdict_proof(
    _receipt_version: u16,
    _session: ID,
    _level: ID,
    _attempt_nonce: u64,
    _case_commitment: vector<u8>,
    _accusation_commitment: vector<u8>,
    _session_attempt_domain_commitment: vector<u8>,
    _verdict_commitment: vector<u8>,
    _encrypted_verdict_blob_id: u256,
    _expected_verifier_identity: vector<u8>,
    _proof: vector<u8>,
): VerdictProofReceipt {
    abort EVerifierUnavailable
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

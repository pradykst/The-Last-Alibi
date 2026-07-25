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

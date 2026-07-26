#[test_only]
module alibi::query_native_tests;

use std::unit_test::{assert_eq, destroy};
use sui::clock;

use alibi::alibi;
use alibi::verifier;

const PLAYER: address = @0xA11CE;
const INTEGRATION_HINT: u64 = 9001;

fun session_id(): ID {
    object::id_from_address(@0x815df49979fa951bb38c69b0319a9a6d3af78f43eca3701a696f814e96700999)
}

fun level_id(): ID {
    object::id_from_address(@0x320ae3b942b1f644e89ef624137eaef00f7dc72c91c58e27cdab422f995da1c2)
}

fun verifier_identity(): vector<u8> {
    x"16f341db81cc4a598510081ebe924699358c658cf8dc4618fdb8c924305b237e"
}

fun yes_case_commitment(): vector<u8> {
    x"7725734ec60f4b726dff1bf4cad03e2b8268c389fde8305ccc2e7c821cc30621"
}

fun no_case_commitment(): vector<u8> {
    x"d9d45e3367f5b7a5304d234e9fa6f70aace739ee6f667b1b80fbbed519f8ba24"
}

fun predicate_commitment(): vector<u8> {
    x"da5c234e63ff5bd28a72a3097f982bc218292f9af7b07b9bcfcf11ae72096226"
}

fun yes_proof(): vector<u8> {
    x"46076736af978eefbaccce8c670da30db22c9d6c438b2ee059e55cab1b628f93a40ab00af7d3ed555db47390f30293979486a3669b17d7f313f310eb19521912b4fbc73a6af3ada26d1747fbfa09e691639cce887b5c038426eb3d4b487105a11121f5b1294f47400c0fd8785b3e87e8c314b7ae782b0081f8c223342f291422"
}

fun no_proof(): vector<u8> {
    x"7c47073c11c75171862ca9cb9640d1910893b950cdd9fcd130f678122b30d01a503cfa8c3c93d684ac1f26edcf182336b1fdc4bc0d97fead04583b3faf7c25273e4cb0bba8629c4bd6bab23c26a7c108337ee54fd11ad4806155ee94f190840a0252d3e50dc69c164e19f8a49c28c0eacf2920a5789012b79702e9afdcb61c00"
}

#[test]
fun valid_yes_proof_succeeds_natively() {
    let receipt = verifier::verify_query_proof(
        1, session_id(), level_id(), yes_case_commitment(), 0, 0,
        std::u64::max_value!(), true, verifier_identity(), yes_proof(),
    );
    let (_, _, _, predicate_id, nonce, pre_mask, result, identity) = verifier::consume(receipt);
    assert_eq!(predicate_id, 0);
    assert_eq!(nonce, 0);
    assert_eq!(pre_mask, std::u64::max_value!());
    assert!(result);
    assert_eq!(identity, verifier_identity());
}

#[test]
fun valid_no_proof_succeeds_natively() {
    let receipt = verifier::verify_query_proof(
        1, session_id(), level_id(), no_case_commitment(), 0, 0,
        std::u64::max_value!(), false, verifier_identity(), no_proof(),
    );
    let (_, _, _, _, _, _, result, _) = verifier::consume(receipt);
    assert!(!result);
}

#[test]
fun move_query_public_inputs_match_rust_exactly() {
    let encoded = verifier::query_public_inputs_for_testing(
        yes_case_commitment(), session_id(), level_id(), 0, 0, true,
    );
    assert_eq!(encoded, x"7725734ec60f4b726dff1bf4cad03e2b000000000000000000000000000000008268c389fde8305ccc2e7c821cc306210000000000000000000000000000000043fc840cfb7db2c6f50136a6794dbd1400000000000000000000000000000000c870bc6689133d8bd7f30b6bf92e742f00000000000000000000000000000000da5c234e63ff5bd28a72a3097f982bc20000000000000000000000000000000018292f9af7b07b9bcfcf11ae72096226000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000");
    assert_eq!(verifier::registered_predicate_commitment_for_testing(0), predicate_commitment());
}

#[test]
fun valid_proof_resolves_exactly_the_authorized_branch_once() {
    let mut ctx = tx_context::new_from_hint(PLAYER, INTEGRATION_HINT, 0, 0, 0);
    let level = alibi::new_level_for_testing(&mut ctx);
    let mut session = alibi::new_session_for_testing(
        &level,
        alibi::practice_mode_for_testing(),
        no_case_commitment(),
        alibi::protocol_version_for_testing(),
        alibi::level_version_for_testing(),
        &mut ctx,
    );
    let test_clock = clock::create_for_testing(&mut ctx);
    assert_eq!(object::id(&session), session_id());
    assert_eq!(object::id(&level), level_id());
    alibi::authorize_query(&mut session, &level, 0, 0, &test_clock, &mut ctx);
    let receipt = alibi::verify_query_proof(
        &session, &level, 0, 0, std::u64::max_value!(), false, no_proof(),
    );
    alibi::resolve_query(&mut session, &level, receipt);
    assert_eq!(alibi::candidate_mask(&session), 18446744073709486080);
    assert_eq!(alibi::disclosure_count(&session), 1);
    assert_eq!(alibi::query_nonce(&session), 1);
    assert_eq!(alibi::used_predicates(&session), 1);
    assert!(!alibi::has_pending_query(&session));
    clock::destroy_for_testing(test_clock);
    destroy(session);
    destroy(level);
}

#[test, expected_failure(abort_code = 22, location = verifier)]
fun modified_proof_is_rejected() {
    let mut proof = yes_proof();
    let altered = *proof.borrow(0) ^ 1;
    *proof.borrow_mut(0) = altered;
    let receipt = verifier::verify_query_proof(
        1, session_id(), level_id(), yes_case_commitment(), 0, 0,
        std::u64::max_value!(), true, verifier_identity(), proof,
    );
    let (_, _, _, _, _, _, _, _) = verifier::consume(receipt);
    abort 255
}

#[test, expected_failure(abort_code = 22, location = verifier)]
fun wrong_result_is_rejected() {
    let receipt = verifier::verify_query_proof(
        1, session_id(), level_id(), yes_case_commitment(), 0, 0,
        std::u64::max_value!(), false, verifier_identity(), yes_proof(),
    );
    let (_, _, _, _, _, _, _, _) = verifier::consume(receipt);
    abort 255
}

#[test, expected_failure(abort_code = 23, location = verifier)]
fun attacker_selected_verifying_key_identity_is_rejected() {
    let receipt = verifier::verify_query_proof(
        1, session_id(), level_id(), yes_case_commitment(), 0, 0,
        std::u64::max_value!(), true, x"0707070707070707070707070707070707070707070707070707070707070707", yes_proof(),
    );
    let (_, _, _, _, _, _, _, _) = verifier::consume(receipt);
    abort 255
}

#[test, expected_failure(abort_code = 4, location = alibi)]
fun resolved_query_cannot_be_replayed() {
    let mut ctx = tx_context::new_from_hint(PLAYER, INTEGRATION_HINT, 0, 0, 0);
    let level = alibi::new_level_for_testing(&mut ctx);
    let mut session = alibi::new_session_for_testing(
        &level,
        alibi::practice_mode_for_testing(),
        no_case_commitment(),
        alibi::protocol_version_for_testing(),
        alibi::level_version_for_testing(),
        &mut ctx,
    );
    let test_clock = clock::create_for_testing(&mut ctx);
    alibi::authorize_query(&mut session, &level, 0, 0, &test_clock, &mut ctx);
    let receipt = alibi::verify_query_proof(
        &session, &level, 0, 0, std::u64::max_value!(), false, no_proof(),
    );
    alibi::resolve_query(&mut session, &level, receipt);
    let replay = alibi::verify_query_proof(
        &session, &level, 0, 0, std::u64::max_value!(), false, no_proof(),
    );
    let (_, _, _, _, _, _, _, _) = verifier::consume(replay);
    abort 255
}

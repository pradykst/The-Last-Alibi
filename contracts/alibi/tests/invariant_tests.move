#[test_only]
module alibi::invariant_tests;

use std::unit_test::{assert_eq, destroy};
use sui::clock::{Self, Clock};

use alibi::alibi::{Self, GameSession, LevelConfig};
use alibi::predicates;
use alibi::verifier::{Self, QueryProofReceipt};

const PLAYER: address = @0xA11CE;

fun commitment(): vector<u8> {
    x"2222222222222222222222222222222222222222222222222222222222222222"
}

fun context(hint: u64): TxContext {
    tx_context::new_from_hint(PLAYER, hint, 0, 0, 0)
}

fun setup(hint: u64): (LevelConfig, GameSession, Clock, TxContext) {
    let mut ctx = context(hint);
    let level = alibi::new_level_for_testing(&mut ctx);
    let session = alibi::new_session_for_testing(
        &level,
        alibi::practice_mode_for_testing(),
        commitment(),
        alibi::protocol_version_for_testing(),
        alibi::level_version_for_testing(),
        &mut ctx,
    );
    let clock = clock::create_for_testing(&mut ctx);
    (level, session, clock, ctx)
}

fun receipt(
    session: &GameSession,
    level: &LevelConfig,
    predicate_id: u8,
    query_nonce: u64,
    pre_candidate_mask: u64,
    result: bool,
): QueryProofReceipt {
    verifier::mint_receipt_for_testing(
        alibi::receipt_version_for_testing(),
        object::id(session),
        object::id(level),
        predicate_id,
        query_nonce,
        pre_candidate_mask,
        result,
        *alibi::expected_verifier_identity(level),
    )
}

fun cleanup(level: LevelConfig, session: GameSession, clock: Clock) {
    clock.destroy_for_testing();
    destroy(session);
    destroy(level);
}

#[test, expected_failure(abort_code = 1, location = alibi)]
fun unsupported_level_schema_is_rejected() {
    let ctx = &mut context(10);
    let _level = alibi::new_level_with_rules_for_testing(2, 1, 5, 2, ctx);
    abort 255
}

#[test, expected_failure(abort_code = 2, location = alibi)]
fun noncanonical_disclosure_limit_is_rejected() {
    let ctx = &mut context(11);
    let _level = alibi::new_level_with_rules_for_testing(1, 1, 6, 2, ctx);
    abort 255
}

#[test, expected_failure(abort_code = 2, location = predicates)]
fun duplicate_predicate_identifiers_are_rejected() {
    let duplicate = predicates::definition(0);
    predicates::validate_for_testing(&vector[duplicate, duplicate]);
    abort 255
}

#[test, expected_failure(abort_code = 2, location = predicates)]
fun invalid_dimension_value_is_rejected() {
    let malformed = predicates::definition_for_testing(0, 9, 0, 1);
    predicates::validate_for_testing(&vector[malformed]);
    abort 255
}

#[test, expected_failure(abort_code = 5, location = alibi)]
fun unknown_predicate_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(12);
    alibi::authorize_query(&mut session, &level, 12, 0, &clock, &mut ctx);
    abort 255
}

#[test, expected_failure(abort_code = 10, location = alibi)]
fun singleton_yes_branch_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(13);
    alibi::set_candidate_mask_for_testing(
        &mut session,
        1u64 | predicates::predicate_mask(1),
    );
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, &mut ctx);
    abort 255
}

#[test, expected_failure(abort_code = 11, location = alibi)]
fun singleton_no_branch_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(14);
    alibi::set_candidate_mask_for_testing(
        &mut session,
        predicates::predicate_mask(0) | (1u64 << 16),
    );
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, &mut ctx);
    abort 255
}

#[test, expected_failure(abort_code = 8, location = alibi)]
fun concurrent_query_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(15);
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, &mut ctx);
    alibi::authorize_query(&mut session, &level, 1, 0, &clock, &mut ctx);
    abort 255
}

#[test, expected_failure(abort_code = 9, location = alibi)]
fun wrong_authorization_nonce_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(16);
    alibi::authorize_query(&mut session, &level, 0, 1, &clock, &mut ctx);
    abort 255
}

#[test, expected_failure(abort_code = 14, location = alibi)]
fun premature_expiry_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(17);
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, &mut ctx);
    alibi::expire_query(&mut session, &level, &clock, &mut ctx);
    abort 255
}

#[test]
fun eligible_expiry_preserves_candidates_and_disclosures() {
    let (level, mut session, mut clock, mut ctx) = setup(18);
    let initial_mask = alibi::candidate_mask(&session);
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, &mut ctx);
    clock.increment_for_testing(alibi::query_ttl_ms_for_testing());
    alibi::expire_query(&mut session, &level, &clock, &mut ctx);

    assert_eq!(alibi::candidate_mask(&session), initial_mask);
    assert_eq!(alibi::candidate_count(&session), 64);
    assert_eq!(alibi::disclosure_count(&session), 0);
    assert_eq!(alibi::used_predicates(&session), 0);
    assert_eq!(alibi::query_nonce(&session), 1);
    assert!(!alibi::has_pending_query(&session));
    cleanup(level, session, clock);
}

#[test]
fun resolution_selects_exact_no_branch_and_is_monotonic() {
    let (level, mut session, clock, mut ctx) = setup(19);
    let pre_mask = alibi::candidate_mask(&session);
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, &mut ctx);
    let proof_receipt = receipt(&session, &level, 0, 0, pre_mask, false);
    alibi::resolve_query(&mut session, &level, proof_receipt);

    let expected = pre_mask & (predicates::universe_mask() ^ predicates::predicate_mask(0));
    assert_eq!(alibi::candidate_mask(&session), expected);
    assert_eq!(alibi::candidate_mask(&session) & pre_mask, alibi::candidate_mask(&session));
    assert_eq!(alibi::candidate_count(&session), 48);
    cleanup(level, session, clock);
}

#[test, expected_failure(abort_code = 6, location = alibi)]
fun resolved_predicate_cannot_be_repeated() {
    let (level, mut session, clock, mut ctx) = setup(20);
    let pre_mask = alibi::candidate_mask(&session);
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, &mut ctx);
    let proof_receipt = receipt(&session, &level, 0, 0, pre_mask, true);
    alibi::resolve_query(&mut session, &level, proof_receipt);
    alibi::authorize_query(&mut session, &level, 0, 1, &clock, &mut ctx);
    abort 255
}

#[test, expected_failure(abort_code = 17, location = alibi)]
fun receipt_replay_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(21);
    let pre_mask = alibi::candidate_mask(&session);
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, &mut ctx);
    let first = receipt(&session, &level, 0, 0, pre_mask, true);
    alibi::resolve_query(&mut session, &level, first);
    let replay = receipt(&session, &level, 0, 0, pre_mask, true);
    alibi::resolve_query(&mut session, &level, replay);
    abort 255
}

#[test, expected_failure(abort_code = 16, location = alibi)]
fun wrong_session_receipt_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(22);
    let pre_mask = alibi::candidate_mask(&session);
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, &mut ctx);
    let proof_receipt = verifier::mint_receipt_for_testing(
        alibi::receipt_version_for_testing(),
        object::id_from_address(@0xDEAD),
        object::id(&level),
        0,
        0,
        pre_mask,
        true,
        *alibi::expected_verifier_identity(&level),
    );
    alibi::resolve_query(&mut session, &level, proof_receipt);
    abort 255
}

#[test, expected_failure(abort_code = 13, location = alibi)]
fun wrong_predicate_receipt_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(23);
    let pre_mask = alibi::candidate_mask(&session);
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, &mut ctx);
    let proof_receipt = receipt(&session, &level, 1, 0, pre_mask, true);
    alibi::resolve_query(&mut session, &level, proof_receipt);
    abort 255
}

#[test, expected_failure(abort_code = 13, location = alibi)]
fun wrong_nonce_receipt_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(24);
    let pre_mask = alibi::candidate_mask(&session);
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, &mut ctx);
    let proof_receipt = receipt(&session, &level, 0, 1, pre_mask, true);
    alibi::resolve_query(&mut session, &level, proof_receipt);
    abort 255
}

#[test, expected_failure(abort_code = 15, location = alibi)]
fun wrong_verifier_identity_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(25);
    let pre_mask = alibi::candidate_mask(&session);
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, &mut ctx);
    let proof_receipt = verifier::mint_receipt_for_testing(
        alibi::receipt_version_for_testing(),
        object::id(&session),
        object::id(&level),
        0,
        0,
        pre_mask,
        true,
        vector[1],
    );
    alibi::resolve_query(&mut session, &level, proof_receipt);
    abort 255
}

#[test, expected_failure(abort_code = 7, location = alibi)]
fun sixth_disclosure_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(26);
    alibi::set_disclosure_count_for_testing(&mut session, 5);
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, &mut ctx);
    abort 255
}

#[test, expected_failure(abort_code = 18, location = alibi)]
fun candidate_tampering_cannot_replace_authorized_transition() {
    let (level, mut session, clock, mut ctx) = setup(27);
    let pre_mask = alibi::candidate_mask(&session);
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, &mut ctx);
    alibi::set_candidate_mask_for_testing(&mut session, predicates::predicate_mask(0));
    let proof_receipt = receipt(&session, &level, 0, 0, pre_mask, false);
    alibi::resolve_query(&mut session, &level, proof_receipt);
    abort 255
}

#[test]
fun five_safe_transitions_never_drop_below_two_candidates() {
    let (level, mut session, clock, mut ctx) = setup(28);
    let sequence = vector[0u8, 4u8, 8u8, 10u8, 1u8];
    sequence.do_ref!(|predicate_id| {
        let nonce = alibi::query_nonce(&session);
        let pre_mask = alibi::candidate_mask(&session);
        alibi::authorize_query(&mut session, &level, *predicate_id, nonce, &clock, &mut ctx);
        let proof_receipt = receipt(
            &session,
            &level,
            *predicate_id,
            nonce,
            pre_mask,
            false,
        );
        alibi::resolve_query(&mut session, &level, proof_receipt);
        assert!(alibi::candidate_count(&session) >= 2);
    });
    assert_eq!(alibi::disclosure_count(&session), 5);
    cleanup(level, session, clock);
}
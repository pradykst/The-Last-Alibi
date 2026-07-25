#[test_only]
module alibi::foundation_tests;

use std::unit_test::{assert_eq, destroy};
use sui::clock;

use alibi::alibi;
use alibi::predicates;
use alibi::verifier;

const PLAYER: address = @0xA11CE;
const OTHER: address = @0xB0B;

fun commitment(): vector<u8> {
    x"1111111111111111111111111111111111111111111111111111111111111111"
}

fun context(sender: address, hint: u64): TxContext {
    tx_context::new_from_hint(sender, hint, 0, 0, 0)
}

#[test]
fun canonical_level_has_expected_shape() {
    let ctx = &mut context(PLAYER, 1);
    let level = alibi::new_level_for_testing(ctx);
    assert_eq!(alibi::registered_predicates(&level).length(), 12);
    assert_eq!(predicates::case_count(), 64);
    assert_eq!(predicates::count(), 12);
    destroy(level);
}

#[test]
fun mechanical_predicate_masks_cover_expected_populations() {
    12u8.do!(|predicate_id| {
        let mask = predicates::predicate_mask(predicate_id);
        let expected: u8 = if (predicate_id < 8) { 16 } else { 32 };
        let mut remaining = mask;
        let mut population = 0u8;
        while (remaining != 0) {
            remaining = remaining & (remaining - 1);
            population = population + 1;
        };
        assert_eq!(population, expected);
    });
}

#[test]
fun practice_session_starts_with_all_candidates() {
    let ctx = &mut context(PLAYER, 2);
    let level = alibi::new_level_for_testing(ctx);
    let session = alibi::new_session_for_testing(
        &level,
        alibi::practice_mode_for_testing(),
        commitment(),
        alibi::protocol_version_for_testing(),
        alibi::level_version_for_testing(),
        ctx,
    );
    assert_eq!(alibi::candidate_mask(&session), predicates::universe_mask());
    assert_eq!(alibi::candidate_count(&session), 64);
    assert_eq!(alibi::disclosure_count(&session), 0);
    assert_eq!(alibi::used_predicates(&session), 0);
    assert_eq!(alibi::query_nonce(&session), 0);
    assert!(!alibi::has_pending_query(&session));
    destroy(session);
    destroy(level);
}

#[test]
fun safe_query_authorizes_and_resolves_exact_yes_branch() {
    let ctx = &mut context(PLAYER, 3);
    let level = alibi::new_level_for_testing(ctx);
    let mut session = alibi::new_session_for_testing(
        &level,
        alibi::practice_mode_for_testing(),
        commitment(),
        alibi::protocol_version_for_testing(),
        alibi::level_version_for_testing(),
        ctx,
    );
    let clock = clock::create_for_testing(ctx);
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, ctx);
    assert!(alibi::has_pending_query(&session));

    let receipt = verifier::mint_receipt_for_testing(
        alibi::receipt_version_for_testing(),
        object::id(&session),
        object::id(&level),
        0,
        0,
        predicates::universe_mask(),
        true,
        vector[],
    );
    alibi::resolve_query(&mut session, &level, receipt);
    assert_eq!(alibi::candidate_mask(&session), predicates::predicate_mask(0));
    assert_eq!(alibi::candidate_count(&session), 16);
    assert_eq!(alibi::disclosure_count(&session), 1);
    assert_eq!(alibi::used_predicates(&session), 1);
    assert_eq!(alibi::query_nonce(&session), 1);
    assert!(!alibi::has_pending_query(&session));

    clock.destroy_for_testing();
    destroy(session);
    destroy(level);
}

#[test, expected_failure(abort_code = 3, location = alibi)]
fun malformed_commitment_is_rejected() {
    let ctx = &mut context(PLAYER, 4);
    let level = alibi::new_level_for_testing(ctx);
    let _session = alibi::new_session_for_testing(
        &level,
        alibi::practice_mode_for_testing(),
        vector[1],
        alibi::protocol_version_for_testing(),
        alibi::level_version_for_testing(),
        ctx,
    );
    abort 255
}

#[test, expected_failure(abort_code = 19, location = alibi)]
fun ranked_session_is_rejected() {
    let ctx = &mut context(PLAYER, 5);
    let level = alibi::new_level_for_testing(ctx);
    let _session = alibi::new_session_for_testing(
        &level,
        alibi::ranked_mode_for_testing(),
        commitment(),
        alibi::protocol_version_for_testing(),
        alibi::level_version_for_testing(),
        ctx,
    );
    abort 255
}

#[test, expected_failure(abort_code = 0, location = alibi)]
fun another_sender_cannot_authorize() {
    let player_ctx = &mut context(PLAYER, 6);
    let level = alibi::new_level_for_testing(player_ctx);
    let mut session = alibi::new_session_for_testing(
        &level,
        alibi::practice_mode_for_testing(),
        commitment(),
        alibi::protocol_version_for_testing(),
        alibi::level_version_for_testing(),
        player_ctx,
    );
    let clock = clock::create_for_testing(player_ctx);
    let other_ctx = &context(OTHER, 7);
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, other_ctx);
    abort 255
}

#[test, expected_failure(abort_code = 20, location = verifier)]
fun production_verifier_is_unavailable() {
    let _receipt = verifier::verify_query_proof(
        1,
        object::id_from_address(@0x1),
        object::id_from_address(@0x2),
        0,
        0,
        predicates::universe_mask(),
        true,
        vector[],
        vector[],
    );
    abort 255
}

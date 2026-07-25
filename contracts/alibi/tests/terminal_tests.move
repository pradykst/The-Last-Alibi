#[test_only]
module alibi::terminal_tests;

use std::unit_test::{assert_eq, destroy};
use sui::clock::{Self, Clock};
use sui::event;

use alibi::alibi::{Self, GameSession, LevelConfig};
use alibi::predicates;
use alibi::verifier::{Self, VerdictProofReceipt};

const PLAYER: address = @0xA11CE;
const OTHER: address = @0xB0B;
const TEST_BLOB_ID: u256 = 1;

fun case_commitment(): vector<u8> {
    x"1111111111111111111111111111111111111111111111111111111111111111"
}

fun accusation_commitment(): vector<u8> {
    x"2222222222222222222222222222222222222222222222222222222222222222"
}

fun other_accusation_commitment(): vector<u8> {
    x"3333333333333333333333333333333333333333333333333333333333333333"
}

fun verdict_commitment(): vector<u8> {
    x"4444444444444444444444444444444444444444444444444444444444444444"
}

fun no_path_verdict_commitment(): vector<u8> {
    x"5555555555555555555555555555555555555555555555555555555555555555"
}

fun verifier_identity(): vector<u8> {
    x"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}

fun other_verifier_identity(): vector<u8> {
    x"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
}

fun context(sender: address, hint: u64): TxContext {
    tx_context::new_from_hint(sender, hint, 0, 0, 0)
}

fun setup(hint: u64): (LevelConfig, GameSession, Clock, TxContext) {
    let mut ctx = context(PLAYER, hint);
    let mut level = alibi::new_level_for_testing(&mut ctx);
    alibi::enable_verdict_verifier_for_testing(&mut level, verifier_identity());
    let session = alibi::new_session_for_testing(
        &level,
        alibi::practice_mode_for_testing(),
        case_commitment(),
        alibi::protocol_version_for_testing(),
        alibi::level_version_for_testing(),
        &mut ctx,
    );
    let clock = clock::create_for_testing(&mut ctx);
    (level, session, clock, ctx)
}

fun start(session: &mut GameSession, level: &LevelConfig, clock: &Clock, ctx: &mut TxContext) {
    alibi::start_accusation(session, level, accusation_commitment(), 0, clock, ctx)
}

fun verified_receipt(
    session: &GameSession,
    level: &LevelConfig,
    attempt_nonce: u64,
    case: vector<u8>,
    accusation: vector<u8>,
    domain: vector<u8>,
    verdict: vector<u8>,
    blob_id: u256,
    identity: vector<u8>,
): VerdictProofReceipt {
    verifier::mint_verified_verdict_receipt_for_testing(
        alibi::verdict_receipt_version_for_testing(),
        object::id(session),
        object::id(level),
        attempt_nonce,
        case,
        accusation,
        domain,
        verdict,
        blob_id,
        identity,
    )
}

fun canonical_receipt(
    session: &GameSession,
    level: &LevelConfig,
    verdict: vector<u8>,
): VerdictProofReceipt {
    verified_receipt(
        session,
        level,
        alibi::pending_accusation_attempt_nonce(session),
        *alibi::case_commitment(session),
        *alibi::pending_accusation_commitment(session),
        *alibi::pending_session_attempt_domain_commitment(session),
        verdict,
        TEST_BLOB_ID,
        verifier_identity(),
    )
}

fun terminate(
    session: &mut GameSession,
    level: &LevelConfig,
    clock: &Clock,
    verdict: vector<u8>,
) {
    let receipt = canonical_receipt(session, level, verdict);
    alibi::finalize_verdict(session, level, receipt, clock);
}

fun cleanup(level: LevelConfig, session: GameSession, clock: Clock) {
    clock.destroy_for_testing();
    destroy(session);
    destroy(level);
}

#[test]
fun active_transitions_to_accusation_pending_with_exact_binding() {
    let (level, mut session, clock, mut ctx) = setup(100);
    let session_id = object::id(&session);
    let level_id = object::id(&level);
    start(&mut session, &level, &clock, &mut ctx);

    assert_eq!(alibi::session_state(&session), alibi::accusation_pending_state_for_testing());
    assert_eq!(alibi::attempt_nonce(&session), 1);
    assert_eq!(alibi::pending_accusation_attempt_nonce(&session), 0);
    assert_eq!(*alibi::pending_accusation_commitment(&session), accusation_commitment());
    assert_eq!(
        *alibi::pending_session_attempt_domain_commitment(&session),
        alibi::session_attempt_domain_commitment_for_testing(&session, 0),
    );
    assert!(alibi::has_pending_accusation(&session));
    assert!(!alibi::has_pending_query(&session));
    assert!(!alibi::has_verdict(&session));

    let events = event::events_by_type<alibi::AccusationStarted>();
    assert_eq!(events.length(), 1);
    let (event_session, event_level, nonce, commitment, domain, started_at_ms) =
        alibi::accusation_started_fields_for_testing(events.borrow(0));
    assert_eq!(event_session, session_id);
    assert_eq!(event_level, level_id);
    assert_eq!(nonce, 0);
    assert_eq!(commitment, accusation_commitment());
    assert_eq!(domain, alibi::session_attempt_domain_commitment_for_testing(&session, 0));
    assert_eq!(started_at_ms, 0);
    cleanup(level, session, clock);
}

#[test]
fun verified_finalization_creates_public_terminal_record() {
    let (level, mut session, mut clock, mut ctx) = setup(101);
    start(&mut session, &level, &clock, &mut ctx);
    clock.increment_for_testing(7);
    terminate(&mut session, &level, &clock, verdict_commitment());

    assert_eq!(alibi::session_state(&session), alibi::terminal_state_for_testing());
    assert!(!alibi::has_pending_accusation(&session));
    assert!(alibi::has_verdict(&session));
    assert_eq!(alibi::verdict_attempt_nonce(&session), 0);
    assert_eq!(*alibi::verdict_accusation_commitment(&session), accusation_commitment());
    assert_eq!(
        *alibi::verdict_session_attempt_domain_commitment(&session),
        alibi::session_attempt_domain_commitment_for_testing(&session, 0),
    );
    assert_eq!(*alibi::verdict_commitment(&session), verdict_commitment());
    assert_eq!(alibi::encrypted_verdict_blob_id(&session), TEST_BLOB_ID);
    assert_eq!(*alibi::verdict_verifier_identity(&session), verifier_identity());
    assert_eq!(
        alibi::verdict_verifier_status(&session),
        alibi::verified_verdict_status_for_testing(),
    );
    assert_eq!(alibi::verdict_started_at_ms(&session), 0);
    assert_eq!(alibi::verdict_finalized_at_ms(&session), 7);
    cleanup(level, session, clock);
}

#[test]
fun no_path_terminal_record_discloses_no_hidden_solution() {
    let (level, mut session, clock, mut ctx) = setup(102);
    let initial_candidates = alibi::candidate_mask(&session);
    start(&mut session, &level, &clock, &mut ctx);
    terminate(&mut session, &level, &clock, no_path_verdict_commitment());

    assert_eq!(alibi::candidate_mask(&session), initial_candidates);
    assert_eq!(alibi::candidate_count(&session), 64);
    assert_eq!(alibi::disclosure_count(&session), 0);
    assert_eq!(*alibi::verdict_commitment(&session), no_path_verdict_commitment());
    let events = event::events_by_type<alibi::VerdictFinalized>();
    assert_eq!(events.length(), 1);
    let (
        event_session,
        event_level,
        nonce,
        accusation,
        domain,
        verdict,
        blob_id,
        identity,
        status,
        finalized_at_ms,
    ) = alibi::verdict_finalized_fields_for_testing(events.borrow(0));
    assert_eq!(event_session, object::id(&session));
    assert_eq!(event_level, object::id(&level));
    assert_eq!(nonce, 0);
    assert_eq!(accusation, accusation_commitment());
    assert_eq!(domain, alibi::session_attempt_domain_commitment_for_testing(&session, 0));
    assert_eq!(verdict, no_path_verdict_commitment());
    assert_eq!(blob_id, TEST_BLOB_ID);
    assert_eq!(identity, verifier_identity());
    assert_eq!(status, alibi::verified_verdict_status_for_testing());
    assert_eq!(finalized_at_ms, 0);
    cleanup(level, session, clock);
}

#[test, expected_failure(abort_code = 4, location = alibi)]
fun accusation_while_query_is_pending_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(103);
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, &mut ctx);
    alibi::start_accusation(&mut session, &level, accusation_commitment(), 0, &clock, &mut ctx);
    abort 255
}

#[test, expected_failure(abort_code = 0, location = alibi)]
fun accusation_by_wrong_player_is_rejected() {
    let (level, mut session, clock, _) = setup(104);
    let mut other_ctx = context(OTHER, 105);
    alibi::start_accusation(
        &mut session,
        &level,
        accusation_commitment(),
        0,
        &clock,
        &mut other_ctx,
    );
    abort 255
}

#[test, expected_failure(abort_code = 3, location = alibi)]
fun empty_accusation_commitment_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(106);
    alibi::start_accusation(&mut session, &level, vector[], 0, &clock, &mut ctx);
    abort 255
}

#[test, expected_failure(abort_code = 3, location = alibi)]
fun malformed_accusation_commitment_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(107);
    alibi::start_accusation(
        &mut session,
        &level,
        x"01010101010101010101010101010101010101010101010101010101010101",
        0,
        &clock,
        &mut ctx,
    );
    abort 255
}

#[test, expected_failure(abort_code = 3, location = alibi)]
fun zero_accusation_commitment_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(108);
    alibi::start_accusation(
        &mut session,
        &level,
        x"0000000000000000000000000000000000000000000000000000000000000000",
        0,
        &clock,
        &mut ctx,
    );
    abort 255
}

#[test, expected_failure(abort_code = 4, location = alibi)]
fun duplicate_accusation_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(109);
    start(&mut session, &level, &clock, &mut ctx);
    alibi::start_accusation(&mut session, &level, accusation_commitment(), 1, &clock, &mut ctx);
    abort 255
}

#[test, expected_failure(abort_code = 9, location = alibi)]
fun wrong_attempt_nonce_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(110);
    alibi::start_accusation(&mut session, &level, accusation_commitment(), 1, &clock, &mut ctx);
    abort 255
}

#[test, expected_failure(abort_code = 9, location = alibi)]
fun stale_attempt_nonce_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(111);
    alibi::set_attempt_nonce_for_testing(&mut session, 1);
    alibi::start_accusation(&mut session, &level, accusation_commitment(), 0, &clock, &mut ctx);
    abort 255
}

#[test, expected_failure(abort_code = 4, location = alibi)]
fun attempt_nonce_overflow_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(128);
    alibi::set_attempt_nonce_for_testing(&mut session, std::u64::max_value!());
    alibi::start_accusation(
        &mut session,
        &level,
        accusation_commitment(),
        std::u64::max_value!(),
        &clock,
        &mut ctx,
    );
    abort 255
}

#[test, expected_failure(abort_code = 12, location = alibi)]
fun accusation_pending_cannot_use_query_expiry_as_cancellation() {
    let (level, mut session, clock, mut ctx) = setup(129);
    start(&mut session, &level, &clock, &mut ctx);
    alibi::expire_query(&mut session, &level, &clock, &mut ctx);
    abort 255
}

#[test, expected_failure(abort_code = 24, location = alibi)]
fun wrong_verdict_receipt_version_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(130);
    start(&mut session, &level, &clock, &mut ctx);
    let receipt = verifier::mint_verified_verdict_receipt_for_testing(
        2,
        object::id(&session),
        object::id(&level),
        0,
        case_commitment(),
        accusation_commitment(),
        *alibi::pending_session_attempt_domain_commitment(&session),
        verdict_commitment(),
        TEST_BLOB_ID,
        verifier_identity(),
    );
    alibi::finalize_verdict(&mut session, &level, receipt, &clock);
    abort 255
}

#[test, expected_failure(abort_code = 24, location = alibi)]
fun verdict_for_wrong_session_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(112);
    start(&mut session, &level, &clock, &mut ctx);
    let receipt = verifier::mint_verified_verdict_receipt_for_testing(
        alibi::verdict_receipt_version_for_testing(),
        object::id_from_address(@0xDEAD),
        object::id(&level),
        0,
        case_commitment(),
        accusation_commitment(),
        *alibi::pending_session_attempt_domain_commitment(&session),
        verdict_commitment(),
        TEST_BLOB_ID,
        verifier_identity(),
    );
    alibi::finalize_verdict(&mut session, &level, receipt, &clock);
    abort 255
}

#[test, expected_failure(abort_code = 22, location = alibi)]
fun verdict_for_wrong_accusation_commitment_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(113);
    start(&mut session, &level, &clock, &mut ctx);
    let receipt = verified_receipt(
        &session,
        &level,
        0,
        case_commitment(),
        other_accusation_commitment(),
        *alibi::pending_session_attempt_domain_commitment(&session),
        verdict_commitment(),
        TEST_BLOB_ID,
        verifier_identity(),
    );
    alibi::finalize_verdict(&mut session, &level, receipt, &clock);
    abort 255
}

#[test, expected_failure(abort_code = 22, location = alibi)]
fun verdict_for_wrong_session_attempt_domain_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(114);
    start(&mut session, &level, &clock, &mut ctx);
    let receipt = verified_receipt(
        &session,
        &level,
        0,
        case_commitment(),
        accusation_commitment(),
        other_accusation_commitment(),
        verdict_commitment(),
        TEST_BLOB_ID,
        verifier_identity(),
    );
    alibi::finalize_verdict(&mut session, &level, receipt, &clock);
    abort 255
}

#[test, expected_failure(abort_code = 25, location = alibi)]
fun stale_verdict_attempt_nonce_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(115);
    alibi::set_attempt_nonce_for_testing(&mut session, 1);
    alibi::start_accusation(&mut session, &level, accusation_commitment(), 1, &clock, &mut ctx);
    let receipt = verified_receipt(
        &session,
        &level,
        0,
        case_commitment(),
        accusation_commitment(),
        alibi::session_attempt_domain_commitment_for_testing(&session, 0),
        verdict_commitment(),
        TEST_BLOB_ID,
        verifier_identity(),
    );
    alibi::finalize_verdict(&mut session, &level, receipt, &clock);
    abort 255
}

#[test, expected_failure(abort_code = 22, location = alibi)]
fun future_verdict_attempt_nonce_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(116);
    start(&mut session, &level, &clock, &mut ctx);
    let receipt = verified_receipt(
        &session,
        &level,
        1,
        case_commitment(),
        accusation_commitment(),
        alibi::session_attempt_domain_commitment_for_testing(&session, 1),
        verdict_commitment(),
        TEST_BLOB_ID,
        verifier_identity(),
    );
    alibi::finalize_verdict(&mut session, &level, receipt, &clock);
    abort 255
}

#[test, expected_failure(abort_code = 24, location = alibi)]
fun verdict_for_wrong_case_commitment_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(117);
    start(&mut session, &level, &clock, &mut ctx);
    let receipt = verified_receipt(
        &session,
        &level,
        0,
        other_accusation_commitment(),
        accusation_commitment(),
        *alibi::pending_session_attempt_domain_commitment(&session),
        verdict_commitment(),
        TEST_BLOB_ID,
        verifier_identity(),
    );
    alibi::finalize_verdict(&mut session, &level, receipt, &clock);
    abort 255
}

#[test, expected_failure(abort_code = 15, location = alibi)]
fun wrong_verdict_verifier_identity_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(118);
    start(&mut session, &level, &clock, &mut ctx);
    let receipt = verified_receipt(
        &session,
        &level,
        0,
        case_commitment(),
        accusation_commitment(),
        *alibi::pending_session_attempt_domain_commitment(&session),
        verdict_commitment(),
        TEST_BLOB_ID,
        other_verifier_identity(),
    );
    alibi::finalize_verdict(&mut session, &level, receipt, &clock);
    abort 255
}

#[test, expected_failure(abort_code = 26, location = alibi)]
fun unverified_finalization_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(119);
    start(&mut session, &level, &clock, &mut ctx);
    let receipt = verifier::mint_unverified_verdict_receipt_for_testing(
        alibi::verdict_receipt_version_for_testing(),
        object::id(&session),
        object::id(&level),
        0,
        case_commitment(),
        accusation_commitment(),
        *alibi::pending_session_attempt_domain_commitment(&session),
        verdict_commitment(),
        TEST_BLOB_ID,
        verifier_identity(),
    );
    alibi::finalize_verdict(&mut session, &level, receipt, &clock);
    abort 255
}

#[test, expected_failure(abort_code = 23, location = alibi)]
fun missing_encrypted_verdict_reference_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(120);
    start(&mut session, &level, &clock, &mut ctx);
    let receipt = verified_receipt(
        &session,
        &level,
        0,
        case_commitment(),
        accusation_commitment(),
        *alibi::pending_session_attempt_domain_commitment(&session),
        verdict_commitment(),
        0,
        verifier_identity(),
    );
    alibi::finalize_verdict(&mut session, &level, receipt, &clock);
    abort 255
}

#[test, expected_failure(abort_code = 3, location = alibi)]
fun invalid_verdict_commitment_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(121);
    start(&mut session, &level, &clock, &mut ctx);
    let receipt = verified_receipt(
        &session,
        &level,
        0,
        case_commitment(),
        accusation_commitment(),
        *alibi::pending_session_attempt_domain_commitment(&session),
        vector[],
        TEST_BLOB_ID,
        verifier_identity(),
    );
    alibi::finalize_verdict(&mut session, &level, receipt, &clock);
    abort 255
}

#[test, expected_failure(abort_code = 4, location = alibi)]
fun duplicate_verdict_finalization_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(122);
    start(&mut session, &level, &clock, &mut ctx);
    let duplicate = canonical_receipt(&session, &level, verdict_commitment());
    terminate(&mut session, &level, &clock, verdict_commitment());
    alibi::finalize_verdict(&mut session, &level, duplicate, &clock);
    abort 255
}

#[test, expected_failure(abort_code = 4, location = alibi)]
fun replay_of_finalized_attempt_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(123);
    start(&mut session, &level, &clock, &mut ctx);
    let replay = canonical_receipt(&session, &level, verdict_commitment());
    terminate(&mut session, &level, &clock, verdict_commitment());
    alibi::finalize_verdict(&mut session, &level, replay, &clock);
    abort 255
}

#[test, expected_failure(abort_code = 4, location = alibi)]
fun query_after_terminal_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(124);
    start(&mut session, &level, &clock, &mut ctx);
    terminate(&mut session, &level, &clock, verdict_commitment());
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, &mut ctx);
    abort 255
}

#[test, expected_failure(abort_code = 4, location = alibi)]
fun expiry_mutation_after_terminal_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(125);
    start(&mut session, &level, &clock, &mut ctx);
    terminate(&mut session, &level, &clock, verdict_commitment());
    alibi::expire_query(&mut session, &level, &clock, &mut ctx);
    abort 255
}

#[test, expected_failure(abort_code = 4, location = alibi)]
fun accusation_after_terminal_is_rejected() {
    let (level, mut session, clock, mut ctx) = setup(126);
    start(&mut session, &level, &clock, &mut ctx);
    terminate(&mut session, &level, &clock, verdict_commitment());
    alibi::start_accusation(&mut session, &level, other_accusation_commitment(), 1, &clock, &mut ctx);
    abort 255
}

#[test]
fun s1_query_lifecycle_remains_available_before_accusation() {
    let (level, mut session, clock, mut ctx) = setup(127);
    let pre_mask = alibi::candidate_mask(&session);
    alibi::authorize_query(&mut session, &level, 0, 0, &clock, &mut ctx);
    let receipt = verifier::mint_receipt_for_testing(
        alibi::receipt_version_for_testing(),
        object::id(&session),
        object::id(&level),
        0,
        0,
        pre_mask,
        true,
        vector[],
    );
    alibi::resolve_query(&mut session, &level, receipt);
    assert_eq!(alibi::candidate_mask(&session), predicates::predicate_mask(0));
    assert_eq!(alibi::query_nonce(&session), 1);
    assert_eq!(alibi::attempt_nonce(&session), 0);
    cleanup(level, session, clock);
}

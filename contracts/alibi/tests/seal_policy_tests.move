#[test_only]
module alibi::seal_policy_tests;

use std::unit_test::destroy;
use sui::bcs;
use sui::clock::{Self, Clock};

use alibi::alibi::{Self, GameSession, LevelConfig};
use alibi::verifier;

const PLAYER: address = @0xA11CE;
const OTHER: address = @0xB0B;
const TEST_BLOB_ID: u256 =
    23308994573709855642619175826119088931643282545396843698436971920739544859977;

fun case_commitment(): vector<u8> {
    x"1111111111111111111111111111111111111111111111111111111111111111"
}

fun accusation_commitment(): vector<u8> {
    x"2222222222222222222222222222222222222222222222222222222222222222"
}

fun verdict_commitment(): vector<u8> {
    x"2424242424242424242424242424242424242424242424242424242424242424"
}

fun seal_domain(): vector<u8> {
    b"the-last-alibi::seal::verdict-capsule::v1"
}

fun context(sender: address, hint: u64): TxContext {
    tx_context::new_from_hint(sender, hint, 0, 0, 0)
}

fun seal_identity(
    session: &GameSession,
    attempt_nonce: u64,
    protocol_version: u16,
    level_version: u16,
    accusation: vector<u8>,
    verdict: vector<u8>,
): vector<u8> {
    let identity_version = 1u16;
    let mut identity = bcs::to_bytes(&seal_domain());
    identity.append(bcs::to_bytes(&identity_version));
    identity.append(bcs::to_bytes(&object::id(session).to_address()));
    identity.append(bcs::to_bytes(&attempt_nonce));
    identity.append(bcs::to_bytes(&protocol_version));
    identity.append(bcs::to_bytes(&level_version));
    identity.append(accusation);
    identity.append(verdict);
    identity
}

fun terminal_session(hint: u64): (LevelConfig, GameSession, Clock) {
    let mut ctx = context(PLAYER, hint);
    let level = alibi::new_level_for_testing(&mut ctx);
    let mut session = alibi::new_session_for_testing(
        &level,
        alibi::practice_mode_for_testing(),
        case_commitment(),
        alibi::protocol_version_for_testing(),
        alibi::level_version_for_testing(),
        &mut ctx,
    );
    let clock = clock::create_for_testing(&mut ctx);
    alibi::start_accusation(
        &mut session,
        &level,
        accusation_commitment(),
        TEST_BLOB_ID,
        0,
        &clock,
        &mut ctx,
    );
    let receipt = verifier::mint_verified_verdict_receipt_for_testing(
        alibi::verdict_receipt_version_for_testing(),
        object::id(&session),
        object::id(&level),
        0,
        *alibi::case_commitment(&session),
        *alibi::pending_accusation_commitment(&session),
        *alibi::pending_session_attempt_domain_commitment(&session),
        verdict_commitment(),
        TEST_BLOB_ID,
        *alibi::expected_verdict_verifier_identity(&level),
    );
    alibi::finalize_verdict(&mut session, &level, receipt, &clock);
    (level, session, clock)
}

fun active_session(hint: u64): (LevelConfig, GameSession, Clock) {
    let mut ctx = context(PLAYER, hint);
    let level = alibi::new_level_for_testing(&mut ctx);
    let session = alibi::new_session_for_testing(
        &level,
        alibi::practice_mode_for_testing(),
        case_commitment(),
        alibi::protocol_version_for_testing(),
        alibi::level_version_for_testing(),
        &mut ctx,
    );
    let clock = clock::create_for_testing(&mut ctx);
    (level, session, clock)
}

fun canonical_identity(session: &GameSession): vector<u8> {
    seal_identity(
        session,
        alibi::verdict_attempt_nonce(session),
        alibi::protocol_version_for_testing(),
        alibi::level_version_for_testing(),
        *alibi::verdict_accusation_commitment(session),
        *alibi::verdict_commitment(session),
    )
}

fun cleanup(level: LevelConfig, session: GameSession, clock: Clock) {
    clock.destroy_for_testing();
    destroy(session);
    destroy(level);
}
#[test]
fun identity_encoding_matches_typescript_vector() {
    let identity_version = 1u16;
    let attempt_nonce = 0u64;
    let protocol_version = 1u16;
    let level_version = 1u16;
    let session = @0x5E5510;
    let mut identity = bcs::to_bytes(&seal_domain());
    identity.append(bcs::to_bytes(&identity_version));
    identity.append(bcs::to_bytes(&session));
    identity.append(bcs::to_bytes(&attempt_nonce));
    identity.append(bcs::to_bytes(&protocol_version));
    identity.append(bcs::to_bytes(&level_version));
    identity.append(accusation_commitment());
    identity.append(verdict_commitment());
    assert!(
        identity
            == x"297468652d6c6173742d616c6962693a3a7365616c3a3a766572646963742d63617073756c653a3a7631010000000000000000000000000000000000000000000000000000000000005e551000000000000000000100010022222222222222222222222222222222222222222222222222222222222222222424242424242424242424242424242424242424242424242424242424242424",
        255,
    );
}
#[test]
fun authorized_terminal_player_is_approved_without_mutation() {
    let (level, session, clock) = terminal_session(1200);
    let identity = canonical_identity(&session);
    alibi::assert_seal_verdict_access_for_testing(copy identity, &session, PLAYER);
    alibi::assert_seal_verdict_access_for_testing(identity, &session, PLAYER);
    cleanup(level, session, clock);
}

#[test, expected_failure(abort_code = 0, location = alibi)]
fun unauthorized_player_is_denied() {
    let (level, session, clock) = terminal_session(1201);
    alibi::assert_seal_verdict_access_for_testing(canonical_identity(&session), &session, OTHER);
    cleanup(level, session, clock);
}

#[test, expected_failure(abort_code = 4, location = alibi)]
fun pre_terminal_session_is_denied() {
    let (level, session, clock) = active_session(1202);
    let identity = seal_identity(
        &session,
        0,
        alibi::protocol_version_for_testing(),
        alibi::level_version_for_testing(),
        accusation_commitment(),
        verdict_commitment(),
    );
    alibi::assert_seal_verdict_access_for_testing(identity, &session, PLAYER);
    cleanup(level, session, clock);
}

#[test, expected_failure(abort_code = 27, location = alibi)]
fun truncated_identity_is_denied() {
    let (level, session, clock) = terminal_session(1203);
    let mut identity = canonical_identity(&session);
    identity.pop_back();
    alibi::assert_seal_verdict_access_for_testing(identity, &session, PLAYER);
    cleanup(level, session, clock);
}

#[test, expected_failure(abort_code = 27, location = alibi)]
fun trailing_identity_bytes_are_denied() {
    let (level, session, clock) = terminal_session(1204);
    let mut identity = canonical_identity(&session);
    identity.push_back(0);
    alibi::assert_seal_verdict_access_for_testing(identity, &session, PLAYER);
    cleanup(level, session, clock);
}

#[test, expected_failure(abort_code = 28, location = alibi)]
fun wrong_session_identity_is_denied() {
    let (level, session, clock) = terminal_session(1205);
    let mut identity = canonical_identity(&session);
    *identity.borrow_mut(46) = *identity.borrow(46) ^ 1;
    alibi::assert_seal_verdict_access_for_testing(identity, &session, PLAYER);
    cleanup(level, session, clock);
}

#[test, expected_failure(abort_code = 28, location = alibi)]
fun wrong_attempt_identity_is_denied() {
    let (level, session, clock) = terminal_session(1206);
    let identity = seal_identity(
        &session,
        1,
        alibi::protocol_version_for_testing(),
        alibi::level_version_for_testing(),
        accusation_commitment(),
        verdict_commitment(),
    );
    alibi::assert_seal_verdict_access_for_testing(identity, &session, PLAYER);
    cleanup(level, session, clock);
}

#[test, expected_failure(abort_code = 28, location = alibi)]
fun wrong_protocol_version_is_denied() {
    let (level, session, clock) = terminal_session(1207);
    let identity = seal_identity(
        &session,
        0,
        2,
        alibi::level_version_for_testing(),
        accusation_commitment(),
        verdict_commitment(),
    );
    alibi::assert_seal_verdict_access_for_testing(identity, &session, PLAYER);
    cleanup(level, session, clock);
}

#[test, expected_failure(abort_code = 28, location = alibi)]
fun wrong_level_version_is_denied() {
    let (level, session, clock) = terminal_session(1208);
    let identity = seal_identity(
        &session,
        0,
        alibi::protocol_version_for_testing(),
        2,
        accusation_commitment(),
        verdict_commitment(),
    );
    alibi::assert_seal_verdict_access_for_testing(identity, &session, PLAYER);
    cleanup(level, session, clock);
}

#[test, expected_failure(abort_code = 28, location = alibi)]
fun wrong_accusation_commitment_is_denied() {
    let (level, session, clock) = terminal_session(1209);
    let identity = seal_identity(
        &session,
        0,
        alibi::protocol_version_for_testing(),
        alibi::level_version_for_testing(),
        x"2323232323232323232323232323232323232323232323232323232323232323",
        verdict_commitment(),
    );
    alibi::assert_seal_verdict_access_for_testing(identity, &session, PLAYER);
    cleanup(level, session, clock);
}

#[test, expected_failure(abort_code = 28, location = alibi)]
fun wrong_verdict_commitment_is_denied() {
    let (level, session, clock) = terminal_session(1210);
    let identity = seal_identity(
        &session,
        0,
        alibi::protocol_version_for_testing(),
        alibi::level_version_for_testing(),
        accusation_commitment(),
        x"2525252525252525252525252525252525252525252525252525252525252525",
    );
    alibi::assert_seal_verdict_access_for_testing(identity, &session, PLAYER);
    cleanup(level, session, clock);
}

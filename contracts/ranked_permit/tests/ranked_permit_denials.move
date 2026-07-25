#[test_only]
module ranked_permit::ranked_permit_denials;

use sui::clock;

use alibi::alibi;
use ranked_permit::ranked_permit;

const PLAYER: address = @0xA11CE;
const OTHER: address = @0xB0B;

fun context(sender: address, hint: u64): TxContext {
    tx_context::new_from_hint(sender, hint, 0, 0, 0)
}

fun commitment(byte: u8): vector<u8> {
    vector[byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte]
}

#[test, expected_failure(abort_code = 0, location = ranked_permit)]
fun issuer_for_another_registry_is_rejected() {
    let ctx = &mut context(PLAYER, 10);
    let level = alibi::new_level_for_testing(ctx);
    let (mut registry, _) = ranked_permit::new_registry_for_testing(ctx);
    let (_, wrong_issuer) = ranked_permit::new_registry_for_testing(ctx);
    let clock = clock::create_for_testing(ctx);
    let _permit = ranked_permit::issue_for_testing(
        &mut registry,
        &wrong_issuer,
        &level,
        PLAYER,
        commitment(1),
        commitment(2),
        commitment(3),
        1,
        &clock,
        ctx,
    );
    abort 255
}

#[test, expected_failure(abort_code = 1, location = ranked_permit)]
fun malformed_commitment_is_rejected() {
    let ctx = &mut context(PLAYER, 11);
    let level = alibi::new_level_for_testing(ctx);
    let (mut registry, issuer) = ranked_permit::new_registry_for_testing(ctx);
    let clock = clock::create_for_testing(ctx);
    let _permit = ranked_permit::issue_for_testing(
        &mut registry,
        &issuer,
        &level,
        PLAYER,
        vector[1],
        commitment(2),
        commitment(3),
        1,
        &clock,
        ctx,
    );
    abort 255
}

#[test, expected_failure(abort_code = 3, location = ranked_permit)]
fun expired_authorization_is_rejected() {
    let ctx = &mut context(PLAYER, 12);
    let level = alibi::new_level_for_testing(ctx);
    let (mut registry, issuer) = ranked_permit::new_registry_for_testing(ctx);
    let clock = clock::create_for_testing(ctx);
    let _permit = ranked_permit::issue_for_testing(
        &mut registry,
        &issuer,
        &level,
        PLAYER,
        commitment(1),
        commitment(2),
        commitment(3),
        0,
        &clock,
        ctx,
    );
    abort 255
}

#[test, expected_failure(abort_code = 5, location = ranked_permit)]
fun another_recipient_cannot_consume() {
    let player_ctx = &mut context(PLAYER, 13);
    let level = alibi::new_level_for_testing(player_ctx);
    let (mut registry, issuer) = ranked_permit::new_registry_for_testing(player_ctx);
    let clock = clock::create_for_testing(player_ctx);
    let permit = ranked_permit::issue_for_testing(
        &mut registry,
        &issuer,
        &level,
        PLAYER,
        commitment(1),
        commitment(2),
        commitment(3),
        1,
        &clock,
        player_ctx,
    );
    let other_ctx = &context(OTHER, 14);
    ranked_permit::consume_ranked_permit(permit, &level, &clock, other_ctx);
    abort 255
}

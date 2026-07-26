#[test_only]
module ranked_permit::ranked_permit_nonce_replay;

use sui::clock;

use alibi::alibi;
use ranked_permit::ranked_permit;

const PLAYER: address = @0xA11CE;

fun commitment(byte: u8): vector<u8> {
    vector[byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte]
}

#[test, expected_failure(abort_code = 6, location = ranked_permit)]
fun authorization_nonce_cannot_be_replayed_for_another_entitlement() {
    let ctx = &mut tx_context::new_from_hint(PLAYER, 20, 0, 0, 0);
    let level = alibi::new_level_for_testing(ctx);
    let (mut registry, issuer) = ranked_permit::new_registry_for_testing(ctx);
    let clock = clock::create_for_testing(ctx);
    let _first = ranked_permit::issue_for_testing(
        &mut registry,
        &issuer,
        &level,
        PLAYER,
        commitment(1),
        commitment(2),
        commitment(3),
        1,
        &clock,
        ctx,
    );
    let _replay = ranked_permit::issue_for_testing(
        &mut registry,
        &issuer,
        &level,
        PLAYER,
        commitment(4),
        commitment(2),
        commitment(3),
        1,
        &clock,
        ctx,
    );
    abort 255
}

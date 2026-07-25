#[test_only]
module ranked_permit::ranked_permit_tests;

use std::unit_test::destroy;
use sui::clock;

use alibi::alibi;
use ranked_permit::ranked_permit;

const PLAYER: address = @0xA11CE;

fun context(hint: u64): TxContext {
    tx_context::new_from_hint(PLAYER, hint, 0, 0, 0)
}

fun commitment(byte: u8): vector<u8> {
    vector[byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte]
}

#[test]
fun permit_is_issued_and_consumed_for_the_exact_level() {
    let ctx = &mut context(1);
    let level = alibi::new_level_for_testing(ctx);
    let (mut registry, issuer) = ranked_permit::new_registry_for_testing(ctx);
    let clock = clock::create_for_testing(ctx);
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
        ctx,
    );
    ranked_permit::consume_ranked_permit(permit, &level, &clock, ctx);
    clock.destroy_for_testing();
    ranked_permit::destroy_issuer_for_testing(issuer);
    ranked_permit::destroy_registry_for_testing(registry);
    destroy(level);
}

#[test, expected_failure(abort_code = 4, location = ranked_permit)]
fun duplicate_level_entitlement_is_rejected() {
    let ctx = &mut context(2);
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
    let _duplicate = ranked_permit::issue_for_testing(
        &mut registry,
        &issuer,
        &level,
        PLAYER,
        commitment(1),
        commitment(4),
        commitment(5),
        1,
        &clock,
        ctx,
    );
    abort 255
}

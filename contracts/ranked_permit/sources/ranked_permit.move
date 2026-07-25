module ranked_permit::ranked_permit;

use alibi::alibi::{Self, LevelConfig};
use sui::clock::Clock;
use sui::dynamic_field as df;

const EUnauthorizedIssuer: u64 = 0;
const EInvalidCommitment: u64 = 1;
const EInvalidLevel: u64 = 2;
const EExpiredAuthorization: u64 = 3;
const EEntitlementAlreadyUsed: u64 = 4;
const EUnauthorizedRecipient: u64 = 5;
const EAuthorizationNonceAlreadyUsed: u64 = 6;

const COMMITMENT_LENGTH: u64 = 32;
const LEVEL_ID: vector<u8> = b"the-last-exhibit";

/// Publisher-owned authority for the World AgentKit authorization service.
public struct IssuerCap has key {
    id: UID,
    registry: ID,
    epoch: u64,
}

/// Issuer-owned replay and one-human-per-level registry.
public struct RankedPermitRegistry has key {
    id: UID,
    issuer_epoch: u64,
}

/// Address-owned, short-lived authority for one Ranked attempt.
public struct RankedPermit has key {
    id: UID,
    recipient: address,
    level: ID,
    level_id: vector<u8>,
    entitlement_commitment: vector<u8>,
    nonce_commitment: vector<u8>,
    resource_commitment: vector<u8>,
    expires_at_ms: u64,
}

/// Dynamic-field key enforcing one opaque human entitlement per level.
public struct EntitlementKey(ID, vector<u8>) has copy, drop, store;

/// Dynamic-field key enforcing one-time use of each AgentKit authorization nonce.
public struct NonceKey(vector<u8>) has copy, drop, store;

public struct RankedPermitIssued has copy, drop {
    permit: ID,
    recipient: address,
    level: ID,
    expires_at_ms: u64,
}

public struct RankedPermitConsumed has copy, drop {
    permit: ID,
    recipient: address,
    level: ID,
}

fun init(ctx: &mut TxContext) {
    let registry = RankedPermitRegistry {
        id: object::new(ctx),
        issuer_epoch: 0,
    };
    let registry_id = object::id(&registry);
    transfer::transfer(
        IssuerCap {
            id: object::new(ctx),
            registry: registry_id,
            epoch: 0,
        },
        ctx.sender(),
    );
    transfer::transfer(registry, ctx.sender());
}

/// Issues one level-bound permit after the offchain service completes live AgentKit verification.
entry fun issue_ranked_permit(
    registry: &mut RankedPermitRegistry,
    issuer: &IssuerCap,
    level: &LevelConfig,
    level_id: vector<u8>,
    recipient: address,
    entitlement_commitment: vector<u8>,
    nonce_commitment: vector<u8>,
    resource_commitment: vector<u8>,
    expires_at_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let permit = new_permit(
        registry,
        issuer,
        level,
        level_id,
        recipient,
        entitlement_commitment,
        nonce_commitment,
        resource_commitment,
        expires_at_ms,
        clock,
        ctx,
    );
    transfer::transfer(permit, recipient);
}

/// Consumes the permit without importing or mutating verdict-finalization state.
public fun consume_ranked_permit(
    permit: RankedPermit,
    level: &LevelConfig,
    clock: &Clock,
    ctx: &TxContext,
) {
    let RankedPermit {
        id,
        recipient,
        level: permit_level,
        level_id,
        entitlement_commitment: _,
        nonce_commitment: _,
        resource_commitment: _,
        expires_at_ms,
    } = permit;
    assert!(recipient == ctx.sender(), EUnauthorizedRecipient);
    assert!(permit_level == alibi::level_object_id(level), EInvalidLevel);
    assert!(level_id == LEVEL_ID, EInvalidLevel);
    assert!(clock.timestamp_ms() <= expires_at_ms, EExpiredAuthorization);
    let permit_id = id.to_inner();
    id.delete();
    event::emit(RankedPermitConsumed {
        permit: permit_id,
        recipient,
        level: permit_level,
    });
}

fun new_permit(
    registry: &mut RankedPermitRegistry,
    issuer: &IssuerCap,
    level: &LevelConfig,
    level_id: vector<u8>,
    recipient: address,
    entitlement_commitment: vector<u8>,
    nonce_commitment: vector<u8>,
    resource_commitment: vector<u8>,
    expires_at_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): RankedPermit {
    assert!(issuer.registry == object::id(registry), EUnauthorizedIssuer);
    assert!(issuer.epoch == registry.issuer_epoch, EUnauthorizedIssuer);
    assert!(level_id == LEVEL_ID, EInvalidLevel);
    assert!(entitlement_commitment.length() == COMMITMENT_LENGTH, EInvalidCommitment);
    assert!(nonce_commitment.length() == COMMITMENT_LENGTH, EInvalidCommitment);
    assert!(resource_commitment.length() == COMMITMENT_LENGTH, EInvalidCommitment);
    assert!(clock.timestamp_ms() < expires_at_ms, EExpiredAuthorization);

    let level_object_id = alibi::level_object_id(level);
    let entitlement_key = EntitlementKey(level_object_id, entitlement_commitment.clone());
    let nonce_key = NonceKey(nonce_commitment.clone());
    assert!(!df::exists(&registry.id, entitlement_key), EEntitlementAlreadyUsed);
    assert!(!df::exists(&registry.id, nonce_key), EAuthorizationNonceAlreadyUsed);
    df::add(&mut registry.id, entitlement_key, true);
    df::add(&mut registry.id, nonce_key, true);

    let permit = RankedPermit {
        id: object::new(ctx),
        recipient,
        level: level_object_id,
        level_id,
        entitlement_commitment,
        nonce_commitment,
        resource_commitment,
        expires_at_ms,
    };
    event::emit(RankedPermitIssued {
        permit: object::id(&permit),
        recipient,
        level: level_object_id,
        expires_at_ms,
    });
    permit
}

#[test_only]
public fun new_registry_for_testing(ctx: &mut TxContext): (RankedPermitRegistry, IssuerCap) {
    let registry = RankedPermitRegistry {
        id: object::new(ctx),
        issuer_epoch: 0,
    };
    let cap = IssuerCap {
        id: object::new(ctx),
        registry: object::id(&registry),
        epoch: 0,
    };
    (registry, cap)
}

#[test_only]
public fun issue_for_testing(
    registry: &mut RankedPermitRegistry,
    issuer: &IssuerCap,
    level: &LevelConfig,
    recipient: address,
    entitlement_commitment: vector<u8>,
    nonce_commitment: vector<u8>,
    resource_commitment: vector<u8>,
    expires_at_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): RankedPermit {
    new_permit(
        registry,
        issuer,
        level,
        LEVEL_ID,
        recipient,
        entitlement_commitment,
        nonce_commitment,
        resource_commitment,
        expires_at_ms,
        clock,
        ctx,
    )
}

#[test_only]
public fun destroy_registry_for_testing(registry: RankedPermitRegistry) {
    let RankedPermitRegistry { id, issuer_epoch: _ } = registry;
    id.delete();
}

#[test_only]
public fun destroy_issuer_for_testing(issuer: IssuerCap) {
    let IssuerCap { id, registry: _, epoch: _ } = issuer;
    id.delete();
}

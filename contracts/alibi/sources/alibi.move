module alibi::alibi;

use sui::bcs;
use sui::clock::Clock;
use sui::event;
use sui::hash;

use alibi::predicates::{Self, PredicateDefinition};
use alibi::verifier::{Self, QueryProofReceipt, VerdictProofReceipt};

const EUnauthorized: u64 = 0;
const EUnsupportedVersion: u64 = 1;
const EInvalidLevel: u64 = 2;
const EInvalidCommitment: u64 = 3;
const EInvalidSessionState: u64 = 4;
const EUnknownPredicate: u64 = 5;
const EPredicateAlreadyUsed: u64 = 6;
const EDisclosureLimitReached: u64 = 7;
const EQueryAlreadyPending: u64 = 8;
const EStaleOrWrongNonce: u64 = 9;
const EUnsafeYesBranch: u64 = 10;
const EUnsafeNoBranch: u64 = 11;
const EPendingQueryMissing: u64 = 12;
const EPendingQueryMismatch: u64 = 13;
const EPrematureExpiry: u64 = 14;
const EInvalidVerifier: u64 = 15;
const EInvalidProofReceipt: u64 = 16;
const EReceiptReplay: u64 = 17;
const ECandidateTransitionMismatch: u64 = 18;
const ERankedModeUnavailable: u64 = 19;
const EPendingAccusationMissing: u64 = 21;
const EPendingAccusationMismatch: u64 = 22;
const EInvalidEncryptedVerdictReference: u64 = 23;
const EInvalidVerdictReceipt: u64 = 24;
const EVerdictReceiptReplay: u64 = 25;
const EUnverifiedVerdict: u64 = 26;

const SCHEMA_VERSION: u16 = 1;
const LEVEL_VERSION: u16 = 1;
const PROTOCOL_VERSION: u16 = 1;
const RECEIPT_VERSION: u16 = 1;
const VERDICT_RECEIPT_VERSION: u16 = 1;

const CASE_COUNT: u8 = 64;
const PREDICATE_COUNT: u8 = 12;
const DISCLOSURE_LIMIT: u8 = 5;
const MINIMUM_SURVIVORS: u8 = 2;
const COMMITMENT_LENGTH: u64 = 32;
const QUERY_TTL_MS: u64 = 300000;

const MODE_PRACTICE: u8 = 0;
const MODE_RANKED: u8 = 1;
const STATE_ACTIVE: u8 = 1;
const STATE_QUERY_PENDING: u8 = 2;
const STATE_ACCUSATION_PENDING: u8 = 3;
const STATE_TERMINAL: u8 = 4;
const VERIFIER_UNAVAILABLE: u8 = 0;
const VERIFIER_AVAILABLE: u8 = 1;
const VERIFIER_VERIFIED: u8 = 1;

const PRODUCT_ID: vector<u8> = b"the-last-alibi";
const LEVEL_ID: vector<u8> = b"the-last-exhibit";
const SESSION_ATTEMPT_DOMAIN: vector<u8> =
    b"the-last-alibi::verdict::session-attempt::v1";

/// One-time capability consumed when the canonical level is finalized.
public struct PublisherCap has key {
    id: UID,
}

/// Immutable public policy and registered-predicate definition for the MVP level.
public struct LevelConfig has key {
    id: UID,
    product_id: vector<u8>,
    level_id: vector<u8>,
    schema_version: u16,
    level_version: u16,
    case_count: u8,
    predicate_count: u8,
    disclosure_limit: u8,
    minimum_survivors: u8,
    verifier_state: u8,
    expected_verifier_identity: vector<u8>,
    verdict_verifier_state: u8,
    expected_verdict_verifier_identity: vector<u8>,
    finalized: bool,
    predicates: vector<PredicateDefinition>,
}

/// Public authorization state embedded in its owning practice session.
public struct PendingQuery has copy, drop, store {
    predicate_id: u8,
    query_nonce: u64,
    pre_candidate_mask: u64,
    yes_branch: u64,
    no_branch: u64,
    authorized_at_ms: u64,
    expires_at_ms: u64,
}

/// Public commitment-only state for the one terminal accusation attempt.
public struct PendingAccusation has copy, drop, store {
    attempt_nonce: u64,
    accusation_commitment: vector<u8>,
    session_attempt_domain_commitment: vector<u8>,
    started_at_ms: u64,
}

/// Public terminal metadata. It contains no verdict bit or commitment openings.
public struct VerdictRecord has copy, drop, store {
    attempt_nonce: u64,
    accusation_commitment: vector<u8>,
    session_attempt_domain_commitment: vector<u8>,
    verdict_commitment: vector<u8>,
    encrypted_verdict_blob_id: u256,
    verifier_identity: vector<u8>,
    verifier_status: u8,
    started_at_ms: u64,
    finalized_at_ms: u64,
}

/// Player-owned authoritative canonical state for one practice investigation.
public struct GameSession has key {
    id: UID,
    player: address,
    level: ID,
    mode: u8,
    case_commitment: vector<u8>,
    candidate_mask: u64,
    disclosure_count: u8,
    used_predicates: u16,
    query_nonce: u64,
    pending_query: Option<PendingQuery>,
    attempt_nonce: u64,
    pending_accusation: Option<PendingAccusation>,
    verdict: Option<VerdictRecord>,
    state: u8,
    protocol_version: u16,
    level_version: u16,
}

public struct LevelCreated has copy, drop {
    level: ID,
    schema_version: u16,
    level_version: u16,
    case_count: u8,
    predicate_count: u8,
    disclosure_limit: u8,
    minimum_survivors: u8,
    verifier_state: u8,
    verdict_verifier_state: u8,
}

public struct SessionCreated has copy, drop {
    session: ID,
    level: ID,
    player: address,
    mode: u8,
    candidate_mask: u64,
    candidate_count: u8,
    disclosure_count: u8,
    query_nonce: u64,
    attempt_nonce: u64,
    protocol_version: u16,
    level_version: u16,
}

/// Sanitized public metadata emitted when secret accusation evaluation may begin.
public struct AccusationStarted has copy, drop {
    session: ID,
    level: ID,
    attempt_nonce: u64,
    accusation_commitment: vector<u8>,
    session_attempt_domain_commitment: vector<u8>,
    started_at_ms: u64,
}

/// Sanitized public metadata emitted after verified irreversible finalization.
public struct VerdictFinalized has copy, drop {
    session: ID,
    level: ID,
    attempt_nonce: u64,
    accusation_commitment: vector<u8>,
    session_attempt_domain_commitment: vector<u8>,
    verdict_commitment: vector<u8>,
    encrypted_verdict_blob_id: u256,
    verifier_identity: vector<u8>,
    verifier_status: u8,
    finalized_at_ms: u64,
}

public struct QueryAuthorized has copy, drop {
    session: ID,
    level: ID,
    predicate_id: u8,
    query_nonce: u64,
    pre_candidate_mask: u64,
    yes_branch: u64,
    no_branch: u64,
    expires_at_ms: u64,
}

public struct QueryExpired has copy, drop {
    session: ID,
    level: ID,
    predicate_id: u8,
    query_nonce: u64,
    candidate_mask: u64,
    disclosure_count: u8,
    next_query_nonce: u64,
}

public struct QueryResolved has copy, drop {
    session: ID,
    level: ID,
    predicate_id: u8,
    query_nonce: u64,
    result: bool,
    pre_candidate_mask: u64,
    post_candidate_mask: u64,
    candidate_count: u8,
    disclosure_count: u8,
    next_query_nonce: u64,
}

fun init(ctx: &mut TxContext) {
    transfer::transfer(
        PublisherCap {
            id: object::new(ctx),
        },
        ctx.sender(),
    );
}

/// Consumes the initialization capability and permanently freezes the canonical level.
entry fun create_level(
    cap: PublisherCap,
    schema_version: u16,
    level_version: u16,
    disclosure_limit: u8,
    minimum_survivors: u8,
    ctx: &mut TxContext,
) {
    let PublisherCap { id } = cap;
    id.delete();
    let level = new_level(
        schema_version,
        level_version,
        disclosure_limit,
        minimum_survivors,
        ctx,
    );
    transfer::freeze_object(level);
}

/// Creates a player-owned Practice session bound to an immutable canonical level.
entry fun create_session(
    level: &LevelConfig,
    mode: u8,
    case_commitment: vector<u8>,
    protocol_version: u16,
    level_version: u16,
    ctx: &mut TxContext,
) {
    let session = new_session(
        level,
        mode,
        case_commitment,
        protocol_version,
        level_version,
        ctx,
    );
    transfer::transfer(session, ctx.sender());
}

/// Starts the one terminal accusation using only its salted commitment.
public fun start_accusation(
    session: &mut GameSession,
    level: &LevelConfig,
    accusation_commitment: vector<u8>,
    expected_attempt_nonce: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_session_binding(session, level);
    assert_not_terminal(session);
    assert!(session.player == ctx.sender(), EUnauthorized);
    assert!(session.state == STATE_ACTIVE, EInvalidSessionState);
    assert!(session.pending_query.is_none(), EQueryAlreadyPending);
    assert!(session.pending_accusation.is_none(), EInvalidSessionState);
    assert!(session.verdict.is_none(), EInvalidSessionState);
    assert!(session.attempt_nonce == expected_attempt_nonce, EStaleOrWrongNonce);
    assert_valid_commitment(&accusation_commitment);

    let domain_commitment = session_attempt_domain_commitment(session, expected_attempt_nonce);
    let started_at_ms = clock.timestamp_ms();
    session.pending_accusation.fill(PendingAccusation {
        attempt_nonce: expected_attempt_nonce,
        accusation_commitment: copy accusation_commitment,
        session_attempt_domain_commitment: copy domain_commitment,
        started_at_ms,
    });
    advance_attempt_nonce(session);
    session.state = STATE_ACCUSATION_PENDING;

    event::emit(AccusationStarted {
        session: object::id(session),
        level: object::id(level),
        attempt_nonce: expected_attempt_nonce,
        accusation_commitment,
        session_attempt_domain_commitment: domain_commitment,
        started_at_ms,
    });
}

/// Consumes a verifier-owned verdict receipt and irreversibly terminates the session.
public fun finalize_verdict(
    session: &mut GameSession,
    level: &LevelConfig,
    receipt: VerdictProofReceipt,
    clock: &Clock,
) {
    assert_session_binding(session, level);
    assert_not_terminal(session);
    assert!(session.state == STATE_ACCUSATION_PENDING, EInvalidSessionState);
    assert!(session.pending_accusation.is_some(), EPendingAccusationMissing);
    assert!(session.verdict.is_none(), EInvalidSessionState);

    let (
        receipt_version,
        receipt_session,
        receipt_level,
        receipt_attempt_nonce,
        receipt_case_commitment,
        receipt_accusation_commitment,
        receipt_domain_commitment,
        verdict_commitment,
        encrypted_verdict_blob_id,
        verifier_identity,
        verifier_status,
    ) = verifier::consume_verdict(receipt);

    assert!(receipt_version == VERDICT_RECEIPT_VERSION, EInvalidVerdictReceipt);
    assert!(receipt_session == object::id(session), EInvalidVerdictReceipt);
    assert!(receipt_level == object::id(level), EInvalidVerdictReceipt);
    assert!(verifier_status == VERIFIER_VERIFIED, EUnverifiedVerdict);
    assert!(level.verdict_verifier_state == VERIFIER_AVAILABLE, EInvalidVerifier);
    assert_valid_verifier_identity(&verifier_identity);
    assert!(
        verifier_identity == level.expected_verdict_verifier_identity,
        EInvalidVerifier,
    );
    assert!(
        receipt_case_commitment.length() == COMMITMENT_LENGTH,
        EInvalidVerdictReceipt,
    );
    assert!(receipt_case_commitment == session.case_commitment, EInvalidVerdictReceipt);
    assert_valid_commitment(&receipt_accusation_commitment);
    assert_valid_commitment(&receipt_domain_commitment);
    assert_valid_commitment(&verdict_commitment);
    assert!(encrypted_verdict_blob_id != 0, EInvalidEncryptedVerdictReference);

    let pending = session.pending_accusation.borrow();
    assert!(receipt_attempt_nonce >= pending.attempt_nonce, EVerdictReceiptReplay);
    assert!(receipt_attempt_nonce == pending.attempt_nonce, EPendingAccusationMismatch);
    assert!(
        receipt_accusation_commitment == pending.accusation_commitment,
        EPendingAccusationMismatch,
    );
    assert!(
        receipt_domain_commitment == pending.session_attempt_domain_commitment,
        EPendingAccusationMismatch,
    );
    assert!(
        receipt_domain_commitment
            == session_attempt_domain_commitment(session, receipt_attempt_nonce),
        EPendingAccusationMismatch,
    );
    assert!(
        session.attempt_nonce == receipt_attempt_nonce + 1,
        EPendingAccusationMismatch,
    );
    let started_at_ms = pending.started_at_ms;
    let finalized_at_ms = clock.timestamp_ms();
    assert!(finalized_at_ms >= started_at_ms, EInvalidSessionState);

    let _ = session.pending_accusation.extract();
    session.verdict.fill(VerdictRecord {
        attempt_nonce: receipt_attempt_nonce,
        accusation_commitment: copy receipt_accusation_commitment,
        session_attempt_domain_commitment: copy receipt_domain_commitment,
        verdict_commitment: copy verdict_commitment,
        encrypted_verdict_blob_id,
        verifier_identity: copy verifier_identity,
        verifier_status,
        started_at_ms,
        finalized_at_ms,
    });
    session.state = STATE_TERMINAL;

    event::emit(VerdictFinalized {
        session: object::id(session),
        level: object::id(level),
        attempt_nonce: receipt_attempt_nonce,
        accusation_commitment: receipt_accusation_commitment,
        session_attempt_domain_commitment: receipt_domain_commitment,
        verdict_commitment,
        encrypted_verdict_blob_id,
        verifier_identity,
        verifier_status,
        finalized_at_ms,
    });
}

/// Authorizes one safe registered query without evaluating the hidden case.
public fun authorize_query(
    session: &mut GameSession,
    level: &LevelConfig,
    predicate_id: u8,
    expected_nonce: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_session_binding(session, level);
    assert_not_terminal(session);
    assert!(session.player == ctx.sender(), EUnauthorized);
    assert!(session.pending_query.is_none(), EQueryAlreadyPending);
    assert!(session.state == STATE_ACTIVE, EInvalidSessionState);
    assert!(session.query_nonce == expected_nonce, EStaleOrWrongNonce);
    assert!(predicate_id < PREDICATE_COUNT, EUnknownPredicate);
    assert!(
        (session.used_predicates & predicate_bit(predicate_id)) == 0,
        EPredicateAlreadyUsed,
    );
    assert!(session.disclosure_count < DISCLOSURE_LIMIT, EDisclosureLimitReached);

    let predicate_mask = predicates::predicate_mask(predicate_id);
    let yes_branch = session.candidate_mask & predicate_mask;
    let no_branch = session.candidate_mask & (predicates::universe_mask() ^ predicate_mask);
    assert!(popcount(yes_branch) >= MINIMUM_SURVIVORS, EUnsafeYesBranch);
    assert!(popcount(no_branch) >= MINIMUM_SURVIVORS, EUnsafeNoBranch);

    let authorized_at_ms = clock.timestamp_ms();
    let maximum_timestamp = std::u64::max_value!();
    let expires_at_ms = if (authorized_at_ms > maximum_timestamp - QUERY_TTL_MS) {
        maximum_timestamp
    } else {
        authorized_at_ms + QUERY_TTL_MS
    };
    session.pending_query.fill(PendingQuery {
        predicate_id,
        query_nonce: expected_nonce,
        pre_candidate_mask: session.candidate_mask,
        yes_branch,
        no_branch,
        authorized_at_ms,
        expires_at_ms,
    });
    session.state = STATE_QUERY_PENDING;

    event::emit(QueryAuthorized {
        session: object::id(session),
        level: object::id(level),
        predicate_id,
        query_nonce: expected_nonce,
        pre_candidate_mask: session.candidate_mask,
        yes_branch,
        no_branch,
        expires_at_ms,
    });
}

/// Expires an unresolved query after its deadline without disclosing or changing candidates.
public fun expire_query(
    session: &mut GameSession,
    level: &LevelConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_session_binding(session, level);
    assert_not_terminal(session);
    assert!(session.player == ctx.sender(), EUnauthorized);
    assert!(session.pending_query.is_some(), EPendingQueryMissing);
    assert!(session.state == STATE_QUERY_PENDING, EInvalidSessionState);

    let pending = session.pending_query.borrow();
    assert!(clock.timestamp_ms() >= pending.expires_at_ms, EPrematureExpiry);
    assert!(pending.query_nonce == session.query_nonce, EPendingQueryMismatch);
    let predicate_id = pending.predicate_id;
    let expired_nonce = pending.query_nonce;
    let _ = session.pending_query.extract();
    advance_nonce(session);
    session.state = STATE_ACTIVE;

    event::emit(QueryExpired {
        session: object::id(session),
        level: object::id(level),
        predicate_id,
        query_nonce: expired_nonce,
        candidate_mask: session.candidate_mask,
        disclosure_count: session.disclosure_count,
        next_query_nonce: session.query_nonce,
    });
}

/// Consumes a verifier-owned receipt and applies exactly its stored authorized branch.
public fun resolve_query(
    session: &mut GameSession,
    level: &LevelConfig,
    receipt: QueryProofReceipt,
) {
    assert_session_binding(session, level);
    assert_not_terminal(session);
    let (
        receipt_version,
        receipt_session,
        receipt_level,
        predicate_id,
        receipt_nonce,
        receipt_pre_mask,
        result,
        verifier_identity,
    ) = verifier::consume(receipt);

    assert!(receipt_version == RECEIPT_VERSION, EInvalidProofReceipt);
    assert!(receipt_session == object::id(session), EInvalidProofReceipt);
    assert!(receipt_level == object::id(level), EInvalidProofReceipt);
    assert!(
        verifier_identity == level.expected_verifier_identity,
        EInvalidVerifier,
    );
    assert!(receipt_nonce >= session.query_nonce, EReceiptReplay);
    assert!(session.pending_query.is_some(), EPendingQueryMissing);
    assert!(session.state == STATE_QUERY_PENDING, EInvalidSessionState);

    let pending = session.pending_query.borrow();
    assert!(receipt_nonce == session.query_nonce, EPendingQueryMismatch);
    assert!(pending.query_nonce == receipt_nonce, EPendingQueryMismatch);
    assert!(pending.predicate_id == predicate_id, EPendingQueryMismatch);
    assert!(pending.pre_candidate_mask == receipt_pre_mask, EPendingQueryMismatch);
    assert!(session.candidate_mask == receipt_pre_mask, ECandidateTransitionMismatch);
    assert!(predicate_id < PREDICATE_COUNT, EUnknownPredicate);
    assert!(
        (session.used_predicates & predicate_bit(predicate_id)) == 0,
        EPredicateAlreadyUsed,
    );
    assert!(session.disclosure_count < DISCLOSURE_LIMIT, EDisclosureLimitReached);

    let predicate_mask = predicates::predicate_mask(predicate_id);
    let expected_yes = receipt_pre_mask & predicate_mask;
    let expected_no = receipt_pre_mask & (predicates::universe_mask() ^ predicate_mask);
    assert!(pending.yes_branch == expected_yes, ECandidateTransitionMismatch);
    assert!(pending.no_branch == expected_no, ECandidateTransitionMismatch);

    let post_candidate_mask = if (result) {
        pending.yes_branch
    } else {
        pending.no_branch
    };
    assert!(
        (post_candidate_mask & receipt_pre_mask) == post_candidate_mask,
        ECandidateTransitionMismatch,
    );
    assert!(popcount(post_candidate_mask) >= MINIMUM_SURVIVORS, ECandidateTransitionMismatch);

    let pre_candidate_mask = session.candidate_mask;
    let resolved_nonce = session.query_nonce;
    let _ = session.pending_query.extract();
    session.candidate_mask = post_candidate_mask;
    session.disclosure_count = session.disclosure_count + 1;
    session.used_predicates = session.used_predicates | predicate_bit(predicate_id);
    advance_nonce(session);
    session.state = STATE_ACTIVE;

    event::emit(QueryResolved {
        session: object::id(session),
        level: object::id(level),
        predicate_id,
        query_nonce: resolved_nonce,
        result,
        pre_candidate_mask,
        post_candidate_mask,
        candidate_count: popcount(post_candidate_mask),
        disclosure_count: session.disclosure_count,
        next_query_nonce: session.query_nonce,
    });
}

fun new_level(
    schema_version: u16,
    level_version: u16,
    disclosure_limit: u8,
    minimum_survivors: u8,
    ctx: &mut TxContext,
): LevelConfig {
    assert!(schema_version == SCHEMA_VERSION, EUnsupportedVersion);
    assert!(level_version == LEVEL_VERSION, EUnsupportedVersion);
    assert!(disclosure_limit == DISCLOSURE_LIMIT, EInvalidLevel);
    assert!(minimum_survivors == MINIMUM_SURVIVORS, EInvalidLevel);

    let registered_predicates = predicates::canonical_predicates();
    assert!(predicates::case_count() == CASE_COUNT, EInvalidLevel);
    assert!(registered_predicates.length() == (PREDICATE_COUNT as u64), EInvalidLevel);
    predicates::validate(&registered_predicates);

    let level = LevelConfig {
        id: object::new(ctx),
        product_id: PRODUCT_ID,
        level_id: LEVEL_ID,
        schema_version,
        level_version,
        case_count: CASE_COUNT,
        predicate_count: PREDICATE_COUNT,
        disclosure_limit,
        minimum_survivors,
        verifier_state: VERIFIER_UNAVAILABLE,
        expected_verifier_identity: vector[],
        verdict_verifier_state: VERIFIER_AVAILABLE,
        expected_verdict_verifier_identity: verifier::verdict_verifier_identity(),
        finalized: true,
        predicates: registered_predicates,
    };
    event::emit(LevelCreated {
        level: object::id(&level),
        schema_version,
        level_version,
        case_count: CASE_COUNT,
        predicate_count: PREDICATE_COUNT,
        disclosure_limit,
        minimum_survivors,
        verifier_state: VERIFIER_UNAVAILABLE,
        verdict_verifier_state: VERIFIER_AVAILABLE,
    });
    level
}

fun new_session(
    level: &LevelConfig,
    mode: u8,
    case_commitment: vector<u8>,
    protocol_version: u16,
    level_version: u16,
    ctx: &mut TxContext,
): GameSession {
    assert_level(level);
    if (mode == MODE_RANKED) abort ERankedModeUnavailable;
    assert!(mode == MODE_PRACTICE, ERankedModeUnavailable);
    assert!(protocol_version == PROTOCOL_VERSION, EUnsupportedVersion);
    assert!(level_version == level.level_version, EUnsupportedVersion);
    assert!(case_commitment.length() == COMMITMENT_LENGTH, EInvalidCommitment);

    let session = GameSession {
        id: object::new(ctx),
        player: ctx.sender(),
        level: object::id(level),
        mode,
        case_commitment,
        candidate_mask: predicates::universe_mask(),
        disclosure_count: 0,
        used_predicates: 0,
        query_nonce: 0,
        pending_query: option::none(),
        attempt_nonce: 0,
        pending_accusation: option::none(),
        verdict: option::none(),
        state: STATE_ACTIVE,
        protocol_version,
        level_version,
    };
    event::emit(SessionCreated {
        session: object::id(&session),
        level: object::id(level),
        player: ctx.sender(),
        mode,
        candidate_mask: predicates::universe_mask(),
        candidate_count: CASE_COUNT,
        disclosure_count: 0,
        query_nonce: 0,
        attempt_nonce: 0,
        protocol_version,
        level_version,
    });
    session
}

fun assert_level(level: &LevelConfig) {
    assert!(level.product_id == PRODUCT_ID, EInvalidLevel);
    assert!(level.level_id == LEVEL_ID, EInvalidLevel);
    assert!(level.schema_version == SCHEMA_VERSION, EUnsupportedVersion);
    assert!(level.level_version == LEVEL_VERSION, EUnsupportedVersion);
    assert!(level.case_count == CASE_COUNT, EInvalidLevel);
    assert!(level.predicate_count == PREDICATE_COUNT, EInvalidLevel);
    assert!(level.disclosure_limit == DISCLOSURE_LIMIT, EInvalidLevel);
    assert!(level.minimum_survivors == MINIMUM_SURVIVORS, EInvalidLevel);
    assert!(level.verifier_state == VERIFIER_UNAVAILABLE, EInvalidVerifier);
    assert!(level.expected_verifier_identity.is_empty(), EInvalidVerifier);
    if (level.verdict_verifier_state == VERIFIER_UNAVAILABLE) {
        assert!(level.expected_verdict_verifier_identity.is_empty(), EInvalidVerifier);
    } else {
        assert!(level.verdict_verifier_state == VERIFIER_AVAILABLE, EInvalidVerifier);
        assert_valid_verifier_identity(&level.expected_verdict_verifier_identity);
    };
    assert!(level.finalized, EInvalidLevel);
    predicates::validate(&level.predicates);
}

fun assert_session_binding(session: &GameSession, level: &LevelConfig) {
    assert_level(level);
    assert!(session.level == object::id(level), EInvalidLevel);
    assert!(session.mode == MODE_PRACTICE, EInvalidSessionState);
    assert!(session.protocol_version == PROTOCOL_VERSION, EUnsupportedVersion);
    assert!(session.level_version == level.level_version, EUnsupportedVersion);
}

fun assert_not_terminal(session: &GameSession) {
    assert!(session.state != STATE_TERMINAL, EInvalidSessionState);
}

fun assert_valid_commitment(commitment: &vector<u8>) {
    assert!(commitment.length() == COMMITMENT_LENGTH, EInvalidCommitment);
    assert!(contains_nonzero_byte(commitment), EInvalidCommitment);
}

fun assert_valid_verifier_identity(identity: &vector<u8>) {
    assert!(identity.length() == COMMITMENT_LENGTH, EInvalidVerifier);
    assert!(contains_nonzero_byte(identity), EInvalidVerifier);
}

fun contains_nonzero_byte(bytes: &vector<u8>): bool {
    let mut index = 0;
    while (index < bytes.length()) {
        if (*bytes.borrow(index) != 0) return true;
        index = index + 1;
    };
    false
}

fun session_attempt_domain_commitment(
    session: &GameSession,
    attempt_nonce: u64,
): vector<u8> {
    let mut input = SESSION_ATTEMPT_DOMAIN;
    input.append(bcs::to_bytes(&object::id(session)));
    input.append(bcs::to_bytes(&attempt_nonce));
    input.append(bcs::to_bytes(&session.protocol_version));
    input.append(bcs::to_bytes(&session.level_version));
    hash::blake2b256(&input)
}

fun predicate_bit(predicate_id: u8): u16 {
    1u16 << predicate_id
}

fun popcount(mask: u64): u8 {
    let mut remaining = mask;
    let mut count = 0u8;
    while (remaining != 0) {
        remaining = remaining & (remaining - 1);
        count = count + 1;
    };
    count
}

fun advance_nonce(session: &mut GameSession) {
    assert!(session.query_nonce < std::u64::max_value!(), EInvalidSessionState);
    session.query_nonce = session.query_nonce + 1;
}

fun advance_attempt_nonce(session: &mut GameSession) {
    assert!(session.attempt_nonce < std::u64::max_value!(), EInvalidSessionState);
    session.attempt_nonce = session.attempt_nonce + 1;
}

/// Returns the immutable level object's ID.
public fun level_object_id(level: &LevelConfig): ID {
    object::id(level)
}

/// Returns the registered predicate definitions.
public fun registered_predicates(level: &LevelConfig): &vector<PredicateDefinition> {
    &level.predicates
}

/// Returns the current candidate mask.
public fun candidate_mask(session: &GameSession): u64 {
    session.candidate_mask
}

/// Returns the number of candidates in the current mask.
public fun candidate_count(session: &GameSession): u8 {
    popcount(session.candidate_mask)
}

/// Returns the resolved disclosure count.
public fun disclosure_count(session: &GameSession): u8 {
    session.disclosure_count
}

/// Returns the used-predicate bitset.
public fun used_predicates(session: &GameSession): u16 {
    session.used_predicates
}

/// Returns the next expected query nonce.
public fun query_nonce(session: &GameSession): u64 {
    session.query_nonce
}

/// Returns the stable session state identifier.
public fun session_state(session: &GameSession): u8 {
    session.state
}

/// Returns true when a query authorization is unresolved.
public fun has_pending_query(session: &GameSession): bool {
    session.pending_query.is_some()
}

/// Returns the case commitment, never its private opening.
public fun case_commitment(session: &GameSession): &vector<u8> {
    &session.case_commitment
}

/// Returns the expected query verifier identity; empty while unavailable.
public fun expected_verifier_identity(level: &LevelConfig): &vector<u8> {
    &level.expected_verifier_identity
}

/// Returns the expected verdict verifier identity; empty while unavailable.
public fun expected_verdict_verifier_identity(level: &LevelConfig): &vector<u8> {
    &level.expected_verdict_verifier_identity
}

/// Returns the next expected terminal-attempt nonce.
public fun attempt_nonce(session: &GameSession): u64 {
    session.attempt_nonce
}

/// Returns true while the commitment-only terminal accusation is unresolved.
public fun has_pending_accusation(session: &GameSession): bool {
    session.pending_accusation.is_some()
}

/// Returns true after verified irreversible terminal finalization.
public fun has_verdict(session: &GameSession): bool {
    session.verdict.is_some()
}

/// Returns the authorized player address for future release-policy checks.
public fun session_player(session: &GameSession): address {
    session.player
}

/// Returns the pending accusation attempt nonce.
public fun pending_accusation_attempt_nonce(session: &GameSession): u64 {
    session.pending_accusation.borrow().attempt_nonce
}

/// Returns the pending salted accusation commitment.
public fun pending_accusation_commitment(session: &GameSession): &vector<u8> {
    &session.pending_accusation.borrow().accusation_commitment
}

/// Returns the pending session-attempt domain commitment.
public fun pending_session_attempt_domain_commitment(
    session: &GameSession,
): &vector<u8> {
    &session.pending_accusation.borrow().session_attempt_domain_commitment
}

/// Returns the terminal attempt nonce.
public fun verdict_attempt_nonce(session: &GameSession): u64 {
    session.verdict.borrow().attempt_nonce
}

/// Returns the terminal accusation commitment.
public fun verdict_accusation_commitment(session: &GameSession): &vector<u8> {
    &session.verdict.borrow().accusation_commitment
}

/// Returns the terminal session-attempt domain commitment.
public fun verdict_session_attempt_domain_commitment(
    session: &GameSession,
): &vector<u8> {
    &session.verdict.borrow().session_attempt_domain_commitment
}

/// Returns the terminal verdict commitment, never its opening or result bit.
public fun verdict_commitment(session: &GameSession): &vector<u8> {
    &session.verdict.borrow().verdict_commitment
}

/// Returns the canonical Walrus encrypted-verdict blob ID as an onchain u256.
public fun encrypted_verdict_blob_id(session: &GameSession): u256 {
    session.verdict.borrow().encrypted_verdict_blob_id
}

/// Returns the verifier identity recorded at successful finalization.
public fun verdict_verifier_identity(session: &GameSession): &vector<u8> {
    &session.verdict.borrow().verifier_identity
}

/// Returns the verifier status recorded at successful finalization.
public fun verdict_verifier_status(session: &GameSession): u8 {
    session.verdict.borrow().verifier_status
}

/// Returns the accusation start timestamp recorded in the terminal record.
public fun verdict_started_at_ms(session: &GameSession): u64 {
    session.verdict.borrow().started_at_ms
}

/// Returns the terminal finalization timestamp.
public fun verdict_finalized_at_ms(session: &GameSession): u64 {
    session.verdict.borrow().finalized_at_ms
}

#[test_only]
public fun new_level_for_testing(ctx: &mut TxContext): LevelConfig {
    new_level(
        SCHEMA_VERSION,
        LEVEL_VERSION,
        DISCLOSURE_LIMIT,
        MINIMUM_SURVIVORS,
        ctx,
    )
}

#[test_only]
public fun new_level_with_rules_for_testing(
    schema_version: u16,
    level_version: u16,
    disclosure_limit: u8,
    minimum_survivors: u8,
    ctx: &mut TxContext,
): LevelConfig {
    new_level(
        schema_version,
        level_version,
        disclosure_limit,
        minimum_survivors,
        ctx,
    )
}

#[test_only]
public fun new_session_for_testing(
    level: &LevelConfig,
    mode: u8,
    case_commitment: vector<u8>,
    protocol_version: u16,
    level_version: u16,
    ctx: &mut TxContext,
): GameSession {
    new_session(
        level,
        mode,
        case_commitment,
        protocol_version,
        level_version,
        ctx,
    )
}

#[test_only]
public fun enable_verdict_verifier_for_testing(
    level: &mut LevelConfig,
    verifier_identity: vector<u8>,
) {
    assert_valid_verifier_identity(&verifier_identity);
    level.verdict_verifier_state = VERIFIER_AVAILABLE;
    level.expected_verdict_verifier_identity = verifier_identity;
}

#[test_only]
public fun set_attempt_nonce_for_testing(session: &mut GameSession, nonce: u64) {
    session.attempt_nonce = nonce;
}

#[test_only]
public fun set_candidate_mask_for_testing(session: &mut GameSession, mask: u64) {
    session.candidate_mask = mask;
}

#[test_only]
public fun set_disclosure_count_for_testing(session: &mut GameSession, count: u8) {
    session.disclosure_count = count;
}

#[test_only]
public fun set_used_predicates_for_testing(session: &mut GameSession, used: u16) {
    session.used_predicates = used;
}

#[test_only]
public fun set_query_nonce_for_testing(session: &mut GameSession, nonce: u64) {
    session.query_nonce = nonce;
}

#[test_only]
public fun practice_mode_for_testing(): u8 {
    MODE_PRACTICE
}

#[test_only]
public fun ranked_mode_for_testing(): u8 {
    MODE_RANKED
}

#[test_only]
public fun protocol_version_for_testing(): u16 {
    PROTOCOL_VERSION
}

#[test_only]
public fun level_version_for_testing(): u16 {
    LEVEL_VERSION
}

#[test_only]
public fun receipt_version_for_testing(): u16 {
    RECEIPT_VERSION
}

#[test_only]
public fun query_ttl_ms_for_testing(): u64 {
    QUERY_TTL_MS
}

#[test_only]
public fun accusation_pending_state_for_testing(): u8 {
    STATE_ACCUSATION_PENDING
}

#[test_only]
public fun terminal_state_for_testing(): u8 {
    STATE_TERMINAL
}

#[test_only]
public fun verdict_receipt_version_for_testing(): u16 {
    VERDICT_RECEIPT_VERSION
}

#[test_only]
public fun verified_verdict_status_for_testing(): u8 {
    VERIFIER_VERIFIED
}

#[test_only]
public fun session_attempt_domain_commitment_for_testing(
    session: &GameSession,
    attempt_nonce: u64,
): vector<u8> {
    session_attempt_domain_commitment(session, attempt_nonce)
}

#[test_only]
public fun accusation_started_fields_for_testing(
    emitted: &AccusationStarted,
): (ID, ID, u64, vector<u8>, vector<u8>, u64) {
    (
        emitted.session,
        emitted.level,
        emitted.attempt_nonce,
        emitted.accusation_commitment,
        emitted.session_attempt_domain_commitment,
        emitted.started_at_ms,
    )
}

#[test_only]
public fun verdict_finalized_fields_for_testing(
    emitted: &VerdictFinalized,
): (ID, ID, u64, vector<u8>, vector<u8>, vector<u8>, u256, vector<u8>, u8, u64) {
    (
        emitted.session,
        emitted.level,
        emitted.attempt_nonce,
        emitted.accusation_commitment,
        emitted.session_attempt_domain_commitment,
        emitted.verdict_commitment,
        emitted.encrypted_verdict_blob_id,
        emitted.verifier_identity,
        emitted.verifier_status,
        emitted.finalized_at_ms,
    )
}

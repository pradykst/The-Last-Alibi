# The Last Alibi S2 terminal-verdict boundary

S2 adds the canonical terminal accusation and verdict-state foundation to the S1 Practice-session package. It does **not** implement production proof verification, a circuit, trusted setup, Walrus upload or availability checks, Seal release, World authorization, UI wiring, wallet handling, publication, or deployment.

## Canonical lifecycle

`GameSession.state` uses these stable values:

| Value | State             | Allowed canonical transition                        |
| ----: | ----------------- | --------------------------------------------------- |
|     1 | Active            | safe query authorization or one terminal accusation |
|     2 | QueryPending      | S1 proof-backed resolution or expiry                |
|     3 | AccusationPending | verified verdict finalization only                  |
|     4 | Terminal          | none                                                |

`start_accusation` requires the session owner, `Active`, no pending query, an exact next attempt nonce, and a nonzero 32-byte salted accusation commitment. It stores no accusation fields or salt. The session-attempt nonce advances immediately, the commitment-only `PendingAccusation` is created, and the session enters `AccusationPending`. There is no cancellation or expiry function for an accusation.

`finalize_verdict` accepts only the ability-less `verifier::VerdictProofReceipt`. It checks the receipt version, session and level IDs, attempt nonce, stored case commitment, stored accusation commitment, recomputed session-attempt domain commitment, nonzero verdict commitment, nonzero Walrus blob ID, verified status, and the level's expected verdict-verifier identity. Success consumes the pending accusation, writes one `VerdictRecord`, and enters `Terminal`. Query authorization, query resolution/expiry, repeat accusation, and repeat finalization all reject after Terminal.

Neither `PendingAccusation`, `VerdictRecord`, nor their events contains the accusation opening, accusation salt, hidden case, verdict bit, verdict opening, verdict salt, proof witness, ciphertext, or decryption material. The events contain only public object IDs, commitments, nonces, timestamps, the Walrus blob ID, and verifier metadata.

## Session-attempt domain commitment

Move computes the domain commitment; callers cannot select it:

```text
Blake2b-256(
  UTF8("the-last-alibi::verdict::session-attempt::v1") ||
  BCS(session_object_id: ID) ||
  BCS(attempt_nonce: u64) ||
  BCS(protocol_version: u16) ||
  BCS(level_version: u16)
)
```

BCS integers are little-endian. The `ID` is its 32-byte Sui object identifier. For the only S2 attempt, the session starts with next attempt nonce `0`; starting the accusation stores attempt `0` and advances the authoritative next nonce to `1`.

This follows the bundled BCS and hashing interfaces in `.tools/sui-pilot/.move-book-docs/book/programmability/bcs.md` and `.tools/sui-pilot/.move-book-docs/book/programmability/cryptography-and-hashing.md`.

## Exact Z1 proof inputs

`verifier::verify_verdict_proof` is the sole production constructor boundary for `VerdictProofReceipt`. In S2 it always aborts with `EVerifierUnavailable` (20). A submitted proof, caller assertion, fixture value, transaction success, or boolean is never treated as verification. Only `#[test_only]` constructors can produce verified/unverified receipts in Move tests; test-only code is stripped from production builds as documented in `.tools/sui-pilot/.move-book-docs/book/testing/testing-basics.md`.

Z1 must make the circuit bind these four logical public inputs, each an exact `vector<u8>` of 32 bytes:

1. `case_commitment`
2. `accusation_commitment`
3. `session_attempt_domain_commitment`
4. `verdict_commitment`

For BN254, Z1 must encode them as exactly eight field inputs, staying within Sui's documented eight-input limit:

```text
case[0..16] LE-u128, case[16..32] LE-u128,
accusation[0..16] LE-u128, accusation[16..32] LE-u128,
domain[0..16] LE-u128, domain[16..32] LE-u128,
verdict[0..16] LE-u128, verdict[16..32] LE-u128
```

Each `u128` value is serialized as one canonical 32-byte little-endian BN254 scalar, in the order above, and concatenated for `groth16::public_proof_inputs_from_bytes`. The circuit and prover must use the same byte order and limb order. The private witness must prove openings for the case and accusation commitments, derive the verdict bit from their equality, open the verdict commitment to that derived bit, and include the supplied domain commitment in the statement. The accusation opening, case fields, salts, and verdict bit remain private.

Z1 must then:

- pin or verifiably identify the expected prepared verification key;
- set `verdict_verifier_state` to available and store a nonzero 32-byte `expected_verdict_verifier_identity` in the immutable level configuration;
- validate all four commitment lengths and the exact public-input serialization;
- call native Sui Groth16 verification;
- construct `VerdictProofReceipt` only after native verification returns true;
- copy the already validated session, level, attempt, verifier identity, and nonzero encrypted-verdict blob ID into that receipt;
- keep every receipt constructor private/package-owned and retain no fallback path.

Sui's native interface, verification-key responsibility, and eight-input limit are documented in `.tools/sui-pilot/.sui-docs/develop/cryptography/groth16.mdx`. S2 deliberately leaves the level verdict verifier unavailable, so production finalization remains impossible until Z1 supplies this implementation and identity.

## Walrus and future Seal release

`encrypted_verdict_blob_id` is stored as a nonzero Move `u256`, Walrus's canonical onchain blob-ID representation. S2 does not fabricate, upload, certify, fetch, or validate availability for a blob. The TypeScript boundary renders the value as a lossless 64-hex-digit string; clients can later convert the real `u256` to Walrus's 43-character URL-safe base64 form.

Walrus documents blob IDs as `u256` values typically encoded as URL-safe base64 in `.tools/sui-pilot/.walrus-docs/system-overview/operations.mdx`, and documents that blobs and IDs are public in `.tools/sui-pilot/.walrus-docs/data-security.mdx`. The verdict capsule therefore must be authenticated and encrypted before a future upload.

A future Seal policy can use the public accessors for player, Terminal state, verdict commitment, and encrypted-verdict blob ID. It must additionally check the exact session, protocol and level versions, and authorized player. S2 stores no capsule plaintext and grants no decryption authority.

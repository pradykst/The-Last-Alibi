# The Last Alibi S2 terminal-verdict boundary

S2 adds the canonical terminal accusation and verdict-state foundation to the S1 Practice-session package. Z1 now supplies its native BN254 Groth16 verdict verifier and development circuit parameters; see [Z1 native Groth16 verdict verification](./Z1_NATIVE_GROTH16.md). Neither lane implements a production trusted-setup ceremony, Walrus upload or availability checks, Seal release, World authorization, UI wiring, wallet handling, publication, or deployment.

> **TEST/DEVELOPMENT PARAMETERS ONLY. INSECURE FOR PRODUCTION.** Z1's committed verification key is reproducible development material, not the output of a production ceremony.

## Canonical lifecycle

`GameSession.state` uses these stable values:

| Value | State             | Allowed canonical transition                        |
| ----: | ----------------- | --------------------------------------------------- |
|     1 | Active            | safe query authorization or one terminal accusation |
|     2 | QueryPending      | S1 proof-backed resolution or expiry                |
|     3 | AccusationPending | verified verdict finalization only                  |
|     4 | Terminal          | none                                                |

`start_accusation` requires the session owner, `Active`, no pending query, an exact next attempt nonce, a nonzero 32-byte salted accusation commitment, and a canonical nonzero Walrus content Blob ID. It stores no accusation fields or salt. The authorized player single-assigns the expected Blob ID in `PendingAccusation`; no relayer or later call can replace it for that attempt. The session-attempt nonce advances immediately and the session enters `AccusationPending`. There is no cancellation or expiry function for an accusation.

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
  BCS(level_version: u16) ||
  raw_walrus_content_blob_id[32]
)
```

BCS integers are little-endian and the `ID` is the raw 32-byte Sui session object identifier. The final 32 bytes are the canonical URL-safe-Base64-decoded Walrus content Blob ID. Walrus interprets those raw bytes as an unsigned big-endian `u256`; because Sui BCS encodes `u256` little-endian, Move reverses its BCS bytes before hashing. For the only S2 attempt, the session starts with next attempt nonce `0`; starting the accusation stores attempt `0` and advances the authoritative next nonce to `1`.

This follows the bundled BCS and hashing interfaces in `.tools/sui-pilot/.move-book-docs/book/programmability/bcs.md` and `.tools/sui-pilot/.move-book-docs/book/programmability/cryptography-and-hashing.md`.

## Exact Z1 proof inputs

`alibi::verify_verdict_proof` is the sole public production path to the package-only `verifier::verify_verdict_proof` constructor for `VerdictProofReceipt`. It derives the case, accusation, version, nonce, and blob-bound domain inputs from canonical state before native verification under the package-pinned key. A submitted caller assertion, fixture value, transaction success, or boolean is never treated as verification. Only `#[test_only]` constructors can bypass native verification in Move tests; test-only code is stripped from production builds as documented in `.tools/sui-pilot/.move-book-docs/book/testing/testing-basics.md`.

The Z1 circuit binds these four logical public inputs, each an exact `vector<u8>` of 32 bytes:

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

The production Z1 boundary:

- pin or verifiably identify the expected prepared verification key;
- set `verdict_verifier_state` to available and store a nonzero 32-byte `expected_verdict_verifier_identity` in the immutable level configuration;
- validate all four commitment lengths and the exact public-input serialization;
- call native Sui Groth16 verification;
- construct `VerdictProofReceipt` only after native verification returns true;
- require the submitted Blob ID to equal the pending single-assignment ID, constrain that exact ID through the session-attempt digest, and copy it into the receipt;
- keep every receipt constructor private/package-owned and retain no fallback path.

Sui's native interface, verification-key responsibility, and eight-input limit are documented in `.tools/sui-pilot/.sui-docs/develop/cryptography/groth16.mdx`. The immutable level now records the SHA-256 identity of Z1's exact embedded key and marks only the verdict verifier available; the separate query verifier remains fail closed.

## Walrus and future Seal release

`encrypted_verdict_blob_id` is the exact Walrus content-derived Blob ID, stored as a nonzero Move `u256`. The TypeScript transaction boundary accepts only a canonical 43-character URL-safe Base64 Blob ID, decodes exactly 32 bytes, interprets those bytes as Walrus's unsigned big-endian `u256`, and uses a branded value that cannot be confused with a Sui Blob object ID. S2 does not fabricate, upload, certify, fetch, or validate availability for a blob.

Walrus documents content Blob IDs as `u256` values typically encoded as URL-safe Base64 in `.tools/sui-pilot/.walrus-docs/system-overview/operations.mdx`, their raw-byte big-endian interpretation in `.tools/sui-pilot/.walrus-docs/system-overview/red-stuff.mdx`, and the distinct Sui Blob metadata object ID in `.tools/sui-pilot/.walrus-docs/snippets/blob-object-id.mdx`. Blob IDs are public; the verdict capsule therefore must be authenticated and encrypted before upload.

A future Seal policy can use the public accessors for player, Terminal state, verdict commitment, and encrypted-verdict blob ID. It must additionally check the exact session, protocol and level versions, and authorized player. S2 stores no capsule plaintext and grants no decryption authority.

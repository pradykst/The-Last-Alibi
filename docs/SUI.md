# Sui canonical state (S1)

> S2 extends this frozen S1 foundation with AccusationPending and Terminal state. Z1 implements that terminal path's native verifier using test/development Groth16 parameters. See [S2 terminal-verdict boundary](./S2_TERMINAL_VERDICT.md) and [Z1 native Groth16 verdict verification](./Z1_NATIVE_GROTH16.md). The S1 query behavior documented below remains unchanged and fail closed.

> **TEST/DEVELOPMENT PARAMETERS ONLY. INSECURE FOR PRODUCTION. NO TRUSTED-SETUP CEREMONY HAS BEEN PERFORMED.**

S1 establishes the canonical public state and certified-disclosure transition boundary for **The Last Alibi**. It does not claim a testnet deployment. It creates no wallet, signer, key, mnemonic, keystore, credential, package ID, object ID, transaction digest, checkpoint, or explorer URL.

The implementation follows the repository-pinned Sui documentation in `.tools/sui-pilot`, especially the Move Book sections on [package manifests](../.tools/sui-pilot/.move-book-docs/reference/packages.md), [module initializers](../.tools/sui-pilot/.move-book-docs/book/programmability/module-initializer.md), [object storage](../.tools/sui-pilot/.move-book-docs/book/storage/storage-functions.md), and [unit testing](../.tools/sui-pilot/.move-book-docs/book/testing/index.md), plus the Sui documentation for [the Clock object](../.tools/sui-pilot/.sui-docs/sui-stack/on-chain-primitives/access-time.mdx) and [Groth16](../.tools/sui-pilot/.sui-docs/develop/cryptography/groth16.mdx). The TypeScript package follows the pinned [SDK 2.0 migration guide](../.tools/sui-pilot/.ts-sdk-docs/sui/migrations/sui-2.0/index.mdx) and [transaction guide](../.tools/sui-pilot/.ts-sdk-docs/sui/transactions/basics.mdx).

## Object model and authority

The Move package is `contracts/alibi` and contains four modules.

- `alibi::predicates` mechanically derives the 12 registered equality predicates over the fixed 4 × 4 × 2 × 2 universe.
- `alibi::alibi` owns level initialization, Practice sessions, warrant authorization, expiry, and receipt consumption.
- `alibi::verifier` owns the unforgeable proof receipt types. Query verification remains unavailable; accusation-verdict verification uses native BN254 Groth16 and can mint an ability-less verdict receipt only after successful verification.
- `alibi::verdict_verifying_key` embeds the immutable 520-byte development verification key and its SHA-256 identity.

`PublisherCap` is created once by the package initializer. `create_level` consumes it, creates the sole canonical `LevelConfig`, and freezes that object. The capability grants no access to player sessions. Consuming the capability is the uniqueness rule: the same authority cannot initialize another level.

`LevelConfig` is immutable and contains only public policy:

- product `the-last-alibi` and level `the-last-exhibit` as byte strings;
- schema and level version 1;
- 64 cases and 12 predicates;
- disclosure limit 5 and minimum branch population 2;
- verifier state 0 (unavailable) and an empty expected verifier identity;
- the mechanically generated predicate definitions.

The immutable level keeps the query verifier unavailable and stores no query identity. It marks the verdict verifier available and stores `8d33885ac91333e3ad68a2885c2f030e43a1042abb95cb68ddd2c0e59f700b8f`, the SHA-256 identity of the exact embedded Z1 verification key.
`GameSession` is an address-owned object controlled by its `player`. It contains the level object ID, Practice mode, a 32-byte case commitment, a `u64` candidate mask, disclosure counter, 12-bit used-predicate set in a `u16`, strictly increasing `u64` query nonce, embedded optional pending query, state, and protocol/level versions.

The initial candidate mask is `0xffffffffffffffff`, representing all 64 cases. Neither Move nor TypeScript routes masks through JavaScript `number` values.

## Public and prohibited data

The object and event schemas may expose object IDs, player address, public versions, predicate ID, nonce, candidate masks/counts, disclosure count, branch masks, expiry timestamp, and the result bit only after receipt-backed resolution.

They never contain the hidden case, commitment opening, case salt, private witness, accusation plaintext, verdict plaintext, verdict salt, proving material, private configuration, wallet material, or fabricated chain identifiers. The TypeScript decoders use strict runtime schemas, reject extra secret-bearing fields, and verify the configured package and exact Move object type.

## Stable numeric mapping

Case index is:

```text
(((suspect * 4) + room) * 2 + weapon) * 2 + time
```

Predicate IDs follow the ordering already defined by `packages/game-engine`; S1 does not create another gameplay manifest.

| Move ID | Dimension ID | Value index | Browser-safe value ID | Browser-safe predicate ID      |
| ------: | -----------: | ----------: | --------------------- | ------------------------------ |
|       0 |  0 (suspect) |           0 | `suspect_archivist`   | `predicate_suspect_archivist`  |
|       1 |  0 (suspect) |           1 | `suspect_security`    | `predicate_suspect_security`   |
|       2 |  0 (suspect) |           2 | `suspect_patron`      | `predicate_suspect_patron`     |
|       3 |  0 (suspect) |           3 | `suspect_restorer`    | `predicate_suspect_restorer`   |
|       4 |     1 (room) |           0 | `room_gallery`        | `predicate_room_gallery`       |
|       5 |     1 (room) |           1 | `room_restoration`    | `predicate_room_restoration`   |
|       6 |     1 (room) |           2 | `room_archive`        | `predicate_room_archive`       |
|       7 |     1 (room) |           3 | `room_conservatory`   | `predicate_room_conservatory`  |
|       8 |   2 (weapon) |           0 | `weapon_dagger`       | `predicate_weapon_dagger`      |
|       9 |   2 (weapon) |           1 | `weapon_bust`         | `predicate_weapon_bust`        |
|      10 |     3 (time) |           0 | `time_pre_blackout`   | `predicate_time_pre_blackout`  |
|      11 |     3 (time) |           1 | `time_post_blackout`  | `predicate_time_post_blackout` |

The checked-in vectors in `contracts/alibi/test-vectors` and generated Move test are produced mechanically by `contracts/alibi/scripts/generate-predicate-vectors.test.ts` from `packages/game-engine`.

Modes are 0 Practice and 1 Ranked. Only Practice creation succeeds. Session states are 1 active and 2 query pending. Verifier state 0 means unavailable.

## Entry and public transaction functions

- `create_level(cap, schema_version, level_version, disclosure_limit, minimum_survivors)` consumes the one-time cap and freezes the canonical level.
- `create_session(level, mode, case_commitment, protocol_version, level_version)` creates an address-owned Practice session. Ranked mode aborts.
- `authorize_query(session, level, predicate_id, expected_nonce, clock)` authorizes only a registered, unused predicate whose YES and NO branches each retain at least two candidates.
- `expire_query(session, level, clock)` clears an expired pending query without revealing a result, changing candidates, increasing disclosures, or marking the predicate used. It advances the nonce so a late receipt cannot match.
- `verifier::verify_query_proof(...)` is a later query-proof boundary and still always aborts.
- `alibi::verify_verdict_proof(...)` validates the authoritative pending attempt and exact Walrus content Blob ID, then the package-only verifier constructs the fixed eight-field public-input vector, verifies a 128-byte proof with Sui's native BN254 Groth16 API under the embedded key, and only then returns an ability-less receipt.
- `resolve_query(session, level, receipt)` accepts only the verifier module's ability-less receipt, checks every binding, selects the stored branch, and consumes the receipt. It accepts no replacement candidate mask.

There is intentionally no player cancellation function. There is no oracle, administrator, publisher, or testing bypass in production bytecode.

## Transaction lifecycle

1. The application builds a transaction with `@alibi/sui`; no signer is loaded by the package.
2. An injected signer/client submits the transaction and supplies the actual chain digest.
3. The adapter represents this as `pending` only after validating the returned digest.
4. An independently injected confirmer waits for successful execution and a checkpoint.
5. Only then does the adapter return `confirmed`.
6. State is re-read through a package/type-validating public object reader.

This separation permits future sponsored or relayed execution without placing wallet policy in the S1 package. RPC failures are converted to stable app-facing errors without RPC bodies, paths, environment values, or credentials.

## Events

- `LevelCreated`
- `SessionCreated`
- `QueryAuthorized`
- `QueryExpired`
- `QueryResolved`

`QueryResolved` is the only event that includes the result bit. It can only be emitted after a valid receipt is consumed. All events are compact public transition records and contain no hidden witness data.

## Abort codes

| Code | Constant                       | Meaning                                                     |
| ---: | ------------------------------ | ----------------------------------------------------------- |
|    0 | `EUnauthorized`                | Sender does not own the Practice session.                   |
|    1 | `EUnsupportedVersion`          | Schema, level, protocol, or receipt version is unsupported. |
|    2 | `EInvalidLevel`                | Canonical level policy or predicate definition is invalid.  |
|    3 | `EInvalidCommitment`           | Commitment is not exactly 32 bytes.                         |
|    4 | `EInvalidSessionState`         | Session is not in the required active/pending state.        |
|    5 | `EUnknownPredicate`            | Predicate ID is outside 0–11.                               |
|    6 | `EPredicateAlreadyUsed`        | Predicate was resolved previously.                          |
|    7 | `EDisclosureLimitReached`      | Five disclosures have already resolved.                     |
|    8 | `EQueryAlreadyPending`         | Another query is pending.                                   |
|    9 | `EStaleOrWrongNonce`           | Authorization nonce does not equal the session nonce.       |
|   10 | `EUnsafeYesBranch`             | YES would leave fewer than two candidates.                  |
|   11 | `EUnsafeNoBranch`              | NO would leave fewer than two candidates.                   |
|   12 | `EPendingQueryMissing`         | Resolution or expiry has no pending authorization.          |
|   13 | `EPendingQueryMismatch`        | Pending state and receipt bindings differ.                  |
|   14 | `EPrematureExpiry`             | Clock has not reached the pending deadline.                 |
|   15 | `EInvalidVerifier`             | Receipt verifier identity differs from the level.           |
|   16 | `EInvalidProofReceipt`         | Receipt version, session, or level is invalid.              |
|   17 | `EReceiptReplay`               | Receipt nonce precedes the authoritative nonce.             |
|   18 | `ECandidateTransitionMismatch` | Stored or proposed transition violates mask invariants.     |
|   19 | `ERankedModeUnavailable`       | Ranked creation has no permit path in S1.                   |
|   20 | `EVerifierUnavailable`         | Production Groth16 verification is not implemented.         |

## Why resolution remains unavailable

Query-proof functionality is outside Z1's verdict scope. `verifier::verify_query_proof` therefore continues to abort with stable code 20. Only a `#[test_only]` helper can construct query receipts for invariant tests; Sui excludes test-only functions from production bytecode. The separate verdict receipt has no production constructor other than successful native verification.

## Local build and tests

The validated toolchain is Sui CLI and `move-analyzer` `1.76.0-6effb4523834`, Node 22, pnpm 9.15.4, and `@mysten/sui` 2.22.1. Prepend the installed tools for each PowerShell session:

```powershell
$env:Path = "$env:LOCALAPPDATA\bin;$env:Path"
Get-Command sui
Get-Command move-analyzer
sui --version
move-analyzer --version
```

Set up the pinned documentation/tool integration and verify its revision:

```powershell
./scripts/setup-sui-pilot.ps1
git -C .tools/sui-pilot rev-parse HEAD
```

The expected revision is `034e4d2b657018bf9863c091febffcf74c886f28`.

Use an existing operator-controlled Sui client configuration outside the repository. Do not ask the CLI to create one during CI:

```powershell
sui move --client.config <client-yaml> build --path contracts/alibi --build-env testnet --warnings-are-errors
sui move --client.config <client-yaml> test --path contracts/alibi --build-env testnet --warnings-are-errors
sui move --client.config <client-yaml> lint --path contracts/alibi --build-env testnet
pnpm --filter @alibi/game-engine test
pnpm --filter @alibi/sui test
pnpm check
$env:ALIBI_RUNTIME_MODE = 'fixture'
pnpm --filter @alibi/web build
```

The client YAML used for build/test need not contain signer material; publication does.

## Safe future testnet publication

S1 itself was not published. A later authorized operator should first rerun every check on the exact source revision, use a funded testnet address and keystore stored outside the repository, confirm the active environment and address, and perform a dry run before publication.

```powershell
$env:Path = "$env:LOCALAPPDATA\bin;$env:Path"
sui client --client.config <operator-client-yaml> active-env
sui client --client.config <operator-client-yaml> active-address
sui move --client.config <operator-client-yaml> test --path contracts/alibi --build-env testnet --warnings-are-errors
sui client --client.config <operator-client-yaml> publish contracts/alibi --build-env testnet --warnings-are-errors --dry-run --gas-budget <mist-budget>
sui client --client.config <operator-client-yaml> publish contracts/alibi --build-env testnet --warnings-are-errors --gas-budget <mist-budget> --json
```

After publication, the operator must execute `create_level` once with the returned `PublisherCap`, using schema/level version 1, disclosure limit 5, and minimum survivors 2. Record only public evidence:

- network (`testnet`);
- deployed source revision;
- package ID;
- frozen `LevelConfig` object ID;
- publish and level-creation transaction digests;
- corresponding official explorer links.

Configure live consumers with only `ALIBI_SUI_NETWORK`, `ALIBI_SUI_PACKAGE_ID`, and `ALIBI_SUI_LEVEL_CONFIG_ID`. Missing or invalid configuration fails closed; there is no fixture fallback. Never commit an operator client file, private key, mnemonic, keystore, recovery material, or `.env`.

Remaining publication blockers are deliberate: a production circuit-specific trusted-setup ceremony and key replacement, an authorized funded testnet operator, external signer configuration, gas budget selection, and execution evidence capture. Ranked mode additionally requires the later World/Sui permit path. No publication or wallet operation is part of Z1.

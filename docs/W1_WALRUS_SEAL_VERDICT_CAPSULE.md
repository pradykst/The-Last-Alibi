# W1 Walrus + Seal terminal verdict capsule

W1 stores only a Seal ciphertext in Walrus and releases its plaintext only when
the immutable terminal `GameSession` authorizes the recorded player. Walrus and
Seal do not decide whether a verdict is correct. Z1 Groth16 verification and the
Poseidon verdict commitment remain the correctness boundary.

## Pinned SDK surface

The repository uses exact direct dependencies:

- `@mysten/sui` 2.22.1
- `@mysten/walrus` 1.2.9
- `@mysten/seal` 1.3.4
- `@mysten/bcs` 2.1.0

New Sui access uses `SuiGrpcClient`. The Testnet gRPC endpoint is
`https://fullnode.testnet.sui.io:443`. Walrus's current Testnet upload relay is
`https://upload-relay.testnet.walrus.space`; the public aggregator and publisher
routes are recorded in `packages/sui/src/partner-clients.ts`.

The Testnet Seal framework package is
`0xdccbeb87767be2b2346af5575eb139807205e4c23ec53dc616f951fe1d814112`.
W1's default development configuration uses the current official decentralized
Testnet committee object
`0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98`.
That object represents a 3-of-5 MPC committee (Mysten Labs, Natsai, Overclock,
NodeInfra, and Ruby Nodes). Seal therefore encodes one outer service with weight
1 and outer threshold 1; this does not reduce the committee's internal 3-of-5
threshold. The installed SDK requires the committee's transport-only aggregator
URL, currently `https://seal-aggregator-testnet.mystenlabs.com`, because it is
not supplied as the onchain key-server URL. The committee object ID remains the
cryptographic service identity. The official committee configuration uses
`verifyKeyServers: false`; signed committee shares plus
`checkShareConsistency: true` provide the relevant response checks.

Testnet partner infrastructure has no availability or persistence guarantee.

## Canonical capsule

`VerdictCapsuleV1` is a 143-byte BCS struct with no variable-width fields:

| Offset | Width | Field                  | Encoding                                  |
| -----: | ----: | ---------------------- | ----------------------------------------- |
|      0 |     2 | capsule format version | `u16` little-endian, value 1              |
|      2 |     2 | protocol version       | `u16` little-endian                       |
|      4 |     2 | level version          | `u16` little-endian                       |
|      6 |    32 | GameSession ID         | raw normalized Sui object-ID bytes        |
|     38 |     8 | attempt nonce          | `u64` little-endian                       |
|     46 |    32 | accusation commitment  | canonical BN254 Fr, 32-byte little-endian |
|     78 |     1 | verdict                | strict `u8`, exactly 0 or 1               |
|     79 |    32 | verdict salt           | canonical BN254 Fr, 32-byte little-endian |
|    111 |    32 | verdict commitment     | canonical BN254 Fr, 32-byte little-endian |

Decode rejects any other length, version, verdict byte, noncanonical field
encoding, truncation, or trailing bytes. Release also requires exact equality
with terminal Sui state for session, nonce, protocol/level versions, accusation
commitment, and verdict commitment, then recomputes:

```text
Poseidon(5)(
  LE("TLA_VERDICT_V1"),
  protocol_version,
  level_version,
  verdict_bit,
  verdict_salt
)
```

The plaintext contains no hidden case, case salt, accusation opening,
accusation salt, wallet material, or Seal secret. The release API returns only
verified `YES` or `NO` and public status/identity fields; it never returns the
verdict salt or capsule bytes.

## Seal inner identity

The 152-byte inner identity is the BCS concatenation below. Seal prepends the
first-published policy package ID as its namespace.

| Offset | Width | Field                                             |
| -----: | ----: | ------------------------------------------------- |
|      0 |     1 | BCS vector length, exactly 41                     |
|      1 |    41 | UTF-8 `the-last-alibi::seal::verdict-capsule::v1` |
|     42 |     2 | identity version `u16` LE, value 1                |
|     44 |    32 | raw normalized GameSession ID                     |
|     76 |     8 | attempt nonce `u64` LE                            |
|     84 |     2 | protocol version `u16` LE                         |
|     86 |     2 | level version `u16` LE                            |
|     88 |    32 | raw accusation commitment                         |
|    120 |    32 | raw verdict commitment                            |

The identity is also passed as AES-256-GCM authenticated data. The Move parser
requires the exact length, BCS domain prefix, full consumption, and equality of
every field to authoritative terminal state.

The Walrus Blob ID is deliberately excluded from this identity: the Blob ID is
a content hash of the final Seal ciphertext, so including it in the encryption
identity would create a hash/encryption cycle.

The complete association is instead:

1. Seal identity binds session, attempt, versions, accusation commitment, and
   verdict commitment.
2. Seal produces one immutable AES-GCM ciphertext.
3. Walrus derives one canonical content Blob ID from those exact bytes.
4. Z1's unchanged BLAKE2b session-attempt digest binds that Blob ID to the
   Groth16 proof.
5. `PendingAccusation` single-assigns the same Blob ID.
6. `VerdictRecord` records that ID and both commitments.
7. Release reads only the terminal record's ID, checks retrieved bytes against
   it, decrypts under the reconstructed identity, compares the capsule to
   terminal state, and verifies the Poseidon opening.

The Z1 eight-scalar/256-byte public-input interface is unchanged.

## Walrus write and retry boundary

`prepareTerminalVerdictCapsule` accepts only a typed capsule, derives its Seal
identity internally, canonically encodes it, and clears the internal plaintext
buffer after Seal encryption. The returned prepared value owns the exact
ciphertext, identity, and locally computed content Blob ID. It must be reused
for every retry; encryption is not repeated after an attempt has selected its
Blob ID.

`OfficialWalrusVerdictStore`:

1. computes the Blob ID locally with the official Walrus SDK;
2. writes the unchanged ciphertext as a nondeletable blob;
3. retains every official write-flow checkpoint for resume;
4. requires publisher ID, onchain Walrus `Blob.blob_id`, and local ID equality;
5. requires certification;
6. records `Blob.id` only as operational Sui-object metadata;
7. reads the content back and requires byte equality and recomputed-ID equality.

The URL-safe, unpadded 43-character Walrus content Blob ID represents an
unsigned big-endian u256. It is not the Sui `Blob` object ID, a transaction
digest, or an arbitrary nonzero u256.

Walrus storage and Sui terminalization are not atomic. A failed Sui transaction
can leave an orphan encrypted blob. This is acceptable; substituting a different
blob is not. Z1 aborts substitutions without consuming the pending attempt.

## Seal authorization and local release

`alibi::seal_approve_verdict_capsule` is a side-effect-free, non-public entry
function whose first parameter is the inner identity. It approves only when:

- the dry-run sender is the recorded session player;
- the identity names that exact `GameSession`;
- session state is Terminal and has a `VerdictRecord`;
- identity and record nonce, protocol version, level version, accusation
  commitment, and verdict commitment match;
- the terminal Walrus content Blob ID is nonzero.

Malformed and trailing identities, another player, pre-terminal sessions, and
every wrong identity field abort.

The client creates a short-lived Seal `SessionKey` only after the active account
matches the recorded player. The wallet signs its personal message once. An
account switch or expiry invalidates the handle. Decryption enables
`checkShareConsistency`; key servers see the approval PTB and encrypted key
request, never the ciphertext or plaintext. Decryption and capsule validation
are local.

## Deployment and trust limitations

Local tests use no wallet and do not publish the package. Live Walrus write/read
requires a funded, explicitly supplied Testnet signer. Live Seal release also
requires the W1 package (first published package ID) and representative terminal
state to be deployed. Those prerequisites are intentionally not fabricated.

If the deployed package retains an `UpgradeCap`, its controller can change the
Seal policy. Until the capability is governed or the package is immutable, this
is development/hackathon-grade access control. W1 does not change or destroy the
upgrade capability.

The Groth16 artifacts still use the Z1 test/development parameters:
**TEST/DEVELOPMENT PARAMETERS, NOT A PRODUCTION TRUSTED SETUP**.

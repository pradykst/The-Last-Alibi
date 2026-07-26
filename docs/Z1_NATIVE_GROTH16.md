# Z1 native Groth16 verdict verification

> **HACKATHON/TESTNET SINGLE-PARTY TRUSTED SETUP. NON-PRODUCTION.** The committed deployment keys were generated with operating-system cryptographic randomness. No multiparty ceremony occurred. Deterministic parameters remain test fixtures only; production requires an appropriate ceremony or accepted production parameters.

Gate 3A generalizes the verdict prover and adds the registered-query circuit and native verifier. The
accepted lifecycle remains `Active -> AccusationPending -> Terminal`, and `finalize_verdict` still
compares every receipt field with the immutable level and pending session state.

## Circuit statement

The circuit is BN254 Groth16 compiled by Circom 2.2.1. All 80 witness inputs are private. Its only
public signals are the eight output limbs described below.

The private witness contains case and accusation `{suspect, room, weapon, time}` values, their
salts, the 32 raw session-ID bytes, the `u64` attempt nonce, the 32 raw Walrus content Blob ID
bytes, the verdict bit, and the verdict salt.
Suspect and room are constrained to two bits (`0..3`); weapon and time are Boolean (`0..1`). Every
salt is a canonical BN254 scalar represented by two little-endian `u128` limbs. The high two bits
are zero and `Bits2Num_strict` rejects values at or above the scalar modulus.

For dimension equality bits `es`, `er`, `ew`, and `et`, the circuit enforces:

```text
verdict_bit is Boolean
verdict_bit = es * er * ew * et
```

This is equality, not a one-way implication: a full match requires `1`, while any partial or total
mismatch requires `0`.

## Poseidon commitments

Z1 uses `circomlib@2.0.5`'s `Poseidon(nInputs)` template over the BN254 scalar field and
`circomlibjs@0.1.7` for the matching TypeScript computation. No JSON, string concatenation,
SHA-256, BLAKE2b, or Keccak substitution is used for these three commitments.

All integers below are field elements. `protocol_version = 1` and `level_version = 1`.

```text
case_commitment = Poseidon(8)(
  59645246114738790757125204, protocol_version, level_version,
  suspect, room, weapon, time, case_salt
)

accusation_commitment = Poseidon(8)(
  16788644443274716470833820098044729838676, protocol_version, level_version,
  suspect, room, weapon, time, accusation_salt
)

verdict_commitment = Poseidon(5)(
  1000681195498610548960066585840724, protocol_version, level_version,
  verdict_bit, verdict_salt
)
```

The domain integers are the ASCII bytes `TLA_CASE_V1`, `TLA_ACCUSATION_V1`, and `TLA_VERDICT_V1`
interpreted as unsigned little-endian integers. A Poseidon result is serialized as exactly 32
little-endian bytes and must be strictly below the BN254 scalar modulus:

```text
21888242871839275222246405745257275088548364400416034343698204186575808495617
```

Leading zero bytes are preserved.

## Session-attempt domain

The circuit implements the blob-bound S2 definition exactly:

```text
BLAKE2b-256(
  UTF8("the-last-alibi::verdict::session-attempt::v1") ||
  raw 32-byte Sui session object ID ||
  attempt_nonce as u64 little-endian ||
  protocol_version as u16 little-endian ||
  level_version as u16 little-endian ||
  raw 32-byte Walrus content Blob ID
)
```

This is a 120-byte preimage. `blake2b_256_120.circom` constrains the complete single-block BLAKE2b
compression, including the 32-byte digest parameter block, byte count `120`, and final-block flag.
The Blob ID is Walrus's content-derived `BlobId`: canonical 43-character URL-safe Base64 without
padding decodes once to exactly 32 bytes. Those bytes are the unsigned big-endian Walrus `u256`.
Sui BCS serializes that `u256` little-endian, so Move reverses the 32 BCS bytes before hashing;
Circom, Rust, and TypeScript hash the original decoded bytes. It is not a Sui Blob object ID,
transaction digest, storage address, text encoding, or arbitrary nonzero integer.

TypeScript uses `@noble/hashes@2.2.0`; tests prove its result equals the circuit output and the Move
computation. Any change to the session, nonce, versions, or exact content Blob ID changes the
proof-bound public digest.

## Exact public-input encoding

Each 32-byte commitment is split without field reduction. Bytes `[0..16]` are a little-endian
`u128` low limb and bytes `[16..32]` are a little-endian `u128` high limb. Each limb is serialized
as one 32-byte little-endian Arkworks BN254 scalar, with its upper 16 bytes zero. The fixed order is:

1. case commitment low limb
2. case commitment high limb
3. accusation commitment low limb
4. accusation commitment high limb
5. session-attempt domain commitment low limb
6. session-attempt domain commitment high limb
7. verdict commitment low limb
8. verdict commitment high limb

The resulting vector is exactly 256 bytes. TypeScript and Move reject wrong lengths. Move also
rejects non-canonical Poseidon commitment encodings before constructing the inputs. Because each
accepted limb is constrained to 128 bits and separately exposed, the encoding is injective and
cannot admit a modular collision.

## Native verification and receipt boundary

`alibi::verdict_verifying_key` contains the exact 520-byte Arkworks compressed VK. A caller cannot
provide the key, processed key, curve, circuit version, or verifier identity. The immutable level
stores the identity returned by the package, and the verifier recomputes SHA-256 over the embedded
VK before verification.

`verdictVerifierId` is:

```text
SHA-256(compressed_verifying_key) =
04809b4e07e23854492d78f3efbb7b275168b507459d4ff425bd5f99c28451e3
```

The public `alibi::verify_verdict_proof` boundary reads the immutable level and authoritative
pending attempt, requires the submitted content Blob ID to equal the single-assignment pending ID,
recomputes the 120-byte domain digest, and then calls the package-only verifier. That verifier calls
`sui::groth16::bn254`, `prepare_verifying_key`, `proof_points_from_bytes`,
`public_proof_inputs_from_bytes`, and `verify_groth16_proof`. It creates `VerdictProofReceipt` only
after the native call returns true.

The receipt retains no abilities and binds the session ID, level ID, attempt nonce, all four
commitments, exact content Blob ID, verifier identity, and verified status. Finalization independently
requires equality between the pending expected ID, proof-bound domain, receipt ID, and terminal ID.
Both verification and finalization abort atomically, so a rejected substitution leaves the same
pending attempt retryable.

The native API and the eight-input bound are documented in the pinned
`.tools/sui-pilot/.sui-docs/develop/cryptography/groth16.mdx`. Test-only receipt constructors and the
public-input inspection helper are stripped from production bytecode according to the pinned Move
Book testing rules.

## Reproduction and hashes

```powershell
pnpm --filter @alibi/verdict-circuit test
cargo run --release --locked --manifest-path circuits/verdict/prover/Cargo.toml -- `
  verdict circuits/verdict/build/verdict/verdict_js/verdict.wasm `
  circuits/verdict/build/verdict/verdict.r1cs
./scripts/invoke-isolated-sui-move-test.ps1 -TestFilter verdict_native_tests
```

The 12.2 MB R1CS and 3.7 MB WASM are reproducible build outputs and remain ignored. The compact
fixture manifest, proofs, commitments, VKs, seeds, and hashes are committed in
`artifacts/z1-verdict/fixtures.json`.

| Artifact                                  | SHA-256                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Verdict circuit source                    | `265e7253ef98df831d25bd933e07cf22118c139e7a1eb43835ae2babab50d82a` |
| Fixed BLAKE2b circuit source              | `7a5e6c57f26aacbec60fd9ee62f44f216b3aa12dd97cdd08b5c0627ffa89e1dd` |
| TypeScript commitment/encoder source      | `a0bf6f3849d5a13092b13b91fbd06d4d420a1b808fcf8eb56fb7c64d2988471e` |
| Rust verdict prover source                | `3ada9ca3953414b4e65471aa86a25f69b103a676bd9ef746d5a9b5aa052483b3` |
| Verdict R1CS                              | `65e21cc257d150fd42184fed626ca9a905d9f641168e3b01602b3ee006fd99a2` |
| Verdict WASM                              | `28db2c5b2d5652456c337c5ba8519563a8435c07b9233f2eb009a9870de94764` |
| Compressed verification key / verifier ID | `04809b4e07e23854492d78f3efbb7b275168b507459d4ff425bd5f99c28451e3` |
| Different-key negative-test VK            | `b5b6d0a37bf6a0c51b948dc184db0fab5425a3cab1261858ea662e6ea8d4508f` |
| Fixture manifest                          | `1d8a1b34ad0830c7991d90c845ccb8e15edc32a031a576d1f8dd56d53139a21e` |

The deterministic fixtures bind Walrus content ID
`M4hsZGQ1oCktdzegB6HnI6Mi28S2nqOPHxK-W7_4BUk` (raw bytes
`33886c646435a0292d7737a007a1e723a322dbc4b69ea38f1f12be5bbff80549`) and session-attempt
digest `9bdcc3b07d45d65a6cd07d4e341bcc27d3b39bf75fbb44ae16993e6983812452`. The YES and NO
proof hashes are `27223e6e2cf8f23b397a7bb789608bb6a956a495a1e9aa62bd286dd262701708` and
`00cb29f92bf5fcddd9bf53ac3deebbfe72c12dd94dee828149b7412a6d4825b0`.

Two consecutive fixture generations produced the same manifest hash.

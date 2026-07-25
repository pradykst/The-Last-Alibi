# Z1 native Groth16 verdict verification

> **TEST/DEVELOPMENT PARAMETERS ONLY. INSECURE FOR PRODUCTION. NO TRUSTED-SETUP CEREMONY HAS
> BEEN PERFORMED.** The public deterministic seeds are reproducibility inputs, not secrets. A
> production release must replace these parameters with a reviewed circuit-specific ceremony.

Z1 replaces only S2's terminal-verdict fail-closed seam. Query proofs remain unavailable. The
accepted lifecycle remains `Active -> AccusationPending -> Terminal`, and `finalize_verdict` still
compares every receipt field with the immutable level and pending session state.

## Circuit statement

The circuit is BN254 Groth16 compiled by Circom 2.2.1. All 48 witness inputs are private. Its only
public signals are the eight output limbs described below.

The private witness contains case and accusation `{suspect, room, weapon, time}` values, their
salts, the 32 raw session-ID bytes, the `u64` attempt nonce, the verdict bit, and the verdict salt.
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

The circuit implements S2's definition exactly:

```text
BLAKE2b-256(
  UTF8("the-last-alibi::verdict::session-attempt::v1") ||
  raw 32-byte Sui object ID ||
  attempt_nonce as u64 little-endian ||
  protocol_version as u16 little-endian ||
  level_version as u16 little-endian
)
```

This is an 88-byte preimage. `blake2b_256_88.circom` constrains the complete single-block BLAKE2b
compression, including the 32-byte digest parameter block, byte count `88`, and final-block flag.
TypeScript uses `@noble/hashes@2.2.0`; tests prove its result equals the circuit output and the S2
Move computation.

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
57413ae2abe8025a6035cca0c5c063687827fcc56bd5f8b11126ba47072fe2c3
```

The production function calls `sui::groth16::bn254`, `prepare_verifying_key`,
`proof_points_from_bytes`, `public_proof_inputs_from_bytes`, and `verify_groth16_proof`. It creates
`VerdictProofReceipt` only after the native call returns true. The receipt retains no abilities and
binds the session ID, level ID, attempt nonce, all four commitments, encrypted blob ID, verifier
identity, and verified status. S2 consumes it and rechecks every canonical field.

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
| Verdict circuit source                    | `ccc50208a9f068920ff95f0c82b2cbaa11f0c7c6474692f43ec4d2936a53bf31` |
| Fixed BLAKE2b circuit source              | `df0dde20a48a4fb3168702a1a4e226756e73183e916cec37b435f3d9468a86a3` |
| TypeScript commitment/encoder source      | `b6a5ec6fc20fb7f090507d142c05c89fb91b9e81d2eed46b8d490652e7cbc4f8` |
| Rust verdict prover source                | `24a58fc246a5651450f7114891d61033b4cb39a996ab6e9b36e53ad417540382` |
| Verdict R1CS                              | `b3dcf33b4a9664e9957273584dfe64fc17de12a6eb57e3f57fa6eafed5fdc7e2` |
| Verdict WASM                              | `41bf58bf9f9d717b1fa1450b8faa71b8055adc0217be8c0b9deba488396f5740` |
| Compressed verification key / verifier ID | `57413ae2abe8025a6035cca0c5c063687827fcc56bd5f8b11126ba47072fe2c3` |
| Different-key negative-test VK            | `220dee77d9416e2a96fc6dfa6323817389f0bc8d6a8ee8f36649d796258e43dc` |
| Fixture manifest                          | `f0231db165264545b816149b12ca32eadc6c9064e805a7082e68af58f35843fd` |

Two consecutive fixture generations produced the same manifest hash.

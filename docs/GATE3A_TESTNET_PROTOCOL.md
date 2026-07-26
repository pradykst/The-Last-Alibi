# Gate 3A testnet protocol and prover contract

## Security status

The query and verdict Groth16 parameters in
`circuits/verdict/artifacts/testnet-v1` are a **hackathon/testnet single-party
trusted setup. Non-production.** They were generated with operating-system
cryptographic randomness through `rand::rngs::OsRng`. No setup randomness,
witness, proof transcript, salt, hidden case, or accusation is retained.

No multiparty ceremony occurred. Production use requires an appropriate
ceremony or independently accepted production parameters.

## Query statement

Private witness:

- canonical case fields: suspect `[0,3]`, room `[0,3]`, weapon `[0,1]`,
  time `[0,1]`
- a canonical BN254 case salt

Public inputs, in this exact order:

1. case commitment low 128-bit limb
2. case commitment high 128-bit limb
3. session/query-domain commitment low 128-bit limb
4. session/query-domain commitment high 128-bit limb
5. registered-predicate commitment low 128-bit limb
6. registered-predicate commitment high 128-bit limb
7. result bit

Each input is serialized as a 32-byte little-endian BN254 scalar. The
session/query commitment is BLAKE2b-256 over the fixed 120-byte preimage:

- bytes `0..44`: `the-last-alibi::query::session-context::v1`
- bytes `44..76`: canonical session object ID bytes
- bytes `76..108`: canonical level object ID bytes
- bytes `108..116`: query nonce, little-endian `u64`
- bytes `116..118`: protocol version, little-endian `u16`
- bytes `118..120`: level version, little-endian `u16`

The registered predicate commitment is Poseidon over the fixed predicate
domain, protocol version, level version, predicate ID, dimension, and value.
The circuit reconstructs the case commitment with the existing Poseidon
encoding, derives the predicate dimension/value from the registered predicate
ID, evaluates equality against the selected case field, and constrains the
public result bit to that result. Range and boolean constraints reject malformed
fields.

Candidate-mask safety, the two-survivor rule, query budget, pending-query state,
and replay protection remain independent Move checks.

## Application prover interface

The server invokes `alibi-verdict-prover` with one of:

```text
prove-query <wasm> <r1cs> <proving-key>
verify-query <verifying-key>
prove-verdict <wasm> <r1cs> <proving-key>
verify-verdict <verifying-key>
```

Private witness JSON is accepted only through standard input. Command-line
arguments contain artifact paths only. Input is capped at 16 KiB and rejects
unknown fields. Output contains only a sanitized status, circuit/version,
canonical proof bytes, canonical public-input bytes, and verifying-key identity.
The TypeScript wrapper enforces absolute artifact paths, a bounded timeout,
bounded output, and strict output schemas. It is exported only from
`@alibi/sui/server`.

The application prover accepts arbitrary valid query and verdict witnesses; it
does not depend on the historical deterministic fixture.

## Parameter artifacts

Generate a fresh single-party testnet setup with:

```powershell
cargo run --release --offline --manifest-path circuits/verdict/prover/Cargo.toml -- `
  setup-testnet query `
  circuits/verdict/build/query/query_js/query.wasm `
  circuits/verdict/build/query/query.r1cs `
  circuits/verdict/artifacts/testnet-v1

cargo run --release --offline --manifest-path circuits/verdict/prover/Cargo.toml -- `
  setup-testnet verdict `
  circuits/verdict/build/verdict/verdict_js/verdict.wasm `
  circuits/verdict/build/verdict/verdict.r1cs `
  circuits/verdict/artifacts/testnet-v1
```

The committed manifests record generation time, library randomness source,
artifact hashes, circuit artifact hashes, and Sui verifier identity. Re-running
these commands intentionally produces new parameter identities.

## Native Sui verification

`alibi::verifier::verify_query_proof` uses Sui's native BN254 Groth16 verifier
with the pinned processed query verifying key. The application-facing
`alibi::alibi::verify_query_proof` wrapper reconstructs public inputs from the
canonical pending query and verifies all bindings before returning a hot-potato
receipt. `alibi::alibi::resolve_query` consumes that receipt in the same PTB and
updates the candidate mask exactly once.

The verdict verifier uses the same native boundary and its separately pinned
testnet verifying key. An attacker-selected key is never accepted as an input.

Bundled documentation used:

- `.tools/sui-pilot/.sui-docs/develop/cryptography/groth16.mdx`
- `.tools/sui-pilot/.move-book-docs/reference/primitive-types/address.mdx`
- `.tools/sui-pilot/.move-book-docs/reference/primitive-types/vector.mdx`

## Server-side Sui execution contract

The trusted server/relayer loads an official Sui SDK client and one Sui signer
from server-only configuration. Submission signs and sends a transaction once.
Confirmation waits by digest and requires successful effects, a checkpoint,
exactly one expected package/module/event identity, and an unambiguous created
object when one is expected. A timeout or ambiguous result is reported as
retryable but never triggers blind resubmission.

Bundled documentation used:

- `.tools/sui-pilot/.ts-sdk-docs/sui/migrations/sui-2.0/index.mdx`
- `.tools/sui-pilot/.ts-sdk-docs/sui/clients/json-rpc.mdx`
- `.tools/sui-pilot/.ts-sdk-docs/sui/transactions/sending-txs.mdx`
- `.tools/sui-pilot/.sui-docs/guides/developer/sui-101/using-events.mdx`

Required public identifiers:

- `ALIBI_SUI_NETWORK`
- `ALIBI_SUI_CHAIN_IDENTIFIER`
- `ALIBI_SUI_PACKAGE_ID`
- `ALIBI_SUI_LEVEL_CONFIG_ID`
- `ALIBI_SUI_SIGNER_ADDRESS`

Required server-only configuration:

- `ALIBI_SUI_RPC_URL`
- `ALIBI_SUI_OPERATION_PATH`
- `ALIBI_PROVER_BINARY_PATH`
- `ALIBI_QUERY_WASM_PATH`
- `ALIBI_QUERY_R1CS_PATH`
- `ALIBI_QUERY_PROVING_KEY_PATH`
- `ALIBI_QUERY_VERIFYING_KEY_PATH`
- `ALIBI_VERDICT_WASM_PATH`
- `ALIBI_VERDICT_R1CS_PATH`
- `ALIBI_VERDICT_PROVING_KEY_PATH`
- `ALIBI_VERDICT_VERIFYING_KEY_PATH`

Required server-only secret:

- `ALIBI_SUI_SIGNER_SECRET_KEY`

The persistent operation path belongs under the existing hosted-volume contract
at `/var/lib/the-last-alibi`. Configuration rejects blank, malformed, zero,
placeholder, non-HTTPS, or network-mismatched values.

## Remaining boundary

This gate enables protocol and execution primitives only. The web game's live
composition is still unwired, no public website deployment is claimed, and the
World/ranked path remains intentionally deferred. Contract publication and
testnet acceptance evidence are recorded separately under `docs/evidence`.

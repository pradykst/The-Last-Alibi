# Z1 proving toolchain

Z1 uses exact, repository-pinned dependencies:

- Circom compiler `2.2.1`;
- `circomlib@2.0.5`;
- `circomlibjs@0.1.7`;
- `ark-circom`, `ark-bn254`, `ark-groth16`, `ark-serialize`, `ark-snark`, and
  `ark-std` `0.6.0`.

The Arkworks crates are licensed under MIT and/or Apache-2.0. The reviewed circomlib dependencies
declare GPL-3.0; they are development/circuit-source dependencies and must remain identified in
distribution and submission license review.

The compiler gate rejects every Circom version other than `2.2.1`. Build Circom from the official
iden3 repository tag `v2.2.1`; do not commit the compiler binary:

```powershell
git clone --branch v2.2.1 --depth 1 https://github.com/iden3/circom.git
cd circom
cargo build --release
circom --version
```

The expected output is exactly `circom compiler 2.2.1`. The resolved official release identity is
the `iden3/circom` tag `v2.2.1`; a future bootstrap script that downloads source must additionally
pin and record the tag's commit before installing it.

Install the repository dependencies and compile the smoke circuit:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @alibi/verdict-circuit build
cargo build --locked --manifest-path circuits/verdict/prover/Cargo.toml
./scripts/invoke-isolated-sui-move-test.ps1 `
  -TestFilter deterministic_arkworks_bn254_proof_passes_native_verification
```

The Move-test wrapper creates a unique wallet-free configuration outside the repository, explicitly
passes it to the Sui child process, rejects every initialization prompt, verifies that its keystore
remains exactly empty, and removes only its own validated temporary directory.

The Rust prover serializes BN254 verification keys, proof points, and each public scalar with
Arkworks `CanonicalSerialize::serialize_compressed`, matching
`.tools/sui-pilot/.sui-docs/develop/cryptography/groth16.mdx`.

> **TEST/DEVELOPMENT PARAMETERS ONLY. INSECURE FOR PRODUCTION. NO TRUSTED-SETUP CEREMONY HAS
> BEEN PERFORMED.**

The deterministic public development seed is not secret. Z1 does not use a Powers-of-Tau file,
snarkjs, rapidsnark, Solidity calldata, or a production ceremony.

## Deterministic smoke hashes

Two consecutive builds and proof generations under the pinned toolchain produced identical bytes:

| Artifact | SHA-256 |
| --- | --- |
| Smoke R1CS | `18e7e2acedabd39db3efaa8a9b457e3dbd3883ae1c421be4a725eec530574ee2` |
| Smoke WASM | `bf30a128fe8b86b69ec88725371a4ea9ab1a39842f400300c30e7955ce7f42c1` |
| Native smoke manifest | `34ce6a229291c67798658bce6bc99e42c26cae524d409fd3bb19c8a358d2a69c` |
| Verification key | `89de2e5f6d5fd1cc07b4d98028a6638f4c6efc41e829fb00c10bfa634ec66322` |
| Proof points | `cd27969601ea24bbb8a165eb4f78c7652a3479f069f6da729cd45bbaccf3dcf0` |
| Public inputs | `2a3310c3b8ccce8b0fd345f873da17c9227d5920568120b67144b51e50c561ff` |

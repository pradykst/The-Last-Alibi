# Gate 3A Sui testnet evidence — 2026-07-26

## Scope and trust statement

This evidence records a real Sui testnet package publication, immutable level
creation, canonical session creation, registered-query authorization, genuine
application proof generation, off-chain verification, native Sui Groth16
acceptance, state transition, and replay rejection.

The query and verdict parameters are a **hackathon/testnet single-party trusted
setup. Non-production.** No multiparty ceremony occurred. Production use
requires an appropriate ceremony or independently accepted production
parameters.

No private key, signer secret, witness, salt, hidden case field, setup
randomness, or raw proof is recorded here.

## Environment

- Network: Sui testnet
- Chain identifier:
  `69WiPg3DAQiwdxfncX6wYQ2siKwAe6L9BZthQea3JNMD` (legacy hex `4c78adac`)
- Sui CLI: `1.76.0-6effb4523834`
- Active public address:
  `0x6673cb5e448933f2159c9e71f0bd3e937099d33f89034daf9e5923bfc19e99c6`
- Sui Pilot revision: `034e4d2b657018bf9863c091febffcf74c886f28`
- Query verifying-key identity:
  `16f341db81cc4a598510081ebe924699358c658cf8dc4618fdb8c924305b237e`

## Published package and level

- Package ID:
  `0x3e2aa9c08186046a6653326bcf46e0c4454f643dc132aef229001d739194d3ea`
- Publication digest:
  `GbtU8Re1D2aG2fzAyazuiecX6quKLQbDF3pQL1JdbXRL`
- Publication checkpoint: `364440686`
- UpgradeCap:
  `0x0414871c0ddf078d8c9fb38c6d8da6be1473840bf4381ec9013884a13783b4de`
- Consumed PublisherCap:
  `0x6fea687c524f4fb505e8c0d5ac38fb2fb7c2f6ba238fc68ea986ccef424a2b52`
- Immutable LevelConfig:
  `0x1198846e70f62c06eaeee181f16bd641d752111306b19ddc62b368826e266818`
- Level-creation digest:
  `3B1TzML47YsuBfT6Hg6D9gdpwd45yMpdocDdHJ9YZE2D`
- Level-creation checkpoint: `364440750`
- Level state: 64 cases, 12 predicates, disclosure limit 5, minimum survivors
  2, query verifier available, verdict verifier available.

Explorer links:

- [Package publication](https://suiscan.xyz/testnet/tx/GbtU8Re1D2aG2fzAyazuiecX6quKLQbDF3pQL1JdbXRL)
- [Level creation](https://suiscan.xyz/testnet/tx/3B1TzML47YsuBfT6Hg6D9gdpwd45yMpdocDdHJ9YZE2D)
- [Package](https://suiscan.xyz/testnet/object/0x3e2aa9c08186046a6653326bcf46e0c4454f643dc132aef229001d739194d3ea)
- [Immutable level](https://suiscan.xyz/testnet/object/0x1198846e70f62c06eaeee181f16bd641d752111306b19ddc62b368826e266818)

## Native query-proof acceptance

- Canonical session:
  `0xb93f874b84c8f292653f22b95edfce4e597e2b41d6bdeb13e953db593d866131`
- Session-creation digest:
  `8wa1k2A9w4MNTGZfAAp4HjMGa1DmZ3STesRVbc7e4FvL`
- Session-creation checkpoint: `364444719`
- Query-authorization digest:
  `YdHHu56s9VfoUb6zS2n15s68zLDWfJM9QAvBxLtmGQh`
- Query-authorization checkpoint: `364444729`
- Query-resolution digest:
  `CFJgdKZZYyWuLiCLQ477DqCyZ9UY73gVbofeVZMBeFYT`
- Query-resolution checkpoint: `364444776`
- Public result: `YES`
- Proof SHA-256:
  `d9ebf98e0171d7a22790b7a459acfce7afe0fed5755522cfd528349113ad96c8`
- Public-input SHA-256:
  `20cd5b9531cfec653a1d60fd9e1363a4a537c31806916f2b42e32ee70ff9e4d8`
- Native proof accepted: yes
- Replay rejected: yes, by testnet dry run against the already-resolved
  canonical session

Post-confirmation canonical state:

- candidate mask: `65535`
- disclosure count: `1`
- query nonce: `1`
- used predicates: `1`
- pending query: none
- state: active

Explorer links:

- [Session creation](https://suiscan.xyz/testnet/tx/8wa1k2A9w4MNTGZfAAp4HjMGa1DmZ3STesRVbc7e4FvL)
- [Query authorization](https://suiscan.xyz/testnet/tx/YdHHu56s9VfoUb6zS2n15s68zLDWfJM9QAvBxLtmGQh)
- [Native proof and resolution](https://suiscan.xyz/testnet/tx/CFJgdKZZYyWuLiCLQ477DqCyZ9UY73gVbofeVZMBeFYT)
- [Canonical session](https://suiscan.xyz/testnet/object/0xb93f874b84c8f292653f22b95edfce4e597e2b41d6bdeb13e953db593d866131)

## Commands

Commands are shown without credentials, witnesses, salts, hidden case data, or
raw proof bytes.

```powershell
sui client active-env
sui client active-address
sui client gas --json

sui client publish . --dry-run --json
sui client publish . --gas-budget 200000000 --json

sui client call `
  --package <PACKAGE_ID> `
  --module alibi `
  --function create_level `
  --args <PUBLISHER_CAP> 1 1 5 2 `
  --gas-budget 30000000 `
  --json

.\scripts\run-gate3a-testnet-query.ps1 `
  -PackageId <PACKAGE_ID> `
  -LevelId <LEVEL_CONFIG_ID> `
  -SuiBinary <PINNED_SUI_BINARY>

sui client object <ACCEPTED_SESSION_ID> --json
```

The acceptance script:

1. generates a fresh synthetic case and canonical salt from the operating-system
   CSPRNG, only in process memory;
2. creates the canonical commitment and session;
3. confirms the on-chain commitment matches the in-memory commitment;
4. authorizes registered predicate `0`;
5. generates a genuine query proof with the application Rust prover;
6. confirms Rust and TypeScript public-input encodings agree;
7. verifies the proof off-chain;
8. uses `sui client ptb --make-move-vec <u8>` to preserve the exact proof bytes;
9. dry-runs and then submits the native verification plus receipt consumption in
   one PTB;
10. confirms the transaction by digest and canonical object state;
11. dry-runs the same PTB again and requires rejection.

## Diagnostic sessions

Six test-only sessions were created while diagnosing Windows PTB array quoting.
Their witnesses were discarded immediately; no proof was accepted for them.
They remain owned, query-pending testnet objects and are not acceptance
evidence:

- `0x4b65679cf6b8c458900054e3d50a2ccbabce8814aed257b3a1330b638239a3e5`
- `0x646dbbf584d7a638ee87f0f2ebe44f59f4e2c83ab3c2ca657231c75f2aadbb72`
- `0x6af8965a17fe0716523b8c064fab98ac171023a0e9a5702e375f6d2cac0343fd`
- `0x77c218c7af0b1db95e4f7e870fc72d9927f5c52b0efdc481680d1d966d7e1004`
- `0xbcd12708040017a6db264b0df400759b1e52776307d96a47091c92163283badd`
- `0xe8e976ad724dd0ff4b6e6c3d63de1797591c7de424165cf605c45967eff140fb`

The root cause was local CLI argument encoding, not proof or protocol logic:
quoting `[byte,...]` caused the PTB parser to encode the characters as UTF-8
text. The dedicated `--make-move-vec <u8>` command produced the intended
byte-vector input. The final accepted transaction used that corrected path.

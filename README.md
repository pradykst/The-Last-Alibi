# The Last Alibi

> Every suspect can lie. The truth cannot.

**The Last Alibi** is a cinematic AI detective game built for ETHGlobal Lisbon 2026. Players investigate a private museum, interrogate suspects, request privacy-preserving certified warrants, and make one final accusation. Natural-language characters can persuade or misdirect; they cannot rewrite the committed case, authorize disclosures, or decide the verdict.

## Demo status

| Capability                           | Current status                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Practice Investigation               | **Playable end to end** in the browser                                                                                          |
| Cinematic UI and audio               | **Implemented**: opening, four rooms, interviews, notebook, warrants, accusation, YES/NO endings, and 23 validated audio assets |
| Sui Move protocol                    | **Published on Sui testnet**                                                                                                    |
| Native Groth16 query verification    | **Accepted on Sui testnet**, including replay rejection                                                                         |
| Application query and verdict prover | **Implemented** with hackathon/testnet parameters                                                                               |
| Browser-to-Sui live orchestration    | **Not yet wired**; current Practice sessions are fixture-backed                                                                 |
| Verified 0G testimony                | Adapter and verification package implemented; browser path unavailable                                                          |
| Walrus + Seal terminal capsule       | SDK lifecycle implemented; browser path unavailable                                                                             |
| World AgentKit ranked authorization  | Authorization and ranked-permit packages implemented; Ranked mode unavailable in the public build                               |

The public game labels Practice behavior as fixture-backed. It never fabricates transaction digests, proof acceptance, provider verification, Walrus Blob IDs, Seal decisions, or World authorizations.

## The game

A session begins with one hidden combination drawn from a fixed universe:

- 4 suspects;
- 4 rooms;
- 2 weapons;
- 2 time windows;
- **64 possible cases** in total.

The player explores the Grand Gallery, Restoration Lab, Archive Vault, and Rooftop Conservatory. Each room contains public observations, a suspect with expressive testimony, and notebook material. The player may request at most five registered binary warrants. A warrant is permitted only when both possible branches retain at least two candidates, preventing the certified-query system from becoming an exact-case oracle.

The investigation ends with a private accusation over suspect, room, weapon, and time. The designed terminal protocol reveals only **YES** or **NO**, never the hidden case.

## Core guarantees

1. **AI cannot rewrite the truth.** Testimony is narrative and non-canonical. Only accepted protocol transitions may change canonical case state.
2. **The detective cannot extract unlimited hidden information.** Warrants are registered, bounded, safety-checked, nonce-bound, and replay-protected.
3. **The publisher cannot change the ending after commitment.** The verdict proof binds the accusation result to the original committed case.
4. **Live mode fails closed.** Missing or failed live adapters never silently fall back to fixtures.
5. **Private material stays server-side.** Hidden cases, salts, witnesses, signer keys, provider credentials, and plaintext verdict capsules are not browser responses.

## Authority and execution

![The Last Alibi authority and execution architecture](apps/web/public/assets/architecture/authority-execution.png)

Solid green paths show the implemented Practice experience. Dashed paths show browser composition that remains unavailable. Separately, the Sui package, immutable level, and native Groth16 accepted path are already deployed and inspectable on testnet; the diagram's right-hand status describes application wiring, not the existence of those testnet artifacts.

The governing rule is simple:

> Narrative can persuade; only an accepted canonical transition may change case state.

| Component         | Authoritative for                                                                              | Explicitly not authoritative for                    |
| ----------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Game UI           | Presentation and player interaction                                                            | Case truth, proof validity, or partner verification |
| API / relayer     | Orchestration, idempotency, signing, and finality waiting                                      | Choosing the case or verdict                        |
| Sui Move          | Canonical session state, query policy, proof acceptance, replay protection, and terminal state | Natural-language testimony                          |
| Private ZK prover | Witness processing and Groth16 proof generation                                                | Disclosure policy, eligibility, or state mutation   |
| 0G                | Verified suspect inference                                                                     | Candidate elimination or verdict authority          |
| Walrus            | Ciphertext availability                                                                        | Plaintext truth or access authorization             |
| Seal              | Decryption under Sui-defined policy                                                            | Verdict correctness                                 |
| World AgentKit    | Human-backed ranked eligibility                                                                | Case truth or game outcome                          |

Further diagrams and boundary documentation are in [`docs/architecture`](docs/architecture/).

## Verified Sui testnet evidence

The Gate 3A acceptance run published the package, created the immutable level, created a canonical session, authorized a registered query, generated a genuine query proof, verified it off-chain, submitted it to native Sui Groth16 verification, confirmed the canonical state transition, and demonstrated replay rejection.

| Artifact                            | Identifier                                                           |
| ----------------------------------- | -------------------------------------------------------------------- |
| Network                             | Sui testnet                                                          |
| Chain identifier                    | `69WiPg3DAQiwdxfncX6wYQ2siKwAe6L9BZthQea3JNMD`                       |
| Package                             | `0x3e2aa9c08186046a6653326bcf46e0c4454f643dc132aef229001d739194d3ea` |
| Immutable level                     | `0x1198846e70f62c06eaeee181f16bd641d752111306b19ddc62b368826e266818` |
| Accepted session                    | `0xb93f874b84c8f292653f22b95edfce4e597e2b41d6bdeb13e953db593d866131` |
| Package publication transaction     | `GbtU8Re1D2aG2fzAyazuiecX6quKLQbDF3pQL1JdbXRL`                       |
| Level creation transaction          | `3B1TzML47YsuBfT6Hg6D9gdpwd45yMpdocDdHJ9YZE2D`                       |
| Native proof-resolution transaction | `CFJgdKZZYyWuLiCLQ477DqCyZ9UY73gVbofeVZMBeFYT`                       |

Explorer links:

- [Published package](https://suiscan.xyz/testnet/object/0x3e2aa9c08186046a6653326bcf46e0c4454f643dc132aef229001d739194d3ea)
- [Immutable level](https://suiscan.xyz/testnet/object/0x1198846e70f62c06eaeee181f16bd641d752111306b19ddc62b368826e266818)
- [Package publication](https://suiscan.xyz/testnet/tx/GbtU8Re1D2aG2fzAyazuiecX6quKLQbDF3pQL1JdbXRL)
- [Level creation](https://suiscan.xyz/testnet/tx/3B1TzML47YsuBfT6Hg6D9gdpwd45yMpdocDdHJ9YZE2D)
- [Native Groth16 acceptance](https://suiscan.xyz/testnet/tx/CFJgdKZZYyWuLiCLQ477DqCyZ9UY73gVbofeVZMBeFYT)

The complete sanitized record, commands, hashes, checkpoints, and negative-path result are in [`docs/evidence/GATE3A_SUI_TESTNET_2026-07-26.md`](docs/evidence/GATE3A_SUI_TESTNET_2026-07-26.md).

### Cryptographic trust statement

The query and verdict parameters are a **hackathon/testnet single-party trusted setup. Non-production.** Setup randomness and toxic-waste material were not retained. No multiparty ceremony occurred. Production use requires an appropriate ceremony or independently accepted production parameters.

The verifier is genuine: valid proofs are accepted and altered, malformed, wrongly bound, stale, or replayed proofs are rejected. Deterministic fixed fixtures are used only in tests, not as the deployed testnet parameter generation model.

## Protocol flow

### Practice path available today

1. The server creates a bounded fixture session and persists it atomically when configured.
2. The deterministic engine selects one of 64 cases and maintains a 64-bit candidate mask.
3. Public observations and explicitly labelled fixture testimony feed the notebook.
4. Registered warrants enforce the five-query limit and two-survivor rule.
5. The final accusation returns only a sanitized YES/NO result.

### Designed live path

1. The trusted server commits a hidden case and creates a canonical Sui `GameSession`.
2. Suspect dialogue is requested through 0G and rendered only after existing verification succeeds.
3. A safe registered predicate is authorized against canonical session state.
4. The private prover creates a session-, nonce-, predicate-, result-, and commitment-bound Groth16 proof.
5. Sui verifies the proof natively and updates the candidate branch exactly once.
6. The terminal accusation is proven and finalized on Sui.
7. Walrus retrieves the matching ciphertext, and Seal releases it only when the Sui terminal policy authorizes the player.
8. The browser receives only the designed binary verdict and sanitized public receipts.

The protocol packages and execution primitives exist; the full browser composition in steps 1–8 remains future integration work.

## Technology

- **Application:** Next.js App Router, React, TypeScript
- **Validation:** Zod, Vitest, Testing Library, ESLint, Prettier
- **Game engine:** deterministic TypeScript case universe, predicates, masks, and transitions
- **Canonical state:** Sui Move 2024
- **Proofs:** Circom-compatible artifacts and an arkworks Rust Groth16 application prover
- **Sui execution:** official `@mysten/sui` server-side client, signer, confirmation, event, and object-change decoding
- **Storage and access:** official Walrus and Seal SDK adapters
- **Inference:** verified 0G inference adapter
- **Ranked authorization:** World AgentKit with scoped, replay-protected permits
- **Tooling:** pnpm workspaces, Node.js 22, pinned Sui CLI and pinned Sui Pilot documentation

## Repository map

| Path                      | Responsibility                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/web`                | Next.js game, How It Works experience, API routes, and server-only fixture runtime                 |
| `packages/game-engine`    | Pure 64-case universe, predicates, candidate masks, and transitions                                |
| `packages/protocol`       | Shared schemas, manifests, public constants, and browser-safe types                                |
| `packages/runtime`        | Strict fixture/live mode selection and fail-closed capability status                               |
| `packages/sui`            | Move transaction builders, Sui execution, prover wrapper, Walrus, Seal, and terminal release logic |
| `packages/zero-g`         | Private prompt boundary, verified inference, response verification, and live smoke harness         |
| `packages/world-agentkit` | World authorization, entitlement persistence, and ranked permits                                   |
| `circuits/verdict`        | Query and verdict circuits, Rust prover, test vectors, and testnet parameter artifacts             |
| `contracts/alibi`         | Sui Move package, canonical state machine, native Groth16 verification, and Move tests             |
| `docs/evidence`           | Sanitized, inspectable live acceptance evidence                                                    |
| `docs/architecture`       | Trust boundaries and sequence diagrams                                                             |

## Run locally

### Requirements

- Node.js `>=22.13.1 <23`
- pnpm `9.15.4`
- Windows PowerShell for the supplied Sui scripts
- Sui `1.76.0-6effb4523834` only when running Move or testnet workflows

### Install and develop

```powershell
cd D:\projects\The-Last-Alibi
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Open `http://localhost:3000`. The How It Works experience is at `/how-it-works`, and the sanitized health endpoint is `/api/health`.

### Production Practice build

```powershell
$env:ALIBI_RUNTIME_MODE = 'fixture'
$env:ALIBI_FIXTURE_STORE_PATH = 'C:\tmp\last-alibi-sessions.json'
corepack pnpm build
corepack pnpm --filter @alibi/web exec next start --port 3100
```

A single full-stack Next.js service is sufficient for Practice. Keep the configured fixture-store parent directory writable and persistent when session resume must survive process restarts.

## Environment policy

Copy [`.env.example`](.env.example) to `apps/web/.env.local` for local server configuration. Keep `ALIBI_RUNTIME_MODE=fixture` unless the live web composition has been completed. Never commit `.env.local`.

- Variables beginning with `NEXT_PUBLIC_` may reach the browser and must never contain secrets.
- Sui signer keys, 0G credentials, World keys, entitlement secrets, hidden cases, salts, and witnesses are server-only.
- Live mode rejects missing, blank, malformed, placeholder, zero, and network-mismatched configuration.
- Live mode never silently falls back to fixtures.
- The recommended hosted persistent mount is `/var/lib/the-last-alibi`.

See [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md), [`docs/GATE3A_TESTNET_PROTOCOL.md`](docs/GATE3A_TESTNET_PROTOCOL.md), [`docs/0G.md`](docs/0G.md), and [`docs/WORLD_AGENTKIT.md`](docs/WORLD_AGENTKIT.md).

## Real testnet proof acceptance

With the Sui CLI explicitly configured for testnet and a funded active address:

```powershell
sui client active-env
sui client active-address
sui client gas

.\scripts\run-gate3a-testnet-query.ps1 `
  -PackageId 0x3e2aa9c08186046a6653326bcf46e0c4454f643dc132aef229001d739194d3ea `
  -LevelId 0x1198846e70f62c06eaeee181f16bd641d752111306b19ddc62b368826e266818
```

This creates a fresh synthetic test case in memory, submits real testnet transactions, generates and verifies a genuine query proof, confirms native Sui acceptance, and requires replay rejection. It spends testnet gas. Do not run it merely to reproduce already-recorded evidence.

## Validation

Common commands:

```powershell
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm audio:validate
corepack pnpm build
```

Protocol-specific validation is documented in [`docs/GATE3A_TESTNET_PROTOCOL.md`](docs/GATE3A_TESTNET_PROTOCOL.md). Move and prover runs intentionally remain separate from ordinary web development because they require pinned native tooling and may be substantially slower.

## Security and privacy boundaries

- Hidden cases, salts, witnesses, accusation openings, signer secrets, and decrypted verdict material are never public receipts.
- 0G receives only the context permitted by its server-side prompt boundary and has no canonical case authority.
- Walrus stores ciphertext only.
- Seal authorization is bound to the intended Sui terminal session and active player.
- Proof public inputs are canonically serialized and verifier identities are pinned.
- Mutations are session- and nonce-bound; replayed or ambiguous operations cannot blindly resubmit.
- External errors returned to browsers are sanitized.
- Health responses expose readiness booleans and runtime mode, never credentials or hidden game state.

For the detailed threat model, see [`docs/architecture/TRUST_BOUNDARIES.md`](docs/architecture/TRUST_BOUNDARIES.md).

## Current limitations

- The public Practice Investigation is fixture-backed and must not be presented as a live on-chain browser session.
- Sui and native Groth16 testnet evidence is genuine but currently separate from the browser gameplay path.
- 0G, Walrus, Seal, and World AgentKit are not active in the public Practice session.
- Ranked Agent mode remains unavailable.
- The Groth16 setup is suitable only for an honestly labelled hackathon/testnet demonstration.
- Cloudflare Quick Tunnel links are temporary and depend on the local production server remaining online.

## Documentation

- [Development workflow](docs/DEVELOPMENT.md)
- [Environment policy](docs/ENVIRONMENT.md)
- [Gate 3A protocol and prover contract](docs/GATE3A_TESTNET_PROTOCOL.md)
- [Sui integration](docs/SUI.md)
- [0G verified inference](docs/0G.md)
- [World AgentKit](docs/WORLD_AGENTKIT.md)
- [Walrus and Seal verdict capsule](docs/W1_WALRUS_SEAL_VERDICT_CAPSULE.md)
- [Trust boundaries](docs/architecture/TRUST_BOUNDARIES.md)
- [Third-party components](docs/THIRD_PARTY_COMPONENTS.md)

---

**The Last Alibi** demonstrates a clean authority boundary for AI-native games: characters may improvise, but truth, disclosure, and outcomes remain verifiable.

# The Last Alibi

> Every suspect can lie. The truth cannot.

The Last Alibi is a browser-based AI detective game for ETHGlobal Lisbon 2026. Suspects can improvise and misdirect, while commitments, disclosure rules, proof acceptance, and the final verdict remain outside the language model's control.

## Three guarantees

1. **AI cannot rewrite the truth.** Suspect inference is non-canonical; Sui case commitments and verified transitions define the canonical record.
2. **The detective cannot extract unlimited hidden information.** Certified binary warrants are registered, replay-protected, safety-checked, and capped.
3. **The publisher cannot change the ending after committing it.** The terminal proof and verdict commitment bind the released binary result to the original case.

## Gameplay loop

1. Explore a case and question AI-driven suspects.
2. Use a limited certified warrant to ask a registered `YES`/`NO` question.
3. Follow the confirmed candidate count without exposing the hidden case.
4. Commit a final suspect, room, weapon, and time accusation.
5. Receive only the commitment-checked terminal answer: `YES` or `NO`.

## Canonical architecture

![The Last Alibi canonical architecture](docs/architecture/alibi-system.svg)

Editable architecture and trust material:

- [System diagram source](docs/architecture/alibi-system.mmd)
- [Certified-warrant sequence](docs/architecture/certified-warrant-sequence.svg)
- [Accusation and verdict sequence](docs/architecture/verdict-release-sequence.svg)
- [Trust boundaries](docs/architecture/TRUST_BOUNDARIES.md)

## Authority at a glance

| Component          | Intended authority                                                                                                    | Explicit boundary                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Sui Move           | Canonical game state, disclosure policy, proof acceptance, replay protection, ranked permits, terminal verdict record | Does not receive model authority or plaintext private witnesses |
| ZK prover          | Private witness processing and proof generation                                                                       | Cannot set policy, state, eligibility, or verdict               |
| 0G                 | Planned verified suspect-agent inference                                                                              | Never receives the hidden case and cannot eliminate candidates  |
| Walrus             | Planned encrypted artifact persistence                                                                                | Stores ciphertext; does not authorize access or establish truth |
| Seal               | Planned decryption under Sui-defined policy                                                                           | Does not prove plaintext truthfulness                           |
| World AgentKit     | Human-backed authorization boundary for one level-bound Ranked Agent attempt                                          | Never exposes human identity or determines the game outcome      |
| Game API / relayer | Orchestration, idempotency, proof jobs, finality waiting, permit handling                                             | Cannot choose the case or verdict                               |
| Web application    | Presentation and local interaction                                                                                    | Cannot establish case truth or proof validity                   |

## Target partner tracks

The architecture targets Sui, 0G, World AgentKit, Walrus, Seal, and zero-knowledge proof integrations. The World AgentKit authorization and isolated Sui ranked-permit boundaries are implemented, but human-backed live authorization is claimed only when a redacted live evidence record exists. Other intended roles are not claims of completed or live partner integrations.

See [`docs/WORLD_AGENTKIT.md`](docs/WORLD_AGENTKIT.md) for the fail-closed flow, configuration, tests, and redacted evidence command.

## Local development

Prerequisites are Node.js 22.13.1 (or a compatible Node 22 release) and pnpm 9.15.4.

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

The application runs at `http://localhost:3000`; its sanitized public health route is
`http://localhost:3000/api/health`.

Select **Begin investigation**, visit each museum room, record public observations, question the
room's suspect, and use registered binary warrants to reduce the 64-case candidate set. Complete
all four accusation fields only when ready to end the session. Fixture sessions use bounded
in-memory storage and reset whenever the web process restarts.

## Workspace

| Path                   | Responsibility                                                |
| ---------------------- | ------------------------------------------------------------- |
| `apps/web`             | Next.js App Router application and server-only route handlers |
| `packages/game-engine` | Pure 64-case universe, predicates, masks, and transitions     |
| `packages/protocol`    | Browser-safe public constants, schemas, and inferred types    |
| `packages/runtime`     | Fixture/live mode enforcement and capability status handling  |
| `docs/architecture`    | Canonical architecture diagrams and trust boundaries          |

Quality and build commands:

```powershell
pnpm assets:build
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm check
pnpm build
```

See [Development](docs/DEVELOPMENT.md), [Environment policy](docs/ENVIRONMENT.md), and
[B3 approved asset integration](docs/B3_ASSET_INTEGRATION.md) for the full local workflow,
runtime rules, asset pipeline, and presentation boundaries.

## Current status

Checkpoint B3 turns the playable local investigation into an approved-art, cinematic browser
game while preserving the B2 state and security boundaries:

- a deterministic 64-case engine and validated `The Last Exhibit` level manifest;
- a skippable opening, case briefing, four-room museum map, and layered investigation scenes;
- four explorable rooms, public observations, and scripted fixture testimony;
- five safety-checked registered binary disclosures and a terminal binary accusation;
- an evidence notebook, Warrant Desk, terminal accusation, and distinct YES/NO sequences;
- bounded server-only fixture sessions and a responsive, accessible cinematic game shell;
- a deterministic approved-asset pipeline and derived ETHGlobal/social compositions;
- the preserved D1 architecture package and pinned sui-pilot development tooling.

Fixture testimony is not 0G inference. Fixture disclosures are not Sui or Groth16 verification,
and fixture verdicts do not use Walrus or Seal. No Move contract, circuit, wallet flow, deployment,
package address, live partner integration, or production proof setup exists yet.

## Product work and reused tooling

The architecture, game rules, trust model, and future Alibi implementation are new product work. The ignored local sui-pilot checkout and adapted Codex skills are third-party development infrastructure and are not part of the project's originality claim. See [Third-Party Components](docs/THIRD_PARTY_COMPONENTS.md).

## Immediate roadmap

1. **S1: Sui canonical state:** implement the canonical session and disclosure state machine in Move.
2. Bind the deterministic predicates, candidate transitions, and fixture commitment vocabulary to explicit public inputs.
3. Scaffold the smallest testable Sui Move package and circuit only after the baseline is approved.
4. Introduce each partner adapter with official documentation, fail-closed tests, and honest status reporting.
5. Revalidate the canonical diagrams against deployed reality before submission.

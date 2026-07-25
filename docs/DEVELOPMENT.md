# Development

## Prerequisites

- Node.js 22.13.1 (the root engine accepts compatible Node 22 releases).
- pnpm 9.15.4 through Corepack.
- Git for the manual publication workflow.

The local Sui tooling documented in [Third-Party Components](THIRD_PARTY_COMPONENTS.md) is
optional for checkpoint B2 because this playable fixture does not contain Move or Sui SDK code.

## Install and run

From the repository root:

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. The public health route is
`http://localhost:3000/api/health`.

## Play the fixture

1. Begin a new investigation from the intro screen.
2. Explore all four rooms and record their public observations.
3. Ask each suspect the two available scripted questions.
4. Use registered warrants to reduce the candidate count without creating an unsafe branch.
5. Select a suspect, room, weapon, and time, confirm the terminal action, and accuse.
6. Restart from the binary verdict screen to generate a new fixture session.

The in-memory session store is bounded and expires inactive sessions. All sessions reset when the
web process restarts; this is not production persistence.

## Quality commands

```powershell
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm check
pnpm build
```

`pnpm check` runs every non-build quality gate. `pnpm build` is a separate production-build
gate. Every workspace package defines each recursive script; missing scripts are not silently
skipped.

## Workspace map

| Path                   | Responsibility                                                       |
| ---------------------- | -------------------------------------------------------------------- |
| `apps/web`             | Deployable Next.js UI and server-only route handlers                 |
| `packages/game-engine` | Pure case universe, predicate masks, and session transitions         |
| `packages/protocol`    | Browser-safe constants, public schemas, and inferred types           |
| `packages/runtime`     | Browser-safe helpers plus an explicit server-only runtime entrypoint |
| `docs/architecture`    | Canonical D1 architecture and trust-boundary package                 |

## Current status

Checkpoint B2 provides a deterministic 64-case engine, a validated level manifest, bounded
server-only fixture sessions, and a playable investigation loop. Public observations and scripted
testimony never change the candidate mask; only accepted fixture disclosures do.

Fixture testimony is not 0G inference. Fixture disclosures are not Sui or Groth16 verification.
Fixture verdicts do not use Walrus or Seal. Live game routes remain unavailable, and fixture mode
is not evidence that Sui, 0G, Walrus, Seal, World AgentKit, or proof integrations are live or verified.

## Manual publication

Codex creates local logical commits but does not push them. Review the commits and working-tree
state locally, then publish through VS Code when ready. Do not bypass the quality gates before
publication.

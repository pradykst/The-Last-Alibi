# Development

## Prerequisites

- Node.js 22.13.1 (the root engine accepts compatible Node 22 releases).
- pnpm 9.15.4 through Corepack.
- Git for the manual publication workflow.

The local Sui tooling documented in [Third-Party Components](THIRD_PARTY_COMPONENTS.md) is
optional for checkpoint B1 because this baseline does not contain Move or Sui SDK code.

## Install and run

From the repository root:

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. The public health route is
`http://localhost:3000/api/health`.

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

| Path                | Responsibility                                                       |
| ------------------- | -------------------------------------------------------------------- |
| `apps/web`          | Deployable Next.js UI and server-only route handlers                 |
| `packages/protocol` | Browser-safe constants, public schemas, and inferred types           |
| `packages/runtime`  | Browser-safe helpers plus an explicit server-only runtime entrypoint |
| `docs/architecture` | Canonical D1 architecture and trust-boundary package                 |

## Current status

Checkpoint B1 provides a runnable web shell, a validated public protocol vocabulary, and a
fail-closed fixture/live boundary. It does not include a playable case engine, Move contracts,
circuits, wallets, deployments, or partner adapters.

Fixture mode is a local/deployment baseline only. It is not evidence that Sui, 0G, Walrus,
Seal, World AgentKit, or proof integrations are live or verified.

## Manual publication

Codex creates local logical commits but does not push them. Review the commits and working-tree
state locally, then publish through VS Code when ready. Do not bypass the quality gates before
publication.

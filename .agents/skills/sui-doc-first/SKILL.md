---
name: sui-doc-first
description: Research the pinned local sui-pilot documentation before writing, reviewing, or answering questions about Sui, Move, Walrus, Seal, Nautilus, Sui Prover, or the @mysten TypeScript SDK. Use for ecosystem API questions, implementation planning, SDK migration work, and any task where current Sui documentation must ground the result.
---

# Sui Doc First

Ground Sui ecosystem work in the documentation at `.tools/sui-pilot` before proposing code or compatibility claims.

## Workflow

1. Resolve the repository root and confirm `.tools/sui-pilot` exists.
2. Confirm the local clone is the revision recorded in `docs/THIRD_PARTY_COMPONENTS.md`:

   ```powershell
   git -C .tools/sui-pilot rev-parse HEAD
   ```

3. Route the question to the narrowest corpus in the table below.
4. Search file names first when the concept has a known name, then search document contents.
5. Read the relevant documents and any linked examples before editing or answering.
6. Cite repository-relative bundled documentation paths for material claims.
7. If the docs do not settle the question, label the conclusion `Inference (not supported by bundled docs): ...`.

If the clone is missing or at the wrong revision, stop Sui-specific implementation and direct the user to run `scripts/setup-sui-pilot.ps1` after installing its explicit prerequisites.

## Corpus routing

| Topic | Corpus |
|---|---|
| Move syntax, types, abilities, generics, modules, and idioms | `.tools/sui-pilot/.move-book-docs/` |
| Sui objects, transactions, framework, runtime, and DeFi | `.tools/sui-pilot/.sui-docs/` |
| Walrus blobs, Sites, operators, and HTTP APIs | `.tools/sui-pilot/.walrus-docs/` |
| Seal encryption, key servers, and access policies | `.tools/sui-pilot/.seal-docs/` |
| TypeScript SDK, dApp Kit, kiosk, payment-kit, hashi, and SDK 2.0 | `.tools/sui-pilot/.ts-sdk-docs/` |
| Sui Prover specs, prover constructs, and Boogie tuning | `.tools/sui-pilot/.sui-prover-docs/` |
| Nautilus enclaves, attestation, PCRs, and on-chain verification | `.tools/sui-pilot/.sui-docs/sui-stack/nautilus/` |

Cross-reference `.sui-docs/` when Walrus or Seal behavior depends on Sui objects, transactions, or authentication. Prefer `.move-book-docs/` for language semantics. Inspect `.move-book-docs/packages/` for Move examples referenced by the prose. For prover work, inspect `.sui-prover-docs/guide/`, `sources/`, and `examples/` together as needed.

## Search patterns

Use repository-local search rather than a precomputed index:

```powershell
rg --files .tools/sui-pilot/.sui-docs | rg -i 'shared|object'
rg -n -i 'shared object' .tools/sui-pilot/.sui-docs
rg -n -i 'ability|phantom' .tools/sui-pilot/.move-book-docs
rg -n -i 'migration|breaking' .tools/sui-pilot/.ts-sdk-docs
```

Open the matching documents and read enough surrounding context to identify version constraints, prerequisites, and exceptions. Do not treat a search snippet as the documentation conclusion.

## SDK 2.0 guard

Before changing any `@mysten/*` import or API use, read:

`.tools/sui-pilot/.ts-sdk-docs/sui/migrations/sui-2.0/index.mdx`

Then find and read the package-specific migration or API documentation for each imported package. Do not silently migrate a project that intentionally pins SDK 1.x or is partway through an explicit migration.

## Implementation checks

After Move implementation:

1. Run `move_diagnostics` through the Move MCP server for each changed `.move` file.
2. Run `sui move test` from every affected package.
3. Use `move-code-quality` for current Move syntax and idioms.
4. Use `move-code-review` for substantive security, architecture, or public-interface changes.

If `move-analyzer` or the MCP server is unavailable, continue only when the task permits degraded validation and state the limitation explicitly.

## Source attribution

Adapted for Codex from `CLAUDE.md` and `agents/sui-pilot-agent.md` in [contract-hero/sui-pilot](https://github.com/contract-hero/sui-pilot) at commit `034e4d2b657018bf9863c091febffcf74c886f28`, licensed MIT. Claude-specific agent metadata, tool allowlists, model selection, slash commands, and plugin-root assumptions were intentionally removed or replaced with repository-scoped Codex equivalents.

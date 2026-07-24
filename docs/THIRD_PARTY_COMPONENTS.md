# Third-Party Components

## sui-pilot

- Repository: https://github.com/contract-hero/sui-pilot
- Pinned commit: `034e4d2b657018bf9863c091febffcf74c886f28`
- License: MIT
- Upstream copyright: Copyright (c) 2024 sui-pilot contributors

### Components reused

- The bundled Sui, Move Book, Walrus, Seal, TypeScript SDK, and Sui Prover documentation corpora are read from the local clone under `.tools/sui-pilot`.
- The `move-lsp-mcp` and `sui-prover-mcp` Node packages are installed and built locally from the pinned clone.
- Selected doc-first, Move code-quality, and Move code-review workflow material is adapted into repository-scoped Codex skills.

The full sui-pilot repository is not vendored into this repository's Git history. `scripts/setup-sui-pilot.ps1` obtains the reviewed revision as ignored local development infrastructure.

### Codex compatibility modifications

- Replaced Claude plugin-root references with the repository-relative `.tools/sui-pilot` location.
- Converted upstream skill metadata to Codex `SKILL.md` metadata and optional `agents/openai.yaml` UI metadata.
- Removed Claude-specific slash-command routing, model selection, agent declarations, and tool allowlists.
- Replaced Claude-specific command assumptions with ordinary Codex skill workflows and project-scoped MCP configuration.
- Apply the reviewed patch in `scripts/patches/sui-pilot-windows-file-uri.patch` so the Move MCP bridge emits standards-compliant LSP file URLs on Windows.
- Kept the Sui Prover MCP server disabled until a compatible `sui-prover` binary is independently verified.

sui-pilot is third-party development tooling. It is not shipped product code and is not part of this project's hackathon originality claim.

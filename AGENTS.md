# Repository Agent Instructions

## Third-party development tooling

- Treat `.tools/sui-pilot` as ignored third-party development infrastructure, not application or hackathon source.
- Use `scripts/setup-sui-pilot.ps1` to obtain the reviewed sui-pilot revision and build its MCP servers.
- Do not copy the full sui-pilot checkout into tracked repository paths.

## Documentation-first Sui development

Before writing or reviewing Sui, Move, Walrus, Seal, Sui Prover, or `@mysten/*` TypeScript SDK code, inspect the current documentation bundled in `.tools/sui-pilot`. Do not rely on remembered APIs when the bundled documentation can answer the question.

Route searches to the narrowest relevant corpus:

| Topic | Search root |
|---|---|
| Move syntax, types, abilities, generics, modules, and idioms | `.tools/sui-pilot/.move-book-docs/` |
| Sui objects, transactions, framework, runtime, and on-chain finance | `.tools/sui-pilot/.sui-docs/` |
| Walrus blobs, Sites, operators, and HTTP APIs | `.tools/sui-pilot/.walrus-docs/` |
| Seal encryption, key servers, and access policies | `.tools/sui-pilot/.seal-docs/` |
| TypeScript SDK, dApp Kit, kiosk, payment-kit, hashi, and SDK 2.0 | `.tools/sui-pilot/.ts-sdk-docs/` |
| Sui Prover specifications and Boogie tuning | `.tools/sui-pilot/.sui-prover-docs/` |
| Nautilus enclaves, attestation, PCRs, and verification | `.tools/sui-pilot/.sui-docs/sui-stack/nautilus/` |

Use `rg --files <corpus>` to discover files and `rg -n -i <term> <corpus>` to search content. Read the relevant source documents, not only search-result snippets. Cross-reference Sui docs for Walrus and Seal work that spans layers. For Move examples referenced by prose, inspect `.tools/sui-pilot/.move-book-docs/packages/`.

If `.tools/sui-pilot` is absent, stop Sui-specific implementation and report that `scripts/setup-sui-pilot.ps1` must be run after its prerequisites are installed.

## TypeScript SDK migration guard

Before changing imports from any `@mysten/*` package, read:

`.tools/sui-pilot/.ts-sdk-docs/sui/migrations/sui-2.0/index.mdx`

Then read the package-specific migration or API documentation for every affected package. Preserve an intentional 1.x pin or in-progress migration unless the task explicitly authorizes changing it.

## Move verification

After implementing Move changes:

1. Run the Move MCP diagnostics tool on every changed `.move` file.
2. Run `sui move test` from each affected Move package.
3. Apply the `move-code-quality` skill for Move 2024 syntax and idioms.
4. Apply the `move-code-review` skill for substantive security, architecture, or public-interface changes.

If the Move MCP server or `move-analyzer` is unavailable, say that diagnostics are degraded; do not claim validation succeeded.

## Evidence labels

Cite bundled documentation paths for API, compatibility, and best-practice conclusions. When the bundled documentation does not support a conclusion, label it exactly:

`Inference (not supported by bundled docs): ...`

Keep documented conclusions distinct from code-reading observations and unsupported inference.

# Sui Pilot Integration Validation

Validated on Windows from the repository root against sui-pilot commit
`034e4d2b657018bf9863c091febffcf74c886f28`.

The Sui binaries used for validation were installed under ignored `.tools/`
storage. The setup script itself does not install any system dependency.

## Setup and prerequisite verification

Command:

```powershell
$suiBin = (Resolve-Path .tools\suiup-state\bin).Path
$env:PATH = "$suiBin;$env:PATH"
& .\scripts\setup-sui-pilot.ps1
```

Exact stable output from the successful idempotent run (pnpm dependency tables,
bundle sizes, and elapsed times omitted because they are generated build noise):

```text
node: v22.13.1
pnpm: 9.15.4
sui: sui 1.75.2-027e13b2c140
move-analyzer: move-analyzer 1.75.2-027e13b2c140
Sui toolchain versions match: 1.75.2
Existing changes are limited to the reviewed compatibility patch and generated MCP bundle outputs.
Windows file-URI compatibility patch is already applied.
sui-pilot setup complete.
Repository: https://github.com/contract-hero/sui-pilot.git
Pinned commit: 034e4d2b657018bf9863c091febffcf74c886f28
Local clone: D:\projects\The-Last-Alibi\.tools\sui-pilot
```

The script also completed `pnpm install --frozen-lockfile` and `pnpm run build`
for both `mcp/move-lsp-mcp` and `mcp/sui-prover-mcp`. Running the same command a
second time completed successfully and reported that the compatibility patch was
already applied.

The explicit missing-prerequisite path was checked before the local Sui binaries
were added to `PATH`. It failed with:

```text
[setup-sui-pilot] Required command 'sui' is unavailable. Install the Sui CLI and make it available on PATH. This script does not install system-wide dependencies.
```

## Codex skill validation and discovery

Command:

```powershell
$env:PYTHONPATH = (Resolve-Path .tools\skill-validator-deps).Path
$validator = 'C:\Users\prady\.codex\skills\.system\skill-creator\scripts\quick_validate.py'
python $validator .agents\skills\sui-doc-first
python $validator .agents\skills\move-code-quality
python $validator .agents\skills\move-code-review
```

Output:

```text
Skill is valid!
Skill is valid!
Skill is valid!
```

Repository discovery was checked with the local Codex prompt renderer. The
packaged Linux CLI was invoked through WSL because the packaged Windows binary
was not executable from the validation shell.

```powershell
$json = wsl.exe --cd /mnt/d/projects/The-Last-Alibi -e /mnt/c/tmp/codex-linux -c 'projects.\"/mnt/d/projects/The-Last-Alibi\".trust_level=\"trusted\"' debug prompt-input 'Local discovery validation only.'
$data = $json | ConvertFrom-Json
$skillsText = ($data[0].content | Where-Object { $_.text -like '<skills_instructions>*' }).text
[regex]::Matches($skillsText, '(?m)^- (sui-doc-first|move-code-quality|move-code-review):') | ForEach-Object { $_.Groups[1].Value } | Sort-Object
```

Output:

```text
move-code-quality
move-code-review
sui-doc-first
```

## MCP registration and diagnostics

Command:

```powershell
wsl.exe --cd /mnt/d/projects/The-Last-Alibi -e /mnt/c/tmp/codex-linux -c 'projects.\"/mnt/d/projects/The-Last-Alibi\".trust_level=\"trusted\"' mcp list
```

Output:

```text
Name        Command  Args                                               Env                        Cwd  Status    Auth
move-lsp    node     .tools/sui-pilot/mcp/move-lsp-mcp/dist/index.js    MOVE_LSP_TIMEOUT_MS=*****  ..   enabled   Unsupported
sui-prover  node     .tools/sui-pilot/mcp/sui-prover-mcp/dist/index.js  -                          ..   disabled  Unsupported
```

Command:

```powershell
$suiBin = (Resolve-Path .tools\suiup-state\bin).Path
$env:PATH = "$suiBin;$env:PATH"
$env:MOVE_ANALYZER_PATH = (Resolve-Path .tools\suiup-state\bin\move-analyzer.exe).Path
node .\scripts\validate-sui-pilot.mjs
```

Output (the process ID is run-specific):

```text
MCP initialize: OK (pid 47940)
MCP tools: move_diagnostics, move_hover, move_completions, move_goto_definition, move_find_references, move_document_symbols, move_type_definition, move_code_actions, move_inlay_hints, move_rename
Diagnostics ready after attempt 5
Diagnostics workspace: D:\projects\The-Last-Alibi\tests\fixtures\sui-pilot-diagnostics
Diagnostics count: 3
error 4:16 Invalid type annotation
error 5:5 Invalid return expression
warning 4:23 Could not determine a concrete type for this numeric literal, so defaulting to 'u64'
```

## Bundled documentation search

Command:

```powershell
rg -n -i "shared object" .tools/sui-pilot/.sui-docs/develop/security/index.mdx
```

Output:

```text
34:Shared objects are not an authorization boundary. Anyone can submit a transaction that references a shared object, so any privileged code path that touches a shared object must enforce authorization with Move-level checks. For example, require a capability argument, validate `tx_context::sender()`, or check object ownership. Never assume that access to a shared object is restricted. See [Access control](/develop/security/best-practices#access-control).
```

## Scope check

Command after the three integration commits:

```powershell
git diff --name-only 7dd07ae..HEAD
```

Output:

```text
.agents/skills/move-code-quality/SKILL.md
.agents/skills/move-code-quality/agents/openai.yaml
.agents/skills/move-code-review/SKILL.md
.agents/skills/move-code-review/agents/openai.yaml
.agents/skills/sui-doc-first/SKILL.md
.agents/skills/sui-doc-first/agents/openai.yaml
.codex/config.toml
.gitignore
AGENTS.md
docs/SUI_PILOT_VALIDATION.md
docs/THIRD_PARTY_COMPONENTS.md
scripts/patches/sui-pilot-windows-file-uri.patch
scripts/setup-sui-pilot.ps1
scripts/validate-sui-pilot.mjs
tests/fixtures/sui-pilot-diagnostics/Move.lock
tests/fixtures/sui-pilot-diagnostics/Move.toml
tests/fixtures/sui-pilot-diagnostics/sources/broken.move
```

No application source path is present.

The `sui-prover` server remains disabled. A compatible `sui-prover` binary was not present, so prover startup is intentionally not claimed as successful validation.

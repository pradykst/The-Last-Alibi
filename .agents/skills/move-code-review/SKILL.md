---
name: move-code-review
description: Perform documentation-grounded security, architecture, and design reviews of Sui Move smart contracts, covering access control, arithmetic, object models, transfers, upgrades, testing, and maintainability. Use for audits, pre-deploy or pre-mainnet reviews, vulnerability checks, safety questions about pasted Move code, or thorough reviews beyond syntax. Pair with move-code-quality for Move 2024 style and idioms.
---

# Move Code Review

Review Sui Move contracts for concrete security and architecture risks. Keep this review distinct from syntax, formatting, and Move 2024 idiom checks handled by `move-code-quality`.

## Documentation gate

Before flagging a pattern or recommending a fix:

1. Search `.tools/sui-pilot/.move-book-docs/` for Move semantics and language guarantees.
2. Search `.tools/sui-pilot/.sui-docs/` for object, transfer, package, transaction, congestion, and framework behavior.
3. Search the Walrus, Seal, TypeScript SDK, or Sui Prover corpus when the reviewed path crosses those layers.
4. Read the relevant documents and cite their bundled paths.

Use code reasoning for project-specific data flow, but do not present undocumented ecosystem assumptions as facts. Label them `Inference (not supported by bundled docs): ...`.

## Severity model

Use these fixed weights for registered findings:

| Level | Label | Weight | Meaning |
|---|---|---:|---|
| S1 | Critical | 10 | Direct financial loss, unauthorized access, data corruption, or permanently locked funds |
| S2 | High | 7 | Incorrect behavior, integrity loss, denial of service, or material availability impact |
| S3 | Medium | 4 | Scalability, composability, maintainability, or edge-case correctness risk |
| S4 | Low | 2 | Documentation or organization issue that raises long-term review cost |

Do not override a registry severity. If context reduces likelihood, preserve the severity and explain the mitigating context.

## Finding registry

### Security

| ID | Severity | Check |
|---|---:|---|
| SEC-AC-1 | S1 | Unprotected public functions permit unauthorized minting, creation, or modification |
| SEC-AC-2 | S1 | Authorization returns a boolean that a caller can ignore |
| SEC-AC-3 | S1 | Critical mutation lacks the required capability or witness check |
| SEC-AR-1 | S1 | A division denominator can be zero |
| SEC-AR-2 | S1 | A narrowing integer conversion lacks a proven upper bound |
| SEC-LG-1 | S1 | Security gating is inverted |
| SEC-AR-3 | S2 | Premature flooring or intermediate storage causes material precision loss |
| SEC-LG-2 | S2 | An update function mutates the wrong field |

### Design and architecture

| ID | Severity | Check |
|---|---:|---|
| DES-OM-1 | S2 | User-grown VecMap or VecSet creates unbounded linear work |
| DES-OM-2 | S2 | High-throughput operations require mutable access to one shared object |
| DES-BT-1 | S2 | Transfer to an object lacks corresponding receive logic |
| DES-OM-3 | S3 | Multiple Publisher objects fragment authority instead of using a documented registry pattern |
| DES-DS-1 | S3 | `address` represents an object reference that should be an `ID` |
| DES-DS-2 | S3 | Magic numeric states replace a clearer Option or enum model |
| DES-FN-1 | S3 | Internal transfer prevents the caller from composing with the returned object |
| DES-FN-2 | S3 | A dedicated batch loop duplicates programmable transaction block composition |
| DES-DS-3 | S4 | LinkedTable adds ordering and gas complexity without a use for iteration or order |
| DES-FN-3 | S4 | A wrapper adds no authorization, transformation, or abstraction value |

### Capability and version patterns

| ID | Severity | Check |
|---|---:|---|
| PAT-VM-1 | S2 | Upgradeable state mutation lacks a version check |
| PAT-CP-1 | S3 | Role mappings imitate modifier-style authorization instead of Move capabilities |
| PAT-CP-2 | S3 | `public(package)` exposes a function used only inside its defining module |
| PAT-VM-2 | S3 | Migration logic exists without evidence of an earlier deployed version |

### Testing and validation

| ID | Severity | Check |
|---|---:|---|
| TST-CV-1 | S2 | Security-critical authorization, transfer, or math paths have no tests |
| TST-CV-2 | S3 | Only success paths are tested |
| TST-VL-1 | S3 | Empty or boundary collection access is untested or unchecked |
| TST-VL-2 | S3 | Loop termination boundaries are unverified |
| TST-VL-3 | S3 | Time logic omits zero-duration, epoch-boundary, or overflow cases |

### Maintainability and configuration

| ID | Severity | Check |
|---|---:|---|
| QA-UC-1 | S3 | Code has no reachable production caller |
| QA-MO-1 | S4 | A module exceeds about 500 non-comment lines and is difficult to review |
| QA-MO-2 | S4 | Related roles, constants, or types are scattered without a clear boundary |
| QA-MO-3 | S4 | One operation's business logic is fragmented across several modules |
| QA-NM-1 | S4 | Generic names obscure security-relevant meaning |
| QA-NM-2 | S4 | Time fields omit their units |
| QA-NM-3 | S3 | A project type shadows a Sui framework type |
| QA-DC-1 | S4 | Public API lacks `///` documentation |
| QA-DC-2 | S4 | TODO, FIXME, HACK, or XXX remains in production code |
| CFG-HC-1 | S3 | A non-test, non-init address is hardcoded |
| CFG-HC-2 | S3 | A governance-sensitive limit cannot be configured |
| CFG-MN-1 | S3 | An unexplained numeric literal controls behavior |
| CFG-MD-1 | S4 | Metadata is frozen before required fields are populated |

## Review workflow

### 1. Discover and map

- Locate `Move.toml`, production sources, tests, and related packages.
- List modules, structs, abilities, and public, package, entry, and private functions.
- Map owned, shared, immutable, wrapped, party, dynamic-field, and derived-object usage as applicable.
- Map transfer, receive, coin, balance, capability, arithmetic, loop, and time-sensitive paths.
- Identify externally reachable functions and trace their callers and callees.

Always perform discovery. For a scoped review, run only the requested registry categories after discovery and report only in-scope findings.

### 2. Scan security

- Trace every critical mutation to its capability, witness, or other documented authorization proof.
- Ensure authorization results cannot be ignored.
- Prove denominators non-zero and narrowing casts bounded.
- Check operation ordering, field selection, precision, and security-branch polarity.

### 3. Scan object and package design

- Determine whether collection growth is provably bounded.
- Assess shared-object mutable hot spots using documented Sui execution behavior.
- Trace transfers to object recipients and verify receive paths.
- Check composability, capability design, visibility, version guards, and upgrade assumptions.

### 4. Scan tests and maintainability

- Cross-reference security-critical paths with success and failure tests.
- Check collection, loop, time, and arithmetic boundaries.
- Identify unreachable code, obscured units, framework-name shadowing, hardcoded control values, and prematurely frozen metadata.

### 5. Validate

- Run Move MCP diagnostics for every reviewed changed file.
- Run `sui move test` in every affected package.
- Apply `move-code-quality` separately for syntax and idioms.
- State exact skipped checks when required tooling is unavailable.

## Reporting

For each finding provide the exact registry ID, fixed severity and weight, file and line, issue, concrete impact, current code, recommended fix, rationale, and supporting bundled documentation path. Order by S1 through S4, then by registry ID.

Suppress false positives after tracing context. Record cleared S1 or S2 candidates briefly so readers know they were examined. Include strengths. If there are no findings, report a Clean rating instead of manufacturing advisory items.

Calculate the total fixed-weight score and rate it:

- Critical: any S1, or total at least 40.
- High: any S2 with no S1, or total at least 20.
- Moderate: total at least 8 with no S1 or S2.
- Low: nonzero total from S3 or S4 only.
- Clean: zero.

Do not invent registry IDs. If an important issue does not fit, describe it separately as an unregistered observation without forcing a severity.

## Source attribution

Adapted for Codex from `skills/move-code-review/SKILL.md` in [contract-hero/sui-pilot](https://github.com/contract-hero/sui-pilot) at commit `034e4d2b657018bf9863c091febffcf74c886f28`, licensed MIT. Claude-specific plugin-root references, slash commands, agent identity, and interactive command assumptions were removed; the upstream registry and review phases were retained in a repository-scoped, documentation-gated form.

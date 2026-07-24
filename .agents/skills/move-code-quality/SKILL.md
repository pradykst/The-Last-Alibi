---
name: move-code-quality
description: Analyze Move packages for current Move 2024 syntax, idioms, manifests, composability, tests, and documentation quality using the pinned sui-pilot Move Book and Sui docs. Use when reviewing .move files or Move.toml, checking Move code quality, modernizing older Move syntax, or validating a Move implementation after changes. Do not use as the primary security audit; pair substantive reviews with move-code-review.
---

# Move Code Quality

Review Move code against the current bundled documentation, then report precise, actionable findings. Keep syntax and idiom review separate from security and architecture review.

## Documentation gate

Before making a recommendation:

1. Read `.tools/sui-pilot/.move-book-docs/book/guides/code-quality-checklist.md`.
2. Search `.tools/sui-pilot/.move-book-docs/` for the language feature or idiom in question.
3. Cross-check `.tools/sui-pilot/.sui-docs/` for Sui framework, object, package, or CLI behavior.
4. Cite the bundled path supporting each version-sensitive conclusion.

Do not promote a remembered rule over the bundled docs. Label unsupported conclusions `Inference (not supported by bundled docs): ...`.

## Review workflow

### 1. Discover scope

- Locate the relevant `Move.toml` files and all package `sources/**/*.move` and `tests/**/*.move` files.
- Distinguish production modules from test-only modules.
- Respect a user-requested file, function, or category scope.
- Read enough call-site context to avoid style changes that break public interfaces or intent.

### 2. Inspect the manifest

Verify current documented expectations for:

- Move edition declarations.
- Framework dependency handling for the installed Sui version.
- Named-address clarity and collision resistance.
- Package-specific pins that must not be silently removed.

Treat version-sensitive manifest advice as a documentation lookup, not a timeless rule.

### 3. Inspect syntax and organization

Check the current documented forms for:

- Module declarations and import grouping.
- Error-constant versus regular-constant naming.
- Capability, event, witness, and dynamic-field-key naming and shapes.
- Public API documentation and comments around non-obvious logic.
- Consistent formatting without unrelated rewrites.

### 4. Inspect function design

Check:

- Whether visibility combinations are redundant or reduce composability.
- Whether functions can return values for programmable transaction block composition instead of transferring internally.
- Documented parameter ordering, with objects and capabilities before primitives and `TxContext` last when applicable.
- Getter names and mutable accessor suffixes.
- Whether modern method-call syntax is clearer and supported by the current docs.

### 5. Inspect current idioms

Verify against the docs before recommending:

- Vector literals, indexing, and associated methods.
- UID, sender, coin, balance, string, option, and collection methods.
- Move 2024 unpacking and positional-struct forms.
- `do!`, `destroy!`, `destroy_or!`, `fold!`, `filter!`, and `tabulate!` macros in place of hand-written loops where semantics match.

Do not recommend a macro merely to shorten code; preserve readability, gas behavior, and ownership semantics.

### 6. Inspect tests

Check documented test patterns for:

- Combined test and expected-failure attributes.
- Failure-path coverage without unreachable cleanup.
- Clear test names without redundant prefixes.
- The simplest suitable test context.
- `assert_eq!` where comparison output improves diagnosis.
- Framework test utilities instead of project-only disposal helpers when appropriate.

### 7. Run validation

After implementing or proposing concrete fixes:

1. Run Move MCP diagnostics for every changed `.move` file.
2. Run `sui move test` in the package.
3. Re-read the diff to ensure the quality pass did not change behavior unintentionally.
4. Use `move-code-review` separately when security or architecture is in scope.

If tooling is unavailable, identify the exact skipped check and do not claim the package passed it.

## Reporting

Group findings into critical compatibility issues, important improvements, and optional enhancements. For every finding include:

- Exact file and line.
- The issue and concrete impact.
- Current and recommended code when a code change is useful.
- The supporting bundled documentation path.

Acknowledge documented patterns the package already follows. Do not report security registry findings under this skill.

## Source attribution

Adapted for Codex from `skills/move-code-quality/SKILL.md` in [contract-hero/sui-pilot](https://github.com/contract-hero/sui-pilot) at commit `034e4d2b657018bf9863c091febffcf74c886f28`, licensed MIT. The Claude-specific plugin-root variable and slash-command assumptions were replaced with `.tools/sui-pilot` and ordinary Codex skill routing; static recommendations were tightened into documentation-gated checks.

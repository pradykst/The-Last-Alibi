# Environment policy

## Runtime modes

`ALIBI_RUNTIME_MODE` accepts exactly:

- `fixture` — clearly labelled deterministic development behavior.
- `live` — real adapters only; missing capabilities are blocking and unavailable.

Development and tests default to fixture mode when the variable is omitted. Production must
declare the mode explicitly. Explicit production fixture mode is permitted for an early
deployment, but it remains visibly labelled `Fixture`.

Live mode never falls back to fixture behavior. A missing or failed live adapter returns a typed,
sanitized blocking failure.

## Secrets

Server secrets must remain in server-only modules and must never be exported by browser-safe
packages. Browser-visible variables must never contain credentials or other secret material.
Public health responses expose only the declared mode, capability states, and stable sanitized
errors.

Do not commit:

- `.env` files other than `.env.example`;
- private keys, keystores, recovery phrases, or credentials;
- salts, private witnesses, hidden-case data, or verdict-opening material;
- local Sui configuration or key material.

Local key and configuration files must remain outside the repository.

## Partner variables

No partner-specific environment variables exist at B1. Each variable will be introduced with
the real adapter that consumes it, after its name and semantics are checked against official
documentation. This avoids inventing configuration that could later be mistaken for a working
integration.

# World AgentKit Ranked Authorization

Ranked Agent authorization is implemented in `packages/world-agentkit` and fails
closed. It uses the official `@worldcoin/agentkit` low-level verification flow:

1. parse the `agentkit` header;
2. require exact URI, domain, and single-resource binding;
3. validate AgentKit freshness and nonce availability;
4. verify the reconstructed SIWE signature;
5. resolve the signer through the canonical World Chain AgentBook;
6. atomically consume one keyed, opaque entitlement per human and level; and
7. return only opaque 32-byte commitments for the isolated Sui permit adapter.

The resolved anonymous human identifier is used only inside the atomic
entitlement operation. It is never returned, logged, or persisted. The
persistent file contains only HMAC commitments. Production deployments should
place that file on durable storage with a single shared filesystem or replace
the store interface with a transactional database implementation.

The Sui submission boundary is isolated in `packages/ranked-permit-sui`. It
builds issue and consume calls for a separate `ranked_permit` Move module and
does not import or modify terminal-verdict code.

## Live configuration

Required:

- `ALIBI_AGENTKIT_AGENT_ADDRESS`
- `ALIBI_AGENTKIT_AGENT_PRIVATE_KEY`
- `ALIBI_AGENTKIT_RESOURCE_URI`
- `ALIBI_AGENTKIT_LEVEL_ID`
- `ALIBI_AGENTKIT_ENTITLEMENT_SECRET` (at least 32 characters)
- `ALIBI_AGENTKIT_STORE_PATH`
- `ALIBI_AGENTKIT_SUI_RECIPIENT`

Optional:

- `ALIBI_AGENTKIT_NETWORK` (defaults to `eip155:480`)
- `ALIBI_AGENTKIT_MAX_AGE_MS` (defaults to `120000`, maximum `300000`)
- `ALIBI_AGENTKIT_WORLD_RPC_URL`
- `ALIBI_AGENTKIT_SIGNATURE_RPC_URL`
- `ALIBI_AGENTKIT_EVIDENCE_PATH`

Run `pnpm --filter @alibi/world-agentkit evidence:live`. It performs an official
AgentKit signed fetch retry against the protected resource, requires one
canonical AgentBook-backed acceptance, then requires a wrong-level denial.
Only a redacted JSON record is written. Private keys, signed headers, wallet
addresses, raw nonces, and human identifiers are never written to evidence.

Do not run AgentBook registration as part of this flow. The registered
detective is looked up at request time, and a missing lookup fails closed.

## Documentation evidence

World AgentKit APIs follow the official SDK reference:
`https://docs.world.org/agents/agent-kit/sdk-reference`.

Sui capability, shared-object access-control, dynamic-field, and PTB choices are
grounded in:

- `.tools/sui-pilot/.sui-docs/getting-started/examples/capability-pattern.mdx`
- `.tools/sui-pilot/.sui-docs/develop/security/best-practices.mdx`
- `.tools/sui-pilot/.sui-docs/develop/objects/dynamic-fields.mdx`
- `.tools/sui-pilot/.ts-sdk-docs/sui/migrations/sui-2.0/index.mdx`
- `.tools/sui-pilot/.ts-sdk-docs/sui/transactions/basics.mdx`
- `.tools/sui-pilot/.ts-sdk-docs/sui/transactions/reference.mdx`

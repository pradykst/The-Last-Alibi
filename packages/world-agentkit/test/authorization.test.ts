import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';

import {
  createRankedAgentkitChallenge,
  createRankedAgentkitClient,
  FileRankedAuthorizationStore,
  InMemoryRankedAuthorizationStore,
  RankedAgentkitAuthorizer,
  loadRankedAgentkitConfig,
  type RankedAgentkitConfig,
} from '../src';

const RESOURCE = 'https://api.example.test/ranked/levels/the-last-exhibit/attempts';
const WRONG_RESOURCE = 'https://api.example.test/ranked/levels/another-level/attempts';
const LEVEL = 'the-last-exhibit';
const RECIPIENT = `0x${'1234'.padStart(64, '0')}`;
const SECRET = 'test-only-entitlement-secret-that-is-at-least-32-bytes';

function config(storePath = '.alibi/test-agentkit.json'): RankedAgentkitConfig {
  return {
    resourceUri: RESOURCE,
    levelId: LEVEL,
    network: 'eip155:480',
    maxAgeMs: 120_000,
    entitlementSecret: SECRET,
    storePath,
  };
}

function agent() {
  const account = privateKeyToAccount(generatePrivateKey());
  return {
    account,
    client: createRankedAgentkitClient({
      address: account.address,
      chainId: 'eip155:480',
      type: 'eip191',
      signMessage: (message) => account.signMessage({ message }),
    }),
  };
}

async function header(
  createdAgent: ReturnType<typeof agent>,
  options: { resource?: string; now?: Date; nonce?: string } = {},
): Promise<string> {
  const resource = options.resource ?? RESOURCE;
  return createdAgent.client.createHeader(
    createRankedAgentkitChallenge(
      { resourceUri: resource, network: 'eip155:480', maxAgeMs: 120_000 },
      options.now,
      options.nonce,
    ),
  );
}

function authorizer(
  createdAgent: ReturnType<typeof agent>,
  store = new InMemoryRankedAuthorizationStore(SECRET),
  humanId = 'private-human-id-never-returned',
) {
  return new RankedAgentkitAuthorizer(config(), store, {
    agentBook: {
      lookupHuman: async (address) =>
        address.toLowerCase() === createdAgent.account.address.toLowerCase() ? humanId : null,
    },
  });
}

function request(agentkitHeader: string, overrides: Record<string, string> = {}) {
  return {
    agentkitHeader,
    resourceUri: overrides['resourceUri'] ?? RESOURCE,
    levelId: overrides['levelId'] ?? LEVEL,
    recipient: overrides['recipient'] ?? RECIPIENT,
  };
}

describe('World AgentKit ranked authorization', () => {
  it('accepts a registered human-backed agent exactly once without exposing identity', async () => {
    const createdAgent = agent();
    const decision = await authorizer(createdAgent).authorize(
      request(await header(createdAgent, { nonce: 'acceptednonce0001' })),
    );
    expect(decision.authorized).toBe(true);
    expect(JSON.stringify(decision)).not.toContain('private-human-id');
    expect(JSON.stringify(decision)).not.toContain(createdAgent.account.address);
    if (decision.authorized) {
      expect(decision.permit.levelId).toBe(LEVEL);
      expect(decision.permit.recipient).toMatch(/^0x[0-9a-f]{64}$/u);
      expect(decision.permit.entitlementCommitment).toMatch(/^0x[0-9a-f]{64}$/u);
    }
  });

  it('denies an unregistered agent', async () => {
    const registered = agent();
    const unregistered = agent();
    const decision = await authorizer(registered).authorize(
      request(await header(unregistered, { nonce: 'unregisterednonce0001' })),
    );
    expect(decision).toMatchObject({ authorized: false, code: 'UNREGISTERED_AGENT' });
  });

  it('denies a stale signed timestamp', async () => {
    const createdAgent = agent();
    const stale = new Date(Date.now() - 120_001);
    const decision = await authorizer(createdAgent).authorize(
      request(await header(createdAgent, { now: stale, nonce: 'stalenonce00000001' })),
    );
    expect(decision).toMatchObject({ authorized: false, code: 'STALE_MESSAGE' });
  });

  it('denies a replayed nonce', async () => {
    const createdAgent = agent();
    const boundary = authorizer(createdAgent);
    const signed = await header(createdAgent, { nonce: 'replaynonce0000001' });
    expect((await boundary.authorize(request(signed))).authorized).toBe(true);
    expect(await boundary.authorize(request(signed))).toMatchObject({
      authorized: false,
      code: 'REPLAYED_NONCE',
    });
  });

  it('denies a signature bound to another exact resource on the same host', async () => {
    const createdAgent = agent();
    const signed = await header(createdAgent, {
      resource: WRONG_RESOURCE,
      nonce: 'wrongresource000001',
    });
    expect(await authorizer(createdAgent).authorize(request(signed))).toMatchObject({
      authorized: false,
      code: 'WRONG_RESOURCE',
    });
  });

  it('denies a request for another level', async () => {
    const createdAgent = agent();
    expect(
      await authorizer(createdAgent).authorize(
        request(await header(createdAgent, { nonce: 'wronglevel00000001' }), {
          levelId: 'another-level',
        }),
      ),
    ).toMatchObject({ authorized: false, code: 'WRONG_LEVEL' });
  });

  it('denies a malformed signature', async () => {
    const createdAgent = agent();
    const signed = await header(createdAgent, { nonce: 'badsignature000001' });
    const payload = JSON.parse(Buffer.from(signed, 'base64').toString('utf8')) as {
      signature: string;
    };
    payload.signature = '0xdeadbeef';
    const malformed = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    expect(await authorizer(createdAgent).authorize(request(malformed))).toMatchObject({
      authorized: false,
      code: 'MALFORMED_SIGNATURE',
    });
  });

  it('persists the entitlement and prevents duplicate level access after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'alibi-agentkit-'));
    const storePath = join(directory, 'entitlements.json');
    const createdAgent = agent();
    const first = new RankedAgentkitAuthorizer(
      config(storePath),
      new FileRankedAuthorizationStore(storePath, SECRET),
      { agentBook: { lookupHuman: async () => 'human-persistence-marker' } },
    );
    const afterRestart = new RankedAgentkitAuthorizer(
      config(storePath),
      new FileRankedAuthorizationStore(storePath, SECRET),
      { agentBook: { lookupHuman: async () => 'human-persistence-marker' } },
    );

    expect(
      (await first.authorize(request(await header(createdAgent, { nonce: 'persistentnonce0001' }))))
        .authorized,
    ).toBe(true);
    expect(
      await afterRestart.authorize(
        request(await header(createdAgent, { nonce: 'persistentnonce0002' })),
      ),
    ).toMatchObject({ authorized: false, code: 'ENTITLEMENT_ALREADY_USED' });

    const persisted = await readFile(storePath, 'utf8');
    expect(persisted).not.toContain('human-persistence-marker');
    expect(persisted).not.toContain('persistentnonce');
  });

  it('rejects placeholder and credential-bearing live URLs', () => {
    const environment = {
      ALIBI_AGENTKIT_RESOURCE_URI: RESOURCE,
      ALIBI_AGENTKIT_LEVEL_ID: LEVEL,
      ALIBI_AGENTKIT_NETWORK: 'eip155:480',
      ALIBI_AGENTKIT_MAX_AGE_MS: '120000',
      ALIBI_AGENTKIT_ENTITLEMENT_SECRET: SECRET,
      ALIBI_AGENTKIT_STORE_PATH: '.alibi/test-agentkit.json',
    };

    expect(() =>
      loadRankedAgentkitConfig({
        ...environment,
        ALIBI_AGENTKIT_RESOURCE_URI: 'https://api.example.com/ranked',
      }),
    ).toThrow('missing or invalid');
    expect(() =>
      loadRankedAgentkitConfig({
        ...environment,
        ALIBI_AGENTKIT_WORLD_RPC_URL: 'https://user:password@worldchain.example.test',
      }),
    ).toThrow('missing or invalid');
  });
});

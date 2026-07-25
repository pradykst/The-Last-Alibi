import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { AGENTKIT, createAgentkitClient } from '@worldcoin/agentkit';
import { privateKeyToAccount } from 'viem/accounts';

import { RankedAgentkitAuthorizer } from './authorization';
import { createRankedAgentkitChallenge } from './challenge';
import { publicCommitment } from './commitments';
import { loadRankedAgentkitConfig } from './config';
import { FileRankedAuthorizationStore } from './storage';

const REQUIRED_AGENT_VARIABLES = [
  'ALIBI_AGENTKIT_AGENT_ADDRESS',
  'ALIBI_AGENTKIT_AGENT_PRIVATE_KEY',
  'ALIBI_AGENTKIT_RESOURCE_URI',
  'ALIBI_AGENTKIT_LEVEL_ID',
  'ALIBI_AGENTKIT_ENTITLEMENT_SECRET',
  'ALIBI_AGENTKIT_STORE_PATH',
  'ALIBI_AGENTKIT_SUI_RECIPIENT',
] as const;

async function main(): Promise<void> {
  const missing = REQUIRED_AGENT_VARIABLES.filter(
    (name) => process.env[name] === undefined || process.env[name]?.trim() === '',
  );
  if (missing.length > 0) {
    throw new Error(`Missing required live variables: ${missing.join(', ')}`);
  }

  const config = loadRankedAgentkitConfig();
  const privateKey = process.env['ALIBI_AGENTKIT_AGENT_PRIVATE_KEY']!;
  if (!/^0x[0-9a-fA-F]{64}$/u.test(privateKey)) {
    throw new Error('ALIBI_AGENTKIT_AGENT_PRIVATE_KEY is malformed.');
  }
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const configuredAddress = process.env['ALIBI_AGENTKIT_AGENT_ADDRESS']!;
  if (account.address.toLowerCase() !== configuredAddress.toLowerCase()) {
    throw new Error('ALIBI_AGENTKIT_AGENT_ADDRESS does not match the configured credential.');
  }

  const recipient = process.env['ALIBI_AGENTKIT_SUI_RECIPIENT']!;
  const authorizer = new RankedAgentkitAuthorizer(
    config,
    new FileRankedAuthorizationStore(config.storePath, config.entitlementSecret),
  );
  const signer = {
    address: account.address,
    chainId: config.network,
    type: 'eip191' as const,
    signMessage: (message: string) => account.signMessage({ message }),
  };

  const acceptedClient = createAgentkitClient({
    signer,
    fetch: protectedFetch(authorizer, config, recipient, config.levelId),
  });
  const acceptedResponse = await acceptedClient.fetch(config.resourceUri, { method: 'POST' });
  const accepted = (await acceptedResponse.json()) as {
    authorized?: boolean;
    permit?: { entitlementCommitment?: string; resourceCommitment?: string };
    code?: string;
  };
  if (
    acceptedResponse.status !== 200 ||
    accepted.authorized !== true ||
    accepted.permit === undefined
  ) {
    throw new Error(`Live accepted AgentKit call failed closed (${accepted.code ?? 'unknown'}).`);
  }

  const deniedClient = createAgentkitClient({
    signer,
    fetch: protectedFetch(authorizer, config, recipient, `${config.levelId}-wrong`),
  });
  const deniedResponse = await deniedClient.fetch(config.resourceUri, { method: 'POST' });
  const denied = (await deniedResponse.json()) as { authorized?: boolean; code?: string };
  if (deniedResponse.status !== 403 || denied.authorized !== false) {
    throw new Error('Live denied AgentKit call did not fail closed.');
  }

  const evidence = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    integration: '@worldcoin/agentkit@0.2.0',
    accepted: {
      status: 'authorized',
      levelId: config.levelId,
      recipientCommitment: publicCommitment('alibi-sui-recipient-v1', recipient),
      entitlementCommitment: accepted.permit.entitlementCommitment,
      resourceCommitment: accepted.permit.resourceCommitment,
    },
    denied: {
      status: 'denied',
      code: denied.code,
      case: 'wrong-level',
    },
  };
  const evidencePath =
    process.env['ALIBI_AGENTKIT_EVIDENCE_PATH'] ?? 'docs/evidence/world-agentkit-live.json';
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  process.stdout.write(
    `Redacted live evidence written to ${evidencePath}; no identity or signature was retained.\n`,
  );
}

function protectedFetch(
  authorizer: RankedAgentkitAuthorizer,
  config: ReturnType<typeof loadRankedAgentkitConfig>,
  recipient: string,
  requestedLevel: string,
): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const header = request.headers.get(AGENTKIT);
    if (header === null) {
      return Response.json(
        {
          x402Version: 2,
          resource: { url: config.resourceUri, description: 'One ranked attempt' },
          accepts: [],
          extensions: { [AGENTKIT]: createRankedAgentkitChallenge(config) },
        },
        { status: 402 },
      );
    }
    const decision = await authorizer.authorize({
      agentkitHeader: header,
      resourceUri: request.url,
      levelId: requestedLevel,
      recipient,
    });
    return Response.json(decision, { status: decision.authorized ? 200 : 403 });
  };
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown live evidence failure.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
});

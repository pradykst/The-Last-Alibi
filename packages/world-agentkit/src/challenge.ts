import {
  buildAgentkitSchema,
  createAgentkitClient,
  type AgentkitClient,
  type AgentkitExtension,
  type AgentkitSigner,
} from '@worldcoin/agentkit';
import { randomBytes } from 'node:crypto';

import type { RankedAgentkitConfig } from './config';

export function createRankedAgentkitChallenge(
  config: Pick<RankedAgentkitConfig, 'resourceUri' | 'network' | 'maxAgeMs'>,
  now = new Date(),
  nonce = randomBytes(16).toString('hex'),
): AgentkitExtension {
  const expires = new Date(now.getTime() + config.maxAgeMs);
  const resource = new URL(config.resourceUri);
  return {
    info: {
      domain: resource.hostname,
      uri: config.resourceUri,
      version: '1',
      nonce,
      issuedAt: now.toISOString(),
      expirationTime: expires.toISOString(),
      resources: [config.resourceUri],
      statement: 'Authorize one human-backed ranked attempt for The Last Alibi.',
    },
    supportedChains: [
      { chainId: config.network, type: 'eip191' },
      { chainId: config.network, type: 'eip1271' },
    ],
    schema: buildAgentkitSchema(),
  };
}

export function createRankedAgentkitClient(signer: AgentkitSigner): AgentkitClient {
  return createAgentkitClient({ signer });
}

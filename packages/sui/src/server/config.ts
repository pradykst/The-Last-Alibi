import { isAbsolute } from 'node:path';

import {
  isValidTransactionDigest,
  isValidSuiAddress,
  normalizeSuiAddress,
} from '@mysten/sui/utils';
import { z } from 'zod';

import { suiPublicConfigSchema, type SuiPublicConfig } from '../config';
import { sanitizedError } from '../errors';

const nonPlaceholderUrl = z
  .string()
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== 'https:' ||
      hostname === 'example.com' ||
      hostname.endsWith('.example.com')
    ) {
      context.addIssue({ code: 'custom', message: 'A real HTTPS Sui RPC URL is required.' });
    }
  });

const absolutePath = z.string().min(1).refine(isAbsolute, 'An absolute server path is required.');

export const suiServerConfigSchema = suiPublicConfigSchema
  .extend({
    network: z.enum(['testnet', 'mainnet']),
    rpcUrl: nonPlaceholderUrl,
    chainIdentifier: z.string().refine(isValidTransactionDigest, 'Invalid chain identifier'),
    signerAddress: z
      .string()
      .refine(isValidSuiAddress)
      .transform((value) => normalizeSuiAddress(value)),
    signerSecretKey: z.string().regex(/^suiprivkey1[0-9a-z]+$/),
    operationPath: absolutePath,
  })
  .strict();

export type SuiServerConfig = z.infer<typeof suiServerConfigSchema>;

export function parseSuiServerConfig(input: unknown): SuiServerConfig {
  const result = suiServerConfigSchema.safeParse(input);
  if (!result.success) {
    throw sanitizedError(
      'INVALID_CONFIGURATION',
      'Live Sui server configuration is missing or invalid.',
    );
  }
  return result.data;
}

export function loadSuiServerConfig(
  environment: Readonly<Record<string, string | undefined>>,
): SuiServerConfig {
  return parseSuiServerConfig({
    network: environment.ALIBI_SUI_NETWORK,
    rpcUrl: environment.ALIBI_SUI_RPC_URL,
    chainIdentifier: environment.ALIBI_SUI_CHAIN_IDENTIFIER,
    packageId: environment.ALIBI_SUI_PACKAGE_ID,
    levelConfigId: environment.ALIBI_SUI_LEVEL_CONFIG_ID,
    signerAddress: environment.ALIBI_SUI_SIGNER_ADDRESS,
    signerSecretKey: environment.ALIBI_SUI_SIGNER_SECRET_KEY,
    operationPath: environment.ALIBI_SUI_OPERATION_PATH,
  });
}

export type PublicSuiServerConfig = SuiPublicConfig & {
  readonly rpcReady: boolean;
  readonly signerReady: boolean;
  readonly persistenceReady: boolean;
};

export function publicSuiServerReadiness(config: SuiServerConfig): PublicSuiServerConfig {
  return {
    network: config.network,
    packageId: config.packageId,
    levelConfigId: config.levelConfigId,
    rpcReady: true,
    signerReady: true,
    persistenceReady: true,
  };
}

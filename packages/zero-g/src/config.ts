import { isAddress } from 'ethers';
import { z } from 'zod';

import { ZeroGError } from './errors';
import { assertZeroGServerOnly } from './server-only';
import type { LiveZeroGConfig, ZeroGConfig, ZeroGEnvironment } from './types';

const positiveInteger = z.coerce.number().int().positive();

const liveEnvironmentSchema = z
  .object({
    ALIBI_ZERO_G_MODE: z.literal('live'),
    ZERO_G_NETWORK: z.enum(['testnet', 'mainnet']),
    ZERO_G_RPC_URL: z
      .string()
      .url()
      .refine((value) => value.startsWith('https://')),
    ZERO_G_PROVIDER_ADDRESS: z.string().refine(isAddress),
    ZERO_G_MODEL: z.string().trim().min(1).max(160),
    ZERO_G_SERVICE_TYPE: z.literal('chatbot'),
    ZERO_G_VERIFICATION_MODE: z.enum(['TeeML', 'TeeTLS']),
    ZERO_G_REQUEST_TIMEOUT_MS: positiveInteger.min(1_000).max(120_000),
    ZERO_G_MAX_RESPONSE_BYTES: positiveInteger.min(1_024).max(1_048_576),
    ZERO_G_REQUIRE_PROVIDER_VERIFICATION: z.enum(['true', 'false']),
    ZERO_G_REQUIRE_RESPONSE_VERIFICATION: z.literal('true'),
  })
  .strict();

export function parseZeroGConfig(environment: ZeroGEnvironment): ZeroGConfig {
  assertZeroGServerOnly();

  const mode = environment['ALIBI_ZERO_G_MODE'];
  if (mode === 'disabled') {
    return { mode: 'disabled' };
  }
  if (mode !== 'live') {
    throw new ZeroGError('ZERO_G_CONFIGURATION_INVALID');
  }

  const parsed = liveEnvironmentSchema.safeParse({
    ALIBI_ZERO_G_MODE: mode,
    ZERO_G_NETWORK: environment['ZERO_G_NETWORK'],
    ZERO_G_RPC_URL: environment['ZERO_G_RPC_URL'],
    ZERO_G_PROVIDER_ADDRESS: environment['ZERO_G_PROVIDER_ADDRESS'],
    ZERO_G_MODEL: environment['ZERO_G_MODEL'],
    ZERO_G_SERVICE_TYPE: environment['ZERO_G_SERVICE_TYPE'],
    ZERO_G_VERIFICATION_MODE: environment['ZERO_G_VERIFICATION_MODE'],
    ZERO_G_REQUEST_TIMEOUT_MS: environment['ZERO_G_REQUEST_TIMEOUT_MS'],
    ZERO_G_MAX_RESPONSE_BYTES: environment['ZERO_G_MAX_RESPONSE_BYTES'],
    ZERO_G_REQUIRE_PROVIDER_VERIFICATION: environment['ZERO_G_REQUIRE_PROVIDER_VERIFICATION'],
    ZERO_G_REQUIRE_RESPONSE_VERIFICATION: environment['ZERO_G_REQUIRE_RESPONSE_VERIFICATION'],
  });

  if (!parsed.success) {
    throw new ZeroGError('ZERO_G_CONFIGURATION_INVALID');
  }

  const value = parsed.data;
  const config: LiveZeroGConfig = {
    mode: 'live',
    network: value.ZERO_G_NETWORK,
    rpcUrl: value.ZERO_G_RPC_URL,
    providerAddress: value.ZERO_G_PROVIDER_ADDRESS,
    model: value.ZERO_G_MODEL,
    serviceType: value.ZERO_G_SERVICE_TYPE,
    expectedVerificationMode: value.ZERO_G_VERIFICATION_MODE,
    requestTimeoutMs: value.ZERO_G_REQUEST_TIMEOUT_MS,
    maximumResponseBytes: value.ZERO_G_MAX_RESPONSE_BYTES,
    requireProviderVerification: value.ZERO_G_REQUIRE_PROVIDER_VERIFICATION === 'true',
    requireResponseVerification: true,
  };

  return config;
}

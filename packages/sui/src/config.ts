import { isValidSuiObjectId, normalizeSuiObjectId } from '@mysten/sui/utils';
import { z } from 'zod';

import { sanitizedError } from './errors';

const objectIdSchema = z
  .string()
  .refine(isValidSuiObjectId, 'Invalid Sui object ID')
  .refine(
    (value) => normalizeSuiObjectId(value) !== normalizeSuiObjectId('0x0'),
    'Zero Sui object ID',
  )
  .transform((value) => normalizeSuiObjectId(value));

export const suiPublicConfigSchema = z
  .object({
    network: z.enum(['mainnet', 'testnet', 'devnet', 'localnet']),
    packageId: objectIdSchema,
    levelConfigId: objectIdSchema,
  })
  .strict();

export type SuiPublicConfig = z.infer<typeof suiPublicConfigSchema>;

export function parseSuiPublicConfig(input: unknown): SuiPublicConfig {
  const result = suiPublicConfigSchema.safeParse(input);
  if (!result.success) {
    throw sanitizedError('INVALID_CONFIGURATION', 'Live Sui configuration is missing or invalid.');
  }
  return result.data;
}

export function loadSuiPublicConfig(
  environment: Readonly<Record<string, string | undefined>>,
): SuiPublicConfig {
  return parseSuiPublicConfig({
    network: environment.ALIBI_SUI_NETWORK,
    packageId: environment.ALIBI_SUI_PACKAGE_ID,
    levelConfigId: environment.ALIBI_SUI_LEVEL_CONFIG_ID,
  });
}

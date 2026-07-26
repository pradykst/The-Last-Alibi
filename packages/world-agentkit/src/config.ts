import { z } from 'zod';

const urlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    );
  }, 'Protected resource URI must use HTTPS outside localhost');

const optionalUrlSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional(),
);

export const rankedAgentkitConfigSchema = z
  .object({
    resourceUri: urlSchema,
    levelId: z.string().min(1).max(128),
    network: z.string().regex(/^eip155:\d+$/u),
    maxAgeMs: z.number().int().positive().max(300_000),
    entitlementSecret: z.string().min(32),
    storePath: z.string().min(1),
    worldRpcUrl: optionalUrlSchema,
    signatureRpcUrl: optionalUrlSchema,
  })
  .strict();

export type RankedAgentkitConfig = z.infer<typeof rankedAgentkitConfigSchema>;
export type AgentkitEnvironment = Readonly<Record<string, string | undefined>>;

export class AgentkitConfigurationError extends Error {
  constructor() {
    super('World AgentKit live configuration is missing or invalid.');
    this.name = 'AgentkitConfigurationError';
  }
}

export function loadRankedAgentkitConfig(
  environment: AgentkitEnvironment = process.env,
): RankedAgentkitConfig {
  const maxAge = Number(environment['ALIBI_AGENTKIT_MAX_AGE_MS'] ?? '120000');
  const parsed = rankedAgentkitConfigSchema.safeParse({
    resourceUri: environment['ALIBI_AGENTKIT_RESOURCE_URI'],
    levelId: environment['ALIBI_AGENTKIT_LEVEL_ID'],
    network: environment['ALIBI_AGENTKIT_NETWORK'] ?? 'eip155:480',
    maxAgeMs: maxAge,
    entitlementSecret: environment['ALIBI_AGENTKIT_ENTITLEMENT_SECRET'],
    storePath: environment['ALIBI_AGENTKIT_STORE_PATH'],
    worldRpcUrl: environment['ALIBI_AGENTKIT_WORLD_RPC_URL'],
    signatureRpcUrl: environment['ALIBI_AGENTKIT_SIGNATURE_RPC_URL'],
  });
  if (!parsed.success) throw new AgentkitConfigurationError();
  return parsed.data;
}

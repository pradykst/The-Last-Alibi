import { describe, expect, it } from 'vitest';

import { parseZeroGConfig } from '../src/config';
import { ZeroGError } from '../src/errors';

const LIVE_ENVIRONMENT = {
  ALIBI_ZERO_G_MODE: 'live',
  ZERO_G_NETWORK: 'testnet',
  ZERO_G_RPC_URL: 'https://evmrpc-testnet.0g.ai',
  ZERO_G_PROVIDER_ADDRESS: '0x1111111111111111111111111111111111111111',
  ZERO_G_MODEL: 'demo-chat-model',
  ZERO_G_SERVICE_TYPE: 'chatbot',
  ZERO_G_VERIFICATION_MODE: 'TeeML',
  ZERO_G_REQUEST_TIMEOUT_MS: '15000',
  ZERO_G_MAX_RESPONSE_BYTES: '65536',
  ZERO_G_REQUIRE_PROVIDER_VERIFICATION: 'true',
  ZERO_G_REQUIRE_RESPONSE_VERIFICATION: 'true',
} as const;

function expectConfigurationError(environment: Record<string, string | undefined>): void {
  try {
    parseZeroGConfig(environment);
    throw new Error('Expected configuration parsing to fail.');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ZeroGError);
    expect((error as ZeroGError).code).toBe('ZERO_G_CONFIGURATION_INVALID');
  }
}

describe('0G server configuration', () => {
  it('accepts an explicit disabled mode without credentials', () => {
    expect(parseZeroGConfig({ ALIBI_ZERO_G_MODE: 'disabled' })).toEqual({ mode: 'disabled' });
  });

  it('parses a complete live configuration without a signer secret', () => {
    expect(parseZeroGConfig(LIVE_ENVIRONMENT)).toEqual({
      mode: 'live',
      network: 'testnet',
      rpcUrl: 'https://evmrpc-testnet.0g.ai',
      providerAddress: '0x1111111111111111111111111111111111111111',
      model: 'demo-chat-model',
      serviceType: 'chatbot',
      expectedVerificationMode: 'TeeML',
      requestTimeoutMs: 15000,
      maximumResponseBytes: 65536,
      requireProviderVerification: true,
      requireResponseVerification: true,
    });
    expect(JSON.stringify(parseZeroGConfig(LIVE_ENVIRONMENT))).not.toContain('PRIVATE_KEY');
  });

  it('fails closed when the mode or any live value is absent', () => {
    expectConfigurationError({});
    for (const key of Object.keys(LIVE_ENVIRONMENT)) {
      expectConfigurationError({ ...LIVE_ENVIRONMENT, [key]: undefined });
    }
  });

  it('rejects invalid addresses, insecure RPC URLs, and non-chatbot services', () => {
    expectConfigurationError({ ...LIVE_ENVIRONMENT, ZERO_G_PROVIDER_ADDRESS: 'provider-one' });
    expectConfigurationError({ ...LIVE_ENVIRONMENT, ZERO_G_RPC_URL: 'http://localhost:8545' });
    expectConfigurationError({ ...LIVE_ENVIRONMENT, ZERO_G_SERVICE_TYPE: 'text-to-image' });
  });

  it('requires response verification explicitly in live mode', () => {
    expectConfigurationError({
      ...LIVE_ENVIRONMENT,
      ZERO_G_REQUIRE_RESPONSE_VERIFICATION: 'false',
    });
  });
});

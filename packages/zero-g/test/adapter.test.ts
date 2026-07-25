import { describe, expect, it, vi } from 'vitest';

import { createVerifiedZeroGAdapter } from '../src/adapter';
import { ZeroGError, toPublicZeroGError } from '../src/errors';
import type { LiveZeroGConfig, ZeroGBroker, ZeroGFetch, ZeroGService } from '../src/types';

const PROVIDER = '0x1111111111111111111111111111111111111111';

const CONFIG: LiveZeroGConfig = {
  mode: 'live',
  network: 'testnet',
  rpcUrl: 'https://evmrpc-testnet.0g.ai',
  providerAddress: PROVIDER,
  model: 'demo-chat-model',
  serviceType: 'chatbot',
  expectedVerificationMode: 'TeeML',
  requestTimeoutMs: 50,
  maximumResponseBytes: 4096,
  requireProviderVerification: false,
  requireResponseVerification: true,
};

const SERVICE: ZeroGService = {
  provider: PROVIDER,
  serviceType: 'chatbot',
  endpoint: 'https://provider.example/v1/proxy',
  model: 'demo-chat-model',
  verificationMode: 'TeeML',
  teeSignerAcknowledged: true,
};

function fakeBroker(overrides: Partial<ZeroGBroker> = {}): ZeroGBroker {
  return {
    listServices: vi.fn(async () => [SERVICE]),
    getServiceMetadata: vi.fn(async () => ({
      endpoint: SERVICE.endpoint,
      model: SERVICE.model,
    })),
    getRequestHeaders: vi.fn(async () => ({ Authorization: 'Bearer test-only' })),
    verifyProvider: vi.fn(async () => ({
      checked: true,
      signerMatched: true,
      composeHashMatched: true,
    })),
    processResponse: vi.fn(async () => true),
    ...overrides,
  };
}

function providerResponse(
  options: {
    content?: string;
    responseIdHeader?: [string, string];
    bodyId?: string;
    chatID?: string;
    status?: number;
    extra?: Record<string, unknown>;
  } = {},
): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (options.responseIdHeader !== undefined) {
    headers.set(...options.responseIdHeader);
  }
  return new Response(
    JSON.stringify({
      ...(options.bodyId === undefined ? {} : { id: options.bodyId }),
      ...(options.chatID === undefined ? {} : { chatID: options.chatID }),
      choices: [{ message: { content: options.content ?? '{"utterance":"Hello"}' } }],
      ...options.extra,
    }),
    { status: options.status ?? 200, headers },
  );
}

function createAdapter(
  options: {
    broker?: ZeroGBroker;
    fetch?: ZeroGFetch;
    config?: Partial<LiveZeroGConfig>;
  } = {},
) {
  return createVerifiedZeroGAdapter({
    config: { ...CONFIG, ...options.config },
    broker: options.broker ?? fakeBroker(),
    fetch:
      options.fetch ??
      vi.fn(async () => providerResponse({ responseIdHeader: ['ZG-Res-Key', 'response-123'] })),
    now: () => new Date('2026-07-25T12:00:00.000Z'),
  });
}

async function expectCode(operation: () => Promise<unknown>, code: string): Promise<ZeroGError> {
  try {
    await operation();
    throw new Error('Expected operation to fail.');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ZeroGError);
    expect((error as ZeroGError).code).toBe(code);
    return error as ZeroGError;
  }
}

const MESSAGES = [{ role: 'user', content: 'Where were you?' }] as const;

describe('verified 0G inference adapter', () => {
  it('discovers only the configured acknowledged chatbot provider', async () => {
    await expect(createAdapter().discoverService()).resolves.toEqual(SERVICE);
    await expectCode(
      () =>
        createAdapter({ broker: fakeBroker({ listServices: async () => [] }) }).discoverService(),
      'ZERO_G_PROVIDER_UNAVAILABLE',
    );
    for (const mismatch of [
      { serviceType: 'text-to-image' },
      { model: 'another-model' },
      { verificationMode: 'TeeTLS' },
      { teeSignerAcknowledged: false },
    ]) {
      await expectCode(
        () =>
          createAdapter({
            broker: fakeBroker({ listServices: async () => [{ ...SERVICE, ...mismatch }] }),
          }).discoverService(),
        'ZERO_G_PROVIDER_MISMATCH',
      );
    }
  });

  it('keeps provider preflight separate and fails closed when it is required', async () => {
    const verifyProvider = vi.fn(async () => ({
      checked: true,
      signerMatched: true,
      composeHashMatched: true,
    }));
    const adapter = createAdapter({
      config: { requireProviderVerification: true },
      broker: fakeBroker({ verifyProvider }),
    });
    await expect(adapter.verifyProvider()).resolves.toMatchObject({ checked: true });
    expect(verifyProvider).toHaveBeenCalledWith(PROVIDER);

    await expectCode(
      () =>
        createAdapter({
          config: { requireProviderVerification: true },
          broker: fakeBroker({
            verifyProvider: async () => ({
              checked: true,
              signerMatched: true,
              composeHashMatched: false,
            }),
          }),
        }).verifyProvider(),
      'ZERO_G_PROVIDER_MISMATCH',
    );
  });

  it('uses injected authenticated headers and a bounded non-streaming request', async () => {
    const getRequestHeaders = vi.fn(async () => ({ Authorization: 'Bearer test-only' }));
    const fetch = vi.fn<ZeroGFetch>(async (_url, init) => {
      const body: unknown = JSON.parse(String(init?.body));
      expect(body).toEqual({ model: CONFIG.model, messages: MESSAGES, stream: false });
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-only');
      return providerResponse({ responseIdHeader: ['ZG-Res-Key', 'response-123'] });
    });
    const result = await createAdapter({
      broker: fakeBroker({ getRequestHeaders }),
      fetch,
    }).createVerifiedChatCompletion({ messages: MESSAGES });

    expect(getRequestHeaders).toHaveBeenCalledWith(PROVIDER);
    expect(fetch).toHaveBeenCalledWith(
      'https://provider.example/v1/proxy/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.metadata).toMatchObject({
      responseId: 'response-123',
      responseVerification: 'verified',
      sdkVersion: '0.8.4',
    });
  });

  it('rejects metadata changes after discovery', async () => {
    await expectCode(
      () =>
        createAdapter({
          broker: fakeBroker({
            getServiceMetadata: async () => ({
              endpoint: 'https://different.example/v1/proxy',
              model: CONFIG.model,
            }),
          }),
        }).createVerifiedChatCompletion({ messages: MESSAGES }),
      'ZERO_G_PROVIDER_MISMATCH',
    );
  });

  it('accepts a metadata route beneath the configured provider catalog origin', async () => {
    const fetch = vi.fn<ZeroGFetch>(async () =>
      providerResponse({ responseIdHeader: ['ZG-Res-Key', 'response-123'] }),
    );
    await createAdapter({
      broker: fakeBroker({
        listServices: async () => [{ ...SERVICE, endpoint: 'https://provider.example/' }],
      }),
      fetch,
    }).createVerifiedChatCompletion({ messages: MESSAGES });

    expect(fetch).toHaveBeenCalledWith(
      'https://provider.example/v1/proxy/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });
  it('times out through an AbortSignal', async () => {
    const fetch: ZeroGFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    await expectCode(
      () =>
        createAdapter({ fetch, config: { requestTimeoutMs: 5 } }).createVerifiedChatCompletion({
          messages: MESSAGES,
        }),
      'ZERO_G_REQUEST_TIMEOUT',
    );
  });

  it('rejects announced and streamed oversized responses', async () => {
    const announcedFetch: ZeroGFetch = async () =>
      new Response('{}', { headers: { 'content-length': '99999' } });
    await expectCode(
      () =>
        createAdapter({ fetch: announcedFetch }).createVerifiedChatCompletion({
          messages: MESSAGES,
        }),
      'ZERO_G_RESPONSE_TOO_LARGE',
    );

    const streamedFetch: ZeroGFetch = async () =>
      new Response('x'.repeat(100), {
        headers: { 'ZG-Res-Key': 'response-123' },
      });
    await expectCode(
      () =>
        createAdapter({
          fetch: streamedFetch,
          config: { maximumResponseBytes: 32 },
        }).createVerifiedChatCompletion({ messages: MESSAGES }),
      'ZERO_G_RESPONSE_TOO_LARGE',
    );
  });

  it('rejects non-success HTTP responses without exposing their body', async () => {
    const error = await expectCode(
      () =>
        createAdapter({
          fetch: async () => new Response('provider secret details', { status: 500 }),
        }).createVerifiedChatCompletion({ messages: MESSAGES }),
      'ZERO_G_INFERENCE_FAILED',
    );
    expect(JSON.stringify(toPublicZeroGError(error))).not.toContain('provider secret details');
  });

  it('prefers the case-insensitive ZG-Res-Key header over body IDs', async () => {
    const processResponse = vi.fn(async () => true);
    const result = await createAdapter({
      broker: fakeBroker({ processResponse }),
      fetch: async () =>
        providerResponse({
          responseIdHeader: ['zG-rEs-kEy', 'header-response'],
          bodyId: 'body-response',
        }),
    }).createVerifiedChatCompletion({ messages: MESSAGES });
    expect(processResponse).toHaveBeenCalledWith(PROVIDER, 'header-response');
    expect(result.metadata.responseId).toBe('header-response');
  });

  it.each([
    ['id', { bodyId: 'body-id-response' }],
    ['chatID', { chatID: 'body-chat-response' }],
  ] as const)('uses the documented chatbot %s fallback', async (_name, body) => {
    const processResponse = vi.fn(async () => true);
    await createAdapter({
      broker: fakeBroker({ processResponse }),
      fetch: async () => providerResponse(body),
    }).createVerifiedChatCompletion({ messages: MESSAGES });
    expect(processResponse).toHaveBeenCalledWith(PROVIDER, Object.values(body)[0]);
  });

  it('rejects a missing or malformed response ID before verification', async () => {
    const processResponse = vi.fn(async () => true);
    for (const fetch of [
      async () => providerResponse(),
      async () => providerResponse({ bodyId: 'contains spaces' }),
    ]) {
      await expectCode(
        () =>
          createAdapter({
            broker: fakeBroker({ processResponse }),
            fetch,
          }).createVerifiedChatCompletion({ messages: MESSAGES }),
        'ZERO_G_RESPONSE_ID_MISSING',
      );
    }
    expect(processResponse).not.toHaveBeenCalled();
  });

  it.each([
    ['false', async (): Promise<boolean> => false],
    ['null', async (): Promise<null> => null],
    [
      'exception',
      async (): Promise<never> => {
        throw new Error('raw verification failure');
      },
    ],
  ] as const)('blocks model content when verification returns %s', async (_label, verification) => {
    const secretUtterance = 'MODEL_CONTROLLED_SECRET_UTTERANCE';
    const error = await expectCode(
      () =>
        createAdapter({
          broker: fakeBroker({ processResponse: verification }),
          fetch: async () =>
            providerResponse({
              responseIdHeader: ['ZG-Res-Key', 'response-123'],
              content: secretUtterance,
              extra: { leadId: 'model-controlled-id' },
            }),
        }).createVerifiedChatCompletion({ messages: MESSAGES }),
      'ZERO_G_VERIFICATION_FAILED',
    );
    const publicFailure = JSON.stringify(toPublicZeroGError(error));
    expect(publicFailure).not.toContain(secretUtterance);
    expect(publicFailure).not.toContain('model-controlled-id');
    expect(publicFailure).not.toContain('raw verification failure');
  });

  it('rejects malformed envelopes even after successful verification', async () => {
    await expectCode(
      () =>
        createAdapter({
          fetch: async () =>
            new Response('not-json', { headers: { 'ZG-Res-Key': 'response-123' } }),
        }).createVerifiedChatCompletion({ messages: MESSAGES }),
      'ZERO_G_OUTPUT_MALFORMED',
    );
  });
});

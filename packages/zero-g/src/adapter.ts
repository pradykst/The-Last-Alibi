import { ZeroGError } from './errors';
import { assertZeroGServerOnly } from './server-only';
import type {
  LiveZeroGConfig,
  VerifiedChatCompletion,
  VerifiedZeroGAdapter,
  ZeroGBroker,
  ZeroGFetch,
  ZeroGMessage,
  ZeroGProviderVerification,
  ZeroGService,
} from './types';

const RESPONSE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const MAXIMUM_MESSAGE_COUNT = 32;
const MAXIMUM_MESSAGE_CHARACTERS = 12_000;
const MAXIMUM_TOTAL_MESSAGE_CHARACTERS = 32_000;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateMessages(messages: readonly ZeroGMessage[]): void {
  if (messages.length === 0 || messages.length > MAXIMUM_MESSAGE_COUNT) {
    throw new ZeroGError('ZERO_G_OUTPUT_MALFORMED');
  }

  let total = 0;
  for (const message of messages) {
    if (
      !['system', 'user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string' ||
      message.content.length === 0 ||
      message.content.length > MAXIMUM_MESSAGE_CHARACTERS
    ) {
      throw new ZeroGError('ZERO_G_OUTPUT_MALFORMED');
    }
    total += message.content.length;
  }

  if (total > MAXIMUM_TOTAL_MESSAGE_CHARACTERS) {
    throw new ZeroGError('ZERO_G_OUTPUT_MALFORMED');
  }
}

function requireSecureEndpoint(endpoint: string): URL {
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') {
      throw new Error('Unsafe endpoint.');
    }
    return parsed;
  } catch {
    throw new ZeroGError('ZERO_G_PROVIDER_MISMATCH');
  }
}

function completionEndpoint(baseEndpoint: string): string {
  const endpoint = requireSecureEndpoint(baseEndpoint);
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/chat/completions`;
  return endpoint.toString();
}

function serviceOriginsMatch(catalogEndpoint: string, metadataEndpoint: string): boolean {
  return (
    requireSecureEndpoint(catalogEndpoint).origin === requireSecureEndpoint(metadataEndpoint).origin
  );
}

async function readBoundedResponse(response: Response, maximumBytes: number): Promise<string> {
  const announcedLength = response.headers.get('content-length');
  if (announcedLength !== null) {
    const parsedLength = Number(announcedLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > maximumBytes) {
      throw new ZeroGError('ZERO_G_RESPONSE_TOO_LARGE');
    }
  }

  if (response.body === null) {
    throw new ZeroGError('ZERO_G_OUTPUT_MALFORMED');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      text += decoder.decode();
      return text;
    }

    totalBytes += chunk.value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new ZeroGError('ZERO_G_RESPONSE_TOO_LARGE');
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
}

function parseEnvelope(rawBody: string): JsonRecord {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!isRecord(parsed)) {
      throw new Error('Envelope is not an object.');
    }
    return parsed;
  } catch {
    throw new ZeroGError('ZERO_G_OUTPUT_MALFORMED');
  }
}

function bodyResponseId(envelope: JsonRecord): string | undefined {
  for (const key of ['id', 'chatID'] as const) {
    const value = envelope[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return undefined;
}

function requireResponseId(response: Response, envelope: JsonRecord): string {
  const responseId = response.headers.get('ZG-Res-Key') ?? bodyResponseId(envelope);
  if (responseId === undefined || !RESPONSE_ID_PATTERN.test(responseId)) {
    throw new ZeroGError('ZERO_G_RESPONSE_ID_MISSING');
  }
  return responseId;
}

function requireContentAfterVerification(envelope: JsonRecord): string {
  const choices = envelope['choices'];
  const firstChoice = Array.isArray(choices) ? choices[0] : undefined;
  const message = isRecord(firstChoice) ? firstChoice['message'] : undefined;
  const content = isRecord(message) ? message['content'] : undefined;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new ZeroGError('ZERO_G_OUTPUT_MALFORMED');
  }
  return content;
}

function serviceMatches(config: LiveZeroGConfig, service: ZeroGService): boolean {
  return (
    service.provider.toLowerCase() === config.providerAddress.toLowerCase() &&
    service.serviceType === config.serviceType &&
    service.model === config.model &&
    service.verificationMode === config.expectedVerificationMode &&
    service.teeSignerAcknowledged
  );
}

export function createVerifiedZeroGAdapter(options: {
  config: LiveZeroGConfig;
  broker: ZeroGBroker;
  fetch?: ZeroGFetch;
  now?: () => Date;
}): VerifiedZeroGAdapter {
  assertZeroGServerOnly();
  const { config, broker } = options;
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());

  async function discoverService(): Promise<ZeroGService> {
    let services: readonly ZeroGService[];
    try {
      services = await broker.listServices();
    } catch {
      throw new ZeroGError('ZERO_G_PROVIDER_UNAVAILABLE');
    }

    const configured = services.find(
      (service) => service.provider.toLowerCase() === config.providerAddress.toLowerCase(),
    );
    if (configured === undefined) {
      throw new ZeroGError('ZERO_G_PROVIDER_UNAVAILABLE');
    }
    if (!serviceMatches(config, configured)) {
      throw new ZeroGError('ZERO_G_PROVIDER_MISMATCH');
    }
    requireSecureEndpoint(configured.endpoint);
    return configured;
  }

  async function verifyProvider(): Promise<ZeroGProviderVerification> {
    if (!config.requireProviderVerification) {
      return { checked: false, signerMatched: null, composeHashMatched: null };
    }

    let verification: ZeroGProviderVerification;
    try {
      verification = await broker.verifyProvider(config.providerAddress);
    } catch {
      throw new ZeroGError('ZERO_G_PROVIDER_MISMATCH');
    }
    if (
      !verification.checked ||
      verification.signerMatched !== true ||
      verification.composeHashMatched !== true
    ) {
      throw new ZeroGError('ZERO_G_PROVIDER_MISMATCH');
    }
    return verification;
  }

  async function createVerifiedChatCompletion(input: {
    messages: readonly ZeroGMessage[];
    signal?: AbortSignal;
  }): Promise<VerifiedChatCompletion> {
    validateMessages(input.messages);
    const service = await discoverService();
    const providerVerification = await verifyProvider();

    let metadata: { endpoint: string; model: string };
    let authenticatedHeaders: Readonly<Record<string, string>>;
    try {
      metadata = await broker.getServiceMetadata(config.providerAddress);
      if (
        metadata.model !== config.model ||
        !serviceOriginsMatch(service.endpoint, metadata.endpoint)
      ) {
        throw new ZeroGError('ZERO_G_PROVIDER_MISMATCH');
      }
      authenticatedHeaders = await broker.getRequestHeaders(config.providerAddress);
    } catch (error: unknown) {
      if (error instanceof ZeroGError) {
        throw error;
      }
      throw new ZeroGError('ZERO_G_PROVIDER_UNAVAILABLE');
    }

    const timeoutSignal = AbortSignal.timeout(config.requestTimeoutMs);
    const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
    const headers = new Headers(authenticatedHeaders);
    headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await fetchImplementation(completionEndpoint(metadata.endpoint), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: metadata.model,
          messages: input.messages,
          stream: false,
        }),
        signal,
      });
    } catch {
      throw new ZeroGError(signal.aborted ? 'ZERO_G_REQUEST_TIMEOUT' : 'ZERO_G_INFERENCE_FAILED');
    }

    if (!response.ok) {
      throw new ZeroGError('ZERO_G_INFERENCE_FAILED');
    }

    let rawBody: string;
    try {
      rawBody = await readBoundedResponse(response, config.maximumResponseBytes);
    } catch (error: unknown) {
      if (error instanceof ZeroGError) {
        throw error;
      }
      throw new ZeroGError(signal.aborted ? 'ZERO_G_REQUEST_TIMEOUT' : 'ZERO_G_INFERENCE_FAILED');
    }
    const envelope = parseEnvelope(rawBody);
    const responseId = requireResponseId(response, envelope);

    let verified: boolean | null;
    try {
      verified = await broker.processResponse(config.providerAddress, responseId);
    } catch {
      throw new ZeroGError('ZERO_G_VERIFICATION_FAILED');
    }
    if (verified !== true) {
      throw new ZeroGError('ZERO_G_VERIFICATION_FAILED');
    }

    const content = requireContentAfterVerification(envelope);
    return {
      content,
      metadata: {
        source: 'zero-g',
        network: config.network,
        providerAddress: config.providerAddress,
        model: config.model,
        serviceType: 'chatbot',
        responseId,
        responseVerification: 'verified',
        verificationMode: config.expectedVerificationMode,
        providerVerification,
        completedAt: now().toISOString(),
        sdkVersion: '0.8.4',
      },
    };
  }

  return { discoverService, verifyProvider, createVerifiedChatCompletion };
}

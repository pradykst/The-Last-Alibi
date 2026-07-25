import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import { JsonRpcProvider, Wallet, type JsonRpcSigner } from 'ethers';

import { ZeroGError } from './errors';
import { assertZeroGServerOnly } from './server-only';
import type {
  LiveZeroGConfig,
  ZeroGBroker,
  ZeroGEnvironment,
  ZeroGProviderVerification,
  ZeroGService,
} from './types';

const require = createRequire(import.meta.url);
const { createZGComputeNetworkBroker } = require('@0gfoundation/0g-compute-ts-sdk') as {
  createZGComputeNetworkBroker: (signer: JsonRpcSigner | Wallet) => Promise<ZGComputeNetworkBroker>;
};

type SupportedSigner = JsonRpcSigner | Wallet;
type OfficialInference = ZGComputeNetworkBroker['inference'];

function normalizeHeaders(
  headers: Awaited<ReturnType<OfficialInference['getRequestHeaders']>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]));
}

function normalizeService(
  service: Awaited<ReturnType<OfficialInference['listServiceWithDetail']>>[number],
): ZeroGService {
  return {
    provider: service.provider,
    serviceType: service.serviceType,
    endpoint: service.url,
    model: service.model,
    verificationMode: service.verifiability,
    teeSignerAcknowledged: service.teeSignerAcknowledged,
  };
}

export async function createOfficialZeroGBroker(options: {
  signer: SupportedSigner;
  createBroker?: (signer: SupportedSigner) => Promise<ZGComputeNetworkBroker>;
  attestationReportDirectory?: string;
}): Promise<ZeroGBroker> {
  assertZeroGServerOnly();
  const createBroker = options.createBroker ?? createZGComputeNetworkBroker;
  const official = await createBroker(options.signer);
  const reportDirectory =
    options.attestationReportDirectory ??
    join(tmpdir(), 'the-last-alibi', 'zero-g-attestation-reports');

  return {
    async listServices(): Promise<readonly ZeroGService[]> {
      const services = await official.inference.listServiceWithDetail();
      return services.map(normalizeService);
    },
    getServiceMetadata: (providerAddress) => official.inference.getServiceMetadata(providerAddress),
    async getRequestHeaders(providerAddress) {
      const headers = await official.inference.getRequestHeaders(providerAddress);
      return normalizeHeaders(headers);
    },
    async verifyProvider(providerAddress): Promise<ZeroGProviderVerification> {
      const result = await official.inference.verifyService(providerAddress, reportDirectory);
      if (
        result === null ||
        result.signerVerification === undefined ||
        result.composeVerification === undefined
      ) {
        return { checked: true, signerMatched: false, composeHashMatched: false };
      }
      return {
        checked: true,
        signerMatched: result.signerVerification.allMatch,
        composeHashMatched: result.composeVerification.passed,
      };
    },
    processResponse: (providerAddress, responseId) =>
      official.inference.processResponse(providerAddress, responseId),
  };
}

export async function createOfficialZeroGBrokerFromEnvironment(options: {
  config: LiveZeroGConfig;
  environment: ZeroGEnvironment;
  createBroker?: (signer: SupportedSigner) => Promise<ZGComputeNetworkBroker>;
}): Promise<ZeroGBroker> {
  assertZeroGServerOnly();
  const privateKey = options.environment['ZERO_G_PRIVATE_KEY'];
  if (privateKey === undefined || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new ZeroGError('ZERO_G_CONFIGURATION_INVALID');
  }

  try {
    const provider = new JsonRpcProvider(options.config.rpcUrl);
    const signer = new Wallet(privateKey, provider);
    return await createOfficialZeroGBroker({
      signer,
      ...(options.createBroker === undefined ? {} : { createBroker: options.createBroker }),
    });
  } catch (error: unknown) {
    if (error instanceof ZeroGError) {
      throw error;
    }
    throw new ZeroGError('ZERO_G_CONFIGURATION_INVALID');
  }
}

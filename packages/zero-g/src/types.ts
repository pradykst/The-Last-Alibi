export type ZeroGMode = 'disabled' | 'live';
export type ZeroGNetwork = 'testnet' | 'mainnet';
export type ZeroGVerificationMode = 'TeeML' | 'TeeTLS';

export type ZeroGEnvironment = Readonly<Record<string, string | undefined>>;

export type DisabledZeroGConfig = {
  mode: 'disabled';
};

export type LiveZeroGConfig = {
  mode: 'live';
  network: ZeroGNetwork;
  rpcUrl: string;
  providerAddress: string;
  model: string;
  serviceType: 'chatbot';
  expectedVerificationMode: ZeroGVerificationMode;
  requestTimeoutMs: number;
  maximumResponseBytes: number;
  requireProviderVerification: boolean;
  requireResponseVerification: true;
};

export type ZeroGConfig = DisabledZeroGConfig | LiveZeroGConfig;

export type ZeroGService = {
  provider: string;
  serviceType: string;
  endpoint: string;
  model: string;
  verificationMode: string;
  teeSignerAcknowledged: boolean;
};

export type ZeroGProviderVerification = {
  checked: boolean;
  signerMatched: boolean | null;
  composeHashMatched: boolean | null;
};

export type ZeroGRequestHeaders = Readonly<Record<string, string>>;

export type ZeroGBroker = {
  listServices(): Promise<readonly ZeroGService[]>;
  getServiceMetadata(providerAddress: string): Promise<{ endpoint: string; model: string }>;
  getRequestHeaders(providerAddress: string): Promise<ZeroGRequestHeaders>;
  verifyProvider(providerAddress: string): Promise<ZeroGProviderVerification>;
  processResponse(providerAddress: string, responseId: string): Promise<boolean | null>;
};

export type ZeroGMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type VerifiedChatCompletion = {
  content: string;
  metadata: {
    source: 'zero-g';
    network: ZeroGNetwork;
    providerAddress: string;
    model: string;
    serviceType: 'chatbot';
    responseId: string;
    responseVerification: 'verified';
    verificationMode: ZeroGVerificationMode;
    providerVerification: ZeroGProviderVerification;
    completedAt: string;
    sdkVersion: '0.8.4';
  };
};

export type ZeroGFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type VerifiedZeroGAdapter = {
  discoverService(): Promise<ZeroGService>;
  verifyProvider(): Promise<ZeroGProviderVerification>;
  createVerifiedChatCompletion(input: {
    messages: readonly ZeroGMessage[];
    signal?: AbortSignal;
  }): Promise<VerifiedChatCompletion>;
};

export type PublicZeroGError = {
  code: string;
  message: string;
  retryable: boolean;
};

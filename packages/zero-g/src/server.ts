export { createVerifiedZeroGAdapter } from './adapter';
export { parseZeroGConfig } from './config';
export {
  createOfficialZeroGBroker,
  createOfficialZeroGBrokerFromEnvironment,
} from './official-sdk';
export { ZeroGError, toPublicZeroGError } from './errors';
export type {
  PublicZeroGError,
  VerifiedChatCompletion,
  VerifiedZeroGAdapter,
  ZeroGBroker,
  ZeroGConfig,
  ZeroGEnvironment,
  ZeroGFetch,
  ZeroGMessage,
  ZeroGProviderVerification,
  ZeroGService,
} from './types';

export const ZERO_G_SDK_VERSION = '0.8.4';

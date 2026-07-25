export { createVerifiedZeroGAdapter } from './adapter';
export { parseZeroGConfig } from './config';
export {
  createOfficialZeroGBroker,
  createOfficialZeroGBrokerFromEnvironment,
} from './official-sdk';
export { ZeroGError, toPublicZeroGError } from './errors';
export {
  SUSPECT_IDS,
  SUSPECT_PERSONAS,
  buildSuspectMessages,
  publicSuspectTestimonyContextSchema,
} from './prompt';
export type { PublicSuspectTestimonyContext, ZeroGSuspectId } from './prompt';
export { parseSuspectDialogue, suspectDialogueSchema } from './dialogue';
export type { SuspectDialogue } from './dialogue';
export { requestVerifiedSuspectTestimony, VerifiedSuspectTestimonyService } from './testimony';
export type { VerifiedSuspectTestimony } from './testimony';
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

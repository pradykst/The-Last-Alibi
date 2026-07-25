import { z } from 'zod';

import {
  CAPABILITY_KEYS,
  CASE_CANDIDATE_COUNT,
  CERTIFIED_DISCLOSURE_LIMIT,
  EVIDENCE_CLASSES,
  MINIMUM_SURVIVING_CANDIDATES,
  PRODUCT_ID,
  PUBLIC_HEALTH_SERVICE_ID,
  RUNTIME_MODES,
  SESSION_STATES,
  VERIFICATION_STATES,
  WARRANT_OUTCOMES,
} from './constants';

const publicIdentifierSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const sessionIdSchema = publicIdentifierSchema.brand<'SessionId'>();
export const levelIdSchema = publicIdentifierSchema.brand<'LevelId'>();
export const predicateIdSchema = publicIdentifierSchema.brand<'PredicateId'>();
export const operationIdSchema = publicIdentifierSchema.brand<'OperationId'>();
export const correlationIdSchema = publicIdentifierSchema.brand<'CorrelationId'>();
export const transactionIdSchema = publicIdentifierSchema.brand<'TransactionId'>();
export const blobIdSchema = publicIdentifierSchema.brand<'BlobId'>();
export const externalResponseIdSchema = publicIdentifierSchema.brand<'ExternalResponseId'>();

export const runtimeModeSchema = z.enum(RUNTIME_MODES);
export const capabilityKeySchema = z.enum(CAPABILITY_KEYS);
export const sessionStateSchema = z.enum(SESSION_STATES);
export const evidenceClassSchema = z.enum(EVIDENCE_CLASSES);
export const verificationStateSchema = z.enum(VERIFICATION_STATES);
export const warrantOutcomeSchema = z.enum(WARRANT_OUTCOMES);

export const candidateCountSchema = z
  .number()
  .int()
  .min(MINIMUM_SURVIVING_CANDIDATES)
  .max(CASE_CANDIDATE_COUNT);

export const gameLimitsSchema = z
  .object({
    initialCandidateCount: z.literal(CASE_CANDIDATE_COUNT),
    certifiedDisclosureLimit: z.literal(CERTIFIED_DISCLOSURE_LIMIT),
    minimumSurvivingCandidates: z.literal(MINIMUM_SURVIVING_CANDIDATES),
  })
  .strict();

export const publicErrorSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    message: z.string().min(1).max(240),
    retryable: z.boolean(),
  })
  .strict();

const integrationReceiptBaseSchema = z
  .object({
    capability: capabilityKeySchema,
    operationId: operationIdSchema,
  })
  .strict();

export const integrationReceiptSchema = z.discriminatedUnion('state', [
  integrationReceiptBaseSchema.extend({
    state: z.literal('idle'),
  }),
  integrationReceiptBaseSchema.extend({
    state: z.literal('pending'),
    correlationId: correlationIdSchema,
  }),
  integrationReceiptBaseSchema.extend({
    state: z.literal('verified'),
    externalResponseId: externalResponseIdSchema,
    transactionId: transactionIdSchema.optional(),
    blobId: blobIdSchema.optional(),
  }),
  integrationReceiptBaseSchema.extend({
    state: z.literal('failed'),
    error: publicErrorSchema,
  }),
  integrationReceiptBaseSchema.extend({
    state: z.literal('denied'),
    error: publicErrorSchema,
  }),
]);

export const capabilityStatusSchema = z.discriminatedUnion('state', [
  z
    .object({
      capability: capabilityKeySchema,
      state: z.literal('fixture'),
      mode: z.literal('fixture'),
      label: z.string().min(1),
      blocking: z.literal(false),
    })
    .strict(),
  z
    .object({
      capability: capabilityKeySchema,
      state: z.literal('available'),
      mode: z.literal('live'),
      label: z.string().min(1),
      blocking: z.literal(false),
    })
    .strict(),
  z
    .object({
      capability: capabilityKeySchema,
      state: z.literal('unavailable'),
      mode: z.literal('live'),
      label: z.string().min(1),
      blocking: z.literal(true),
      error: publicErrorSchema,
    })
    .strict(),
]);

export const publicRuntimeStatusSchema = z
  .object({
    mode: runtimeModeSchema,
    label: z.string().min(1),
    capabilities: z.array(capabilityStatusSchema).length(CAPABILITY_KEYS.length),
  })
  .strict();

export const publicHealthResponseSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('ok'),
      product: z.literal(PRODUCT_ID),
      service: z.literal(PUBLIC_HEALTH_SERVICE_ID),
      application: z.literal('baseline-ready'),
      runtime: publicRuntimeStatusSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('unavailable'),
      product: z.literal(PRODUCT_ID),
      service: z.literal(PUBLIC_HEALTH_SERVICE_ID),
      application: z.enum(['configuration-error', 'live-capabilities-unavailable']),
      error: publicErrorSchema,
      runtime: publicRuntimeStatusSchema.optional(),
    })
    .strict(),
]);

export type RuntimeMode = z.infer<typeof runtimeModeSchema>;
export type CapabilityKey = z.infer<typeof capabilityKeySchema>;
export type SessionState = z.infer<typeof sessionStateSchema>;
export type EvidenceClass = z.infer<typeof evidenceClassSchema>;
export type VerificationState = z.infer<typeof verificationStateSchema>;
export type WarrantOutcome = z.infer<typeof warrantOutcomeSchema>;
export type PublicError = z.infer<typeof publicErrorSchema>;
export type IntegrationReceipt = z.infer<typeof integrationReceiptSchema>;
export type CapabilityStatus = z.infer<typeof capabilityStatusSchema>;
export type PublicRuntimeStatus = z.infer<typeof publicRuntimeStatusSchema>;
export type PublicHealthResponse = z.infer<typeof publicHealthResponseSchema>;

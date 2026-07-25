import { z } from 'zod';

import {
  CERTIFIED_DISCLOSURE_LIMIT,
  MVP_LEVEL_ID,
  PRODUCT_ID,
  SESSION_STATES,
  VERIFICATION_STATES,
  WARRANT_OUTCOMES,
} from './constants';
import {
  GAME_DENIAL_CODES,
  OBSERVATION_IDS,
  PREDICATE_DIMENSIONS,
  ROOM_IDS,
  SUSPECT_IDS,
  TIME_WINDOW_IDS,
  WEAPON_IDS,
} from './game-constants';
import { candidateCountSchema, publicErrorSchema } from './schemas';

const publicGameIdentifierSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const suspectIdSchema = z.enum(SUSPECT_IDS);
export const roomIdSchema = z.enum(ROOM_IDS);
export const weaponIdSchema = z.enum(WEAPON_IDS);
export const timeWindowIdSchema = z.enum(TIME_WINDOW_IDS);
export const observationIdSchema = z.enum(OBSERVATION_IDS);
export const predicateDimensionSchema = z.enum(PREDICATE_DIMENSIONS);
export const gameDenialCodeSchema = z.enum(GAME_DENIAL_CODES);

export const publicObservationSchema = z
  .object({
    id: observationIdSchema,
    roomId: roomIdSchema,
    title: z.string().min(1).max(80),
    description: z.string().min(1).max(400),
    evidenceClass: z.literal('public-observation'),
  })
  .strict();

const suspectManifestSchema = z
  .object({
    id: suspectIdSchema,
    name: z.string().min(1).max(80),
    role: z.string().min(1).max(120),
    publicDirection: z.string().min(1).max(240),
    primaryRoomId: roomIdSchema,
  })
  .strict();

const roomManifestSchema = z
  .object({
    id: roomIdSchema,
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(500),
    observations: z.array(publicObservationSchema).length(2),
  })
  .strict();

const dimensionValueManifestSchema = <T extends z.ZodType>(
  idSchema: T,
): z.ZodObject<{
  id: T;
  name: z.ZodString;
  description: z.ZodString;
}> =>
  z
    .object({
      id: idSchema,
      name: z.string().min(1).max(80),
      description: z.string().min(1).max(240),
    })
    .strict();

function addDuplicateIssue(
  values: readonly string[],
  path: string,
  context: z.RefinementCtx,
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: 'custom',
      path: [path],
      message: `${path} must contain unique IDs.`,
    });
  }
}

export const levelManifestSchema = z
  .object({
    productId: z.literal(PRODUCT_ID),
    levelId: z.literal(MVP_LEVEL_ID),
    title: z.literal('The Last Exhibit'),
    narrative: z.string().min(1).max(700),
    suspects: z.array(suspectManifestSchema).length(SUSPECT_IDS.length),
    rooms: z.array(roomManifestSchema).length(ROOM_IDS.length),
    weapons: z.array(dimensionValueManifestSchema(weaponIdSchema)).length(WEAPON_IDS.length),
    timeWindows: z
      .array(dimensionValueManifestSchema(timeWindowIdSchema))
      .length(TIME_WINDOW_IDS.length),
  })
  .strict()
  .superRefine((manifest, context) => {
    addDuplicateIssue(
      manifest.suspects.map((suspect) => suspect.id),
      'suspects',
      context,
    );
    addDuplicateIssue(
      manifest.rooms.map((room) => room.id),
      'rooms',
      context,
    );
    addDuplicateIssue(
      manifest.weapons.map((weapon) => weapon.id),
      'weapons',
      context,
    );
    addDuplicateIssue(
      manifest.timeWindows.map((timeWindow) => timeWindow.id),
      'timeWindows',
      context,
    );
    addDuplicateIssue(
      manifest.rooms.flatMap((room) => room.observations.map((observation) => observation.id)),
      'observations',
      context,
    );

    for (const room of manifest.rooms) {
      if (room.observations.some((observation) => observation.roomId !== room.id)) {
        context.addIssue({
          code: 'custom',
          path: ['rooms'],
          message: 'Every observation must reference its containing room.',
        });
      }
    }
  });

export const publicPredicateStatusSchema = z
  .object({
    predicateId: publicGameIdentifierSchema,
    dimension: predicateDimensionSchema,
    valueId: z.union([suspectIdSchema, roomIdSchema, weaponIdSchema, timeWindowIdSchema]),
    question: z.string().min(1).max(180),
    availability: z.enum(['available', 'used', 'unsafe']),
    yesCandidateCount: z.number().int().min(0).max(64),
    noCandidateCount: z.number().int().min(0).max(64),
  })
  .strict();

export const fixtureCaseCommitmentSchema = z
  .object({
    scheme: z.literal('fixture-sha256-v1'),
    value: z.string().regex(/^[0-9a-f]{64}$/),
    status: z.literal('local-fixture'),
    label: z.literal('Local fixture commitment'),
  })
  .strict();

export const fixtureDisclosureReceiptSchema = z
  .object({
    kind: z.literal('fixture-certified-simulation'),
    operationId: publicGameIdentifierSchema,
    verificationState: z.literal('verified'),
    label: z.literal('Fixture certified simulation'),
  })
  .strict();

export const testimonyEntrySchema = z
  .object({
    id: publicGameIdentifierSchema,
    suspectId: suspectIdSchema,
    questionId: publicGameIdentifierSchema,
    question: z.string().min(1).max(240),
    answer: z.string().min(1).max(700),
    evidenceClass: z.literal('unverified-testimony'),
    externalResponseId: publicGameIdentifierSchema,
    createdAt: z.string().datetime(),
  })
  .strict();

export const certifiedDisclosureEntrySchema = z
  .object({
    predicateId: publicGameIdentifierSchema,
    question: z.string().min(1).max(180),
    result: z.enum(WARRANT_OUTCOMES),
    candidateCount: candidateCountSchema,
    evidenceClass: z.literal('certified-disclosure'),
    receipt: fixtureDisclosureReceiptSchema,
    createdAt: z.string().datetime(),
  })
  .strict();

const publicSessionBaseSchema = z
  .object({
    sessionId: publicGameIdentifierSchema,
    levelId: z.literal(MVP_LEVEL_ID),
    caseCommitment: fixtureCaseCommitmentSchema,
    currentCandidateCount: candidateCountSchema,
    usedDisclosureCount: z.number().int().min(0).max(CERTIFIED_DISCLOSURE_LIMIT),
    maximumDisclosureCount: z.literal(CERTIFIED_DISCLOSURE_LIMIT),
    collectedObservationIds: z.array(observationIdSchema),
    testimonyEntries: z.array(testimonyEntrySchema),
    certifiedDisclosures: z.array(certifiedDisclosureEntrySchema),
    exploredRoomIds: z.array(roomIdSchema),
    predicateStatuses: z.array(publicPredicateStatusSchema),
    verificationState: z.enum(VERIFICATION_STATES),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const publicGameSessionSchema = z.discriminatedUnion('state', [
  publicSessionBaseSchema.extend({
    state: z.enum(SESSION_STATES).exclude(['terminal']),
    terminalResult: z.never().optional(),
  }),
  publicSessionBaseSchema.extend({
    state: z.literal('terminal'),
    terminalResult: z.enum(WARRANT_OUTCOMES),
  }),
]);

export const testimonyQuestionSchema = z
  .object({
    id: publicGameIdentifierSchema,
    suspectId: suspectIdSchema,
    question: z.string().min(1).max(240),
  })
  .strict();

export const publicGameContentSchema = z
  .object({
    manifest: levelManifestSchema,
    testimonyQuestions: z.array(testimonyQuestionSchema).length(SUSPECT_IDS.length * 2),
  })
  .strict();

export const exploreRequestSchema = z
  .object({
    roomId: roomIdSchema,
    observationId: observationIdSchema.optional(),
  })
  .strict();

export const testimonyRequestSchema = z
  .object({
    suspectId: suspectIdSchema,
    questionId: publicGameIdentifierSchema,
  })
  .strict();

export const warrantRequestSchema = z
  .object({
    predicateId: publicGameIdentifierSchema,
  })
  .strict();

export const accusationRequestSchema = z
  .object({
    suspectId: suspectIdSchema,
    roomId: roomIdSchema,
    weaponId: weaponIdSchema,
    timeWindowId: timeWindowIdSchema,
    confirmTerminal: z.literal(true),
  })
  .strict();

export const gameErrorResponseSchema = z
  .object({
    ok: z.literal(false),
    error: publicErrorSchema,
  })
  .strict();

export const createSessionResponseSchema = z
  .object({
    ok: z.literal(true),
    session: publicGameSessionSchema,
    content: publicGameContentSchema,
  })
  .strict();

export const getSessionResponseSchema = z
  .object({
    ok: z.literal(true),
    session: publicGameSessionSchema,
  })
  .strict();

export const exploreResponseSchema = z
  .object({
    ok: z.literal(true),
    session: publicGameSessionSchema,
    observation: publicObservationSchema.optional(),
  })
  .strict();

export const testimonyResponseSchema = z
  .object({
    ok: z.literal(true),
    session: publicGameSessionSchema,
    entry: testimonyEntrySchema,
  })
  .strict();

export const warrantResponseSchema = z
  .object({
    ok: z.literal(true),
    session: publicGameSessionSchema,
    disclosure: certifiedDisclosureEntrySchema,
  })
  .strict();

export const accusationResponseSchema = z
  .object({
    ok: z.literal(true),
    session: publicGameSessionSchema,
    result: z.enum(WARRANT_OUTCOMES),
    label: z.literal('Fixture verdict'),
  })
  .strict();

export type SuspectId = z.infer<typeof suspectIdSchema>;
export type RoomId = z.infer<typeof roomIdSchema>;
export type WeaponId = z.infer<typeof weaponIdSchema>;
export type TimeWindowId = z.infer<typeof timeWindowIdSchema>;
export type ObservationId = z.infer<typeof observationIdSchema>;
export type PredicateDimension = z.infer<typeof predicateDimensionSchema>;
export type GameDenialCode = z.infer<typeof gameDenialCodeSchema>;
export type PublicObservation = z.infer<typeof publicObservationSchema>;
export type LevelManifest = z.infer<typeof levelManifestSchema>;
export type PublicPredicateStatus = z.infer<typeof publicPredicateStatusSchema>;
export type FixtureCaseCommitment = z.infer<typeof fixtureCaseCommitmentSchema>;
export type TestimonyEntry = z.infer<typeof testimonyEntrySchema>;
export type CertifiedDisclosureEntry = z.infer<typeof certifiedDisclosureEntrySchema>;
export type PublicGameSession = z.infer<typeof publicGameSessionSchema>;
export type TestimonyQuestion = z.infer<typeof testimonyQuestionSchema>;
export type PublicGameContent = z.infer<typeof publicGameContentSchema>;
export type ExploreRequest = z.infer<typeof exploreRequestSchema>;
export type TestimonyRequest = z.infer<typeof testimonyRequestSchema>;
export type WarrantRequest = z.infer<typeof warrantRequestSchema>;
export type AccusationRequest = z.infer<typeof accusationRequestSchema>;
export type GameErrorResponse = z.infer<typeof gameErrorResponseSchema>;
export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;
export type GetSessionResponse = z.infer<typeof getSessionResponseSchema>;
export type ExploreResponse = z.infer<typeof exploreResponseSchema>;
export type TestimonyResponse = z.infer<typeof testimonyResponseSchema>;
export type WarrantResponse = z.infer<typeof warrantResponseSchema>;
export type AccusationResponse = z.infer<typeof accusationResponseSchema>;

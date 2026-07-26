import type { TestimonyRequest, TestimonyResponse } from '@alibi/protocol';
import {
  VerifiedSuspectTestimonyService,
  createOfficialZeroGBrokerFromEnvironment,
  createVerifiedZeroGAdapter,
  parseZeroGConfig,
  toPublicZeroGError,
} from '@alibi/zero-g/server';

import { PUBLIC_GAME_CONTENT, findScriptedTestimony } from './content';
import { GameServiceError } from './errors';
import { fixtureGameService } from './instance';

let servicePromise: Promise<VerifiedSuspectTestimonyService> | undefined;

async function createService(): Promise<VerifiedSuspectTestimonyService> {
  const config = parseZeroGConfig(process.env);
  if (config.mode !== 'live') {
    throw new GameServiceError(503, 'ZERO_G_DISABLED', '0G inference is disabled.');
  }
  const broker = await createOfficialZeroGBrokerFromEnvironment({
    config,
    environment: process.env,
  });
  return new VerifiedSuspectTestimonyService({
    adapter: createVerifiedZeroGAdapter({ config, broker }),
  });
}

function getService(): Promise<VerifiedSuspectTestimonyService> {
  return (servicePromise ??= createService().catch((error: unknown) => {
    servicePromise = undefined;
    throw error;
  }));
}

export async function requestLiveZeroGTestimony(
  sessionId: string,
  request: TestimonyRequest,
): Promise<TestimonyResponse> {
  const scripted = findScriptedTestimony(request.suspectId, request.questionId);
  if (scripted === undefined) {
    throw GameServiceError.denial('MALFORMED_REQUEST');
  }
  const { session } = fixtureGameService.getSession(sessionId);
  const roomId = session.exploredRoomIds.at(-1) ?? PUBLIC_GAME_CONTENT.manifest.rooms[0]?.id;
  const room = PUBLIC_GAME_CONTENT.manifest.rooms.find((entry) => entry.id === roomId);
  if (room === undefined) {
    throw new GameServiceError(
      503,
      'ZERO_G_LIVE_CONTEXT_UNAVAILABLE',
      'Live public session context is unavailable.',
    );
  }

  const collected = new Set(session.collectedObservationIds);
  const observations = PUBLIC_GAME_CONTENT.manifest.rooms
    .flatMap((entry) => entry.observations)
    .filter((entry) => collected.has(entry.id))
    .map(({ id, title, description }) => ({ id, title, description }));
  const history = session.testimonyEntries
    .filter((entry) => entry.suspectId === request.suspectId)
    .flatMap((entry) => [
      { role: 'user' as const, content: entry.question },
      { role: 'assistant' as const, content: entry.answer },
    ]);

  try {
    const testimony = await (
      await getService()
    ).request({
      publicSessionId: session.sessionId,
      suspectId: request.suspectId,
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
      },
      observations,
      history,
      question: scripted.question,
      approvedLeadIds: session.collectedObservationIds,
      approvedPredicates: session.predicateStatuses
        .filter((entry) => entry.availability === 'available')
        .map((entry) => ({ id: entry.predicateId, question: entry.question })),
    });

    return fixtureGameService.recordVerifiedZeroGTestimony(sessionId, request, {
      answer: testimony.dialogue.utterance,
      responseId: testimony.verification.responseId,
    });
  } catch (error: unknown) {
    if (error instanceof GameServiceError) {
      throw error;
    }
    const failure = toPublicZeroGError(error);
    throw new GameServiceError(503, failure.code, failure.message, failure.retryable);
  }
}

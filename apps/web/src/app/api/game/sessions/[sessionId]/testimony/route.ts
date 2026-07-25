import { testimonyRequestSchema } from '@alibi/protocol';

import { fixtureGameService } from '../../../../../../server/game/instance';
import { gameRouteResponse, parseRequestBody } from '../../../../../../server/game/http';
import { runFixtureGameOperation } from '../../../../../../server/game/runtime-gate';

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export function POST(request: Request, context: RouteContext): Promise<Response> {
  return gameRouteResponse(async () => {
    const { sessionId } = await context.params;
    const body = await parseRequestBody(request, testimonyRequestSchema);
    return runFixtureGameOperation(() => fixtureGameService.requestTestimony(sessionId, body));
  });
}

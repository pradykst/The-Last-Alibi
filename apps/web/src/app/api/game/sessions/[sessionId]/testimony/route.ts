import { testimonyRequestSchema } from '@alibi/protocol';

import { fixtureGameService } from '../../../../../../server/game/instance';
import { gameRouteResponse, parseRequestBody } from '../../../../../../server/game/http';
import { runTestimonyOperation } from '../../../../../../server/game/testimony-runtime';
import { requestLiveZeroGTestimony } from '../../../../../../server/game/zero-g-testimony';

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export function POST(request: Request, context: RouteContext): Promise<Response> {
  return gameRouteResponse(async () => {
    const { sessionId } = await context.params;
    const body = await parseRequestBody(request, testimonyRequestSchema);
    return runTestimonyOperation({
      fixture: () => fixtureGameService.requestTestimony(sessionId, body),
      live: () => requestLiveZeroGTestimony(sessionId, body),
    });
  });
}

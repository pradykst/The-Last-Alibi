import { fixtureGameService } from '../../../../../server/game/instance';
import { gameRouteResponse } from '../../../../../server/game/http';
import { runFixtureGameOperation } from '../../../../../server/game/runtime-gate';

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export const dynamic = 'force-dynamic';

export function GET(_request: Request, context: RouteContext): Promise<Response> {
  return gameRouteResponse(async () => {
    const { sessionId } = await context.params;
    return runFixtureGameOperation(() => fixtureGameService.getSession(sessionId));
  });
}

import { fixtureGameService } from '../../../../server/game/instance';
import { gameRouteResponse } from '../../../../server/game/http';
import { runFixtureGameOperation } from '../../../../server/game/runtime-gate';

export const dynamic = 'force-dynamic';

export function POST(): Promise<Response> {
  return gameRouteResponse(() => runFixtureGameOperation(() => fixtureGameService.createSession()));
}

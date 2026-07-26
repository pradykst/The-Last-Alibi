import { FixtureGameService } from './service';
import { FixtureSessionStore } from './store';

type FixtureGameGlobal = typeof globalThis & {
  __lastAlibiFixtureGameService?: FixtureGameService;
};

const fixtureGameGlobal = globalThis as FixtureGameGlobal;

export function createFixtureGameService(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): FixtureGameService {
  const persistencePath = environment['ALIBI_FIXTURE_STORE_PATH']?.trim();
  return new FixtureGameService({
    store: new FixtureSessionStore({
      ...(persistencePath === undefined || persistencePath === '' ? {} : { persistencePath }),
    }),
  });
}

export const fixtureGameService = (fixtureGameGlobal.__lastAlibiFixtureGameService ??=
  createFixtureGameService());

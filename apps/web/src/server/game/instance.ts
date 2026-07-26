import { FixtureGameService } from './service';

type FixtureGameGlobal = typeof globalThis & {
  __lastAlibiFixtureGameService?: FixtureGameService;
};

const fixtureGameGlobal = globalThis as FixtureGameGlobal;

export const fixtureGameService = (fixtureGameGlobal.__lastAlibiFixtureGameService ??=
  new FixtureGameService());

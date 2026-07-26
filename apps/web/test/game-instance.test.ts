import { describe, expect, it, vi } from 'vitest';

describe('fixture service lifecycle', () => {
  it('preserves sessions when route modules reload during development', async () => {
    const firstModule = await import('../src/server/game/instance');
    const created = firstModule.fixtureGameService.createSession();

    vi.resetModules();
    const reloadedModule = await import('../src/server/game/instance');
    const resumed = reloadedModule.fixtureGameService.getSession(created.session.sessionId);

    expect(reloadedModule.fixtureGameService).toBe(firstModule.fixtureGameService);
    expect(resumed.session.sessionId).toBe(created.session.sessionId);
  });
});

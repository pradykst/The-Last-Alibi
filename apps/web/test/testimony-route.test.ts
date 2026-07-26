import { gameErrorResponseSchema, testimonyResponseSchema } from '@alibi/protocol';
import { afterEach, describe, expect, it } from 'vitest';

import { POST as testimonyRoute } from '../src/app/api/game/sessions/[sessionId]/testimony/route';
import { fixtureGameService } from '../src/server/game/instance';

const originalMode = process.env['ALIBI_ZERO_G_MODE'];

afterEach(() => {
  if (originalMode === undefined) {
    delete process.env['ALIBI_ZERO_G_MODE'];
  } else {
    process.env['ALIBI_ZERO_G_MODE'] = originalMode;
  }
});

function request(): Request {
  return new Request('http://localhost/api/game/sessions/session/testimony', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      suspectId: 'suspect_archivist',
      questionId: 'question_archivist_blackout',
    }),
  });
}

describe('testimony route contract', () => {
  it('keeps B2 scripted testimony available only in fixture mode', async () => {
    process.env['ALIBI_ZERO_G_MODE'] = 'disabled';
    const session = fixtureGameService.createSession().session;
    const response = await testimonyRoute(request(), {
      params: Promise.resolve({ sessionId: session.sessionId }),
    });
    const body: unknown = await response.json();
    const parsed = testimonyResponseSchema.parse(body);
    expect(response.status).toBe(200);
    expect(parsed.entry.evidenceClass).toBe('unverified-testimony');
    expect(parsed.entry.externalResponseId).toMatch(/^fixture-response_/);
    expect(parsed.session.currentCandidateCount).toBe(session.currentCandidateCount);
  });

  it('returns a sanitized blocking 503 in live mode without creating a fixture session', async () => {
    process.env['ALIBI_ZERO_G_MODE'] = 'live';
    const session = fixtureGameService.createSession().session;
    const response = await testimonyRoute(request(), {
      params: Promise.resolve({ sessionId: session.sessionId }),
    });
    const body: unknown = await response.json();
    expect(response.status).toBe(503);
    expect(gameErrorResponseSchema.parse(body)).toMatchObject({
      ok: false,
      error: { code: 'ZERO_G_CONFIGURATION_INVALID' },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('fixture-response_');
    expect(serialized).not.toContain('ZERO_G_PRIVATE_KEY');
  });
});

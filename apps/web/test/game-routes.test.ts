import { createSessionResponseSchema, gameErrorResponseSchema } from '@alibi/protocol';
import { afterEach, describe, expect, it } from 'vitest';

import { POST as createSessionRoute } from '../src/app/api/game/sessions/route';
import { gameRouteResponse, parseRequestBody } from '../src/server/game/http';
import { warrantRequestSchema } from '@alibi/protocol';

const originalMode = process.env['ALIBI_RUNTIME_MODE'];

afterEach(() => {
  if (originalMode === undefined) {
    delete process.env['ALIBI_RUNTIME_MODE'];
  } else {
    process.env['ALIBI_RUNTIME_MODE'] = originalMode;
  }
});

describe('game route boundary', () => {
  it('creates a public fixture session through the route', async () => {
    process.env['ALIBI_RUNTIME_MODE'] = 'fixture';
    const response = await createSessionRoute();
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(createSessionResponseSchema.parse(body).session.state).toBe('active');
  });

  it('returns a blocking sanitized 503 in live mode', async () => {
    process.env['ALIBI_RUNTIME_MODE'] = 'live';
    const response = await createSessionRoute();
    const body: unknown = await response.json();

    expect(response.status).toBe(503);
    expect(gameErrorResponseSchema.parse(body)).toMatchObject({
      ok: false,
      error: {
        code: 'LIVE_GAME_CAPABILITY_UNAVAILABLE',
      },
    });
    expect(JSON.stringify(body)).not.toContain('ALIBI_RUNTIME_MODE');
  });

  it('returns a stable malformed-request error without raw exceptions', async () => {
    const request = new Request('http://localhost/api/game/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arbitraryQuestion: 'Who did it?' }),
    });
    const response = await gameRouteResponse(async () =>
      parseRequestBody(request, warrantRequestSchema),
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(400);
    expect(gameErrorResponseSchema.parse(body)).toMatchObject({
      error: { code: 'MALFORMED_REQUEST' },
    });
  });
});

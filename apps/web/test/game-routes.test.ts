import {
  createSessionResponseSchema,
  exploreResponseSchema,
  gameErrorResponseSchema,
  warrantRequestSchema,
} from '@alibi/protocol';
import { afterEach, describe, expect, it } from 'vitest';

import { POST as createSessionRoute } from '../src/app/api/game/sessions/route';
import { POST as exploreSessionRoute } from '../src/app/api/game/sessions/[sessionId]/explore/route';
import { gameRouteResponse, parseRequestBody } from '../src/server/game/http';

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

  it('keeps a created fixture session available to the explore route', async () => {
    process.env['ALIBI_RUNTIME_MODE'] = 'fixture';
    const createResponse = await createSessionRoute();
    const created = createSessionResponseSchema.parse(await createResponse.json());
    const request = new Request(
      `http://localhost/api/game/sessions/${created.session.sessionId}/explore`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: 'room_gallery' }),
      },
    );

    const response = await exploreSessionRoute(request, {
      params: Promise.resolve({ sessionId: created.session.sessionId }),
    });
    const explored = exploreResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(explored.session.sessionId).toBe(created.session.sessionId);
    expect(explored.session.exploredRoomIds).toContain('room_gallery');
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

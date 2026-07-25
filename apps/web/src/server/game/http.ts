import type { z } from 'zod';

import { GameServiceError, gameErrorResponse } from './errors';

export async function parseRequestBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): Promise<z.output<TSchema>> {
  try {
    const body: unknown = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw GameServiceError.denial('MALFORMED_REQUEST');
    }
    return parsed.data;
  } catch (error: unknown) {
    if (error instanceof GameServiceError) {
      throw error;
    }
    throw GameServiceError.denial('MALFORMED_REQUEST');
  }
}

export async function gameRouteResponse<T>(operation: () => T | Promise<T>): Promise<Response> {
  try {
    const body = await operation();
    return Response.json(body, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    const failure = gameErrorResponse(error);
    return Response.json(failure.body, {
      status: failure.statusCode,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }
}

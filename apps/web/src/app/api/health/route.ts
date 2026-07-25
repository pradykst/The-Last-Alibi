import { buildHealthResult } from '../../../server/health';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  const result = buildHealthResult();

  return Response.json(result.body, {
    status: result.statusCode,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

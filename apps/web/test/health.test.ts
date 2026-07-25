import { publicHealthResponseSchema } from '@alibi/protocol';
import { describe, expect, it } from 'vitest';

import { buildHealthResult } from '../src/server/health';

describe('public health response', () => {
  it('returns a schema-valid sanitized fixture response', () => {
    const result = buildHealthResult({
      NODE_ENV: 'test',
      PRIVATE_MARKER: 'must-not-be-public',
    });

    expect(result.statusCode).toBe(200);
    expect(publicHealthResponseSchema.parse(result.body).status).toBe('ok');
    expect(JSON.stringify(result.body)).not.toContain('must-not-be-public');
  });

  it('returns a sanitized 503 when production mode is missing', () => {
    const result = buildHealthResult({ NODE_ENV: 'production' });

    expect(result.statusCode).toBe(503);
    expect(result.body).toMatchObject({
      status: 'unavailable',
      application: 'configuration-error',
      error: {
        code: 'RUNTIME_CONFIGURATION_ERROR',
      },
    });
    expect(JSON.stringify(result.body)).not.toContain('ALIBI_RUNTIME_MODE');
  });

  it('returns a blocking 503 instead of simulating live capabilities', () => {
    const result = buildHealthResult({ ALIBI_RUNTIME_MODE: 'live' });

    expect(result.statusCode).toBe(503);
    expect(result.body).toMatchObject({
      status: 'unavailable',
      application: 'live-capabilities-unavailable',
    });
  });
});

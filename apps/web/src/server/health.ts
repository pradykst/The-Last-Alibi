import { PRODUCT_ID, PUBLIC_HEALTH_SERVICE_ID, publicHealthResponseSchema } from '@alibi/protocol';
import type { PublicHealthResponse } from '@alibi/protocol';
import { createPublicRuntimeStatus, toPublicRuntimeError } from '@alibi/runtime/server';
import type { RuntimeEnvironment } from '@alibi/runtime/server';

export type HealthResult = {
  statusCode: 200 | 503;
  body: PublicHealthResponse;
};

export function buildHealthResult(environment: RuntimeEnvironment = process.env): HealthResult {
  try {
    const runtime = createPublicRuntimeStatus(environment);
    const liveIsBlocked =
      runtime.mode === 'live' && runtime.capabilities.some((capability) => capability.blocking);

    if (liveIsBlocked) {
      return {
        statusCode: 503,
        body: publicHealthResponseSchema.parse({
          status: 'unavailable',
          product: PRODUCT_ID,
          service: PUBLIC_HEALTH_SERVICE_ID,
          application: 'live-capabilities-unavailable',
          error: {
            code: 'LIVE_CAPABILITIES_UNAVAILABLE',
            message: 'One or more declared live capabilities are unavailable.',
            retryable: false,
          },
          runtime,
        }),
      };
    }

    return {
      statusCode: 200,
      body: publicHealthResponseSchema.parse({
        status: 'ok',
        product: PRODUCT_ID,
        service: PUBLIC_HEALTH_SERVICE_ID,
        application: 'baseline-ready',
        runtime,
      }),
    };
  } catch (error: unknown) {
    return {
      statusCode: 503,
      body: publicHealthResponseSchema.parse({
        status: 'unavailable',
        product: PRODUCT_ID,
        service: PUBLIC_HEALTH_SERVICE_ID,
        application: 'configuration-error',
        error: toPublicRuntimeError(error),
      }),
    };
  }
}

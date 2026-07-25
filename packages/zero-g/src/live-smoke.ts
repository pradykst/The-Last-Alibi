import { execFileSync } from 'node:child_process';

import { createVerifiedZeroGAdapter } from './adapter';
import { parseZeroGConfig } from './config';
import { ZeroGError, toPublicZeroGError } from './errors';
import { createOfficialZeroGBrokerFromEnvironment } from './official-sdk';
import { requestVerifiedSuspectTestimony } from './testimony';
import type { VerifiedZeroGAdapter, ZeroGBroker, ZeroGFetch } from './types';

type DiagnosticStage =
  | 'request serialization'
  | 'authenticated request dispatch'
  | 'HTTP response status'
  | 'response-body parsing'
  | 'response identifier extraction'
  | 'structured testimony validation'
  | 'processResponse invocation'
  | 'processResponse result'
  | 'final renderability decision';

type LiveDiagnostic = {
  stage: DiagnosticStage;
  requestSerialization: 'not-checked' | 'valid' | 'invalid';
  httpStatus: number | null;
  responseContentType: string | null;
  responseIdentifierPresent: boolean;
  processResponseResult: 'not-invoked' | 'true' | 'false' | 'null' | 'threw';
  failureCategory: 'none' | 'timeout' | 'network' | 'unknown';
  renderable: boolean;
};

const diagnostic: LiveDiagnostic = {
  stage: 'request serialization',
  requestSerialization: 'not-checked',
  httpStatus: null,
  responseContentType: null,
  responseIdentifierPresent: false,
  processResponseResult: 'not-invoked',
  failureCategory: 'none',
  renderable: false,
};

function diagnosticFetch(): ZeroGFetch {
  return async (input, init) => {
    diagnostic.stage = 'request serialization';
    try {
      if (typeof init?.body !== 'string') {
        throw new Error('Request body was not serialized text.');
      }
      const body: unknown = JSON.parse(init.body);
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new Error('Request body was not an object.');
      }
      diagnostic.requestSerialization = 'valid';
    } catch {
      diagnostic.requestSerialization = 'invalid';
      throw new ZeroGError('ZERO_G_OUTPUT_MALFORMED');
    }

    diagnostic.stage = 'authenticated request dispatch';
    let response: Response;
    try {
      response = await globalThis.fetch(input, init);
    } catch (error: unknown) {
      diagnostic.failureCategory =
        error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name)
          ? 'timeout'
          : error instanceof TypeError
            ? 'network'
            : 'unknown';
      throw error;
    }

    diagnostic.stage = 'HTTP response status';
    diagnostic.httpStatus = response.status;
    diagnostic.responseContentType =
      response.headers.get('content-type')?.split(';', 1)[0]?.trim() ?? null;
    if (response.ok) {
      diagnostic.stage = 'response-body parsing';
    }
    return response;
  };
}

function diagnosticBroker(broker: ZeroGBroker): ZeroGBroker {
  return {
    ...broker,
    async processResponse(providerAddress, responseId) {
      diagnostic.stage = 'processResponse invocation';
      diagnostic.responseIdentifierPresent = responseId.length > 0;
      try {
        const result = await broker.processResponse(providerAddress, responseId);
        diagnostic.processResponseResult =
          result === null ? 'null' : (String(result) as 'true' | 'false');
        diagnostic.stage = 'processResponse result';
        return result;
      } catch {
        diagnostic.processResponseResult = 'threw';
        diagnostic.stage = 'processResponse result';
        throw new ZeroGError('ZERO_G_VERIFICATION_FAILED');
      }
    },
  };
}

function diagnosticAdapter(adapter: VerifiedZeroGAdapter): VerifiedZeroGAdapter {
  return {
    ...adapter,
    async createVerifiedChatCompletion(input) {
      const completion = await adapter.createVerifiedChatCompletion(input);
      diagnostic.stage = 'structured testimony validation';
      return completion;
    },
  };
}

function normalizeFailureStage(code: string): void {
  if (code === 'ZERO_G_RESPONSE_ID_MISSING') {
    diagnostic.stage = 'response identifier extraction';
    return;
  }
  if (
    [
      'ZERO_G_OUTPUT_MALFORMED',
      'ZERO_G_UNKNOWN_ACTION',
      'ZERO_G_UNKNOWN_LEAD',
      'ZERO_G_UNKNOWN_PREDICATE',
    ].includes(code)
  ) {
    diagnostic.stage =
      diagnostic.processResponseResult === 'true' &&
      diagnostic.stage === 'structured testimony validation'
        ? 'structured testimony validation'
        : 'response-body parsing';
  }
}

async function main(): Promise<void> {
  const config = parseZeroGConfig(process.env);
  if (config.mode !== 'live') {
    throw new ZeroGError('ZERO_G_DISABLED');
  }

  const broker = diagnosticBroker(
    await createOfficialZeroGBrokerFromEnvironment({
      config,
      environment: process.env,
    }),
  );
  const adapter = diagnosticAdapter(
    createVerifiedZeroGAdapter({ config, broker, fetch: diagnosticFetch() }),
  );
  const result = await requestVerifiedSuspectTestimony({
    adapter,
    context: {
      publicSessionId: 'zero-g-live-smoke',
      suspectId: 'suspect_archivist',
      room: {
        id: 'room_archive',
        name: 'Archive Vault',
        description: 'A climate-controlled vault of donor records and access ledgers.',
      },
      observations: [
        {
          id: 'observation_archive_access',
          title: 'Interrupted access log',
          description: 'The public access log contains a gap matching the security blackout.',
        },
      ],
      history: [],
      question: 'In one concise sentence, where were you when the lights failed?',
      approvedLeadIds: [],
      approvedPredicates: [],
    },
  });

  diagnostic.stage = 'final renderability decision';
  diagnostic.renderable = true;
  const codeRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      evidenceClass: result.evidenceClass,
      canonicalEffect: result.canonicalEffect,
      candidateMaskChanged: result.candidateMaskChanged,
      network: result.verification.network,
      providerAddress: result.verification.providerAddress,
      model: result.verification.model,
      serviceType: result.verification.serviceType,
      responseId: result.verification.responseId,
      responseVerification: result.verification.responseVerification,
      verificationMode: result.verification.verificationMode,
      providerVerification: result.verification.providerVerification,
      completedAt: result.verification.completedAt,
      sdkVersion: result.verification.sdkVersion,
      codeRevision,
      diagnostic,
    })}\n`,
    () => process.exit(0),
  );
}

main().catch((error: unknown) => {
  const publicError = toPublicZeroGError(error);
  normalizeFailureStage(publicError.code);
  diagnostic.renderable = false;
  process.stderr.write(`${JSON.stringify({ ok: false, error: publicError, diagnostic })}\n`, () =>
    process.exit(1),
  );
});

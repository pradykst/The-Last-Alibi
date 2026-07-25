import { execFileSync } from 'node:child_process';

import { createVerifiedZeroGAdapter } from './adapter';
import { parseZeroGConfig } from './config';
import { ZeroGError, toPublicZeroGError } from './errors';
import { createOfficialZeroGBrokerFromEnvironment } from './official-sdk';
import { requestVerifiedSuspectTestimony } from './testimony';

async function main(): Promise<void> {
  const config = parseZeroGConfig(process.env);
  if (config.mode !== 'live') {
    throw new ZeroGError('ZERO_G_DISABLED');
  }

  const broker = await createOfficialZeroGBrokerFromEnvironment({
    config,
    environment: process.env,
  });
  const adapter = createVerifiedZeroGAdapter({ config, broker });
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

  const codeRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  process.stdout.write(
    `${JSON.stringify(
      {
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
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: toPublicZeroGError(error) })}\n`);
  process.exitCode = 1;
});

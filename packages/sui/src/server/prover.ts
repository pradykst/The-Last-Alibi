import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import { z } from 'zod';

import { sanitizedError } from '../errors';

const MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;

const proofOutputSchema = z
  .object({
    status: z.literal('ok'),
    circuit: z.enum(['query', 'verdict']),
    circuitVersion: z.literal('1'),
    proofHex: z.string().regex(/^[0-9a-f]{256}$/),
    publicInputsHex: z.string().regex(/^[0-9a-f]+$/),
    verifierIdentitySha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

const verificationOutputSchema = z
  .object({
    status: z.literal('ok'),
    circuit: z.enum(['query', 'verdict']),
    verified: z.boolean(),
    verifierIdentitySha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export type ApplicationProof = z.infer<typeof proofOutputSchema>;
export type ApplicationVerification = z.infer<typeof verificationOutputSchema>;

export type ApplicationProverPaths = {
  binary: string;
  queryWasm: string;
  queryR1cs: string;
  queryProvingKey: string;
  queryVerifyingKey: string;
  verdictWasm: string;
  verdictR1cs: string;
  verdictProvingKey: string;
  verdictVerifyingKey: string;
};

export interface ProverProcess {
  run(arguments_: readonly string[], stdin: string, timeoutMs: number): Promise<string>;
}

function assertArtifacts(paths: ApplicationProverPaths): void {
  for (const [label, path] of Object.entries(paths)) {
    if (!isAbsolute(path) || !statSync(path).isFile()) {
      throw sanitizedError('INVALID_CONFIGURATION', `The ${label} prover artifact is unavailable.`);
    }
  }
}

class NodeProverProcess implements ProverProcess {
  readonly binary: string;

  constructor(binary: string) {
    this.binary = binary;
  }

  run(arguments_: readonly string[], stdin: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let stdout = '';
      let stdoutBytes = 0;
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(this.binary, [...arguments_], {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } catch {
        reject(sanitizedError('PROVER_FAILED', 'The proof service could not be started.', true));
        return;
      }
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(stdout);
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(sanitizedError('PROVER_FAILED', 'The proof service timed out.', true));
      }, timeoutMs);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdoutBytes += Buffer.byteLength(chunk);
        if (stdoutBytes > MAX_OUTPUT_BYTES) {
          child.kill();
          finish(
            sanitizedError('PROVER_FAILED', 'The proof service returned an invalid response.'),
          );
          return;
        }
        stdout += chunk;
      });
      child.on('error', () =>
        finish(sanitizedError('PROVER_FAILED', 'The proof service failed.', true)),
      );
      child.on('close', (code) => {
        if (code !== 0) {
          finish(sanitizedError('PROVER_FAILED', 'The proof request was rejected.'));
          return;
        }
        finish();
      });
      child.stdin.end(stdin);
    });
  }
}

export class RustApplicationProver {
  readonly paths: ApplicationProverPaths;
  readonly process: ProverProcess;
  readonly timeoutMs: number;

  constructor(
    paths: ApplicationProverPaths,
    options: { process?: ProverProcess; timeoutMs?: number; validateArtifacts?: boolean } = {},
  ) {
    if (options.validateArtifacts !== false) assertArtifacts(paths);
    this.paths = paths;
    this.process = options.process ?? new NodeProverProcess(paths.binary);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1_000 || this.timeoutMs > 300_000) {
      throw sanitizedError('INVALID_CONFIGURATION', 'The prover timeout is invalid.');
    }
  }

  async proveQuery(witness: unknown): Promise<ApplicationProof> {
    return this.prove('query', witness);
  }

  async proveVerdict(witness: unknown): Promise<ApplicationProof> {
    return this.prove('verdict', witness);
  }

  async verifyQuery(proof: {
    proofHex: string;
    publicInputsHex: string;
  }): Promise<ApplicationVerification> {
    return this.verify('query', proof);
  }

  async verifyVerdict(proof: {
    proofHex: string;
    publicInputsHex: string;
  }): Promise<ApplicationVerification> {
    return this.verify('verdict', proof);
  }

  private async prove(circuit: 'query' | 'verdict', witness: unknown): Promise<ApplicationProof> {
    const prefix = circuit === 'query' ? 'query' : 'verdict';
    const stdout = await this.process.run(
      [
        `prove-${circuit}`,
        this.paths[`${prefix}Wasm`],
        this.paths[`${prefix}R1cs`],
        this.paths[`${prefix}ProvingKey`],
      ],
      JSON.stringify(witness),
      this.timeoutMs,
    );
    const output = proofOutputSchema.safeParse(parseJson(stdout));
    const expectedBytes = circuit === 'query' ? 7 * 32 : 8 * 32;
    if (
      !output.success ||
      output.data.circuit !== circuit ||
      output.data.publicInputsHex.length !== expectedBytes * 2
    ) {
      throw sanitizedError('PROVER_FAILED', 'The proof service returned an invalid response.');
    }
    return output.data;
  }

  private async verify(
    circuit: 'query' | 'verdict',
    proof: { proofHex: string; publicInputsHex: string },
  ): Promise<ApplicationVerification> {
    const stdout = await this.process.run(
      [`verify-${circuit}`, this.paths[`${circuit}VerifyingKey`]],
      JSON.stringify(proof),
      this.timeoutMs,
    );
    const output = verificationOutputSchema.safeParse(parseJson(stdout));
    if (!output.success || output.data.circuit !== circuit) {
      throw sanitizedError('PROVER_FAILED', 'The proof service returned an invalid response.');
    }
    return output.data;
  }
}

function parseJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    throw sanitizedError('PROVER_FAILED', 'The proof service returned an invalid response.');
  }
}

export function loadApplicationProverPaths(
  environment: Readonly<Record<string, string | undefined>>,
): ApplicationProverPaths {
  const mapping = {
    binary: 'ALIBI_PROVER_BINARY_PATH',
    queryWasm: 'ALIBI_QUERY_WASM_PATH',
    queryR1cs: 'ALIBI_QUERY_R1CS_PATH',
    queryProvingKey: 'ALIBI_QUERY_PROVING_KEY_PATH',
    queryVerifyingKey: 'ALIBI_QUERY_VERIFYING_KEY_PATH',
    verdictWasm: 'ALIBI_VERDICT_WASM_PATH',
    verdictR1cs: 'ALIBI_VERDICT_R1CS_PATH',
    verdictProvingKey: 'ALIBI_VERDICT_PROVING_KEY_PATH',
    verdictVerifyingKey: 'ALIBI_VERDICT_VERIFYING_KEY_PATH',
  } as const;
  const result = {} as Record<keyof ApplicationProverPaths, string>;
  for (const [property, variable] of Object.entries(mapping) as [
    keyof ApplicationProverPaths,
    string,
  ][]) {
    const value = environment[variable];
    if (!value || !isAbsolute(value)) {
      throw sanitizedError(
        'INVALID_CONFIGURATION',
        'Live prover configuration is missing or invalid.',
      );
    }
    result[property] = value;
  }
  return result;
}

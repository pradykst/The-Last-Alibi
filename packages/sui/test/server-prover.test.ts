import { describe, expect, it, vi } from 'vitest';

import { AlibiSuiError } from '../src';
import {
  RustApplicationProver,
  loadApplicationProverPaths,
  type ApplicationProverPaths,
  type ProverProcess,
} from '../src/server';

function paths(): ApplicationProverPaths {
  return {
    binary: 'D:\\alibi\\prover.exe',
    queryWasm: 'D:\\alibi\\query.wasm',
    queryR1cs: 'D:\\alibi\\query.r1cs',
    queryProvingKey: 'D:\\alibi\\query.pk',
    queryVerifyingKey: 'D:\\alibi\\query.vk',
    verdictWasm: 'D:\\alibi\\verdict.wasm',
    verdictR1cs: 'D:\\alibi\\verdict.r1cs',
    verdictProvingKey: 'D:\\alibi\\verdict.pk',
    verdictVerifyingKey: 'D:\\alibi\\verdict.vk',
  };
}

function proof(circuit: 'query' | 'verdict') {
  return JSON.stringify({
    status: 'ok',
    circuit,
    circuitVersion: '1',
    proofHex: 'ab'.repeat(128),
    publicInputsHex: '01'.repeat((circuit === 'query' ? 7 : 8) * 32),
    verifierIdentitySha256: 'cd'.repeat(32),
  });
}

function verification(circuit: 'query' | 'verdict', verified: boolean) {
  return JSON.stringify({
    status: 'ok',
    circuit,
    verified,
    verifierIdentitySha256: 'cd'.repeat(32),
  });
}

describe('server-only Rust application prover wrapper', () => {
  it('passes arbitrary query and verdict witnesses only through stdin', async () => {
    const calls: { arguments_: readonly string[]; stdin: string }[] = [];
    const process: ProverProcess = {
      run: vi.fn(async (arguments_, stdin) => {
        calls.push({ arguments_, stdin });
        return proof(arguments_[0] === 'prove-query' ? 'query' : 'verdict');
      }),
    };
    const prover = new RustApplicationProver(paths(), { process, validateArtifacts: false });
    const queryWitness = { case: { suspect: 2 }, nonce: '17' };
    const verdictWitness = { case: { suspect: 3 }, accusation: { suspect: 1 } };
    await expect(prover.proveQuery(queryWitness)).resolves.toMatchObject({ circuit: 'query' });
    await expect(prover.proveVerdict(verdictWitness)).resolves.toMatchObject({
      circuit: 'verdict',
    });
    expect(calls.map((call) => call.arguments_[0])).toEqual(['prove-query', 'prove-verdict']);
    expect(calls.map((call) => JSON.parse(call.stdin))).toEqual([queryWitness, verdictWitness]);
    expect(calls.flatMap((call) => call.arguments_).join(' ')).not.toContain('suspect');
  });

  it('returns off-chain verification results without exposing witness material', async () => {
    const process: ProverProcess = {
      run: vi.fn(async (arguments_) =>
        verification(arguments_[0] === 'verify-query' ? 'query' : 'verdict', true),
      ),
    };
    const prover = new RustApplicationProver(paths(), { process, validateArtifacts: false });
    const input = { proofHex: 'ab'.repeat(128), publicInputsHex: '01'.repeat(7 * 32) };
    await expect(prover.verifyQuery(input)).resolves.toEqual({
      status: 'ok',
      circuit: 'query',
      verified: true,
      verifierIdentitySha256: 'cd'.repeat(32),
    });
  });

  it('sanitizes non-zero, malformed, and oversized process responses', async () => {
    for (const response of ['not-json', JSON.stringify({ status: 'ok', privateWitness: 'leak' })]) {
      const prover = new RustApplicationProver(paths(), {
        process: { run: async () => response },
        validateArtifacts: false,
      });
      try {
        await prover.proveQuery({ synthetic: true });
        throw new Error('expected failure');
      } catch (error) {
        expect(error).toBeInstanceOf(AlibiSuiError);
        expect(JSON.stringify(error)).not.toContain('privateWitness');
      }
    }
  });

  it('fails closed when the path contract is missing or non-absolute', () => {
    expect(() => loadApplicationProverPaths({})).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONFIGURATION' }),
    );
    expect(() =>
      loadApplicationProverPaths({
        ALIBI_PROVER_BINARY_PATH: 'relative/prover',
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_CONFIGURATION' }));
  });
});

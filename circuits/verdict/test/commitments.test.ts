import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  BN254_SCALAR_MODULUS,
  PUBLIC_INPUT_BYTE_LENGTH,
  accusationCommitment,
  bigIntToLittleEndianBytes,
  canonicalFieldBytes,
  canonicalFieldFromBytes,
  caseCommitment,
  commitmentToLimbs,
  decodePublicInputBytes,
  encodePublicInputs,
  limbsToCommitment,
  littleEndianBytesToBigInt,
  sessionAttemptDomainCommitment,
  verdictCommitment,
  type CaseOpening,
  type PublicCommitments,
} from '../src/commitments';

interface WitnessCalculator {
  calculateWitness(input: Record<string, unknown>, sanityCheck: boolean): Promise<bigint[]>;
}

type WitnessCalculatorBuilder = (
  wasm: Uint8Array,
  options: { sanityCheck: boolean },
) => Promise<WitnessCalculator>;

const require = createRequire(import.meta.url);
const circuitRoot = resolve(import.meta.dirname, '..');
const witnessCalculatorPath = resolve(
  circuitRoot,
  'build/verdict/verdict_js/witness_calculator.cjs',
);
const witnessWasmPath = resolve(circuitRoot, 'build/verdict/verdict_js/verdict.wasm');

const sessionId = Uint8Array.from({ length: 32 }, (_, index) => index);
const caseSalt = canonicalFieldBytes(0x1234_5678_90ab_cdefn);
const accusationSalt = canonicalFieldBytes(0x0102_0304_0506_0708n);
const yesVerdictSalt = canonicalFieldBytes(0x9988_7766_5544_3322n);
const noVerdictSalt = canonicalFieldBytes(0xaabb_ccdd_eeff_0011n);

const hiddenCase: CaseOpening = {
  suspect: 3n,
  room: 2n,
  weapon: 1n,
  time: 0n,
  salt: caseSalt,
};

function saltLimbs(bytes: Uint8Array): readonly [string, string] {
  const [low, high] = commitmentToLimbs(bytes);
  return [low.toString(), high.toString()];
}

function witnessInput(
  accusation: CaseOpening,
  verdict: bigint,
  verdictSalt: Uint8Array,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const [caseSaltLow, caseSaltHigh] = saltLimbs(hiddenCase.salt);
  const [accusationSaltLow, accusationSaltHigh] = saltLimbs(accusation.salt);
  const [verdictSaltLow, verdictSaltHigh] = saltLimbs(verdictSalt);
  return {
    case_suspect: hiddenCase.suspect.toString(),
    case_room: hiddenCase.room.toString(),
    case_weapon: hiddenCase.weapon.toString(),
    case_time: hiddenCase.time.toString(),
    case_salt_low: caseSaltLow,
    case_salt_high: caseSaltHigh,
    accusation_suspect: accusation.suspect.toString(),
    accusation_room: accusation.room.toString(),
    accusation_weapon: accusation.weapon.toString(),
    accusation_time: accusation.time.toString(),
    accusation_salt_low: accusationSaltLow,
    accusation_salt_high: accusationSaltHigh,
    session_id: [...sessionId],
    attempt_nonce: '7',
    verdict_bit: verdict.toString(),
    verdict_salt_low: verdictSaltLow,
    verdict_salt_high: verdictSaltHigh,
    ...overrides,
  };
}

async function expectedCommitments(
  accusation: CaseOpening,
  verdict: bigint,
  verdictSalt: Uint8Array,
): Promise<PublicCommitments> {
  return {
    caseCommitment: await caseCommitment(hiddenCase),
    accusationCommitment: await accusationCommitment(accusation),
    sessionAttemptDomainCommitment: sessionAttemptDomainCommitment(sessionId, 7n),
    verdictCommitment: await verdictCommitment(verdict, verdictSalt),
  };
}

describe('canonical eight-field encoding', () => {
  it('round-trips zero, one, limb boundaries, leading zeroes, and field boundaries', () => {
    const values = [
      0n,
      1n,
      (1n << 128n) - 1n,
      1n << 128n,
      BN254_SCALAR_MODULUS - 1n,
      0x0000_0102_0304n,
    ];
    for (const value of values) {
      const encoded = canonicalFieldBytes(value);
      expect(encoded).toHaveLength(32);
      expect(canonicalFieldFromBytes(encoded)).toBe(value);
      const [low, high] = commitmentToLimbs(encoded);
      expect(limbsToCommitment(low, high)).toEqual(encoded);
    }
  });

  it('preserves all 256 bits for arbitrary domain commitments', async () => {
    const allZero = new Uint8Array(32);
    const one = canonicalFieldBytes(1n);
    const lowMaximum = limbsToCommitment((1n << 128n) - 1n, 0n);
    const fieldMaximum = canonicalFieldBytes(BN254_SCALAR_MODULUS - 1n);
    const alternating = Uint8Array.from({ length: 32 }, (_, index) => (index % 2 === 0 ? 0 : 255));
    const leadingZero = Uint8Array.from({ length: 32 }, (_, index) => (index < 8 ? 0 : index));
    const encoded = encodePublicInputs({
      caseCommitment: allZero,
      accusationCommitment: lowMaximum,
      sessionAttemptDomainCommitment: alternating,
      verdictCommitment: fieldMaximum,
    });

    expect(encoded.bytes).toHaveLength(PUBLIC_INPUT_BYTE_LENGTH);
    expect(encoded.fields).toEqual([
      ...commitmentToLimbs(allZero),
      ...commitmentToLimbs(lowMaximum),
      ...commitmentToLimbs(alternating),
      ...commitmentToLimbs(fieldMaximum),
    ]);
    expect(decodePublicInputBytes(encoded.bytes)).toEqual(encoded.fields);
    expect(limbsToCommitment(...commitmentToLimbs(one))).toEqual(one);
    expect(limbsToCommitment(...commitmentToLimbs(leadingZero))).toEqual(leadingZero);
  });

  it('detects endianness reversal, swapped limbs, and swapped commitments', () => {
    const original = canonicalFieldBytes(0x0102_0304_0506_0708_1112_1314_1516_1718n);
    const reversed = original.slice().reverse();
    expect(commitmentToLimbs(reversed)).not.toEqual(commitmentToLimbs(original));

    const [low, high] = commitmentToLimbs(original);
    expect(limbsToCommitment(high, low)).not.toEqual(original);

    const first = canonicalFieldBytes(1n);
    const second = canonicalFieldBytes(2n);
    const domain = new Uint8Array(32);
    const verdict = canonicalFieldBytes(3n);
    const ordered = encodePublicInputs({
      caseCommitment: first,
      accusationCommitment: second,
      sessionAttemptDomainCommitment: domain,
      verdictCommitment: verdict,
    });
    const swapped = encodePublicInputs({
      caseCommitment: second,
      accusationCommitment: first,
      sessionAttemptDomainCommitment: domain,
      verdictCommitment: verdict,
    });
    expect(swapped.bytes).not.toEqual(ordered.bytes);
  });

  it('rejects wrong lengths, extended/truncated input, and non-canonical field encodings', () => {
    expect(() => commitmentToLimbs(new Uint8Array(31))).toThrow(/exactly 32 bytes/);
    expect(() => commitmentToLimbs(new Uint8Array(33))).toThrow(/exactly 32 bytes/);
    expect(() => decodePublicInputBytes(new Uint8Array(255))).toThrow(/exactly 256 bytes/);
    expect(() => decodePublicInputBytes(new Uint8Array(257))).toThrow(/exactly 256 bytes/);
    expect(() => canonicalFieldBytes(BN254_SCALAR_MODULUS)).toThrow(/outside/);
    expect(() =>
      canonicalFieldFromBytes(bigIntToLittleEndianBytes(BN254_SCALAR_MODULUS, 32)),
    ).toThrow(/not a canonical/);

    const malformedScalarInputs = new Uint8Array(256);
    malformedScalarInputs[16] = 1;
    expect(() => decodePublicInputBytes(malformedScalarInputs)).toThrow(/exceeds 128 bits/);
  });

  it('never reduces an oversized commitment modulo the scalar field', () => {
    const boundary = bigIntToLittleEndianBytes(BN254_SCALAR_MODULUS, 32);
    expect(littleEndianBytesToBigInt(boundary)).toBe(BN254_SCALAR_MODULUS);
    expect(() =>
      encodePublicInputs({
        caseCommitment: boundary,
        accusationCommitment: canonicalFieldBytes(1n),
        sessionAttemptDomainCommitment: new Uint8Array(32),
        verdictCommitment: canonicalFieldBytes(2n),
      }),
    ).toThrow(/not a canonical/);
  });
});

describe('verdict circuit relation', () => {
  let calculator: WitnessCalculator;

  beforeAll(async () => {
    const builder = require(witnessCalculatorPath) as WitnessCalculatorBuilder;
    const wasm = await readFile(witnessWasmPath);
    calculator = await builder(wasm, { sanityCheck: true });
  });

  async function expectCircuitOutputs(
    accusation: CaseOpening,
    verdict: bigint,
    salt: Uint8Array,
  ): Promise<void> {
    const witness = await calculator.calculateWitness(
      witnessInput(accusation, verdict, salt),
      true,
    );
    const expected = encodePublicInputs(await expectedCommitments(accusation, verdict, salt));
    expect(witness.slice(1, 9)).toEqual(expected.fields);
  }

  it('matches TypeScript Poseidon and BLAKE2b for a correct accusation', async () => {
    await expectCircuitOutputs({ ...hiddenCase, salt: accusationSalt }, 1n, yesVerdictSalt);
  });

  it.each([
    ['suspect', { ...hiddenCase, suspect: 2n, salt: accusationSalt }],
    ['room', { ...hiddenCase, room: 1n, salt: accusationSalt }],
    ['weapon', { ...hiddenCase, weapon: 0n, salt: accusationSalt }],
    ['time', { ...hiddenCase, time: 1n, salt: accusationSalt }],
    [
      'multiple dimensions',
      { ...hiddenCase, suspect: 0n, room: 0n, weapon: 0n, time: 1n, salt: accusationSalt },
    ],
  ])('derives verdict zero for an incorrect %s', async (_name, accusation) => {
    await expectCircuitOutputs(accusation, 0n, noVerdictSalt);
  });

  it('rejects a false verdict in both directions', async () => {
    await expect(
      calculator.calculateWitness(
        witnessInput({ ...hiddenCase, salt: accusationSalt }, 0n, noVerdictSalt),
        true,
      ),
    ).rejects.toThrow();
    await expect(
      calculator.calculateWitness(
        witnessInput({ ...hiddenCase, suspect: 0n, salt: accusationSalt }, 1n, yesVerdictSalt),
        true,
      ),
    ).rejects.toThrow();
  });

  it('rejects non-Boolean verdicts and out-of-range dimensions', async () => {
    await expect(
      calculator.calculateWitness(
        witnessInput({ ...hiddenCase, salt: accusationSalt }, 2n, yesVerdictSalt),
        true,
      ),
    ).rejects.toThrow();
    await expect(
      calculator.calculateWitness(
        witnessInput({ ...hiddenCase, salt: accusationSalt }, 1n, yesVerdictSalt, {
          case_suspect: '4',
        }),
        true,
      ),
    ).rejects.toThrow();
    await expect(
      calculator.calculateWitness(
        witnessInput({ ...hiddenCase, salt: accusationSalt }, 1n, yesVerdictSalt, {
          accusation_weapon: '2',
        }),
        true,
      ),
    ).rejects.toThrow();
  });

  it('binds the exact session and attempt nonce', async () => {
    const accusation = { ...hiddenCase, salt: accusationSalt };
    const canonicalWitness = await calculator.calculateWitness(
      witnessInput(accusation, 1n, yesVerdictSalt),
      true,
    );
    const wrongSession = await calculator.calculateWitness(
      witnessInput(accusation, 1n, yesVerdictSalt, {
        session_id: [...sessionId.slice(0, 31), 99],
      }),
      true,
    );
    const wrongNonce = await calculator.calculateWitness(
      witnessInput(accusation, 1n, yesVerdictSalt, { attempt_nonce: '8' }),
      true,
    );
    expect(wrongSession.slice(5, 7)).not.toEqual(canonicalWitness.slice(5, 7));
    expect(wrongNonce.slice(5, 7)).not.toEqual(canonicalWitness.slice(5, 7));
  });
});

import {
  bigIntToLittleEndianBytes,
  canonicalFieldBytes,
  verdictCommitment,
} from '@alibi/verdict-circuit';
import { toHex } from '@mysten/bcs';
import { describe, expect, it } from 'vitest';

import {
  type ActivatedSealSession,
  assertPendingVerdictCapsuleTarget,
  createTestnetPartnerClients,
  decodeGameSession,
  decodeVerdictCapsule,
  encodeSealVerdictIdentity,
  encodeVerdictCapsule,
  prepareTerminalVerdictCapsule,
  OfficialWalrusVerdictStore,
  releaseTerminalVerdict,
  SEAL_VERDICT_IDENTITY_DOMAIN,
  storePreparedTerminalVerdictCapsule,
  testnetSealVerdictConfiguration,
  TESTNET_VERIFIED_COMMITTEE_KEY_SERVER_OBJECT_ID,
  TESTNET_VERIFIED_COMMITTEE_MEMBER_COUNT,
  TESTNET_VERIFIED_COMMITTEE_MEMBER_THRESHOLD,
  validateVerdictCapsuleOpening,
  VERDICT_CAPSULE_BYTE_LENGTH,
  WalrusContentBlobId,
  type WalrusVerdictReceipt,
  type WalrusVerdictStore,
} from '../src';
import {
  PACKAGE_ID,
  PLAYER,
  SESSION_ID,
  WALRUS_BLOB_ID,
  WALRUS_BLOB_U256,
  pendingAccusation,
  sessionEnvelope,
  verdictRecord,
} from './fixtures';

const ACCUSATION_COMMITMENT = `0x${'22'.repeat(32)}`;
const SALT = `0x${toHex(canonicalFieldBytes(123_456n))}`;

async function capsuleInput(verdict: 0 | 1) {
  const commitment = await verdictCommitment(BigInt(verdict), canonicalFieldBytes(123_456n));
  return {
    protocolVersion: 1,
    levelVersion: 1,
    sessionId: SESSION_ID,
    attemptNonce: 0n,
    accusationCommitment: ACCUSATION_COMMITMENT,
    verdict,
    verdictSalt: SALT,
    verdictCommitment: `0x${toHex(commitment)}`,
  } as const;
}

function identityInput(verdictCommitmentValue: string) {
  return {
    sessionId: SESSION_ID,
    attemptNonce: 0n,
    protocolVersion: 1,
    levelVersion: 1,
    accusationCommitment: ACCUSATION_COMMITMENT,
    verdictCommitment: verdictCommitmentValue,
  };
}

describe('canonical verdict capsule', () => {
  it.each([0, 1] as const)('round-trips deterministic verdict %i bytes', async (verdict) => {
    const input = await capsuleInput(verdict);
    const first = encodeVerdictCapsule(input);
    const second = encodeVerdictCapsule(input);
    expect(first).toEqual(second);
    expect(first).toHaveLength(VERDICT_CAPSULE_BYTE_LENGTH);
    expect(decodeVerdictCapsule(first)).toEqual({
      ...input,
      formatVersion: 1,
    });
    await expect(
      validateVerdictCapsuleOpening(decodeVerdictCapsule(first)),
    ).resolves.toBeUndefined();
  });

  it('rejects unknown versions, invalid verdicts, truncation, and trailing bytes', async () => {
    const bytes = encodeVerdictCapsule(await capsuleInput(1));
    const unknownVersion = bytes.slice();
    unknownVersion[0] = 2;
    const invalidVerdict = bytes.slice();
    invalidVerdict[78] = 2;
    expect(() => decodeVerdictCapsule(unknownVersion)).toThrowError('unsupported');
    expect(() => decodeVerdictCapsule(invalidVerdict)).toThrowError('verdict');
    expect(() => decodeVerdictCapsule(bytes.subarray(0, bytes.length - 1))).toThrowError('exactly');
    expect(() => decodeVerdictCapsule(Uint8Array.from([...bytes, 0]))).toThrowError('exactly');
  });

  it('rejects non-canonical salts and a wrong commitment opening', async () => {
    const input = await capsuleInput(1);
    expect(() =>
      encodeVerdictCapsule({
        ...input,
        verdictSalt: `0x${toHex(
          bigIntToLittleEndianBytes(
            21888242871839275222246405745257275088548364400416034343698204186575808495617n,
            32,
          ),
        )}`,
      }),
    ).toThrowError('canonical');
    expect(() =>
      encodeVerdictCapsule({
        ...input,
        accusationCommitment: '0x22',
      }),
    ).toThrowError('exactly 32 bytes');
    await expect(
      validateVerdictCapsuleOpening({
        ...decodeVerdictCapsule(encodeVerdictCapsule(input)),
        verdictCommitment: ACCUSATION_COMMITMENT,
      }),
    ).rejects.toThrowError('opening');
  });
});

describe('Seal terminal identity', () => {
  it('is deterministic, domain separated, fixed width, and field sensitive', async () => {
    const input = identityInput(`0x${'24'.repeat(32)}`);
    const identity = encodeSealVerdictIdentity(input);
    expect(identity).toEqual(encodeSealVerdictIdentity(input));
    expect(identity).toHaveLength(152);
    expect(toHex(identity)).toBe(
      '297468652d6c6173742d616c6962693a3a7365616c3a3a766572646963742d63617073756c653a3a7631010000000000000000000000000000000000000000000000000000000000005e551000000000000000000100010022222222222222222222222222222222222222222222222222222222222222222424242424242424242424242424242424242424242424242424242424242424',
    );
    expect(identity[0]).toBe(SEAL_VERDICT_IDENTITY_DOMAIN.length);
    expect(new TextDecoder().decode(identity.subarray(1, 42))).toBe(SEAL_VERDICT_IDENTITY_DOMAIN);
    for (const changed of [
      { ...input, sessionId: '0x1' },
      { ...input, attemptNonce: 1n },
      { ...input, protocolVersion: 2 },
      { ...input, levelVersion: 2 },
      { ...input, accusationCommitment: `0x${'23'.repeat(32)}` },
      { ...input, verdictCommitment: `0x${'25'.repeat(32)}` },
    ]) {
      expect(encodeSealVerdictIdentity(changed)).not.toEqual(identity);
    }
  });

  it('pins the current official Testnet 3-of-5 committee by object identity', () => {
    const config = testnetSealVerdictConfiguration(PACKAGE_ID);
    expect(config.threshold).toBe(1);
    expect(config.keyServers).toEqual([
      expect.objectContaining({
        objectId: TESTNET_VERIFIED_COMMITTEE_KEY_SERVER_OBJECT_ID,
        weight: 1,
      }),
    ]);
    expect(TESTNET_VERIFIED_COMMITTEE_MEMBER_THRESHOLD).toBe(3);
    expect(TESTNET_VERIFIED_COMMITTEE_MEMBER_COUNT).toBe(5);
    expect(() => testnetSealVerdictConfiguration('0x0')).toThrowError('deployed');
  });
});

describe('Walrus content identity and retry orchestration', () => {
  it('round-trips the authoritative big-endian u256 and rejects object-ID confusion', () => {
    const contentId = WalrusContentBlobId.fromBase64Url(WALRUS_BLOB_ID);
    expect(
      WalrusContentBlobId.fromAuthoritativeMoveU256(BigInt(WALRUS_BLOB_U256)).equals(contentId),
    ).toBe(true);
    expect(contentId.toMoveU256().toString()).toBe(WALRUS_BLOB_U256);
    expect(() => WalrusContentBlobId.fromBase64Url(SESSION_ID)).toThrowError(
      'Walrus content blob ID',
    );
    expect(() => WalrusContentBlobId.fromAuthoritativeMoveU256(0n)).toThrowError(
      'Walrus content blob ID',
    );
    expect(() =>
      WalrusContentBlobId.fromAuthoritativeMoveU256(WALRUS_BLOB_U256 as unknown as bigint),
    ).toThrowError('Walrus content blob ID');
  });

  it('uses the official local codec and changes ID after one ciphertext byte changes', async () => {
    const { walrus } = createTestnetPartnerClients();
    const first = WalrusContentBlobId.fromBase64Url(
      (await walrus.computeBlobMetadata({ bytes: Uint8Array.of(1, 2, 3) })).blobId,
    );
    const second = WalrusContentBlobId.fromBase64Url(
      (await walrus.computeBlobMetadata({ bytes: Uint8Array.of(1, 2, 2) })).blobId,
    );
    expect(first.equals(second)).toBe(false);
  }, 30_000);

  it('rejects an uncertified official Walrus write result', async () => {
    const ciphertext = Uint8Array.of(4, 5, 6);
    const { walrus } = createTestnetPartnerClients();
    const metadata = await walrus.computeBlobMetadata({ bytes: ciphertext });
    const contentId = WalrusContentBlobId.fromBase64Url(metadata.blobId);
    const client = {
      async computeBlobMetadata(input: { bytes: Uint8Array }) {
        return walrus.computeBlobMetadata(input);
      },
      async writeBlob() {
        return {
          blobId: contentId.toBase64Url(),
          blobObject: {
            blob_id: contentId.toMoveU256().toString(),
            certified_epoch: null,
          },
        };
      },
    } as never;
    const store = new OfficialWalrusVerdictStore({
      client,
      signer: {} as never,
      epochs: 1,
    });
    await expect(store.storeExact(ciphertext)).rejects.toThrowError('did not certify');
  }, 30_000);

  it('encrypts once and reuses exact ciphertext and Blob ID across storage retry', async () => {
    const { walrus: officialWalrus } = createTestnetPartnerClients();
    let encryptions = 0;
    const seal = {
      async encrypt(plaintext: Uint8Array, identity: Uint8Array) {
        encryptions += 1;
        return {
          bytes: Uint8Array.from([...identity.subarray(0, 8), ...plaintext]),
          identity: identity.slice(),
        };
      },
    };
    const storedBytes: Uint8Array[] = [];
    const store: Pick<WalrusVerdictStore, 'computeContentBlobId' | 'storeExact'> = {
      async computeContentBlobId(bytes) {
        return WalrusContentBlobId.fromBase64Url(
          (await officialWalrus.computeBlobMetadata({ bytes })).blobId,
        );
      },
      async storeExact(bytes) {
        storedBytes.push(bytes.slice());
        const contentBlobId = await this.computeContentBlobId(bytes);
        return {
          contentBlobId,
          suiBlobObjectId: '0x123',
          endEpoch: 99,
          ciphertext: bytes.slice(),
        };
      },
    };
    const capsule = await capsuleInput(1);
    const prepared = await prepareTerminalVerdictCapsule({
      capsule,
      seal,
      walrus: store,
    });
    await storePreparedTerminalVerdictCapsule({ prepared, walrus: store });
    await storePreparedTerminalVerdictCapsule({ prepared, walrus: store });
    expect(encryptions).toBe(1);
    expect(storedBytes).toHaveLength(2);
    expect(storedBytes[0]).toEqual(storedBytes[1]);
  }, 30_000);

  it('blocks a returned-ID mismatch or storage failure', async () => {
    const prepared = {
      ciphertext: Uint8Array.of(1),
      identity: Uint8Array.of(2),
      contentBlobId: WalrusContentBlobId.fromBase64Url(WALRUS_BLOB_ID),
    };
    const other = WalrusContentBlobId.fromBase64Url('oehkoh0352bRGNPjuwcy0nye3OLKT649K62imdNAlXg');
    await expect(
      storePreparedTerminalVerdictCapsule({
        prepared,
        walrus: {
          async storeExact(): Promise<WalrusVerdictReceipt> {
            return {
              contentBlobId: other,
              suiBlobObjectId: '0x123',
              endEpoch: 1,
              ciphertext: prepared.ciphertext,
            };
          },
        },
      }),
    ).rejects.toThrowError('different content Blob ID');
    await expect(
      storePreparedTerminalVerdictCapsule({
        prepared,
        walrus: {
          async storeExact(): Promise<WalrusVerdictReceipt> {
            return {
              contentBlobId: prepared.contentBlobId,
              suiBlobObjectId: '0x123',
              endEpoch: 1,
              ciphertext: Uint8Array.of(2),
            };
          },
        },
      }),
    ).rejects.toThrowError('changed the prepared ciphertext');

    await expect(
      storePreparedTerminalVerdictCapsule({
        prepared,
        walrus: {
          async storeExact(): Promise<WalrusVerdictReceipt> {
            throw new Error('storage unavailable');
          },
        },
      }),
    ).rejects.toThrowError('storage unavailable');
  });
});

async function terminalFixture(verdict: 0 | 1) {
  const capsule = await capsuleInput(verdict);
  const record = verdictRecord();
  record.verdict_commitment = [
    ...(await verdictCommitment(BigInt(verdict), canonicalFieldBytes(123_456n))),
  ];
  const session = decodeGameSession(
    sessionEnvelope({
      state: 4,
      attempt_nonce: '1',
      verdict: { vec: [record] },
    }),
    PACKAGE_ID,
  );
  return { capsule, session, plaintext: encodeVerdictCapsule(capsule) };
}

describe('terminal release boundary', () => {
  it.each([
    [1, 'YES'],
    [0, 'NO'],
  ] as const)(
    'returns only verified %s after storage, Seal, state, and opening checks',
    async (bit, expected) => {
      const fixture = await terminalFixture(bit);
      const expectedBlob = WalrusContentBlobId.fromBase64Url(WALRUS_BLOB_ID);
      const result = await releaseTerminalVerdict({
        adapter: {
          async readSession() {
            return fixture.session;
          },
        },
        sessionId: SESSION_ID,
        authenticatedPlayer: PLAYER,
        walrus: {
          async readExact(blobId) {
            expect(blobId.equals(expectedBlob)).toBe(true);
            return fixture.plaintext.slice();
          },
        },
        seal: {
          async decrypt(_ciphertext, identity) {
            expect(identity).toEqual(
              encodeSealVerdictIdentity(identityInput(fixture.capsule.verdictCommitment)),
            );
            return fixture.plaintext.slice();
          },
        },
        approval: {
          async build({ sessionId, identity }) {
            expect(sessionId).toBe(SESSION_ID);
            expect(identity).toHaveLength(152);
            return Uint8Array.of(0);
          },
        },
        sealSession: {} as ActivatedSealSession,
      });
      expect(result).toMatchObject({
        verdict: expected,
        walrusContentBlobId: WALRUS_BLOB_ID,
        storageVerified: true,
        sealAuthorized: true,
        capsuleValidated: true,
        commitmentOpeningValidated: true,
      });
      expect(result).not.toHaveProperty('verdictSalt');
    },
  );

  it('rejects wrong player, tampered capsule state, and failed retrieval before rendering', async () => {
    const fixture = await terminalFixture(1);
    const common = {
      adapter: {
        async readSession() {
          return fixture.session;
        },
      },
      sessionId: SESSION_ID,
      authenticatedPlayer: PLAYER,
      walrus: {
        async readExact() {
          return fixture.plaintext.slice();
        },
      },
      seal: {
        async decrypt() {
          return fixture.plaintext.slice();
        },
      },
      approval: {
        async build() {
          return Uint8Array.of(0);
        },
      },
      sealSession: {} as ActivatedSealSession,
    };
    await expect(
      releaseTerminalVerdict({ ...common, authenticatedPlayer: '0x2' }),
    ).rejects.toThrowError('authenticated');
    const altered = fixture.plaintext.slice();
    altered[78] = 0;
    await expect(
      releaseTerminalVerdict({
        ...common,
        seal: {
          async decrypt() {
            return altered;
          },
        },
      }),
    ).rejects.toThrowError('opening');
    await expect(
      releaseTerminalVerdict({
        ...common,
        walrus: {
          async readExact() {
            throw new Error('wrong reference');
          },
        },
      }),
    ).rejects.toThrowError('wrong reference');
  });

  it('rejects every capsule identity field that differs from terminal state', async () => {
    const fixture = await terminalFixture(1);
    const variants = [
      { ...fixture.capsule, sessionId: '0x1' },
      { ...fixture.capsule, attemptNonce: 1n },
      { ...fixture.capsule, protocolVersion: 2 },
      { ...fixture.capsule, levelVersion: 2 },
      { ...fixture.capsule, accusationCommitment: `0x${'23'.repeat(32)}` },
      { ...fixture.capsule, verdictCommitment: `0x${'24'.repeat(32)}` },
    ] as const;

    for (const variant of variants) {
      const mismatched = encodeVerdictCapsule(variant);
      await expect(
        releaseTerminalVerdict({
          adapter: {
            async readSession() {
              return fixture.session;
            },
          },
          sessionId: SESSION_ID,
          authenticatedPlayer: PLAYER,
          walrus: {
            async readExact() {
              return fixture.plaintext.slice();
            },
          },
          seal: {
            async decrypt() {
              return mismatched;
            },
          },
          approval: {
            async build() {
              return Uint8Array.of(0);
            },
          },
          sealSession: {} as ActivatedSealSession,
        }),
      ).rejects.toThrowError('does not match terminal Sui state');
    }
  });
  it('requires a retry target to equal the pending single-assignment Blob ID', () => {
    const session = decodeGameSession(
      sessionEnvelope({
        state: 3,
        attempt_nonce: '1',
        pending_accusation: { vec: [pendingAccusation()] },
      }),
      PACKAGE_ID,
    );
    expect(() =>
      assertPendingVerdictCapsuleTarget({
        session,
        preparedBlobId: WalrusContentBlobId.fromBase64Url(WALRUS_BLOB_ID),
      }),
    ).not.toThrow();
    expect(() =>
      assertPendingVerdictCapsuleTarget({
        session,
        preparedBlobId: WalrusContentBlobId.fromBase64Url(
          'oehkoh0352bRGNPjuwcy0nye3OLKT649K62imdNAlXg',
        ),
      }),
    ).toThrowError('pending accusation');
  });
});

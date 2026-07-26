import { describe, expect, it, vi } from 'vitest';

import { publicSuspectTestimonyContextSchema } from '../src/prompt';
import { requestVerifiedSuspectTestimony, VerifiedSuspectTestimonyService } from '../src/testimony';
import type { VerifiedChatCompletion, VerifiedZeroGAdapter } from '../src/types';

function context() {
  return publicSuspectTestimonyContextSchema.parse({
    publicSessionId: 'session-public-1',
    suspectId: 'suspect_archivist',
    room: {
      id: 'room_archive',
      name: 'Archive Vault',
      description: 'A climate-controlled vault of public museum records.',
    },
    observations: [],
    history: [],
    question: 'Where were you during the blackout?',
    approvedLeadIds: [],
    approvedPredicates: [
      { id: 'predicate_room_archive', question: 'Did it happen in the Archive Vault?' },
    ],
  });
}

function completion(content: string): VerifiedChatCompletion {
  return {
    content,
    metadata: {
      source: 'zero-g',
      network: 'testnet',
      providerAddress: '0x1111111111111111111111111111111111111111',
      model: 'demo-chat-model',
      serviceType: 'chatbot',
      responseId: 'real-response-id',
      responseVerification: 'verified',
      verificationMode: 'TeeML',
      providerVerification: {
        checked: false,
        signerMatched: null,
        composeHashMatched: null,
      },
      completedAt: '2026-07-25T12:00:00.000Z',
      sdkVersion: '0.8.4',
    },
  };
}

function adapter(content: string): VerifiedZeroGAdapter {
  return {
    discoverService: vi.fn(),
    verifyProvider: vi.fn(),
    createVerifiedChatCompletion: vi.fn(async () => completion(content)),
  };
}

const DIALOGUE = JSON.stringify({
  utterance: 'I was checking the donor records when the lights failed.',
  emotion: 'guarded',
  action: 'suggest_warrant',
  leadId: null,
  predicateId: 'predicate_room_archive',
});

describe('verified suspect testimony service', () => {
  it('preserves verified inference provenance as non-canonical testimony', async () => {
    const result = await requestVerifiedSuspectTestimony({
      context: context(),
      adapter: adapter(DIALOGUE),
    });
    expect(result).toMatchObject({
      evidenceClass: 'unverified-testimony',
      source: 'zero-g',
      responseVerification: 'verified',
      canonicalEffect: 'none',
      candidateMaskChanged: false,
      verification: {
        responseId: 'real-response-id',
        responseVerification: 'verified',
      },
    });
    expect(result.dialogue.predicateId).toBe('predicate_room_archive');
    expect(result.candidateMaskChanged).toBe(false);
  });

  it('validates model output only after the injected verified adapter resolves', async () => {
    const events: string[] = [];
    const verifiedAdapter: VerifiedZeroGAdapter = {
      discoverService: vi.fn(),
      verifyProvider: vi.fn(),
      createVerifiedChatCompletion: vi.fn(async () => {
        events.push('verified-adapter-resolved');
        return completion(DIALOGUE);
      }),
    };
    const result = await requestVerifiedSuspectTestimony({
      context: context(),
      adapter: verifiedAdapter,
    });
    events.push(`returned:${result.dialogue.utterance}`);
    expect(events).toEqual(['verified-adapter-resolved', `returned:${result.dialogue.utterance}`]);
  });

  it('prevents concurrent duplicate requests per session and suspect', async () => {
    let release!: (value: VerifiedChatCompletion) => void;
    const pending = new Promise<VerifiedChatCompletion>((resolve) => {
      release = resolve;
    });
    const createVerifiedChatCompletion = vi.fn(() => pending);
    const service = new VerifiedSuspectTestimonyService({
      adapter: {
        discoverService: vi.fn(),
        verifyProvider: vi.fn(),
        createVerifiedChatCompletion,
      },
      cooldownMs: 1_000,
      now: () => 100,
    });

    const first = service.request(context());
    await expect(service.request(context())).rejects.toMatchObject({
      code: 'ZERO_G_TESTIMONY_BUSY',
    });
    expect(createVerifiedChatCompletion).toHaveBeenCalledTimes(1);
    release(completion(DIALOGUE));
    await expect(first).resolves.toMatchObject({ candidateMaskChanged: false });
  });

  it('applies a conservative in-memory cooldown without retrying inference', async () => {
    let now = 1_000;
    const createVerifiedChatCompletion = vi.fn(async () => completion(DIALOGUE));
    const service = new VerifiedSuspectTestimonyService({
      adapter: {
        discoverService: vi.fn(),
        verifyProvider: vi.fn(),
        createVerifiedChatCompletion,
      },
      cooldownMs: 500,
      now: () => now,
    });

    await service.request(context());
    await expect(service.request(context())).rejects.toMatchObject({
      code: 'ZERO_G_TESTIMONY_BUSY',
    });
    now += 500;
    await service.request(context());
    expect(createVerifiedChatCompletion).toHaveBeenCalledTimes(2);
  });
});

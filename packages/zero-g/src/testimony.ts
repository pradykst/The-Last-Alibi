import { parseSuspectDialogue, type SuspectDialogue } from './dialogue';
import { ZeroGError } from './errors';
import { buildSuspectMessages, type PublicSuspectTestimonyContext } from './prompt';
import type { VerifiedChatCompletion, VerifiedZeroGAdapter } from './types';

export type VerifiedSuspectTestimony = {
  dialogue: SuspectDialogue;
  evidenceClass: 'unverified-testimony';
  source: 'zero-g';
  responseVerification: 'verified';
  canonicalEffect: 'none';
  candidateMaskChanged: false;
  verification: VerifiedChatCompletion['metadata'];
};

export async function requestVerifiedSuspectTestimony(input: {
  context: unknown;
  adapter: VerifiedZeroGAdapter;
  signal?: AbortSignal;
}): Promise<VerifiedSuspectTestimony> {
  const built = buildSuspectMessages(input.context);
  const completion = await input.adapter.createVerifiedChatCompletion({
    messages: built.messages,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  if (completion.metadata.responseVerification !== 'verified') {
    throw new ZeroGError('ZERO_G_VERIFICATION_FAILED');
  }

  const dialogue = parseSuspectDialogue(completion.content, {
    approvedLeadIds: built.context.approvedLeadIds,
    approvedPredicateIds: built.context.approvedPredicates.map((predicate) => predicate.id),
  });

  return {
    dialogue,
    evidenceClass: 'unverified-testimony',
    source: 'zero-g',
    responseVerification: 'verified',
    canonicalEffect: 'none',
    candidateMaskChanged: false,
    verification: completion.metadata,
  };
}

export class VerifiedSuspectTestimonyService {
  readonly #pending = new Set<string>();
  readonly #lastStartedAt = new Map<string, number>();
  readonly #adapter: VerifiedZeroGAdapter;
  readonly #cooldownMs: number;
  readonly #now: () => number;

  public constructor(options: {
    adapter: VerifiedZeroGAdapter;
    cooldownMs?: number;
    now?: () => number;
  }) {
    this.#adapter = options.adapter;
    this.#cooldownMs = options.cooldownMs ?? 1_500;
    this.#now = options.now ?? Date.now;
  }

  public async request(
    context: PublicSuspectTestimonyContext,
    signal?: AbortSignal,
  ): Promise<VerifiedSuspectTestimony> {
    const key = `${context.publicSessionId}:${context.suspectId}`;
    const now = this.#now();
    const lastStartedAt = this.#lastStartedAt.get(key);
    if (
      this.#pending.has(key) ||
      (lastStartedAt !== undefined && now - lastStartedAt < this.#cooldownMs)
    ) {
      throw new ZeroGError('ZERO_G_TESTIMONY_BUSY');
    }

    this.#pending.add(key);
    this.#lastStartedAt.set(key, now);
    try {
      return await requestVerifiedSuspectTestimony({
        context,
        adapter: this.#adapter,
        ...(signal === undefined ? {} : { signal }),
      });
    } finally {
      this.#pending.delete(key);
    }
  }
}

import { isValidTransactionDigest } from '@mysten/sui/utils';
import type { Transaction } from '@mysten/sui/transactions';

import {
  buildConsumeRankedPermit,
  buildIssueRankedPermit,
  type OpaqueRankedAuthorization,
  type RankedPermitPackageConfig,
} from './transactions';

export interface RankedPermitSubmitter {
  submit(transaction: Transaction): Promise<{ digest: string }>;
}

export class RankedPermitSuiAdapter {
  constructor(
    readonly config: RankedPermitPackageConfig,
    private readonly submitter: RankedPermitSubmitter,
  ) {}

  prepareIssue(authorization: OpaqueRankedAuthorization): Transaction {
    return buildIssueRankedPermit(this.config, authorization);
  }

  prepareConsume(permitId: string): Transaction {
    return buildConsumeRankedPermit(this.config, permitId);
  }

  async submit(transaction: Transaction): Promise<{ status: 'pending'; digest: string }> {
    try {
      const result = await this.submitter.submit(transaction);
      if (!isValidTransactionDigest(result.digest)) throw new Error('invalid digest');
      return { status: 'pending', digest: result.digest };
    } catch {
      throw new Error('The ranked-permit Sui transaction could not be submitted.');
    }
  }
}

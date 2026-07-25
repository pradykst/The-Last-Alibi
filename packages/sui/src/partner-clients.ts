import { SuiGrpcClient } from '@mysten/sui/grpc';
import { WalrusClient } from '@mysten/walrus';

import type { PublicObjectReader } from './adapter.js';
import type { MoveObjectEnvelope } from './state.js';

export const SUI_TESTNET_GRPC_URL = 'https://fullnode.testnet.sui.io:443';
export const WALRUS_TESTNET_AGGREGATOR_URL = 'https://aggregator.walrus-testnet.walrus.space';
export const WALRUS_TESTNET_PUBLISHER_URL = 'https://publisher.walrus-testnet.walrus.space';
export const WALRUS_TESTNET_UPLOAD_RELAY_URL = 'https://upload-relay.testnet.walrus.space';

export function createTestnetPartnerClients(): {
  sui: SuiGrpcClient;
  walrus: WalrusClient;
} {
  const sui = new SuiGrpcClient({
    network: 'testnet',
    baseUrl: SUI_TESTNET_GRPC_URL,
  });
  const walrus = new WalrusClient({
    network: 'testnet',
    suiClient: sui,
    uploadRelay: {
      host: WALRUS_TESTNET_UPLOAD_RELAY_URL,
      sendTip: {
        max: 1_000_000_000,
      },
    },
  });
  return { sui, walrus };
}
export class SuiGrpcPublicObjectReader implements PublicObjectReader {
  readonly #client: SuiGrpcClient;

  constructor(client: SuiGrpcClient) {
    this.#client = client;
  }

  async readObject(objectId: string): Promise<MoveObjectEnvelope> {
    const { object } = await this.#client.core.getObject({
      objectId,
      include: { json: true },
    });
    if (object.json === null) {
      throw new Error('Sui object has no Move JSON representation');
    }
    return {
      objectId: object.objectId,
      type: object.type,
      fields: object.json,
    };
  }
}

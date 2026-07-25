import type { PublicRuntimeStatus } from '@alibi/protocol';

export function runtimeStatusIsBlocking(status: PublicRuntimeStatus): boolean {
  return status.capabilities.some((capability) => capability.blocking);
}

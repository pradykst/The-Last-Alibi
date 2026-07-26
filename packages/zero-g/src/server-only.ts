export function assertZeroGServerOnly(): void {
  if (typeof window !== 'undefined') {
    throw new Error('The 0G integration is server-only.');
  }
}

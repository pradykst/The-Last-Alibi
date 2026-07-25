declare module 'circomlibjs' {
  interface PoseidonField {
    toObject(value: unknown): bigint;
  }

  interface Poseidon {
    (values: readonly bigint[]): unknown;
    F: PoseidonField;
  }

  export function buildPoseidon(): Promise<Poseidon>;
}

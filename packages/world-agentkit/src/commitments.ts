import { createHash, createHmac } from 'node:crypto';

function framed(parts: readonly string[]): string {
  return parts.map((part) => `${Buffer.byteLength(part, 'utf8')}:${part}`).join('|');
}

export function publicCommitment(domain: string, ...parts: string[]): `0x${string}` {
  return `0x${createHash('sha256')
    .update(framed([domain, ...parts]))
    .digest('hex')}`;
}

export function privateCommitment(
  secret: string,
  domain: string,
  ...parts: string[]
): `0x${string}` {
  return `0x${createHmac('sha256', secret)
    .update(framed([domain, ...parts]))
    .digest('hex')}`;
}

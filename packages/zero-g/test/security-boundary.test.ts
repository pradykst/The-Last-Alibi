import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ZERO_G_ROOT = join(REPOSITORY_ROOT, 'packages', 'zero-g');

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('0G static security boundary', () => {
  it('exports one explicit server-only package surface', () => {
    const manifest = JSON.parse(read(join(ZERO_G_ROOT, 'package.json'))) as {
      exports: Record<string, unknown>;
      browser?: unknown;
    };
    expect(Object.keys(manifest.exports)).toEqual(['./server']);
    expect(manifest.browser).toBeUndefined();
    expect(read(join(ZERO_G_ROOT, 'src', 'server-only.ts'))).toContain(
      "typeof window !== 'undefined'",
    );
  });

  it('keeps the official SDK and signer factory out of client components', () => {
    const webSources = sourceFiles(join(REPOSITORY_ROOT, 'apps', 'web', 'src'));
    for (const path of webSources) {
      const content = read(path);
      if (/^['"]use client['"];?/m.test(content)) {
        expect(content, path).not.toContain('@alibi/zero-g');
        expect(content, path).not.toContain('@0gfoundation/0g-compute-ts-sdk');
        expect(content, path).not.toContain('ZERO_G_PRIVATE_KEY');
      }
    }
  });

  it('contains no conventional LLM provider fallback or production fake adapter', () => {
    const productionSources = sourceFiles(join(ZERO_G_ROOT, 'src'));
    const joined = productionSources.map(read).join('\n').toLowerCase();
    for (const forbidden of [
      "from 'openai'",
      'from "openai"',
      '@anthropic-ai',
      '@google/generative-ai',
      'fakebroker',
      'mockadapter',
      'fixturetestimony',
    ]) {
      expect(joined).not.toContain(forbidden);
    }
  });

  it('does not depend on the game engine or canonical transition functions', () => {
    const manifest = read(join(ZERO_G_ROOT, 'package.json'));
    const productionSources = sourceFiles(join(ZERO_G_ROOT, 'src')).map(read).join('\n');
    expect(manifest).not.toContain('@alibi/game-engine');
    for (const forbidden of [
      'applyDisclosure',
      'authorizeDisclosure',
      'previewDisclosure',
      'caseFromIndex',
      'candidateMask:',
    ]) {
      expect(productionSources).not.toContain(forbidden);
    }
  });

  it('keeps credentials confined to the outer official runtime factory', () => {
    const productionSources = sourceFiles(join(ZERO_G_ROOT, 'src'));
    const privateKeyReaders = productionSources.filter((path) =>
      read(path).includes("environment['ZERO_G_PRIVATE_KEY']"),
    );
    expect(privateKeyReaders).toEqual([join(ZERO_G_ROOT, 'src', 'official-sdk.ts')]);
    expect(dirname(privateKeyReaders[0]!)).toBe(join(ZERO_G_ROOT, 'src'));
  });
});

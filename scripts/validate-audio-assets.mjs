import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repositoryRoot = process.cwd();
const sourceRoot = path.join(repositoryRoot, 'public', 'assets', 'audio');
const runtimeRoot = path.join(repositoryRoot, 'apps', 'web', 'public', 'assets', 'audio');
const manifestPath = path.join(sourceRoot, 'audio-manifest.json');
const categories = new Set(['music', 'ambience', 'ui', 'transition', 'verdict']);

async function listFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, absolute)));
    else files.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
  return files.sort();
}

async function sha256(filename) {
  const bytes = await readFile(filename);
  return createHash('sha256').update(bytes).digest('hex');
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!Array.isArray(manifest) || manifest.length !== 23) {
  throw new Error(`Expected 23 audio manifest entries, received ${manifest.length}.`);
}

const ids = new Set();
const expected = [];
const categoryCounts = { music: 0, ambience: 0, ui: 0, transition: 0, verdict: 0 };
for (const [index, asset] of manifest.entries()) {
  if (
    typeof asset?.id !== 'string' ||
    ids.has(asset.id) ||
    typeof asset?.src !== 'string' ||
    !asset.src.startsWith('/assets/audio/') ||
    !categories.has(asset.category) ||
    typeof asset.loop !== 'boolean' ||
    typeof asset.volume !== 'number' ||
    asset.volume < 0 ||
    asset.volume > 1
  ) {
    throw new Error(`Invalid audio manifest entry at index ${index}.`);
  }
  ids.add(asset.id);
  categoryCounts[asset.category] += 1;
  expected.push(asset.src.slice('/assets/audio/'.length));
}

const expectedCounts = { music: 2, ambience: 4, ui: 11, transition: 4, verdict: 2 };
for (const category of categories) {
  if (categoryCounts[category] !== expectedCounts[category]) {
    throw new Error(
      `Expected ${expectedCounts[category]} ${category} files, received ${categoryCounts[category]}.`,
    );
  }
}

for (const [label, root] of [
  ['source', sourceRoot],
  ['runtime', runtimeRoot],
]) {
  const actual = (await listFiles(root)).filter((filename) => filename !== 'audio-manifest.json');
  const missing = expected.filter((filename) => !actual.includes(filename));
  const unexpected = actual.filter((filename) => !expected.includes(filename));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `${label} audio mismatch. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${unexpected.join(', ') || 'none'}.`,
    );
  }
}

for (const relative of ['audio-manifest.json', ...expected]) {
  const sourceHash = await sha256(path.join(sourceRoot, ...relative.split('/')));
  const runtimeHash = await sha256(path.join(runtimeRoot, ...relative.split('/')));
  if (sourceHash !== runtimeHash) {
    throw new Error(`Runtime audio differs from source: ${relative}.`);
  }
}

console.log(
  `Validated 23 audio files and byte-identical runtime copies (${JSON.stringify(categoryCounts)}).`,
);

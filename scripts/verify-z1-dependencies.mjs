import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(
  await readFile(new URL('circuits/verdict/package.json', root), 'utf8'),
);

const expected = Object.freeze({
  circomlib: '2.0.5',
  circomlibjs: '0.1.7',
});

for (const [name, version] of Object.entries(expected)) {
  if (packageJson.dependencies?.[name] !== version) {
    throw new Error(`Z1 requires exact ${name}@${version}.`);
  }
}

console.log('Z1 circuit dependency pins: OK');

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = path.join(root, 'apps', 'web', 'public', 'assets');
const backgroundPath = path.join(assetRoot, 'marketing', 'ethglobal-cover-background.png');
const logoPath = path.join(assetRoot, 'brand', 'alibi-logo-mark.png');
const wordmarkPath = path.join(assetRoot, 'brand', 'the-last-alibi-wordmark.png');
const coverPath = path.join(assetRoot, 'marketing', 'ethglobal-cover.png');
const socialPath = path.join(assetRoot, 'marketing', 'social-preview.png');
const reportJsonPath = path.join(root, 'docs', 'assets', 'asset-validation-report.json');
const reportMarkdownPath = path.join(root, 'docs', 'assets', 'asset-validation-report.md');

function atmosphere(width, height) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#080709" stop-opacity=".9"/>
          <stop offset=".55" stop-color="#130c0f" stop-opacity=".3"/>
          <stop offset="1" stop-color="#080709" stop-opacity=".58"/>
        </linearGradient>
        <radialGradient id="lamp" cx=".31" cy=".5" r=".45">
          <stop offset="0" stop-color="#b77a40" stop-opacity=".2"/>
          <stop offset="1" stop-color="#000" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#shade)"/>
      <rect width="100%" height="100%" fill="url(#lamp)"/>
      <path d="M ${Math.round(width * 0.08)} ${Math.round(height * 0.78)}
        H ${Math.round(width * 0.66)}" stroke="#d0a86d" stroke-opacity=".45" stroke-width="2"/>
    </svg>
  `);
}

async function resizedBuffer(source, width, height) {
  return sharp(source)
    .resize(width, height, { fit: 'contain', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function compose({
  width,
  height,
  destination,
  logoWidth,
  logoHeight,
  logoLeft,
  logoTop,
  wordmarkWidth,
  wordmarkHeight,
  wordmarkLeft,
  wordmarkTop,
}) {
  const [logo, wordmark] = await Promise.all([
    resizedBuffer(logoPath, logoWidth, logoHeight),
    resizedBuffer(wordmarkPath, wordmarkWidth, wordmarkHeight),
  ]);
  await sharp(backgroundPath)
    .resize(width, height, {
      fit: 'cover',
      position: 'centre',
      kernel: sharp.kernel.lanczos3,
    })
    .composite([
      { input: atmosphere(width, height), left: 0, top: 0 },
      { input: logo, left: logoLeft, top: logoTop },
      { input: wordmark, left: wordmarkLeft, top: wordmarkTop },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(destination);
}

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

await compose({
  width: 1920,
  height: 1080,
  destination: coverPath,
  logoWidth: 270,
  logoHeight: 270,
  logoLeft: 145,
  logoTop: 385,
  wordmarkWidth: 900,
  wordmarkHeight: 172,
  wordmarkLeft: 400,
  wordmarkTop: 432,
});

await compose({
  width: 1200,
  height: 630,
  destination: socialPath,
  logoWidth: 165,
  logoHeight: 165,
  logoLeft: 75,
  logoTop: 225,
  wordmarkWidth: 620,
  wordmarkHeight: 118,
  wordmarkLeft: 225,
  wordmarkTop: 248,
});

const derived = [];
for (const [filePath, width, height] of [
  [coverPath, 1920, 1080],
  [socialPath, 1200, 630],
]) {
  const metadata = await sharp(filePath).metadata();
  if (metadata.format !== 'png' || metadata.width !== width || metadata.height !== height) {
    throw new Error(`Marketing composition validation failed: ${path.basename(filePath)}.`);
  }
  derived.push({
    path: path.relative(root, filePath).replaceAll('\\', '/'),
    width,
    height,
    actualFormat: metadata.format,
    sha256: await sha256(filePath),
    compositionPolicy: 'Approved background, logo mark, and wordmark only; no synthetic copy.',
  });
}

const report = JSON.parse(await readFile(reportJsonPath, 'utf8'));
report.summary.derivedMarketingCompositionCount = derived.length;
report.derivedMarketingAssets = derived;
await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const markdown = (await readFile(reportMarkdownPath, 'utf8')).replace(
  /\n## Derived marketing compositions[\s\S]*?(?=\n## Documented source normalization)/,
  '',
);
await writeFile(
  reportMarkdownPath,
  markdown
    .replace(
      /- Derived marketing compositions at this checkpoint: \*\*\d+\*\*/,
      `- Derived marketing compositions: **${derived.length}**`,
    )
    .replace(
      '\n## Documented source normalization',
      `\n## Derived marketing compositions\n\n- \`ethglobal-cover.png\`: 1920×1080, approved background + logo + wordmark.\n- \`social-preview.png\`: 1200×630, approved background + logo + wordmark.\n- No synthetic marketing text or unapproved artwork is present.\n\n## Documented source normalization`,
    ),
  'utf8',
);

console.log('Composed and validated 2 deterministic marketing assets.');

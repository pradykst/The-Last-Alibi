import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

sharp.cache(false);
sharp.concurrency(1);

const root = process.cwd();
const sourceRoot = path.join(root, '_asset-drop');
const publicRoot = path.join(root, 'apps', 'web', 'public', 'assets');
const referenceRoot = path.join(root, 'design', 'assets-source');
const reportRoot = path.join(root, 'docs', 'assets');

const CHARACTERS = ['ada-vale', 'marcus-reed', 'celeste-moreau', 'theo-lin'];
const EMOTIONS = ['neutral', 'guarded', 'anxious', 'angry', 'relieved'];
const ROOMS = ['grand-gallery', 'restoration-lab', 'archive-vault', 'rooftop-conservatory'];

const EVIDENCE = [
  'weapon-ceremonial-dagger',
  'weapon-bronze-bust',
  'time-before-blackout',
  'time-after-blackout',
  'public-observation',
  'unverified-testimony',
  'certified-disclosure',
  'player-hypothesis',
];

const UI = [
  'warrant-request',
  'proof-pending',
  'proof-verified',
  'proof-failed',
  'verdict-sealed',
  'seal-access-approved',
  'seal-access-denied',
  'verdict-yes',
  'verdict-no',
  'ranked-agent-mark',
  'technical-drawer-mark',
];

const SCREENS = [
  'landing-key-art',
  'case-introduction-art',
  'verdict-yes-background',
  'verdict-no-background',
];

function sourceEntry({
  expected,
  received = expected,
  destination,
  family,
  operation,
  alphaExpected = false,
  developmentReference = false,
}) {
  return {
    expected,
    received,
    destination,
    family,
    operation,
    alphaExpected,
    developmentReference,
  };
}

const SOURCE_ENTRIES = [
  sourceEntry({
    expected: 'alibi-logo-mark.png',
    received: 'alibilogo.png',
    destination: 'apps/web/public/assets/brand/alibi-logo-mark.png',
    family: 'brand',
    operation: 'copy',
    alphaExpected: true,
  }),
  sourceEntry({
    expected: 'the-last-alibi-wordmark.png',
    received: 'alibitext.png',
    destination: 'apps/web/public/assets/brand/the-last-alibi-wordmark.png',
    family: 'brand',
    operation: 'copy',
    alphaExpected: true,
  }),
  sourceEntry({
    expected: 'museum-map-base.png',
    received: 'basemap.png',
    destination: 'apps/web/public/assets/map/museum-map-base.png',
    family: 'map',
    operation: 'cover-1920x1080',
  }),
  ...ROOMS.flatMap((room) => [
    sourceEntry({
      expected: `${room}-bg.png`,
      destination: `apps/web/public/assets/rooms/${room}/background.png`,
      family: 'room-background',
      operation: 'cover-1920x1080',
    }),
    sourceEntry({
      expected: `${room}-fg.png`,
      destination: `apps/web/public/assets/rooms/${room}/foreground.png`,
      family: 'room-foreground',
      operation: 'cover-1920x1080',
      alphaExpected: true,
    }),
    sourceEntry({
      expected: `thumb-${room}.png`,
      destination: `apps/web/public/assets/rooms/${room}/thumbnail.png`,
      family: 'room-thumbnail',
      operation: 'cover-960x540',
    }),
  ]),
  ...CHARACTERS.flatMap((character) => [
    sourceEntry({
      expected: `characters/${character}-neutral-fullbody.png`,
      received:
        character === 'ada-vale'
          ? `${character}-neutral-fullbody.PNG`
          : `${character}-neutral-fullbody.png`,
      destination: `apps/web/public/assets/characters/${character}/sprites/neutral.png`,
      family: 'character-neutral',
      operation: 'copy',
      alphaExpected: true,
    }),
    sourceEntry({
      expected: `characters/${character}-reference.png`,
      received: `${character}-reference.png`,
      destination: `design/assets-source/characters/${character}/reference.png`,
      family: 'character-reference',
      operation: 'copy',
      developmentReference: true,
    }),
    sourceEntry({
      expected: `characters/${character}-portrait.png`,
      received: `${character}-portrait.png`,
      destination: `apps/web/public/assets/characters/${character}/portrait.png`,
      family: 'character-portrait',
      operation: 'copy',
      alphaExpected: true,
    }),
    ...EMOTIONS.filter((emotion) => emotion !== 'neutral').map((emotion) =>
      sourceEntry({
        expected: `sprites/${character}-${emotion}-master.png`,
        received: `${character}-${emotion}-master.png`,
        destination: `apps/web/public/assets/characters/${character}/sprites/${emotion}.png`,
        family: 'character-emotion',
        operation: 'normalize-to-neutral',
        alphaExpected: true,
      }),
    ),
  ]),
  ...EVIDENCE.map((id) =>
    sourceEntry({
      expected: `${id}.png`,
      destination: `apps/web/public/assets/evidence/${id}.png`,
      family: 'evidence',
      operation: 'contain-1024x1024',
      alphaExpected: true,
    }),
  ),
  ...UI.map((id) =>
    sourceEntry({
      expected: `${id}.png`,
      destination: `apps/web/public/assets/ui/${id}.png`,
      family: 'ui',
      operation: 'contain-1024x1024',
      alphaExpected: true,
    }),
  ),
  ...SCREENS.map((id) =>
    sourceEntry({
      expected: `${id}.png`,
      destination: `apps/web/public/assets/screens/${id}.webp`,
      family: 'screen',
      operation: 'cover-1920x1080-webp',
    }),
  ),
  sourceEntry({
    expected: 'ethglobal-cover-background.png',
    destination: 'apps/web/public/assets/marketing/ethglobal-cover-background.png',
    family: 'marketing-background',
    operation: 'cover-1920x1080',
  }),
  sourceEntry({
    expected: 'styleboard.png',
    received: 'detectiveicons.png',
    destination: 'design/assets-source/style/styleboard.png',
    family: 'style-reference',
    operation: 'copy',
    alphaExpected: true,
    developmentReference: true,
  }),
];

if (SOURCE_ENTRIES.length !== 68) {
  throw new Error(`Asset mapping error: expected 68 entries, found ${SOURCE_ENTRIES.length}.`);
}

function relativeFromRoot(value) {
  return path.relative(root, value).replaceAll('\\', '/');
}

async function ensureParent(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function alphaAnalysis(filePath, metadata) {
  if (!metadata.hasAlpha) return null;
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alphaIndex = info.channels - 1;
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let alphaZeroMinX = info.width;
  let alphaZeroMinY = info.height;
  let alphaZeroMaxX = -1;
  let alphaZeroMaxY = -1;
  let visiblePixels = 0;
  let nonzeroPixels = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + alphaIndex];
      if (alpha > 0) {
        nonzeroPixels += 1;
        alphaZeroMinX = Math.min(alphaZeroMinX, x);
        alphaZeroMinY = Math.min(alphaZeroMinY, y);
        alphaZeroMaxX = Math.max(alphaZeroMaxX, x);
        alphaZeroMaxY = Math.max(alphaZeroMaxY, y);
      }
      if (alpha > 8) {
        visiblePixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const toBounds = (left, top, right, bottom) =>
    right < left
      ? null
      : {
          left,
          top,
          right,
          bottom,
          width: right - left + 1,
          height: bottom - top + 1,
          centerX: (left + right) / 2,
          baseline: bottom,
        };

  return {
    threshold: 8,
    visibleBounds: toBounds(minX, minY, maxX, maxY),
    nonzeroBounds: toBounds(alphaZeroMinX, alphaZeroMinY, alphaZeroMaxX, alphaZeroMaxY),
    visiblePixelRatio: visiblePixels / (info.width * info.height),
    nonzeroPixelRatio: nonzeroPixels / (info.width * info.height),
    transparentPixelRatio: 1 - nonzeroPixels / (info.width * info.height),
  };
}

async function inspectImage(filePath) {
  const metadata = await sharp(filePath).metadata();
  const alpha = await alphaAnalysis(filePath, metadata);
  return {
    path: relativeFromRoot(filePath),
    actualFormat: metadata.format,
    extension: path.extname(filePath).toLowerCase(),
    width: metadata.width,
    height: metadata.height,
    channels: metadata.channels,
    hasAlpha: Boolean(metadata.hasAlpha),
    alpha,
    sha256: await sha256(filePath),
  };
}

async function writePng(source, destination, width, height, fit) {
  await ensureParent(destination);
  await sharp(source)
    .resize(width, height, {
      fit,
      position: 'centre',
      kernel: sharp.kernel.lanczos3,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(destination);
}

async function writeWebp(source, destination) {
  await ensureParent(destination);
  await sharp(source)
    .resize(1920, 1080, {
      fit: 'cover',
      position: 'centre',
      kernel: sharp.kernel.lanczos3,
    })
    .webp({ quality: 90, smartSubsample: true, effort: 6 })
    .toFile(destination);
}

async function copyExact(source, destination) {
  await ensureParent(destination);
  await copyFile(source, destination);
}

async function normalizeEmotion(source, destination, neutralAnalysis) {
  const sourceMetadata = await sharp(source).metadata();
  const sourceAnalysis = await alphaAnalysis(source, sourceMetadata);
  const sourceBounds = sourceAnalysis?.visibleBounds;
  const neutralBounds = neutralAnalysis.visibleBounds;
  if (!sourceBounds || !neutralBounds) {
    throw new Error(`Cannot normalize blank character sprite: ${relativeFromRoot(source)}`);
  }

  const scale = neutralBounds.height / sourceBounds.height;
  const scaledSize = Math.max(1, Math.round(sourceMetadata.width * scale));
  const scaled = await sharp(source)
    .resize({ width: scaledSize, height: scaledSize, fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const scaledMetadata = await sharp(scaled).metadata();
  const scaledAnalysis = await alphaAnalysis(scaled, scaledMetadata);
  const scaledBounds = scaledAnalysis?.visibleBounds;
  if (!scaledBounds) throw new Error(`Normalization produced a blank sprite: ${source}`);

  const left = Math.round(neutralBounds.centerX - scaledBounds.centerX);
  const top = neutralBounds.baseline - scaledBounds.baseline;
  const scaledNonzero = scaledAnalysis.nonzeroBounds;
  if (
    !scaledNonzero ||
    left + scaledNonzero.left < 0 ||
    top + scaledNonzero.top < 0 ||
    left + scaledNonzero.right >= 1024 ||
    top + scaledNonzero.bottom >= 1024
  ) {
    throw new Error(`Normalization would crop artwork: ${relativeFromRoot(source)}`);
  }

  await ensureParent(destination);
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaled, left, top }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(destination);

  return {
    scale,
    scaledCanvas: { width: scaledSize, height: scaledSize },
    placement: { left, top },
    sourceVisibleBounds: sourceBounds,
    targetNeutralBounds: neutralBounds,
  };
}

async function processEntry(entry, neutralAnalyses, normalizationRecords) {
  const source = path.join(sourceRoot, entry.received);
  const destination = path.join(root, entry.destination);
  if (entry.developmentReference || entry.operation === 'copy') {
    await copyExact(source, destination);
    return;
  }
  if (entry.operation === 'cover-1920x1080') {
    await writePng(source, destination, 1920, 1080, 'cover');
    return;
  }
  if (entry.operation === 'cover-960x540') {
    await writePng(source, destination, 960, 540, 'cover');
    return;
  }
  if (entry.operation === 'contain-1024x1024') {
    const metadata = await sharp(source).metadata();
    if (metadata.width === 1024 && metadata.height === 1024) {
      await copyExact(source, destination);
    } else {
      await writePng(source, destination, 1024, 1024, 'contain');
    }
    return;
  }
  if (entry.operation === 'cover-1920x1080-webp') {
    await writeWebp(source, destination);
    return;
  }
  if (entry.operation === 'normalize-to-neutral') {
    const character = CHARACTERS.find((id) => entry.received.startsWith(`${id}-`));
    const emotion = EMOTIONS.find((id) => entry.received.includes(`-${id}-`));
    if (!character || !emotion) throw new Error(`Unknown character mapping: ${entry.received}`);
    const result = await normalizeEmotion(
      source,
      destination,
      neutralAnalyses.get(character),
    );
    normalizationRecords.push({ character, emotion, source: entry.received, ...result });
    return;
  }
  throw new Error(`Unknown operation: ${entry.operation}`);
}

function formatBounds(bounds) {
  if (!bounds) return 'none';
  return `${bounds.left},${bounds.top}–${bounds.right},${bounds.bottom} (${bounds.width}×${bounds.height})`;
}

async function main() {
  const sourceNames = (await readdir(sourceRoot, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .map((entry) => path.relative(sourceRoot, entry).replaceAll('\\', '/'))
    .sort();
  const mappedNames = new Set(SOURCE_ENTRIES.map((entry) => entry.received.replaceAll('\\', '/')));
  const missing = SOURCE_ENTRIES.filter((entry) => !sourceNames.includes(entry.received)).map(
    (entry) => entry.expected,
  );
  const unexpected = sourceNames.filter((entry) => !mappedNames.has(entry));
  const rejectedNames = [
    'ada-vale-emotions.png',
    'celeste-moreau-anxious.png',
    'time-after-blackout-old.png',
    'player-hypothesis-old.png',
  ];
  const rejectedFound = sourceNames.filter((entry) => rejectedNames.includes(entry));

  if (missing.length > 0) throw new Error(`Missing required assets: ${missing.join(', ')}`);

  const sourceRecords = [];
  const corrupt = [];
  for (const entry of SOURCE_ENTRIES) {
    const source = path.join(sourceRoot, entry.received);
    try {
      const inspected = await inspectImage(source);
      sourceRecords.push({
        expectedFilename: entry.expected,
        sourceFilename: entry.received,
        sourcePath: inspected.path,
        destinationPath: entry.destination,
        intendedFamily: entry.family,
        operation: entry.operation,
        actualFormat: inspected.actualFormat,
        extension: inspected.extension,
        width: inspected.width,
        height: inspected.height,
        hasAlpha: inspected.hasAlpha,
        visibleAlphaBounds: inspected.alpha?.visibleBounds ?? null,
        visiblePixelRatio: inspected.alpha?.visiblePixelRatio ?? null,
        sha256: inspected.sha256,
        directRuntimeEligible:
          entry.family !== 'room-foreground' &&
          !(entry.family === 'evidence' && (inspected.width !== 1024 || inspected.height !== 1024)),
      });
    } catch (error) {
      corrupt.push({ filename: entry.received, error: String(error) });
    }
  }
  if (corrupt.length > 0) throw new Error(`Unreadable assets: ${corrupt.map((e) => e.filename)}`);

  const hashGroups = Map.groupBy(sourceRecords, (entry) => entry.sha256);
  const duplicates = [...hashGroups.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([hash, entries]) => ({ hash, files: entries.map((entry) => entry.sourceFilename) }));

  const sourceFindings = [];
  for (const entry of sourceRecords) {
    if (entry.actualFormat !== entry.extension.slice(1).toLowerCase()) {
      sourceFindings.push({
        severity: 'error',
        file: entry.sourceFilename,
        issue: `Extension ${entry.extension} does not match ${entry.actualFormat}.`,
      });
    }
    const mapping = SOURCE_ENTRIES.find((candidate) => candidate.received === entry.sourceFilename);
    if (mapping?.alphaExpected && !entry.hasAlpha) {
      sourceFindings.push({
        severity: 'error',
        file: entry.sourceFilename,
        issue: 'Expected transparent RGBA artwork but alpha is absent.',
      });
    }
    if (entry.visiblePixelRatio !== null && entry.visiblePixelRatio < 0.0005) {
      sourceFindings.push({
        severity: 'error',
        file: entry.sourceFilename,
        issue: 'Image is blank or nearly transparent.',
      });
    }
    if (entry.intendedFamily === 'room-thumbnail' && (entry.width !== 960 || entry.height !== 540)) {
      sourceFindings.push({
        severity: 'source-requires-normalization',
        file: entry.sourceFilename,
        issue: `Thumbnail ${entry.width}×${entry.height} is not the canonical 16:9 runtime size; it is proportionally cover-normalized to 960×540.`,
      });
    }
    if (
      entry.intendedFamily === 'evidence' &&
      (entry.width !== 1024 || entry.height !== 1024)
    ) {
      sourceFindings.push({
        severity: 'source-requires-normalization',
        file: entry.sourceFilename,
        issue: `Evidence artwork ${entry.width}×${entry.height} is not the canonical square runtime size; it is proportionally contained on a transparent 1024×1024 canvas.`,
      });
    }
  }

  for (const room of ROOMS) {
    const background = sourceRecords.find((entry) => entry.sourceFilename === `${room}-bg.png`);
    const foreground = sourceRecords.find((entry) => entry.sourceFilename === `${room}-fg.png`);
    if (background.width !== foreground.width || background.height !== foreground.height) {
      sourceFindings.push({
        severity: 'source-requires-normalization',
        file: `${room}-fg.png`,
        issue: `Foreground ${foreground.width}×${foreground.height} differs from background ${background.width}×${background.height}; direct runtime use rejected. Both layers are independently cover-normalized to 1920×1080.`,
      });
    }
  }

  const neutralAnalyses = new Map();
  for (const character of CHARACTERS) {
    const neutralName =
      character === 'ada-vale'
        ? `${character}-neutral-fullbody.PNG`
        : `${character}-neutral-fullbody.png`;
    const neutralPath = path.join(sourceRoot, neutralName);
    const metadata = await sharp(neutralPath).metadata();
    neutralAnalyses.set(character, await alphaAnalysis(neutralPath, metadata));
  }

  const normalizationRecords = [];
  for (const entry of SOURCE_ENTRIES) {
    await processEntry(entry, neutralAnalyses, normalizationRecords);
  }

  const faviconSource = path.join(sourceRoot, 'alibilogo.png');
  const faviconDestination = path.join(publicRoot, 'brand', 'favicon.png');
  await writePng(faviconSource, faviconDestination, 256, 256, 'contain');

  const runtimeDestinations = [
    ...SOURCE_ENTRIES.filter((entry) => !entry.developmentReference).map(
      (entry) => entry.destination,
    ),
    'apps/web/public/assets/brand/favicon.png',
  ].sort();
  const referenceDestinations = SOURCE_ENTRIES.filter((entry) => entry.developmentReference)
    .map((entry) => entry.destination)
    .sort();

  const runtimeRecords = [];
  for (const destination of runtimeDestinations) {
    runtimeRecords.push(await inspectImage(path.join(root, destination)));
  }
  const referenceRecords = [];
  for (const destination of referenceDestinations) {
    referenceRecords.push(await inspectImage(path.join(root, destination)));
  }

  const runtimeFindings = [];
  const roomRuntime = new Map();
  for (const room of ROOMS) {
    const background = runtimeRecords.find((entry) =>
      entry.path.endsWith(`/rooms/${room}/background.png`),
    );
    const foreground = runtimeRecords.find((entry) =>
      entry.path.endsWith(`/rooms/${room}/foreground.png`),
    );
    const thumbnail = runtimeRecords.find((entry) =>
      entry.path.endsWith(`/rooms/${room}/thumbnail.png`),
    );
    roomRuntime.set(room, { background, foreground, thumbnail });
    if (
      background.width !== 1920 ||
      background.height !== 1080 ||
      foreground.width !== 1920 ||
      foreground.height !== 1080
    ) {
      runtimeFindings.push({
        severity: 'error',
        file: room,
        issue: 'Room layers are not a matching 1920×1080 pair.',
      });
    }
  }

  const characterValidation = [];
  for (const character of CHARACTERS) {
    const sprites = Object.fromEntries(
      EMOTIONS.map((emotion) => [
        emotion,
        runtimeRecords.find((entry) =>
          entry.path.endsWith(`/characters/${character}/sprites/${emotion}.png`),
        ),
      ]),
    );
    const neutralBounds = sprites.neutral.alpha?.visibleBounds;
    const states = [];
    for (const emotion of EMOTIONS) {
      const sprite = sprites[emotion];
      const bounds = sprite.alpha?.visibleBounds;
      const nonzero = sprite.alpha?.nonzeroBounds;
      const heightDeltaPercent =
        ((bounds.height - neutralBounds.height) / neutralBounds.height) * 100;
      const baselineDelta = bounds.baseline - neutralBounds.baseline;
      const centerDelta = bounds.centerX - neutralBounds.centerX;
      const cropped =
        nonzero.left <= 0 ||
        nonzero.top <= 0 ||
        nonzero.right >= sprite.width - 1 ||
        nonzero.bottom >= sprite.height - 1;
      const passed =
        Math.abs(heightDeltaPercent) <= 2 &&
        Math.abs(baselineDelta) <= 2 &&
        Math.abs(centerDelta) <= 2 &&
        !cropped;
      states.push({
        emotion,
        visibleBounds: bounds,
        heightDeltaPercent,
        baselineDelta,
        centerDelta,
        cropped,
        passed,
      });
      if (!passed) {
        runtimeFindings.push({
          severity: 'error',
          file: `${character}/${emotion}`,
          issue: `Character normalization failed: height ${heightDeltaPercent.toFixed(3)}%, baseline ${baselineDelta}px, center ${centerDelta}px, cropped ${cropped}.`,
        });
      }
    }
    characterValidation.push({ character, neutralBounds, states });
  }

  const report = {
    schemaVersion: 1,
    generatedBy: 'scripts/process-game-assets.mjs',
    tooling: { sharp: sharp.versions.sharp, libvips: sharp.versions.vips },
    summary: {
      expectedSourceCount: 68,
      receivedSourceCount: sourceNames.length,
      mappedSourceCount: SOURCE_ENTRIES.length,
      canonicalRuntimeAssetCount: runtimeRecords.length,
      developmentReferenceCount: referenceRecords.length,
      derivedMarketingCompositionCount: 0,
      missingCount: missing.length,
      unexpectedCount: unexpected.length,
      duplicateGroupCount: duplicates.length,
      rejectedCount: rejectedFound.length,
      corruptCount: corrupt.length,
      sourceFindingCount: sourceFindings.length,
      runtimeErrorCount: runtimeFindings.length,
      status: runtimeFindings.length === 0 ? 'passed-with-documented-source-normalization' : 'failed',
    },
    expectedSources: SOURCE_ENTRIES.map((entry) => entry.expected),
    receivedSources: sourceNames,
    missing,
    unexpected,
    duplicates,
    rejectedFound,
    corrupt,
    sourceNamingAliases: SOURCE_ENTRIES.filter(
      (entry) => entry.expected !== entry.received,
    ).map((entry) => ({ expected: entry.expected, received: entry.received })),
    sourceFindings,
    runtimeFindings,
    normalization: {
      alphaThreshold: 8,
      targetCanvas: { width: 1024, height: 1024 },
      anchor: { x: 0.5, y: 1, origin: 'bottom center' },
      heightTolerancePercent: 2,
      baselineTolerancePixels: 2,
      horizontalCenterTolerancePixels: 2,
      records: normalizationRecords,
      validation: characterValidation,
    },
    conversions: {
      roomLayers:
        'Backgrounds and foregrounds independently use proportional Lanczos3 cover normalization to a shared 1920×1080 runtime canvas; source foreground/background dimension mismatches are retained as source findings.',
      map: 'Proportional Lanczos3 cover normalization to 1920×1080.',
      thumbnails: 'Proportional Lanczos3 cover normalization to 960×540.',
      screens:
        'Proportional Lanczos3 cover normalization to 1920×1080 WebP, quality 90, effort 6.',
      icons:
        'Exact 1024×1024 PNGs are copied byte-for-byte; non-square masters are proportionally contained on a transparent 1024×1024 canvas.',
      favicon:
        'Approved logo mark proportionally contained on a transparent 256×256 PNG canvas.',
    },
    sourceFiles: sourceRecords,
    runtimeFiles: runtimeRecords,
    developmentReferences: referenceRecords,
  };

  await mkdir(reportRoot, { recursive: true });
  await writeFile(
    path.join(reportRoot, 'asset-validation-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );

  const markdown = `# Approved asset validation

- Expected source masters: **${report.summary.expectedSourceCount}**
- Received source masters: **${report.summary.receivedSourceCount}**
- Canonical runtime assets: **${report.summary.canonicalRuntimeAssetCount}**
- Development references: **${report.summary.developmentReferenceCount}**
- Derived marketing compositions at this checkpoint: **0**
- Missing: **${missing.length}**
- Unexpected: **${unexpected.length}**
- Duplicate hash groups: **${duplicates.length}**
- Rejected files found: **${rejectedFound.length}**
- Corrupt files: **${corrupt.length}**
- Runtime validation errors: **${runtimeFindings.length}**
- Status: **${report.summary.status}**

## Documented source normalization

${sourceFindings
  .map((finding) => `- \`${finding.file}\`: ${finding.issue}`)
  .join('\n') || '- None.'}

## Character normalization

${characterValidation
  .map(
    ({ character, neutralBounds, states }) => `### ${character}

Neutral visible bounds: ${formatBounds(neutralBounds)}

| Emotion | Visible height delta | Baseline delta | Center delta | Cropped | Result |
|---|---:|---:|---:|---|---|
${states
  .map(
    (state) =>
      `| ${state.emotion} | ${state.heightDeltaPercent.toFixed(3)}% | ${state.baselineDelta}px | ${state.centerDelta}px | ${state.cropped ? 'yes' : 'no'} | ${state.passed ? 'pass' : 'fail'} |`,
  )
  .join('\n')}`,
  )
  .join('\n\n')}

The JSON report beside this file contains SHA-256 hashes, actual formats, dimensions, alpha data,
source-to-destination mappings, per-emotion transforms, and every runtime-file record.
`;
  await writeFile(path.join(reportRoot, 'asset-validation-report.md'), markdown, 'utf8');

  if (runtimeFindings.length > 0) {
    throw new Error(`Runtime asset validation failed with ${runtimeFindings.length} issue(s).`);
  }
  console.log(
    `Processed ${sourceNames.length} source masters into ${runtimeRecords.length} canonical runtime assets and ${referenceRecords.length} development references.`,
  );
}

await main();

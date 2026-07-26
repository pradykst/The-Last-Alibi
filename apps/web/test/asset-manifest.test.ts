import { access, readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { describe, expect, test } from 'vitest';

import {
  CHARACTER_EMOTIONS,
  CHARACTER_IDS,
  ROOM_IDS,
  accusationAssets,
  canonicalRuntimeAssetPaths,
  characterAssets,
  derivedMarketingAssetPaths,
  evidenceAssets,
  proofAssets,
  resolveCharacterSprite,
  roomAssets,
  sealAccessAssets,
  verdictAssets,
} from '../src/assets/game-assets';
import { designToScreen, getSceneTransform, screenToDesign } from '../src/assets/scene-coordinates';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = join(webRoot, 'public');

function diskPath(runtimePath: string): string {
  return join(publicRoot, runtimePath.replace(/^\/+/, ''));
}

async function visibleBounds(runtimePath: string) {
  const image = sharp(diskPath(runtimePath));
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] <= 8) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error(`${runtimePath} has no visible pixels`);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
    centerX: (left + right) / 2,
  };
}

describe('approved game asset manifest', () => {
  test('exhaustively maps the 64 canonical runtime assets to real files', async () => {
    expect(canonicalRuntimeAssetPaths).toHaveLength(64);
    expect(new Set(canonicalRuntimeAssetPaths).size).toBe(64);

    for (const runtimePath of canonicalRuntimeAssetPaths) {
      expect(runtimePath).toMatch(/^\/assets\//);
      expect(runtimePath).not.toContain('_asset-drop');
      expect(runtimePath).not.toContain('design/assets-source');
      await expect(access(diskPath(runtimePath))).resolves.toBeUndefined();

      const metadata = await sharp(diskPath(runtimePath)).metadata();
      expect(metadata.format).toBe(extname(runtimePath).slice(1));
      expect((await readFile(diskPath(runtimePath))).byteLength).toBeGreaterThan(0);
    }
  });

  test('validates both deterministic marketing compositions', async () => {
    expect(derivedMarketingAssetPaths).toHaveLength(2);
    const expectedDimensions = [
      [1920, 1080],
      [1200, 630],
    ];
    for (const [index, runtimePath] of derivedMarketingAssetPaths.entries()) {
      const metadata = await sharp(diskPath(runtimePath)).metadata();
      expect(metadata.format).toBe('png');
      expect([metadata.width, metadata.height]).toEqual(expectedDimensions[index]);
    }
  });

  test('maps every character, emotion, room layer, evidence type, and status icon', () => {
    for (const characterId of CHARACTER_IDS) {
      expect(Object.keys(characterAssets[characterId].sprites).sort()).toEqual(
        [...CHARACTER_EMOTIONS].sort(),
      );
    }
    for (const roomId of ROOM_IDS) {
      expect(roomAssets[roomId].background).toContain(`/rooms/${roomId}/background.png`);
      expect(roomAssets[roomId].foreground).toContain(`/rooms/${roomId}/foreground.png`);
      expect(roomAssets[roomId].thumbnail).toContain(`/rooms/${roomId}/thumbnail.png`);
    }
    expect(Object.keys(evidenceAssets)).toHaveLength(4);
    expect(Object.keys(accusationAssets.weapons)).toHaveLength(2);
    expect(Object.keys(accusationAssets.times)).toHaveLength(2);
    expect(Object.keys(proofAssets)).toEqual(['pending', 'verified', 'failed']);
    expect(Object.keys(sealAccessAssets)).toEqual(['approved', 'denied']);
    expect(Object.keys(verdictAssets)).toEqual(['sealed', 'yes', 'no']);
    expect(resolveCharacterSprite('not-a-suspect', 'neutral')).toBeNull();
    expect(resolveCharacterSprite('ada-vale', 'not-an-emotion')).toBeNull();
  });

  test('keeps all room layers aligned to a shared 1920 by 1080 coordinate system', async () => {
    for (const roomId of ROOM_IDS) {
      for (const runtimePath of [roomAssets[roomId].background, roomAssets[roomId].foreground]) {
        const metadata = await sharp(diskPath(runtimePath)).metadata();
        expect([metadata.width, metadata.height]).toEqual([1920, 1080]);
      }
    }
  });

  test('normalizes every emotion to its neutral height, baseline, and center', async () => {
    for (const characterId of CHARACTER_IDS) {
      const neutral = await visibleBounds(characterAssets[characterId].sprites.neutral);
      for (const emotion of CHARACTER_EMOTIONS) {
        const current = await visibleBounds(characterAssets[characterId].sprites[emotion]);
        const heightDelta = ((current.height - neutral.height) / neutral.height) * 100;
        expect(Math.abs(heightDelta)).toBeLessThanOrEqual(2);
        expect(Math.abs(current.bottom - neutral.bottom)).toBeLessThanOrEqual(2);
        expect(Math.abs(current.centerX - neutral.centerX)).toBeLessThanOrEqual(2);
        expect(current.left).toBeGreaterThan(0);
        expect(current.top).toBeGreaterThan(0);
        expect(current.right).toBeLessThan(1023);
        expect(current.bottom).toBeLessThan(1023);
      }
    }
  });

  test('round-trips hotspot coordinates through a contained scene transform', () => {
    const transform = getSceneTransform(1024, 768);
    expect(transform.offsetY).toBeGreaterThan(0);
    const hotspot = roomAssets['grand-gallery'].mapHotspot;
    const screenPoint = designToScreen(hotspot, transform);
    const roundTrip = screenToDesign(screenPoint, transform);
    expect(roundTrip?.x).toBeCloseTo(hotspot.x);
    expect(roundTrip?.y).toBeCloseTo(hotspot.y);
    expect(screenToDesign({ x: 0, y: 0 }, transform)).toBeNull();
  });
});

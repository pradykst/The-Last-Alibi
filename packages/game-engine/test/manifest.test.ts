import { levelManifestSchema } from '@alibi/protocol';
import { describe, expect, it } from 'vitest';

import { LEVEL_MANIFEST } from '../src';

describe('The Last Exhibit manifest', () => {
  it('validates the canonical dimensions and observations', () => {
    const manifest = levelManifestSchema.parse(LEVEL_MANIFEST);

    expect(manifest.productId).toBe('the-last-alibi');
    expect(manifest.levelId).toBe('the-last-exhibit');
    expect(manifest.suspects).toHaveLength(4);
    expect(manifest.rooms).toHaveLength(4);
    expect(manifest.weapons).toHaveLength(2);
    expect(manifest.timeWindows).toHaveLength(2);
    expect(manifest.rooms.every((room) => room.observations.length === 2)).toBe(true);
  });

  it('fails loudly on duplicate IDs', () => {
    const duplicateManifest = {
      ...LEVEL_MANIFEST,
      suspects: [
        LEVEL_MANIFEST.suspects[0],
        LEVEL_MANIFEST.suspects[0],
        LEVEL_MANIFEST.suspects[2],
        LEVEL_MANIFEST.suspects[3],
      ],
    };

    expect(() => levelManifestSchema.parse(duplicateManifest)).toThrow(
      'suspects must contain unique IDs',
    );
  });
});

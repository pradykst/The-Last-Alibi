import manifestSource from '../../public/assets/audio/audio-manifest.json';

export const AUDIO_CATEGORIES = ['music', 'ambience', 'ui', 'transition', 'verdict'] as const;

export type AudioCategory = (typeof AUDIO_CATEGORIES)[number];

export type AudioAsset = {
  id: string;
  src: string;
  category: AudioCategory;
  loop: boolean;
  volume: number;
};

const FALLBACK_ASSET_VOLUME: Record<AudioCategory, number> = {
  music: 0.28,
  ambience: 0.22,
  ui: 0.7,
  transition: 0.65,
  verdict: 0.75,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseAudioManifest(value: unknown): AudioAsset[] {
  if (!Array.isArray(value)) {
    throw new Error('Audio manifest must be an array.');
  }

  const ids = new Set<string>();
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Audio manifest entry ${index} must be an object.`);
    }

    const { id, src, category, loop, volume } = entry;
    if (typeof id !== 'string' || id.length === 0 || ids.has(id)) {
      throw new Error(`Audio manifest entry ${index} has an invalid or duplicate id.`);
    }
    if (typeof src !== 'string' || !src.startsWith('/assets/audio/')) {
      throw new Error(`Audio manifest entry ${id} has an invalid source path.`);
    }
    if (typeof category !== 'string' || !AUDIO_CATEGORIES.includes(category as AudioCategory)) {
      throw new Error(`Audio manifest entry ${id} has an invalid category.`);
    }
    if (typeof loop !== 'boolean') {
      throw new Error(`Audio manifest entry ${id} has an invalid loop flag.`);
    }

    const parsedCategory = category as AudioCategory;
    const parsedVolume = volume ?? FALLBACK_ASSET_VOLUME[parsedCategory];
    if (typeof parsedVolume !== 'number' || parsedVolume < 0 || parsedVolume > 1) {
      throw new Error(`Audio manifest entry ${id} has an invalid volume.`);
    }

    ids.add(id);
    return {
      id,
      src,
      category: parsedCategory,
      loop,
      volume: parsedVolume,
    };
  });
}

export const AUDIO_MANIFEST = parseAudioManifest(manifestSource);

export const AUDIO_ASSETS_BY_ID = new Map(AUDIO_MANIFEST.map((asset) => [asset.id, asset]));

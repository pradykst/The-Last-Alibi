import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUDIO_MANIFEST, parseAudioManifest } from '../src/audio/audio-manifest';
import {
  DEFAULT_AUDIO_SETTINGS,
  GameAudioManager,
  finalAssetGain,
  parseStoredAudioSettings,
} from '../src/audio/audio-manager';
import type { AudioElementLike } from '../src/audio/audio-manager';
import { roomAmbienceId } from '../src/audio/audio-provider';

class FakeAudio implements AudioElementLike {
  public currentTime = 0;
  public loop = false;
  public paused = true;
  public preload = '';
  public volume = 1;
  public readonly listeners = new Map<string, Set<() => void>>();
  public readonly load = vi.fn();
  public readonly pause = vi.fn(() => {
    this.paused = true;
  });
  public readonly play = vi.fn(async () => {
    this.paused = false;
    this.playOrder.push(this.src);
  });

  public constructor(
    public src: string,
    private readonly playOrder: string[],
  ) {}

  public addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  public removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
}

function createHarness(options: { throwFor?: string } = {}) {
  const instances: FakeAudio[] = [];
  const playOrder: string[] = [];
  const manager = new GameAudioManager(AUDIO_MANIFEST, {
    createAudio: (src) => {
      if (options.throwFor !== undefined && src.includes(options.throwFor)) {
        throw new Error('asset unavailable');
      }
      const audio = new FakeAudio(src, playOrder);
      instances.push(audio);
      return audio;
    },
    now: () => Date.now(),
  });
  return { manager, instances, playOrder };
}

function instancesFor(instances: FakeAudio[], suffix: string): FakeAudio[] {
  return instances.filter((audio) => audio.src.endsWith(suffix));
}

describe('audio manifest and mixer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T12:00:00Z'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('parses all 23 configured assets and resolves every runtime path', () => {
    expect(parseAudioManifest(AUDIO_MANIFEST)).toHaveLength(23);
    expect(new Set(AUDIO_MANIFEST.map((asset) => asset.id)).size).toBe(23);
    for (const asset of AUDIO_MANIFEST) {
      const path = fileURLToPath(new URL(`../public${asset.src}`, import.meta.url));
      expect(existsSync(path), asset.src).toBe(true);
    }
  });

  it('maps the four real room identifiers to their manifest ambience', () => {
    expect(roomAmbienceId('room_gallery')).toBe('grand-gallery-loop');
    expect(roomAmbienceId('room_restoration')).toBe('restoration-lab-loop');
    expect(roomAmbienceId('room_archive')).toBe('archive-vault-loop');
    expect(roomAmbienceId('room_conservatory')).toBe('rooftop-conservatory-loop');
  });

  it('preloads silently and unlocks only after a deliberate gesture', () => {
    const { manager, instances } = createHarness();
    manager.initialize(['game-opening', 'title-loop', 'select']);
    manager.setMusic('title-loop', 0);

    expect(instances.every((audio) => audio.play.mock.calls.length === 0)).toBe(true);

    manager.unlock();
    manager.setMusic(null, 0);
    manager.setMusic('title-loop', 0);
    expect(instancesFor(instances, '/title-loop.mp3')[0]?.play).toHaveBeenCalledTimes(1);
  });

  it('deduplicates the opening sting and does not restart an active title loop', () => {
    const { manager, instances } = createHarness();
    manager.unlock();
    manager.setMusic('title-loop', 0);
    manager.setMusic('title-loop', 0);
    manager.playOneShot('game-opening', { dedupeKey: 'opening' });
    manager.playOneShot('game-opening', { dedupeKey: 'opening' });

    expect(instancesFor(instances, '/title-loop.mp3')[0]?.play).toHaveBeenCalledTimes(1);
    expect(instancesFor(instances, '/game-opening.wav')).toHaveLength(1);
  });

  it('keeps investigation music alive while ambience crossfades between rooms', () => {
    const { manager, instances } = createHarness();
    manager.unlock();
    manager.setMusic('investigation-loop', 0);
    const music = instancesFor(instances, '/investigation-loop.mp3')[0]!;
    music.currentTime = 42;
    manager.setAmbience('grand-gallery-loop', 0);
    const gallery = instancesFor(instances, '/grand-gallery-loop.mp3')[0]!;
    manager.setAmbience('archive-vault-loop', 0);

    expect(music.play).toHaveBeenCalledTimes(1);
    expect(music.currentTime).toBe(42);
    expect(gallery.pause).toHaveBeenCalledTimes(1);
    expect(manager.currentAmbienceId).toBe('archive-vault-loop');
  });

  it('deduplicates semantic one-shots while keeping proof and access outcomes distinct', () => {
    const { manager, playOrder } = createHarness();
    manager.unlock();
    manager.playOneShot('evidence-added', { dedupeKey: 'evidence:1' });
    manager.playOneShot('evidence-added', { dedupeKey: 'evidence:1' });
    manager.playOneShot('notebook-open', { dedupeKey: 'notebook:1' });
    manager.playOneShot('notebook-open', { dedupeKey: 'notebook:1' });
    for (const id of [
      'proof-pending',
      'proof-verified',
      'proof-failed',
      'access-approved',
      'access-denied',
      'accusation-confirm',
    ]) {
      manager.playOneShot(id, { dedupeKey: `${id}:1` });
    }

    expect(playOrder.filter((src) => src.endsWith('/evidence-added.wav'))).toHaveLength(1);
    expect(playOrder.filter((src) => src.endsWith('/notebook-open.wav'))).toHaveLength(1);
    expect(playOrder.slice(-6).map((src) => src.split('/').at(-1))).toEqual([
      'proof-pending.wav',
      'proof-verified.wav',
      'proof-failed.wav',
      'access-approved.wav',
      'access-denied.wav',
      'accusation-confirm.wav',
    ]);
  });

  it('plays verdict reveal before exactly one terminal outcome', async () => {
    const { manager, playOrder } = createHarness();
    manager.unlock();
    manager.playVerdict('YES', 'attempt-1');
    manager.playVerdict('NO', 'attempt-1');
    await vi.advanceTimersByTimeAsync(650);

    expect(playOrder.map((src) => src.split('/').at(-1))).toEqual([
      'verdict-reveal.wav',
      'verdict-yes.wav',
    ]);
  });

  it('uses only the negative sting for a negative terminal result', async () => {
    const { manager, playOrder } = createHarness();
    manager.unlock();
    manager.playVerdict('NO', 'attempt-no');
    await vi.advanceTimersByTimeAsync(650);

    expect(playOrder.map((src) => src.split('/').at(-1))).toEqual([
      'verdict-reveal.wav',
      'verdict-no.wav',
    ]);
    expect(playOrder.some((src) => src.endsWith('/verdict-yes.wav'))).toBe(false);
  });
  it('mutes active and future playback and restores saved levels without resetting', () => {
    const { manager, instances } = createHarness();
    manager.unlock();
    manager.setMusic('investigation-loop', 0);
    const music = instancesFor(instances, '/investigation-loop.mp3')[0]!;
    manager.setSettings({
      version: 1,
      muted: true,
      master: 0.8,
      music: 0.6,
      ambience: 0.4,
      sfx: 0.2,
    });

    expect(music.paused).toBe(true);
    expect(music.volume).toBe(0);
    expect(manager.playOneShot('select')).toBe(false);

    manager.setSettings({ ...manager.settings, muted: false });
    expect(manager.settings).toMatchObject({ master: 0.8, music: 0.6, ambience: 0.4, sfx: 0.2 });
    expect(music.play).toHaveBeenCalledTimes(2);
  });

  it('pauses hidden loops and resumes from the preserved position', () => {
    const { manager, instances } = createHarness();
    manager.unlock();
    manager.setMusic('investigation-loop', 0);
    manager.setAmbience('restoration-lab-loop', 0);
    const music = instancesFor(instances, '/investigation-loop.mp3')[0]!;
    const ambience = instancesFor(instances, '/restoration-lab-loop.mp3')[0]!;
    music.currentTime = 17;
    ambience.currentTime = 9;

    manager.handleVisibility(true);
    manager.handleVisibility(false);

    expect(music.currentTime).toBe(17);
    expect(ambience.currentTime).toBe(9);
    expect(music.play).toHaveBeenCalledTimes(2);
    expect(ambience.play).toHaveBeenCalledTimes(2);
  });

  it('clamps stored levels, recovers malformed settings, and applies final gain', () => {
    expect(parseStoredAudioSettings('{bad json')).toBe(DEFAULT_AUDIO_SETTINGS);
    const parsed = parseStoredAudioSettings(
      JSON.stringify({ version: 1, muted: false, master: 4, music: -1, ambience: 0.5, sfx: 0.25 }),
    );
    expect(parsed).toEqual({
      version: 1,
      muted: false,
      master: 1,
      music: 0,
      ambience: 0.5,
      sfx: 0.25,
    });
    const title = AUDIO_MANIFEST.find((asset) => asset.id === 'title-loop')!;
    expect(finalAssetGain(title, { ...parsed, music: 0.5 })).toBeCloseTo(0.14);
  });

  it('marks a broken asset once and continues without retrying or blocking gameplay', () => {
    const diagnostic = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { manager } = createHarness({ throwFor: 'grand-gallery-loop' });
    manager.preload(['grand-gallery-loop']);
    manager.preload(['grand-gallery-loop']);

    expect(diagnostic).toHaveBeenCalledTimes(1);
    expect(() => manager.setMusic('title-loop', 0)).not.toThrow();
    expect(manager.playOneShot('missing-asset')).toBe(false);
  });
});

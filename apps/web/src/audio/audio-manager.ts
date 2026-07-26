import type { AudioAsset } from './audio-manifest';

export const AUDIO_SETTINGS_STORAGE_KEY = 'the-last-alibi.audio.v1';

export type AudioSettings = {
  version: 1;
  muted: boolean;
  master: number;
  music: number;
  ambience: number;
  sfx: number;
};

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  version: 1,
  muted: false,
  master: 1,
  music: 1,
  ambience: 1,
  sfx: 1,
};

export type AudioElementLike = {
  currentTime: number;
  loop: boolean;
  paused: boolean;
  preload: string;
  src: string;
  volume: number;
  addEventListener: (type: string, listener: () => void, options?: AddEventListenerOptions) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  load: () => void;
  pause: () => void;
  play: () => Promise<void>;
};

export type AudioElementFactory = (src: string) => AudioElementLike;

type LoopKind = 'music' | 'ambience';

type LoopNode = {
  asset: AudioAsset;
  audio: AudioElementLike;
  fade: number;
};

type OneShotOptions = {
  dedupeKey?: string;
  throttleMs?: number;
};

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function parseLevel(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value) : fallback;
}

export function parseStoredAudioSettings(raw: string | null): AudioSettings {
  if (raw === null) return DEFAULT_AUDIO_SETTINGS;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== 'object' ||
      value === null ||
      !('version' in value) ||
      value.version !== 1
    ) {
      return DEFAULT_AUDIO_SETTINGS;
    }
    const settings = value as Partial<AudioSettings>;
    return {
      version: 1,
      muted: typeof settings.muted === 'boolean' ? settings.muted : false,
      master: parseLevel(settings.master, 1),
      music: parseLevel(settings.music, 1),
      ambience: parseLevel(settings.ambience, 1),
      sfx: parseLevel(settings.sfx, 1),
    };
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

export function finalAssetGain(
  asset: AudioAsset,
  settings: AudioSettings,
  duck = 1,
  fade = 1,
): number {
  const category =
    asset.category === 'music'
      ? settings.music
      : asset.category === 'ambience'
        ? settings.ambience
        : settings.sfx;
  if (settings.muted) return 0;
  return clamp(settings.master * category * asset.volume * duck * fade);
}

export class GameAudioManager {
  readonly #assets: Map<string, AudioAsset>;
  readonly #createAudio: AudioElementFactory;
  readonly #now: () => number;
  readonly #elements = new Map<string, AudioElementLike>();
  readonly #loopNodes = new Map<string, LoopNode>();
  readonly #rampTimers = new Map<string, ReturnType<typeof setInterval>>();
  readonly #restoreTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #oneShotKeys = new Set<string>();
  readonly #lastPlayedAt = new Map<string, number>();
  readonly #brokenAssets = new Set<string>();
  readonly #reportedAssets = new Set<string>();
  readonly #failureListeners = new Map<AudioElementLike, () => void>();
  readonly #activeSfx = new Set<AudioElementLike>();
  readonly #duckFactors = new Map<string, number>();
  readonly #verdictResults = new Map<string, 'YES' | 'NO'>();
  #settings: AudioSettings;
  #currentMusicId: string | null = null;
  #currentAmbienceId: string | null = null;
  #unlocked = false;
  #hidden = false;
  #playBlocked = false;
  #destroyed = false;

  public constructor(
    manifest: AudioAsset[],
    options: {
      createAudio?: AudioElementFactory;
      now?: () => number;
      settings?: AudioSettings;
    } = {},
  ) {
    this.#assets = new Map(manifest.map((asset) => [asset.id, asset]));
    this.#createAudio =
      options.createAudio ??
      ((src) => {
        if (typeof Audio === 'undefined') {
          throw new Error('Browser audio is unavailable.');
        }
        return new Audio(src);
      });
    this.#now = options.now ?? Date.now;
    this.#settings = options.settings ?? DEFAULT_AUDIO_SETTINGS;
  }

  public get settings(): AudioSettings {
    return this.#settings;
  }

  public get unlocked(): boolean {
    return this.#unlocked;
  }

  public get currentMusicId(): string | null {
    return this.#currentMusicId;
  }

  public get currentAmbienceId(): string | null {
    return this.#currentAmbienceId;
  }

  public initialize(preloadIds: string[]): void {
    this.preload(preloadIds);
  }

  public preload(ids: string[]): void {
    for (const id of ids) {
      const asset = this.#assets.get(id);
      if (asset === undefined || this.#brokenAssets.has(id)) continue;
      try {
        const audio = this.#ensureElement(asset);
        audio.preload = 'auto';
        audio.load();
      } catch {
        this.#markAssetFailure(asset.id);
      }
    }
  }

  public unlock(): void {
    this.#unlocked = true;
    this.#playBlocked = false;
  }

  public setSettings(settings: AudioSettings): void {
    const wasMuted = this.#settings.muted;
    this.#settings = {
      version: 1,
      muted: settings.muted,
      master: clamp(settings.master),
      music: clamp(settings.music),
      ambience: clamp(settings.ambience),
      sfx: clamp(settings.sfx),
    };
    this.#updateActiveVolumes();
    if (this.#settings.muted) {
      this.#pauseLoops();
    } else if (wasMuted && this.#unlocked && !this.#hidden) {
      this.#resumeLoops();
    }
  }

  public setMusic(id: string, durationMs = 850): void {
    this.#switchLoop('music', id, durationMs);
  }

  public setAmbience(id: string | null, durationMs = 700): void {
    this.#switchLoop('ambience', id, durationMs);
  }

  public playOneShot(id: string, options: OneShotOptions = {}): boolean {
    const asset = this.#assets.get(id);
    if (asset === undefined || asset.loop || this.#brokenAssets.has(id) || this.#destroyed) {
      return false;
    }

    if (options.dedupeKey !== undefined) {
      if (this.#oneShotKeys.has(options.dedupeKey)) return false;
      this.#oneShotKeys.add(options.dedupeKey);
    }

    const now = this.#now();
    const throttleMs = options.throttleMs ?? 0;
    const lastPlayed = this.#lastPlayedAt.get(id);
    if (lastPlayed !== undefined && now - lastPlayed < throttleMs) return false;
    this.#lastPlayedAt.set(id, now);

    if (!this.#unlocked || this.#hidden || this.#settings.muted || this.#playBlocked) return false;

    let audio: AudioElementLike;
    try {
      audio = this.#createAudio(asset.src);
    } catch {
      this.#markAssetFailure(id);
      return false;
    }
    audio.preload = 'auto';
    audio.loop = false;
    audio.volume = finalAssetGain(asset, this.#settings, this.#duckFactor());
    const onFailure = () => this.#markAssetFailure(id);
    const onEnded = () => this.#releaseSfx(audio, onFailure, onEnded);
    audio.addEventListener('error', onFailure, { once: true });
    audio.addEventListener('ended', onEnded, { once: true });
    this.#activeSfx.add(audio);
    void audio.play().catch(() => {
      this.#playBlocked = true;
      this.#releaseSfx(audio, onFailure, onEnded);
    });
    return true;
  }

  public duck(key: string, factor: number, durationMs?: number): void {
    this.#duckFactors.set(key, clamp(factor));
    this.#updateActiveVolumes();
    const existing = this.#restoreTimers.get(key);
    if (existing !== undefined) clearTimeout(existing);
    if (durationMs !== undefined) {
      this.#restoreTimers.set(
        key,
        setTimeout(() => {
          this.#restoreTimers.delete(key);
          this.#duckFactors.delete(key);
          this.#updateActiveVolumes();
        }, durationMs),
      );
    }
  }

  public playBlackout(eventKey: string): void {
    this.duck(`blackout:${eventKey}`, 0.25, 1800);
    this.playOneShot('blackout', { dedupeKey: `blackout:${eventKey}` });
  }

  public playVerdict(result: 'YES' | 'NO', attemptKey: string): void {
    if (this.#verdictResults.has(attemptKey)) return;
    this.#verdictResults.set(attemptKey, result);
    this.duck(`verdict:${attemptKey}`, 0.12);
    this.setAmbience(null, 500);
    this.playOneShot('verdict-reveal', { dedupeKey: `verdict-reveal:${attemptKey}` });
    this.#restoreTimers.set(
      `verdict-outcome:${attemptKey}`,
      setTimeout(() => {
        this.#restoreTimers.delete(`verdict-outcome:${attemptKey}`);
        this.playOneShot(result === 'YES' ? 'verdict-yes' : 'verdict-no', {
          dedupeKey: `verdict-outcome:${attemptKey}`,
        });
      }, 650),
    );
  }

  public resetForMenu(): void {
    for (const key of [...this.#duckFactors.keys()]) {
      this.#oneShotKeys.clear();
      this.#lastPlayedAt.clear();
      this.#verdictResults.clear();
      if (key.startsWith('verdict:')) this.#duckFactors.delete(key);
    }
    for (const [key, timer] of [...this.#restoreTimers]) {
      if (!key.startsWith('verdict-outcome:')) continue;
      clearTimeout(timer);
      this.#restoreTimers.delete(key);
    }
    this.#updateActiveVolumes();
    this.setAmbience(null, 350);
    if (this.#unlocked) this.setMusic('title-loop', 850);
  }

  public handleVisibility(hidden: boolean): void {
    this.#hidden = hidden;
    if (hidden) {
      this.#pauseLoops();
      for (const audio of this.#activeSfx) audio.pause();
      this.#activeSfx.clear();
      return;
    }
    if (this.#unlocked && !this.#settings.muted) this.#resumeLoops();
  }

  public destroy(): void {
    this.#destroyed = true;
    for (const timer of this.#rampTimers.values()) clearInterval(timer);
    for (const timer of this.#restoreTimers.values()) clearTimeout(timer);
    this.#rampTimers.clear();
    this.#restoreTimers.clear();
    this.#pauseLoops();
    for (const audio of this.#activeSfx) audio.pause();
    this.#activeSfx.clear();
    for (const [audio, listener] of this.#failureListeners) {
      audio.removeEventListener('error', listener);
    }
    this.#failureListeners.clear();
  }

  #switchLoop(kind: LoopKind, id: string | null, durationMs: number): void {
    const previousId = kind === 'music' ? this.#currentMusicId : this.#currentAmbienceId;
    if (previousId === id) {
      this.#updateActiveVolumes();
      return;
    }

    if (kind === 'music') this.#currentMusicId = id;
    else this.#currentAmbienceId = id;

    if (previousId !== null) {
      const previous = this.#loopNodes.get(previousId);
      if (previous !== undefined) {
        this.#ramp(previous, 0, durationMs, () => previous.audio.pause());
      }
    }

    if (id === null) return;
    const asset = this.#assets.get(id);
    if (
      asset === undefined ||
      !asset.loop ||
      asset.category !== kind ||
      this.#brokenAssets.has(id)
    ) {
      return;
    }

    let next: LoopNode;
    try {
      next = this.#ensureLoopNode(asset);
    } catch {
      this.#markAssetFailure(id);
      return;
    }
    next.fade = this.#settings.muted || this.#hidden ? 1 : 0;
    this.#applyNodeVolume(next);
    if (this.#unlocked && !this.#settings.muted && !this.#hidden) {
      this.#safePlay(next.audio);
      this.#ramp(next, 1, durationMs);
    }
  }

  #ensureLoopNode(asset: AudioAsset): LoopNode {
    const existing = this.#loopNodes.get(asset.id);
    if (existing !== undefined) return existing;
    const audio = this.#ensureElement(asset);
    audio.loop = true;
    const node = { asset, audio, fade: 1 };
    this.#loopNodes.set(asset.id, node);
    return node;
  }

  #ensureElement(asset: AudioAsset): AudioElementLike {
    const existing = this.#elements.get(asset.id);
    if (existing !== undefined) return existing;
    const audio = this.#createAudio(asset.src);
    audio.src = asset.src;
    audio.loop = asset.loop;
    audio.preload = 'metadata';
    const onFailure = () => this.#markAssetFailure(asset.id);
    audio.addEventListener('error', onFailure);
    this.#failureListeners.set(audio, onFailure);
    this.#elements.set(asset.id, audio);
    return audio;
  }

  #ramp(node: LoopNode, target: number, durationMs: number, onComplete?: () => void): void {
    const existing = this.#rampTimers.get(node.asset.id);
    if (existing !== undefined) clearInterval(existing);
    if (durationMs <= 0) {
      node.fade = target;
      this.#applyNodeVolume(node);
      onComplete?.();
      return;
    }
    const start = node.fade;
    const startedAt = this.#now();
    const timer = setInterval(() => {
      const progress = Math.min(1, (this.#now() - startedAt) / durationMs);
      node.fade = start + (target - start) * progress;
      this.#applyNodeVolume(node);
      if (progress >= 1) {
        clearInterval(timer);
        this.#rampTimers.delete(node.asset.id);
        onComplete?.();
      }
    }, 40);
    this.#rampTimers.set(node.asset.id, timer);
  }

  #applyNodeVolume(node: LoopNode): void {
    node.audio.volume = finalAssetGain(node.asset, this.#settings, this.#duckFactor(), node.fade);
  }

  #updateActiveVolumes(): void {
    for (const node of this.#loopNodes.values()) this.#applyNodeVolume(node);
  }

  #duckFactor(): number {
    return this.#duckFactors.size === 0 ? 1 : Math.min(...this.#duckFactors.values());
  }

  #pauseLoops(): void {
    for (const id of [this.#currentMusicId, this.#currentAmbienceId]) {
      if (id !== null) this.#loopNodes.get(id)?.audio.pause();
    }
  }

  #resumeLoops(): void {
    for (const id of [this.#currentMusicId, this.#currentAmbienceId]) {
      if (id === null) continue;
      const node = this.#loopNodes.get(id);
      if (node === undefined) continue;
      this.#safePlay(node.audio);
    }
  }

  #safePlay(audio: AudioElementLike): void {
    if (this.#destroyed || this.#hidden || this.#settings.muted || this.#playBlocked) return;
    void audio.play().catch(() => {
      this.#playBlocked = true;
    });
  }

  #markAssetFailure(id: string): void {
    if (this.#brokenAssets.has(id)) return;
    this.#brokenAssets.add(id);
    const element = this.#elements.get(id);
    element?.pause();
    if (process.env.NODE_ENV !== 'production' && !this.#reportedAssets.has(id)) {
      this.#reportedAssets.add(id);
      console.info(`[The Last Alibi audio] Unable to play manifest asset: ${id}`);
    }
  }

  #releaseSfx(audio: AudioElementLike, onFailure: () => void, onEnded: () => void): void {
    audio.removeEventListener('error', onFailure);
    audio.removeEventListener('ended', onEnded);
    this.#activeSfx.delete(audio);
  }
}

'use client';

import type { RoomId } from '@alibi/protocol';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import { AUDIO_MANIFEST } from './audio-manifest';
import {
  AUDIO_SETTINGS_STORAGE_KEY,
  DEFAULT_AUDIO_SETTINGS,
  GameAudioManager,
  parseStoredAudioSettings,
} from './audio-manager';
import type { AudioSettings } from './audio-manager';

const ROOM_AMBIENCE: Record<RoomId, string> = {
  room_gallery: 'grand-gallery-loop',
  room_restoration: 'restoration-lab-loop',
  room_archive: 'archive-vault-loop',
  room_conservatory: 'rooftop-conservatory-loop',
};

type AudioLevel = 'master' | 'music' | 'ambience' | 'sfx';
export function roomAmbienceId(roomId: RoomId): string {
  return ROOM_AMBIENCE[roomId];
}

export type GameAudioApi = {
  settings: AudioSettings;
  unlocked: boolean;
  setMuted: (muted: boolean) => void;
  setLevel: (level: AudioLevel, value: number) => void;
  startOpening: () => void;
  beginCaseIntroduction: () => void;
  beginInvestigation: () => void;
  restartToMenu: () => void;
  enterRoom: (roomId: RoomId, eventKey: string) => void;
  returnToMap: () => void;
  select: (eventKey?: string) => void;
  back: (eventKey?: string) => void;
  evidenceAdded: (eventKey: string) => void;
  notebookOpened: (eventKey: string) => void;
  warrantSubmitted: (eventKey: string) => void;
  proofPending: (eventKey: string) => void;
  proofVerified: (eventKey: string) => void;
  proofFailed: (eventKey: string) => void;
  accessApproved: (eventKey: string) => void;
  accessDenied: (eventKey: string) => void;
  accusationConfirmed: (eventKey: string) => void;
  verdict: (result: 'YES' | 'NO', attemptKey: string) => void;
};

const noop = () => undefined;

const DEFAULT_AUDIO_API: GameAudioApi = {
  settings: DEFAULT_AUDIO_SETTINGS,
  unlocked: false,
  setMuted: noop,
  setLevel: noop,
  startOpening: noop,
  beginCaseIntroduction: noop,
  beginInvestigation: noop,
  restartToMenu: noop,
  enterRoom: noop,
  returnToMap: noop,
  select: noop,
  back: noop,
  evidenceAdded: noop,
  notebookOpened: noop,
  warrantSubmitted: noop,
  proofPending: noop,
  proofVerified: noop,
  proofFailed: noop,
  accessApproved: noop,
  accessDenied: noop,
  accusationConfirmed: noop,
  verdict: noop,
};

const AudioContext = createContext<GameAudioApi>(DEFAULT_AUDIO_API);

export function AudioProvider({ children }: { children: ReactNode }) {
  const managerRef = useRef<GameAudioManager | null>(null);
  const activeRoomRef = useRef<RoomId | null>(null);
  const [settings, setSettings] = useState<AudioSettings>(DEFAULT_AUDIO_SETTINGS);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const stored = parseStoredAudioSettings(
      window.localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY),
    );
    const manager = new GameAudioManager(AUDIO_MANIFEST, { settings: stored });
    manager.initialize(['game-opening', 'title-loop', 'select']);
    managerRef.current = manager;
    const settingsTimer = window.setTimeout(() => setSettings(stored), 0);

    const handleVisibility = () => manager.handleVisibility(document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearTimeout(settingsTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      manager.destroy();
      if (managerRef.current === manager) managerRef.current = null;
    };
  }, []);

  const commitSettings = useCallback((next: AudioSettings) => {
    setSettings(next);
    managerRef.current?.setSettings(next);
    try {
      window.localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage failure must not affect playback or gameplay.
    }
  }, []);

  const setMuted = useCallback(
    (muted: boolean) => {
      if (!muted) {
        managerRef.current?.unlock();
        setUnlocked(true);
      }
      commitSettings({ ...settings, muted });
    },
    [commitSettings, settings],
  );

  const setLevel = useCallback(
    (level: AudioLevel, value: number) => {
      commitSettings({ ...settings, [level]: value });
    },
    [commitSettings, settings],
  );

  const startOpening = useCallback(() => {
    const manager = managerRef.current;
    if (manager === null) return;
    manager.unlock();
    setUnlocked(true);
    manager.preload(['investigation-loop', 'room-enter', 'grand-gallery-loop']);
    manager.setMusic('title-loop', 850);
    manager.duck('game-opening', 0.35, 1500);
    manager.playOneShot('game-opening', { dedupeKey: 'game-opening' });
  }, []);

  const beginCaseIntroduction = useCallback(() => {
    const manager = managerRef.current;
    manager?.playOneShot('select', { throttleMs: 90 });
    manager?.playBlackout('case-introduction');
  }, []);

  const beginInvestigation = useCallback(() => {
    const manager = managerRef.current;
    if (manager === null) return;
    manager.unlock();
    activeRoomRef.current = null;
    setUnlocked(true);
    manager.setAmbience(null, 500);
    manager.setMusic('investigation-loop', 900);
  }, []);

  const restartToMenu = useCallback(() => {
    managerRef.current?.resetForMenu();
    activeRoomRef.current = null;
  }, []);

  const enterRoom = useCallback((roomId: RoomId, eventKey: string) => {
    const manager = managerRef.current;
    if (manager === null || activeRoomRef.current === roomId) return;
    activeRoomRef.current = roomId;
    manager.playOneShot('room-enter', {
      dedupeKey: `room-enter:${eventKey}`,
      throttleMs: 250,
    });
    manager.setAmbience(roomAmbienceId(roomId), 700);
  }, []);

  const returnToMap = useCallback(() => {
    managerRef.current?.setAmbience(null, 650);
    activeRoomRef.current = null;
  }, []);

  const select = useCallback((eventKey?: string) => {
    managerRef.current?.playOneShot('select', {
      ...(eventKey === undefined ? {} : { dedupeKey: `select:${eventKey}` }),
      throttleMs: 70,
    });
  }, []);

  const back = useCallback((eventKey?: string) => {
    managerRef.current?.playOneShot('back', {
      ...(eventKey === undefined ? {} : { dedupeKey: `back:${eventKey}` }),
      throttleMs: 90,
    });
  }, []);

  const evidenceAdded = useCallback((eventKey: string) => {
    managerRef.current?.playOneShot('evidence-added', {
      dedupeKey: `evidence:${eventKey}`,
    });
  }, []);

  const notebookOpened = useCallback((eventKey: string) => {
    managerRef.current?.playOneShot('notebook-open', {
      dedupeKey: `notebook:${eventKey}`,
    });
  }, []);

  const warrantSubmitted = useCallback((eventKey: string) => {
    managerRef.current?.playOneShot('warrant-request', {
      dedupeKey: `warrant-request:${eventKey}`,
    });
  }, []);

  const proofPending = useCallback((eventKey: string) => {
    managerRef.current?.playOneShot('proof-pending', {
      dedupeKey: `proof-pending:${eventKey}`,
    });
  }, []);

  const proofVerified = useCallback((eventKey: string) => {
    managerRef.current?.playOneShot('proof-verified', {
      dedupeKey: `proof-verified:${eventKey}`,
    });
  }, []);

  const proofFailed = useCallback((eventKey: string) => {
    managerRef.current?.playOneShot('proof-failed', {
      dedupeKey: `proof-failed:${eventKey}`,
    });
  }, []);

  const accessApproved = useCallback((eventKey: string) => {
    managerRef.current?.playOneShot('access-approved', {
      dedupeKey: `access-approved:${eventKey}`,
    });
  }, []);

  const accessDenied = useCallback((eventKey: string) => {
    managerRef.current?.playOneShot('access-denied', {
      dedupeKey: `access-denied:${eventKey}`,
    });
  }, []);

  const accusationConfirmed = useCallback((eventKey: string) => {
    managerRef.current?.playOneShot('accusation-confirm', {
      dedupeKey: `accusation-confirm:${eventKey}`,
    });
  }, []);

  const verdict = useCallback((result: 'YES' | 'NO', attemptKey: string) => {
    managerRef.current?.playVerdict(result, attemptKey);
  }, []);

  const value = useMemo<GameAudioApi>(
    () => ({
      settings,
      unlocked,
      setMuted,
      setLevel,
      startOpening,
      beginCaseIntroduction,
      beginInvestigation,
      restartToMenu,
      enterRoom,
      returnToMap,
      select,
      back,
      evidenceAdded,
      notebookOpened,
      warrantSubmitted,
      proofPending,
      proofVerified,
      proofFailed,
      accessApproved,
      accessDenied,
      accusationConfirmed,
      verdict,
    }),
    [
      accusationConfirmed,
      accessApproved,
      accessDenied,
      back,
      beginCaseIntroduction,
      beginInvestigation,
      restartToMenu,
      enterRoom,
      evidenceAdded,
      notebookOpened,
      proofFailed,
      proofPending,
      proofVerified,
      returnToMap,
      select,
      setLevel,
      setMuted,
      settings,
      startOpening,
      unlocked,
      verdict,
      warrantSubmitted,
    ],
  );

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useGameAudio(): GameAudioApi {
  return useContext(AudioContext);
}

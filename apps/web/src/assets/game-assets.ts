import type {
  RoomId as ProtocolRoomId,
  SuspectId as ProtocolSuspectId,
  TimeWindowId as ProtocolTimeWindowId,
  WeaponId as ProtocolWeaponId,
} from '@alibi/protocol';

export const CHARACTER_IDS = ['ada-vale', 'marcus-reed', 'celeste-moreau', 'theo-lin'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export const CHARACTER_EMOTIONS = ['neutral', 'guarded', 'anxious', 'angry', 'relieved'] as const;
export type CharacterEmotion = (typeof CHARACTER_EMOTIONS)[number];

export const ROOM_IDS = [
  'grand-gallery',
  'restoration-lab',
  'archive-vault',
  'rooftop-conservatory',
] as const;
export type RoomId = (typeof ROOM_IDS)[number];

export const EVIDENCE_TYPES = [
  'public-observation',
  'unverified-testimony',
  'certified-disclosure',
  'player-hypothesis',
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const PROOF_STATUSES = ['pending', 'verified', 'failed'] as const;
export type ProofStatus = (typeof PROOF_STATUSES)[number];

export const SEAL_ACCESS_STATUSES = ['approved', 'denied'] as const;
export type SealAccessStatus = (typeof SEAL_ACCESS_STATUSES)[number];

export const VERDICT_STATUSES = ['sealed', 'yes', 'no'] as const;
export type VerdictStatus = (typeof VERDICT_STATUSES)[number];

export const ACCUSATION_WEAPONS = ['ceremonial-dagger', 'bronze-bust'] as const;
export type AccusationWeapon = (typeof ACCUSATION_WEAPONS)[number];

export const ACCUSATION_TIMES = ['before-blackout', 'after-blackout'] as const;
export type AccusationTime = (typeof ACCUSATION_TIMES)[number];

export type DesignPoint = Readonly<{ x: number; y: number }>;

export const brandAssets = {
  logoMark: '/assets/brand/alibi-logo-mark.png',
  wordmark: '/assets/brand/the-last-alibi-wordmark.png',
  favicon: '/assets/brand/favicon.png',
} as const;

export const mapAssets = {
  base: '/assets/map/museum-map-base.png',
} as const;

export const characterAssets = {
  'ada-vale': {
    name: 'Ada Vale',
    portrait: '/assets/characters/ada-vale/portrait.png',
    sprites: {
      neutral: '/assets/characters/ada-vale/sprites/neutral.png',
      guarded: '/assets/characters/ada-vale/sprites/guarded.png',
      anxious: '/assets/characters/ada-vale/sprites/anxious.png',
      angry: '/assets/characters/ada-vale/sprites/angry.png',
      relieved: '/assets/characters/ada-vale/sprites/relieved.png',
    },
  },
  'marcus-reed': {
    name: 'Marcus Reed',
    portrait: '/assets/characters/marcus-reed/portrait.png',
    sprites: {
      neutral: '/assets/characters/marcus-reed/sprites/neutral.png',
      guarded: '/assets/characters/marcus-reed/sprites/guarded.png',
      anxious: '/assets/characters/marcus-reed/sprites/anxious.png',
      angry: '/assets/characters/marcus-reed/sprites/angry.png',
      relieved: '/assets/characters/marcus-reed/sprites/relieved.png',
    },
  },
  'celeste-moreau': {
    name: 'Celeste Moreau',
    portrait: '/assets/characters/celeste-moreau/portrait.png',
    sprites: {
      neutral: '/assets/characters/celeste-moreau/sprites/neutral.png',
      guarded: '/assets/characters/celeste-moreau/sprites/guarded.png',
      anxious: '/assets/characters/celeste-moreau/sprites/anxious.png',
      angry: '/assets/characters/celeste-moreau/sprites/angry.png',
      relieved: '/assets/characters/celeste-moreau/sprites/relieved.png',
    },
  },
  'theo-lin': {
    name: 'Theo Lin',
    portrait: '/assets/characters/theo-lin/portrait.png',
    sprites: {
      neutral: '/assets/characters/theo-lin/sprites/neutral.png',
      guarded: '/assets/characters/theo-lin/sprites/guarded.png',
      anxious: '/assets/characters/theo-lin/sprites/anxious.png',
      angry: '/assets/characters/theo-lin/sprites/angry.png',
      relieved: '/assets/characters/theo-lin/sprites/relieved.png',
    },
  },
} as const satisfies Record<
  CharacterId,
  {
    name: string;
    portrait: string;
    sprites: Record<CharacterEmotion, string>;
  }
>;

export const suspectAssetIdByProtocolId = {
  suspect_archivist: 'ada-vale',
  suspect_security: 'marcus-reed',
  suspect_patron: 'celeste-moreau',
  suspect_restorer: 'theo-lin',
} as const satisfies Record<ProtocolSuspectId, CharacterId>;

export const roomAssets = {
  'grand-gallery': {
    name: 'Grand Gallery',
    background: '/assets/rooms/grand-gallery/background.png',
    foreground: '/assets/rooms/grand-gallery/foreground.png',
    thumbnail: '/assets/rooms/grand-gallery/thumbnail.png',
    mapHotspot: { x: 560, y: 300 },
    characterAnchor: { x: 1510, y: 1010 },
    observationHotspots: {
      observation_gallery_clock: { x: 960, y: 92 },
      observation_gallery_glass: { x: 960, y: 540 },
    },
  },
  'restoration-lab': {
    name: 'Restoration Lab',
    background: '/assets/rooms/restoration-lab/background.png',
    foreground: '/assets/rooms/restoration-lab/foreground.png',
    thumbnail: '/assets/rooms/restoration-lab/thumbnail.png',
    mapHotspot: { x: 1430, y: 300 },
    characterAnchor: { x: 1480, y: 1010 },
    observationHotspots: {
      observation_restoration_solvent: { x: 1120, y: 455 },
      observation_restoration_tools: { x: 1450, y: 410 },
    },
  },
  'archive-vault': {
    name: 'Archive Vault',
    background: '/assets/rooms/archive-vault/background.png',
    foreground: '/assets/rooms/archive-vault/foreground.png',
    thumbnail: '/assets/rooms/archive-vault/thumbnail.png',
    mapHotspot: { x: 550, y: 790 },
    characterAnchor: { x: 1490, y: 1010 },
    observationHotspots: {
      observation_archive_access: { x: 960, y: 390 },
      observation_archive_dust: { x: 720, y: 760 },
    },
  },
  'rooftop-conservatory': {
    name: 'Rooftop Conservatory',
    background: '/assets/rooms/rooftop-conservatory/background.png',
    foreground: '/assets/rooms/rooftop-conservatory/foreground.png',
    thumbnail: '/assets/rooms/rooftop-conservatory/thumbnail.png',
    mapHotspot: { x: 1420, y: 790 },
    characterAnchor: { x: 1450, y: 1010 },
    observationHotspots: {
      observation_conservatory_glass: { x: 1470, y: 730 },
      observation_conservatory_route: { x: 955, y: 520 },
    },
  },
} as const satisfies Record<
  RoomId,
  {
    name: string;
    background: string;
    foreground: string;
    thumbnail: string;
    mapHotspot: DesignPoint;
    characterAnchor: DesignPoint;
    observationHotspots: Record<string, DesignPoint>;
  }
>;

export const roomAssetIdByProtocolId = {
  room_gallery: 'grand-gallery',
  room_restoration: 'restoration-lab',
  room_archive: 'archive-vault',
  room_conservatory: 'rooftop-conservatory',
} as const satisfies Record<ProtocolRoomId, RoomId>;

export const evidenceAssets = {
  'public-observation': '/assets/evidence/public-observation.png',
  'unverified-testimony': '/assets/evidence/unverified-testimony.png',
  'certified-disclosure': '/assets/evidence/certified-disclosure.png',
  'player-hypothesis': '/assets/evidence/player-hypothesis.png',
} as const satisfies Record<EvidenceType, string>;

export const accusationAssets = {
  weapons: {
    'ceremonial-dagger': '/assets/evidence/weapon-ceremonial-dagger.png',
    'bronze-bust': '/assets/evidence/weapon-bronze-bust.png',
  },
  times: {
    'before-blackout': '/assets/evidence/time-before-blackout.png',
    'after-blackout': '/assets/evidence/time-after-blackout.png',
  },
} as const satisfies {
  weapons: Record<AccusationWeapon, string>;
  times: Record<AccusationTime, string>;
};

export const weaponAssetIdByProtocolId = {
  weapon_dagger: 'ceremonial-dagger',
  weapon_bust: 'bronze-bust',
} as const satisfies Record<ProtocolWeaponId, AccusationWeapon>;

export const timeAssetIdByProtocolId = {
  time_pre_blackout: 'before-blackout',
  time_post_blackout: 'after-blackout',
} as const satisfies Record<ProtocolTimeWindowId, AccusationTime>;

export const proofAssets = {
  pending: '/assets/ui/proof-pending.png',
  verified: '/assets/ui/proof-verified.png',
  failed: '/assets/ui/proof-failed.png',
} as const satisfies Record<ProofStatus, string>;

export const sealAccessAssets = {
  approved: '/assets/ui/seal-access-approved.png',
  denied: '/assets/ui/seal-access-denied.png',
} as const satisfies Record<SealAccessStatus, string>;

export const verdictAssets = {
  sealed: '/assets/ui/verdict-sealed.png',
  yes: '/assets/ui/verdict-yes.png',
  no: '/assets/ui/verdict-no.png',
} as const satisfies Record<VerdictStatus, string>;

export const interfaceAssets = {
  warrantRequest: '/assets/ui/warrant-request.png',
  rankedAgent: '/assets/ui/ranked-agent-mark.png',
  technicalDrawer: '/assets/ui/technical-drawer-mark.png',
} as const;

export const screenAssets = {
  landing: '/assets/screens/landing-key-art.webp',
  caseIntroduction: '/assets/screens/case-introduction-art.webp',
  verdictYes: '/assets/screens/verdict-yes-background.webp',
  verdictNo: '/assets/screens/verdict-no-background.webp',
} as const;

export const marketingAssets = {
  background: '/assets/marketing/ethglobal-cover-background.png',
  ethglobalCover: '/assets/marketing/ethglobal-cover.png',
  socialPreview: '/assets/marketing/social-preview.png',
} as const;

export const canonicalRuntimeAssetPaths = [
  ...Object.values(brandAssets),
  mapAssets.base,
  ...ROOM_IDS.flatMap((roomId) => {
    const room = roomAssets[roomId];
    return [room.background, room.foreground, room.thumbnail];
  }),
  ...CHARACTER_IDS.flatMap((characterId) => {
    const character = characterAssets[characterId];
    return [character.portrait, ...CHARACTER_EMOTIONS.map((emotion) => character.sprites[emotion])];
  }),
  ...Object.values(evidenceAssets),
  ...Object.values(accusationAssets.weapons),
  ...Object.values(accusationAssets.times),
  ...Object.values(proofAssets),
  ...Object.values(sealAccessAssets),
  ...Object.values(verdictAssets),
  ...Object.values(interfaceAssets),
  ...Object.values(screenAssets),
  marketingAssets.background,
] as const;

export const derivedMarketingAssetPaths = [
  marketingAssets.ethglobalCover,
  marketingAssets.socialPreview,
] as const;

export function isCharacterId(value: string): value is CharacterId {
  return CHARACTER_IDS.includes(value as CharacterId);
}

export function isCharacterEmotion(value: string): value is CharacterEmotion {
  return CHARACTER_EMOTIONS.includes(value as CharacterEmotion);
}

export function resolveCharacterSprite(characterId: string, emotion: string): string | null {
  if (!isCharacterId(characterId) || !isCharacterEmotion(emotion)) return null;
  return characterAssets[characterId].sprites[emotion];
}

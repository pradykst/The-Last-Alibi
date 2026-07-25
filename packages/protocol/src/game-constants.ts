export const SUSPECT_IDS = [
  'suspect_archivist',
  'suspect_security',
  'suspect_patron',
  'suspect_restorer',
] as const;

export const ROOM_IDS = [
  'room_gallery',
  'room_restoration',
  'room_archive',
  'room_conservatory',
] as const;

export const WEAPON_IDS = ['weapon_dagger', 'weapon_bust'] as const;

export const TIME_WINDOW_IDS = ['time_pre_blackout', 'time_post_blackout'] as const;

export const OBSERVATION_IDS = [
  'observation_gallery_clock',
  'observation_gallery_glass',
  'observation_restoration_solvent',
  'observation_restoration_tools',
  'observation_archive_access',
  'observation_archive_dust',
  'observation_conservatory_glass',
  'observation_conservatory_route',
] as const;

export const PREDICATE_DIMENSIONS = ['suspect', 'room', 'weapon', 'time'] as const;

export const GAME_DENIAL_CODES = [
  'UNKNOWN_SESSION',
  'INVALID_SESSION_STATE',
  'UNKNOWN_PREDICATE',
  'PREDICATE_ALREADY_USED',
  'DISCLOSURE_LIMIT_REACHED',
  'UNSAFE_DISCLOSURE',
  'OPERATION_ALREADY_PENDING',
  'MALFORMED_REQUEST',
] as const;

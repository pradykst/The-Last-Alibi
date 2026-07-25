export const PRODUCT_ID = 'the-last-alibi' as const;
export const MVP_LEVEL_ID = 'the-last-exhibit' as const;
export const PUBLIC_HEALTH_SERVICE_ID = 'the-last-alibi-web' as const;

export const CASE_CANDIDATE_COUNT = 64 as const;
export const CERTIFIED_DISCLOSURE_LIMIT = 5 as const;
export const MINIMUM_SURVIVING_CANDIDATES = 2 as const;

export const RUNTIME_MODES = ['fixture', 'live'] as const;
export const SESSION_STATES = [
  'creating',
  'active',
  'query-pending',
  'accusation-pending',
  'terminal',
] as const;
export const EVIDENCE_CLASSES = [
  'public-observation',
  'unverified-testimony',
  'certified-disclosure',
  'player-hypothesis',
] as const;
export const VERIFICATION_STATES = ['idle', 'pending', 'verified', 'failed', 'denied'] as const;
export const WARRANT_OUTCOMES = ['YES', 'NO'] as const;

export const CAPABILITY_KEYS = [
  'sui',
  'zk-prover',
  '0g',
  'walrus',
  'seal',
  'world-agentkit',
] as const;

export const CAPABILITY_LABELS = {
  sui: 'Sui',
  'zk-prover': 'ZK prover',
  '0g': '0G',
  walrus: 'Walrus',
  seal: 'Seal',
  'world-agentkit': 'World AgentKit',
} as const satisfies Record<(typeof CAPABILITY_KEYS)[number], string>;

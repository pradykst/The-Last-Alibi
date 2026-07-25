export type RankedAuthorizationDenialCode =
  | 'MISSING_AGENTKIT_HEADER'
  | 'MALFORMED_AGENTKIT_HEADER'
  | 'WRONG_RESOURCE'
  | 'WRONG_LEVEL'
  | 'STALE_MESSAGE'
  | 'REPLAYED_NONCE'
  | 'MALFORMED_SIGNATURE'
  | 'UNREGISTERED_AGENT'
  | 'ENTITLEMENT_ALREADY_USED'
  | 'AUTHORIZATION_UNAVAILABLE';

export type RankedAuthorizationDenial = {
  authorized: false;
  code: RankedAuthorizationDenialCode;
  message: string;
};

const MESSAGES: Record<RankedAuthorizationDenialCode, string> = {
  MISSING_AGENTKIT_HEADER: 'World AgentKit authorization is required.',
  MALFORMED_AGENTKIT_HEADER: 'The World AgentKit authorization is malformed.',
  WRONG_RESOURCE: 'The World AgentKit authorization is bound to another resource.',
  WRONG_LEVEL: 'The World AgentKit authorization is bound to another level.',
  STALE_MESSAGE: 'The World AgentKit authorization is no longer fresh.',
  REPLAYED_NONCE: 'The World AgentKit authorization nonce has already been used.',
  MALFORMED_SIGNATURE: 'The World AgentKit signature is invalid.',
  UNREGISTERED_AGENT: 'The agent is not registered as human-backed.',
  ENTITLEMENT_ALREADY_USED: 'The human-backed ranked entitlement was already used for this level.',
  AUTHORIZATION_UNAVAILABLE: 'World AgentKit authorization is temporarily unavailable.',
};

export function deny(code: RankedAuthorizationDenialCode): RankedAuthorizationDenial {
  return { authorized: false, code, message: MESSAGES[code] };
}

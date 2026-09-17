export const alexaScopes = ['inventory.read', 'sales.read'] as const;
export type AlexaScope = (typeof alexaScopes)[number];

export interface AlexaAuthorizationRequest {
  approved: boolean;
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  redirectUri: string;
  responseType: 'code';
  scope: string;
  state: string;
}

export interface AlexaAuthorizationData {
  redirectUrl: string;
}

export interface AlexaLinkStatusData {
  authorizedAt: string | null;
  linked: boolean;
  scopes: readonly AlexaScope[];
}

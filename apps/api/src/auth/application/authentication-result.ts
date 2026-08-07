import type { SecretToken } from '../infrastructure/auth-token.service.js';
import type { ActiveSession } from './session.service.js';

export type AuthenticatedUser = {
  displayName: string;
  id: string;
  identifier: string;
  status: 'ACTIVE';
};

export type AuthenticationResult = {
  secret: SecretToken;
  session: ActiveSession;
  user: AuthenticatedUser;
};

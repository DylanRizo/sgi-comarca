export type ActiveAuthUser = {
  id: string;
  displayName: string;
  identifier: string;
  status: 'ACTIVE';
};

export type ActivateAccountRequest = {
  password: string;
  token: string;
};

export type LoginRequest = {
  identifier: string;
  password: string;
};

export type ChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};

export type AuthPublicErrorCode =
  | 'ACTIVATION_FAILED'
  | 'AUTHENTICATION_FAILED'
  | 'INVALID_REQUEST'
  | 'PASSWORD_POLICY_REJECTED'
  | 'REQUEST_VERIFICATION_FAILED'
  | 'SESSION_INVALID';

export type AuthSessionSummary = {
  absoluteExpiresAt: string;
  idleExpiresAt: string;
};

export type AuthenticationData = {
  csrfToken: string;
  session: AuthSessionSummary;
  user: ActiveAuthUser;
};

export type CurrentSessionData = AuthSessionSummary & {
  displayName: string;
  identifier: string;
  permissions: readonly string[];
  status: 'ACTIVE';
  userId: string;
};

export type CsrfData = {
  csrfToken: string;
  expiresAt: string;
};

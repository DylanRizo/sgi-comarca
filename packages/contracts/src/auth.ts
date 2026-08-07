export type ActiveAuthUser = {
  id: string;
  displayName: string;
  identifier: string;
  status: 'ACTIVE';
};

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

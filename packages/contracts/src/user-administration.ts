export type AdminInvitationData = {
  token: string;
};

export type UserAdministrationPublicErrorCode =
  | 'ADMIN_OPERATION_CONFLICT'
  | 'ADMIN_USER_NOT_FOUND'
  | 'ADMIN_USER_STATE_CONFLICT'
  | 'LAST_ADMIN_PROTECTED';

import type { DatabaseClient } from '@sgi/database';

export type TransactionClient = Omit<
  DatabaseClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

export class LastAdminPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LastAdminPolicyError';
  }
}

export type AssignedAdmin = {
  roleId: string;
  user: {
    activatedAt: Date | null;
    id: string;
    status: 'ACTIVE' | 'DISABLED' | 'PENDING_ACTIVATION';
  };
};

export class LastAdminPolicy {
  async lockAssignedAdmins(
    transaction: TransactionClient,
  ): Promise<AssignedAdmin[]> {
    const roles = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM roles
      WHERE code = 'ADMIN'
      FOR UPDATE
    `;

    if (roles.length !== 1) {
      throw new LastAdminPolicyError(
        'The ADMIN role is missing or structurally incompatible.',
      );
    }

    const roleId = roles[0]?.id;
    if (!roleId) {
      throw new LastAdminPolicyError('The ADMIN role could not be locked.');
    }

    const assignments = await transaction.userRole.findMany({
      where: { roleId, revokedAt: null },
      select: {
        user: {
          select: {
            activatedAt: true,
            id: true,
            status: true,
          },
        },
      },
    });

    return assignments.map(({ user }) => ({ roleId, user }));
  }

  async requireExactlyOneAssignedAdmin(
    transaction: TransactionClient,
  ): Promise<AssignedAdmin> {
    const assignments = await this.lockAssignedAdmins(transaction);
    if (assignments.length !== 1) {
      throw new LastAdminPolicyError(
        'Exactly one assigned ADMIN is required for this operation.',
      );
    }

    const assignment = assignments[0];
    if (!assignment) {
      throw new LastAdminPolicyError('The assigned ADMIN could not be read.');
    }

    return assignment;
  }

  async assertCanRemoveAdminAssignment(
    transaction: TransactionClient,
    targetUserId: string,
  ): Promise<void> {
    const assignments = await this.lockAssignedAdmins(transaction);
    const targetIsAdmin = assignments.some(
      ({ user }) => user.id === targetUserId,
    );

    if (targetIsAdmin && assignments.length <= 1) {
      throw new LastAdminPolicyError(
        'The last ADMIN assignment cannot be removed.',
      );
    }
  }

  async assertCanDisableUser(
    transaction: TransactionClient,
    targetUserId: string,
  ): Promise<void> {
    const assignments = await this.lockAssignedAdmins(transaction);
    const targetIsAdmin = assignments.some(
      ({ user }) => user.id === targetUserId,
    );
    const targetIsAlreadyDisabled = assignments.some(
      ({ user }) => user.id === targetUserId && user.status === 'DISABLED',
    );
    const enabledAdmins = assignments.filter(
      ({ user }) => user.status !== 'DISABLED',
    );

    if (
      targetIsAdmin &&
      !targetIsAlreadyDisabled &&
      enabledAdmins.length <= 1
    ) {
      throw new LastAdminPolicyError(
        'The last enabled ADMIN cannot be disabled.',
      );
    }
  }

  async assertCanAdministrativelyRevokeCredential(
    transaction: TransactionClient,
    targetUserId: string,
  ): Promise<void> {
    const assignments = await this.lockAssignedAdmins(transaction);
    const targetIsEnabledAdmin = assignments.some(
      ({ user }) => user.id === targetUserId && user.status !== 'DISABLED',
    );
    const enabledAdminCount = assignments.filter(
      ({ user }) => user.status !== 'DISABLED',
    ).length;

    if (targetIsEnabledAdmin && enabledAdminCount <= 1) {
      throw new LastAdminPolicyError(
        'The sole enabled ADMIN credential cannot be administratively revoked.',
      );
    }
  }

  async assertCanInvalidateInvitation(
    transaction: TransactionClient,
    invitationId: string,
    now = new Date(),
  ): Promise<void> {
    const assignments = await this.lockAssignedAdmins(transaction);
    if (assignments.length !== 1) return;

    const soleAdmin = assignments[0];
    if (!soleAdmin || soleAdmin.user.status !== 'PENDING_ACTIVATION') return;

    const invitation = await transaction.userInvitation.findUnique({
      where: { id: invitationId },
      select: {
        consumedAt: true,
        expiresAt: true,
        invalidatedAt: true,
        userId: true,
      },
    });
    if (
      !invitation ||
      invitation.userId !== soleAdmin.user.id ||
      invitation.consumedAt !== null ||
      invitation.invalidatedAt !== null ||
      invitation.expiresAt <= now
    ) {
      return;
    }

    const usableInvitationCount = await transaction.userInvitation.count({
      where: {
        userId: soleAdmin.user.id,
        consumedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: now },
      },
    });
    if (usableInvitationCount <= 1) {
      throw new LastAdminPolicyError(
        'The last usable invitation for the sole pending ADMIN cannot be invalidated.',
      );
    }
  }

  allowsLogout(): true {
    return true;
  }

  allowsSessionRevocation(): true {
    return true;
  }

  allowsNormalPasswordChange(): true {
    return true;
  }
}

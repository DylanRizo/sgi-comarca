import type {
  RoleSummary,
  UserDetail,
  UserDirectoryEntry,
} from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';

import { EffectivePermissionsService } from './effective-permissions.service.js';

/**
 * Reads for the administration panel. Roles and permissions are granted and
 * revoked rather than deleted, so every query filters `revokedAt: null` and
 * reports what is in force now.
 *
 * The directory states whether a person can actually sign in, which their
 * status alone does not say: an ACTIVE user whose credential was revoked
 * cannot, and one still PENDING_ACTIVATION can only do so through an
 * outstanding invitation.
 */
export class UserDirectoryService {
  constructor(
    private readonly client: DatabaseClient,
    private readonly permissions = new EffectivePermissionsService(client),
  ) {}

  async roles(): Promise<readonly RoleSummary[]> {
    const roles = await this.client.role.findMany({
      orderBy: { code: 'asc' },
      select: { code: true, name: true, description: true },
    });
    return roles;
  }

  async list(
    search: string,
    page: number,
    pageSize: number,
  ): Promise<{
    items: readonly UserDirectoryEntry[];
    totalItems: number;
  }> {
    const term = search.trim();
    const where = term
      ? {
          OR: [
            { loginIdentifier: { contains: term, mode: 'insensitive' as const } },
            { displayName: { contains: term, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [totalItems, users] = await Promise.all([
      this.client.user.count({ where }),
      this.client.user.findMany({
        where,
        orderBy: { loginIdentifier: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.directoryInclude(),
      }),
    ]);
    return { items: users.map((user) => this.toEntry(user)), totalItems };
  }

  async detail(userId: string): Promise<UserDetail | null> {
    const user = await this.client.user.findUnique({
      where: { id: userId },
      include: {
        ...this.directoryInclude(),
        userPermissions: {
          where: { revokedAt: null },
          include: { permission: { select: { code: true } } },
        },
      },
    });
    if (!user) return null;
    return {
      ...this.toEntry(user),
      effectivePermissions: [
        ...(await this.permissions.listPermissions(userId)),
      ].sort(),
      overrides: user.userPermissions
        .map((override) => ({
          code: override.permission.code,
          effect: override.effect,
        }))
        .sort((left, right) => left.code.localeCompare(right.code)),
    };
  }

  private directoryInclude() {
    const now = new Date();
    return {
      userRoles: {
        where: { revokedAt: null },
        include: { role: { select: { code: true } } },
      },
      passwordCredential: { select: { revokedAt: true } },
      _count: {
        select: {
          sessions: { where: { revokedAt: null, absoluteExpiresAt: { gt: now } } },
          invitations: {
            where: {
              consumedAt: null,
              invalidatedAt: null,
              expiresAt: { gt: now },
            },
          },
        },
      },
    };
  }

  private toEntry(user: {
    id: string;
    loginIdentifier: string;
    displayName: string;
    status: string;
    activatedAt: Date | null;
    createdAt: Date;
    passwordCredential: { revokedAt: Date | null } | null;
    userRoles: readonly { role: { code: string } }[];
    _count: { sessions: number; invitations: number };
  }): UserDirectoryEntry {
    return {
      id: user.id,
      loginIdentifier: user.loginIdentifier,
      displayName: user.displayName,
      status: user.status as UserDirectoryEntry['status'],
      roles: user.userRoles.map(({ role }) => role.code).sort(),
      activatedAt: user.activatedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      hasActiveCredential:
        user.passwordCredential !== null &&
        user.passwordCredential.revokedAt === null,
      activeSessions: user._count.sessions,
      hasOpenInvitation: user._count.invitations > 0,
    };
  }
}

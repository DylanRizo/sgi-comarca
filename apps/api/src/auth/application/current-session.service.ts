import type { DatabaseClient } from '@sgi/database';

import { SessionError } from '../domain/authentication.errors.js';
import type { ActiveSession } from './session.service.js';
import { EffectivePermissionsService } from './effective-permissions.service.js';

export type CurrentSession = {
  absoluteExpiresAt: Date;
  displayName: string;
  identifier: string;
  idleExpiresAt: Date;
  permissions: readonly string[];
  status: 'ACTIVE';
  userId: string;
};

export class CurrentSessionService {
  constructor(
    private readonly client: DatabaseClient,
    private readonly permissions = new EffectivePermissionsService(client),
  ) {}

  async get(
    session: Pick<
      ActiveSession,
      'absoluteExpiresAt' | 'idleExpiresAt' | 'sessionId' | 'userId'
    >,
  ): Promise<CurrentSession> {
    const user = await this.client.user.findUnique({
      where: { id: session.userId },
      select: {
        displayName: true,
        loginIdentifier: true,
        status: true,
      },
    });
    if (user?.status !== 'ACTIVE') throw new SessionError();

    return {
      absoluteExpiresAt: session.absoluteExpiresAt,
      displayName: user.displayName,
      identifier: user.loginIdentifier,
      idleExpiresAt: session.idleExpiresAt,
      permissions: await this.permissions.listPermissions(session.userId),
      status: 'ACTIVE',
      userId: session.userId,
    };
  }
}

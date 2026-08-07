import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { DatabaseService } from '../database/database.service.js';
import { EffectivePermissionsService } from './application/effective-permissions.service.js';
import { SessionService } from './application/session.service.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import { OriginGuard } from './guards/origin.guard.js';
import { PermissionGuard } from './guards/permission.guard.js';
import { SessionGuard } from './guards/session.guard.js';
import { CsrfTokenService } from './http/csrf-token.service.js';
import { OriginPolicyService } from './http/origin-policy.service.js';
import { SessionCookieService } from './http/session-cookie.service.js';

@Module({
  providers: [
    {
      provide: SessionService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider((client) => new SessionService(client)),
    },
    {
      provide: EffectivePermissionsService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new EffectivePermissionsService(client),
        ),
    },
    OriginPolicyService,
    SessionCookieService,
    CsrfTokenService,
    OriginGuard,
    SessionGuard,
    CsrfGuard,
    PermissionGuard,
    { provide: APP_GUARD, useExisting: OriginGuard },
    { provide: APP_GUARD, useExisting: SessionGuard },
    { provide: APP_GUARD, useExisting: CsrfGuard },
    { provide: APP_GUARD, useExisting: PermissionGuard },
  ],
  exports: [
    CsrfTokenService,
    EffectivePermissionsService,
    SessionCookieService,
  ],
})
export class AuthModule {}

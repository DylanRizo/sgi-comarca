import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { appConfig } from '../config/app.config.js';
import { DatabaseService } from '../database/database.service.js';
import { ActivationService } from './application/activation.service.js';
import { CurrentSessionService } from './application/current-session.service.js';
import { EffectivePermissionsService } from './application/effective-permissions.service.js';
import { LoginService } from './application/login.service.js';
import { PasswordService } from './application/password.service.js';
import { SessionService } from './application/session.service.js';
import { AuthController } from './controllers/auth.controller.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import { OriginGuard } from './guards/origin.guard.js';
import { PermissionGuard } from './guards/permission.guard.js';
import { SessionGuard } from './guards/session.guard.js';
import { CsrfTokenService } from './http/csrf-token.service.js';
import { OriginPolicyService } from './http/origin-policy.service.js';
import { SessionCookieService } from './http/session-cookie.service.js';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher.js';
import { OriginHasher } from './infrastructure/origin-hasher.js';

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: SessionService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider((client) => new SessionService(client)),
    },
    {
      provide: ActivationService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new ActivationService(client, new Argon2PasswordHasher()),
        ),
    },
    {
      provide: LoginService,
      inject: [DatabaseService, appConfig.KEY],
      useFactory: (
        database: DatabaseService,
        configuration: ConfigType<typeof appConfig>,
      ) =>
        database.instantiateProvider(
          (client) =>
            new LoginService(client, {
              originHasher: new OriginHasher(configuration.originHmacSecret),
              passwordHasher: new Argon2PasswordHasher(),
            }),
        ),
    },
    {
      provide: PasswordService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new PasswordService(client, new Argon2PasswordHasher()),
        ),
    },
    {
      provide: EffectivePermissionsService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        database.instantiateProvider(
          (client) => new EffectivePermissionsService(client),
        ),
    },
    {
      provide: CurrentSessionService,
      inject: [DatabaseService, EffectivePermissionsService],
      useFactory: (
        database: DatabaseService,
        permissions: EffectivePermissionsService,
      ) =>
        database.instantiateProvider(
          (client) => new CurrentSessionService(client, permissions),
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

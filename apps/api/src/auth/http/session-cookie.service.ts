import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

import { appConfig } from '../../config/app.config.js';
import type { ActiveSession } from '../application/session.service.js';

@Injectable()
export class SessionCookieService {
  constructor(
    @Inject(appConfig.KEY)
    private readonly configuration: ConfigType<typeof appConfig>,
  ) {}

  read(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const value = cookies?.[this.configuration.sessionCookieName];
    return typeof value === 'string' ? value : undefined;
  }

  write(response: Response, token: string, session: ActiveSession): void {
    const expiresAt = new Date(
      Math.min(
        session.idleExpiresAt.getTime(),
        session.absoluteExpiresAt.getTime(),
      ),
    );
    response.cookie(this.configuration.sessionCookieName, token, {
      ...this.baseOptions(),
      expires: expiresAt,
      maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
    });
    response.setHeader('Cache-Control', 'no-store');
  }

  clear(response: Response): void {
    response.clearCookie(this.configuration.sessionCookieName, {
      ...this.baseOptions(),
      expires: new Date(0),
      maxAge: 0,
    });
    response.setHeader('Cache-Control', 'no-store');
  }

  private baseOptions(): CookieOptions {
    return {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: this.configuration.secureCookies,
    };
  }
}

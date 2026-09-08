import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  ValidationPipe,
} from '@nestjs/common';
import type {
  AdminInvitationData,
  ApiSuccess,
  PaginatedData,
  RoleSummary,
  UserDetail,
  UserDirectoryEntry,
} from '@sgi/contracts';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

import {
  UserAdministrationError,
  UserAdministrationService,
} from '../application/user-administration.service.js';
import { UserDirectoryService } from '../application/user-directory.service.js';
import { LastAdminPolicyError } from '../application/last-admin-policy.js';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import { RequirePermission } from '../decorators/require-permission.decorator.js';
// DTO values must remain runtime imports so Nest emits validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { EmptyAdminCommandDto } from '../dto/admin-user-command.dto.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UserIdParamDto } from '../dto/user-id-param.dto.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CatalogListQueryDto } from '../../common/dto/read-query.dto.js';
import type { AuthenticatedRequestContext } from '../http/auth-http-context.js';
import { AuthHttpException } from '../http/auth-http.exception.js';

export function mapUserAdministrationError(error: unknown): never {
  if (error instanceof LastAdminPolicyError) {
    throw AuthHttpException.lastAdminProtected();
  }
  if (error instanceof UserAdministrationError) {
    switch (error.code) {
      case 'ADMIN_OPERATION_CONFLICT':
        throw AuthHttpException.adminOperationConflict();
      case 'ADMIN_USER_NOT_FOUND':
        throw AuthHttpException.adminUserNotFound();
      case 'ADMIN_USER_STATE_CONFLICT':
        throw AuthHttpException.adminUserStateConflict();
    }
  }
  throw error;
}

const directoryPipe = new ValidationPipe({
  expectedType: CatalogListQueryDto,
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller({ path: 'users', version: '1' })
export class UserAdministrationController {
  constructor(
    @Inject(UserAdministrationService)
    private readonly users: UserAdministrationService,
    @Inject(UserDirectoryService)
    private readonly directory: UserDirectoryService,
  ) {}

  @Post(':id/invitations')
  @RequirePermission('users.invitations.create')
  @HttpCode(HttpStatus.CREATED)
  async createInvitation(
    @Param() params: UserIdParamDto,
    @Body() _input: EmptyAdminCommandDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<AdminInvitationData>> {
    try {
      const invitation = await this.users.createInvitation(
        current.userId,
        params.id,
      );
      const requestId = this.prepareResponse(request, response);
      return {
        data: { token: invitation.secret.revealOnce() },
        meta: { requestId },
      };
    } catch (error) {
      mapUserAdministrationError(error);
    }
  }

  @Post(':id/credentials/revoke')
  @RequirePermission('users.credentials.revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeCredential(
    @Param() params: UserIdParamDto,
    @Body() _input: EmptyAdminCommandDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    try {
      await this.users.revokeCredential(current.userId, params.id);
      this.prepareResponse(request, response);
    } catch (error) {
      mapUserAdministrationError(error);
    }
  }

  @Post(':id/sessions/revoke')
  @RequirePermission('users.sessions.revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSessions(
    @Param() params: UserIdParamDto,
    @Body() _input: EmptyAdminCommandDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    try {
      await this.users.revokeSessions(current.userId, params.id);
      this.prepareResponse(request, response);
    } catch (error) {
      mapUserAdministrationError(error);
    }
  }

  @Post(':id/deactivate')
  @RequirePermission('users.status.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivateUser(
    @Param() params: UserIdParamDto,
    @Body() _input: EmptyAdminCommandDto,
    @CurrentUser() current: AuthenticatedRequestContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    try {
      await this.users.deactivateUser(current.userId, params.id);
      this.prepareResponse(request, response);
    } catch (error) {
      mapUserAdministrationError(error);
    }
  }

  @Get()
  @RequirePermission('users.read')
  async list(
    @Query(directoryPipe) query: CatalogListQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<PaginatedData<UserDirectoryEntry>>> {
    const { items, totalItems } = await this.directory.list(
      query.search ?? '',
      query.page,
      query.pageSize,
    );
    return {
      data: {
        items: [...items],
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          totalItems,
          totalPages: Math.max(1, Math.ceil(totalItems / query.pageSize)),
        },
      },
      meta: { requestId: this.prepareResponse(request, response) },
    };
  }

  @Get(':id')
  @RequirePermission('users.read')
  async detail(
    @Param() params: UserIdParamDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<UserDetail>> {
    const detail = await this.directory.detail(params.id);
    if (!detail) throw AuthHttpException.adminUserNotFound();
    return {
      data: detail,
      meta: { requestId: this.prepareResponse(request, response) },
    };
  }

  private prepareResponse(request: Request, response: Response): string {
    const suppliedRequestId = request.header('x-request-id')?.trim();
    const requestId =
      suppliedRequestId && suppliedRequestId.length <= 128
        ? suppliedRequestId
        : randomUUID();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('x-request-id', requestId);
    return requestId;
  }
}

/** The manifest's roles, so the interface names them instead of guessing. */
@Controller({ path: 'roles', version: '1' })
export class RolesController {
  constructor(
    @Inject(UserDirectoryService)
    private readonly directory: UserDirectoryService,
  ) {}

  @Get()
  @RequirePermission('users.read')
  async list(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<readonly RoleSummary[]>> {
    const suppliedRequestId = request.header('x-request-id')?.trim();
    const requestId =
      suppliedRequestId && suppliedRequestId.length <= 128
        ? suppliedRequestId
        : randomUUID();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('x-request-id', requestId);
    return { data: await this.directory.roles(), meta: { requestId } };
  }
}

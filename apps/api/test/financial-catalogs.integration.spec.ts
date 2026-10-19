import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runBootstrap } from '../../../packages/database/src/bootstrap/run-bootstrap.js';
import { SessionService } from '../src/auth/application/session.service.js';
import { createApplication } from '../src/bootstrap.js';
import { CreateFinancialEntryService } from '../src/finances/create-financial-entry.service.js';
import {
  prepareFinancialCatalogs,
  legacyFinancialCategories,
} from '../src/finances/prepare-financial-catalogs.js';

const originalUrl = process.env.DATABASE_URL!;
const databaseName = `sgi_fincatalog_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

describe.sequential(
  'Financial catalog preparation and responsible directory',
  () => {
    let administrator: DatabaseClient;
    let client: DatabaseClient;
    let app: Awaited<ReturnType<typeof createApplication>>;
    let dylan: string;
    let samantha: string;
    let jean: string;
    let luden: string;

    beforeAll(async () => {
      const url = new URL(originalUrl);
      url.pathname = '/postgres';
      administrator = createDatabaseClient(url.toString());
      await administrator.$executeRawUnsafe(
        `CREATE DATABASE "${databaseName}"`,
      );
      url.pathname = `/${databaseName}`;
      process.env.DATABASE_URL = url.toString();
      await promisify(execFile)(
        process.execPath,
        [
          fileURLToPath(
            new URL(
              '../../../packages/database/node_modules/prisma/build/index.js',
              import.meta.url,
            ),
          ),
          'migrate',
          'deploy',
          '--config',
          fileURLToPath(
            new URL(
              '../../../packages/database/prisma.config.ts',
              import.meta.url,
            ),
          ),
        ],
        {
          cwd: fileURLToPath(
            new URL('../../../packages/database/', import.meta.url),
          ),
          env: process.env,
        },
      );
      client = createDatabaseClient(url.toString());
      await runBootstrap(client);
      await client.user.updateMany({
        data: { status: 'ACTIVE', activatedAt: new Date() },
      });
      const users = await client.user.findMany();
      const id = (identifier: string) =>
        users.find((user) => user.loginIdentifier === identifier)!.id;
      dylan = id('dylan');
      samantha = id('samantha');
      jean = id('jean');
      luden = id('luden');
      app = await createApplication();
      await app.init();
    }, 120_000);

    afterAll(async () => {
      if (app) await app.close();
      if (client) await client.$disconnect();
      if (administrator) {
        await administrator.$executeRawUnsafe(
          `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
        );
        await administrator.$disconnect();
      }
      process.env.DATABASE_URL = originalUrl;
    });

    async function get(path: string, userId?: string) {
      const call = request(app.getHttpServer())
        .get(`/api/v1/finances/${path}`)
        .set('Host', 'localhost:3001');
      if (userId)
        call.set(
          'Cookie',
          `sgi_session=${(await app.get(SessionService).create(userId)).revealOnce()}`,
        );
      return call;
    }

    it('plans nine legacy categories without writing anything', async () => {
      const audits = await client.auditLog.count();
      const result = await prepareFinancialCatalogs(client, 'dylan');
      expect(result).toMatchObject({
        mode: 'dry-run',
        created: 0,
        unchanged: 0,
      });
      expect(result.planned).toHaveLength(9);
      expect(await client.financialCategory.count()).toBe(0);
      expect(await client.auditLog.count()).toBe(audits);
    });

    it('refuses incompatible codes before preparing any other category', async () => {
      const conflict = await client.financialCategory.create({
        data: {
          code: 'EXPENSE_PARTNER_WITHDRAWAL',
          name: 'Different meaning',
          entryType: 'INCOME',
        },
      });
      try {
        await expect(
          prepareFinancialCatalogs(client, 'dylan', true),
        ).rejects.toMatchObject({ code: 'FINANCIAL_CATALOG_CONFLICT' });
        expect(await client.financialCategory.count()).toBe(1);
        expect(
          await client.auditLog.count({
            where: { action: 'finances.category_prepared' },
          }),
        ).toBe(0);
      } finally {
        await client.financialCategory.delete({ where: { id: conflict.id } });
      }
    });

    it('prepares the legacy vocabulary once, with actor and audit, and retries safely', async () => {
      expect(
        await prepareFinancialCatalogs(client, 'dylan', true),
      ).toMatchObject({ created: 9, unchanged: 0 });
      expect(
        await prepareFinancialCatalogs(client, 'samantha', true),
      ).toMatchObject({ created: 0, unchanged: 9 });
      const categories = await client.financialCategory.findMany();
      expect(
        categories.filter((category) => category.entryType === 'EXPENSE'),
      ).toHaveLength(6);
      expect(
        categories.filter((category) => category.entryType === 'INCOME'),
      ).toHaveLength(3);
      expect(
        categories.map(({ code, name, entryType }) => ({
          code,
          name,
          entryType,
        })),
      ).toEqual(expect.arrayContaining([...legacyFinancialCategories]));
      const audits = await client.auditLog.findMany({
        where: { action: 'finances.category_prepared' },
      });
      expect(audits).toHaveLength(9);
      expect(
        audits.every(
          (audit) => audit.actorUserId === dylan && audit.afterData !== null,
        ),
      ).toBe(true);
      expect(await client.financialEntry.count()).toBe(0);
      expect(await client.inventoryMovement.count()).toBe(0);
    });

    it('does not reactivate retired categories or duplicate an existing name', async () => {
      await client.financialCategory.update({
        where: { code: 'INCOME_LOAN' },
        data: { active: false },
      });
      expect(
        (await prepareFinancialCatalogs(client, 'dylan', true)).inactive,
      ).toEqual(['INCOME_LOAN']);
      expect(
        (
          await client.financialCategory.findUniqueOrThrow({
            where: { code: 'INCOME_LOAN' },
          })
        ).active,
      ).toBe(false);
      const duplicate = await client.financialCategory.create({
        data: {
          code: 'EXISTING_PACKAGING',
          name: ' empaques ',
          entryType: 'EXPENSE',
        },
      });
      try {
        await expect(
          prepareFinancialCatalogs(client, 'dylan', true),
        ).rejects.toMatchObject({ code: 'FINANCIAL_CATALOG_CONFLICT' });
      } finally {
        await client.financialCategory.delete({ where: { id: duplicate.id } });
      }
    });

    it('rejects non-finance users and a direct denial for a finance user', async () => {
      for (const identifier of ['jean', 'luden', 'missing']) {
        await expect(
          prepareFinancialCatalogs(client, identifier, true),
        ).rejects.toMatchObject({
          code: 'FINANCIAL_CATALOG_PERMISSION_DENIED',
        });
      }
      const permission = await client.permission.findUniqueOrThrow({
        where: { code: 'finances.manual.create' },
      });
      const deny = await client.userPermission.create({
        data: { userId: samantha, permissionId: permission.id, effect: 'DENY' },
      });
      try {
        await expect(
          prepareFinancialCatalogs(client, 'samantha', true),
        ).rejects.toMatchObject({
          code: 'FINANCIAL_CATALOG_PERMISSION_DENIED',
        });
      } finally {
        await client.userPermission.update({
          where: { id: deny.id },
          data: { revokedAt: new Date() },
        });
      }
    });

    it('creates a real expense against the prepared category, without duplicate retries', async () => {
      const category = await client.financialCategory.findUniqueOrThrow({
        where: { code: 'EXPENSE_PACKAGING' },
      });
      const entries = new CreateFinancialEntryService(client);
      const key = randomUUID();
      const input = {
        categoryId: category.id,
        entryType: 'EXPENSE' as const,
        amount: '45.50',
        businessDate: '2026-10-18',
        responsibleUserId: dylan,
      };
      const first = await entries.create(dylan, key, input);
      expect(await entries.create(dylan, key, input)).toEqual(first);
      expect(first).toMatchObject({
        amount: '45.50',
        responsibleUserId: dylan,
        category: { name: 'Empaques' },
      });
      expect(await client.financialEntry.count()).toBe(1);
    });

    it('protects both catalogs by finances.read, including direct DENY', async () => {
      for (const path of ['categories', 'responsibles']) {
        expect((await get(path)).status).toBe(401);
        for (const userId of [jean, luden])
          expect((await get(path, userId)).status).toBe(403);
        expect((await get(path, samantha)).status).toBe(200);
      }
      const permission = await client.permission.findUniqueOrThrow({
        where: { code: 'finances.read' },
      });
      const deny = await client.userPermission.create({
        data: { userId: samantha, permissionId: permission.id, effect: 'DENY' },
      });
      try {
        expect((await get('responsibles', samantha)).status).toBe(403);
      } finally {
        await client.userPermission.update({
          where: { id: deny.id },
          data: { revokedAt: new Date() },
        });
      }
    });

    it('returns only active responsible names and ids, without account administration data', async () => {
      await client.user.create({
        data: {
          loginIdentifier: 'inactive-test',
          displayName: 'Hidden inactive',
        },
      });
      const response = await get('responsibles', samantha);
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(4);
      for (const user of response.body.data)
        expect(Object.keys(user).sort()).toEqual(['displayName', 'id']);
      expect(response.body.data).toContainEqual({
        id: dylan,
        displayName: 'Dylan',
      });
    });
  },
);

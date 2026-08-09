# SGI La Comarca

Sistema de Gestión Integral en migración desde Google Apps Script y Google
Sheets hacia un monolito modular con TypeScript, Next.js, NestJS, Prisma y
PostgreSQL.

- FASE 3A: modelo estructural y migración inicial — completa.
- FASE 3B: autenticación, sesiones, autorización, administración limitada y
  frontend de autenticación — completa.
- FASE 3C: perfilador reproducible del XLSX — completa.
- FASE 4: importador y reconciliación legacy — en progreso; FASE 4A dispone de
  framework y dry-run, sin importación persistente.

Consulte el
[informe canónico de FASE 3B](docs/reviews/phase-3b-completion-report.md),
[ADR-007](docs/decisions/ADR-007-phase-3b-authentication-authorization.md) y el
[runbook operativo](docs/deployment/phase-3b-auth-operations.md).

El diseño y la evidencia sanitizada de FASE 3C están en la
[guía del profiler](docs/migration/phase-3c-profiler.md) y su
[informe de cierre](docs/reviews/phase-3c-completion-report.md).

El alcance de FASE 4A se documenta en la
[guía del importer](docs/migration/phase-4-importer.md),
[ADR-008](docs/decisions/ADR-008-legacy-import-boundaries.md) y el
[informe sanitizado del dry-run](docs/reviews/phase-4-dry-run-report.md).

## Requisitos para Windows

- Windows 10/11 con WSL 2 y Docker Desktop.
- Node.js 24 LTS; `.nvmrc` fija `24.13.0`.
- Corepack y pnpm `11.18.0`.
- Git.

```powershell
node --version
pnpm --version
docker info
docker compose version
git --version
```

## Instalación y PostgreSQL

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
docker compose up -d postgres
pnpm db:validate
pnpm db:generate
pnpm db:migrate:deploy
```

Los valores de `.env.example` son solo locales. Los secretos y archivos `.env`
reales permanecen fuera de Git. PostgreSQL local usa el puerto `5433` y un
volumen persistente; no ejecute `docker compose down --volumes` salvo que quiera
eliminar deliberadamente sus datos locales.

Las migraciones no ejecutan bootstrap ni importaciones. Revise siempre el SQL y
disponga de un backup antes de aplicar cambios de esquema.

## Bootstrap y administración local

El bootstrap es manual, transaccional e idempotente. Crea la matriz aprobada de
Dylan, Samantha, Jean y Luden, pero no contraseñas, sesiones o invitaciones:

```powershell
pnpm db:bootstrap
```

Las CLI de identidad requieren TTY, confirmación y acceso directo al ambiente:

```powershell
pnpm auth:bootstrap-admin-invitation
pnpm auth:recover-admin
```

Nunca pase secretos como argumentos ni almacene los tokens mostrados. Revise el
runbook operativo antes de ejecutar cualquiera de estas CLI.

## Desarrollo

Con PostgreSQL saludable:

```powershell
pnpm dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:3001/api/v1`
- Health: `http://localhost:3001/api/v1/health`
- Readiness: `http://localhost:3001/api/v1/ready`

Páginas de autenticación disponibles:

- `/activate`
- `/login`
- `/app`
- `/account/change-password`
- `/unauthorized`
- `/session-expired`

Swagger y `/api/docs` no están montados. `SWAGGER_ENABLED` permanece reservado
e inerte hasta que se apruebe una puerta autenticada.

## Seguridad de autenticación

La API usa sesiones opacas revocables en cookie `HttpOnly`, CSRF, validación
estricta de Host/Origin y autorización por permisos efectivos de PostgreSQL.
No usa JWT, `localStorage` ni `sessionStorage` para autenticación. Las rutas son
privadas por defecto; solo health, ready, activación y login son públicas.

## Validaciones

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

El cierre de FASE 3B registra 47 pruebas unitarias, 85 de integración y 11 E2E
en Chromium. Integración y E2E requieren PostgreSQL activo y crean únicamente
bases temporales descartables.

Para formatear de manera intencional use `pnpm format`. No instale herramientas
globalmente ni cambie el lockfile fuera de una actualización aprobada.

## Perfilado legacy de solo lectura

El perfilador no importa datos ni se conecta a PostgreSQL. Produce evidencia
privada ignorada por Git:

```powershell
pnpm profile:legacy -- `
  --input legacy/private/datos-inventario.xlsx `
  --source-code legacy-inventory-xlsx `
  --output reports/private/profiling
```

No copie el XLSX ni los reportes privados a rutas versionadas. FASE 4 debe
verificar el manifest determinista antes de consumir esa evidencia.

## Importer legacy en dry-run

FASE 4A solo permite PostgreSQL temporal y rechaza cualquier opción de commit:

```powershell
pnpm import:legacy -- --dry-run `
  --input legacy/private/datos-inventario.xlsx `
  --source-code legacy-inventory-xlsx `
  --profile-dir reports/private/profiling/legacy-inventory-xlsx/<SOURCE_SHA256> `
  --mapping-file packages/legacy-importer/config/legacy-inventory-xlsx.mapping.json `
  --report-dir reports/private/importing
```

Los reportes son privados. **PERSISTENT IMPORT NOT AUTHORIZED.**

## Solución de problemas

Si Docker no responde, confirme Docker Desktop/WSL 2 antes de reiniciar el
entorno. Si el puerto `5433` está ocupado, ajuste `POSTGRES_PORT` y
`DATABASE_URL` de forma coordinada. Para problemas de readiness revise:

```powershell
docker compose ps
docker compose logs postgres --tail 50
```

No imprima `DATABASE_URL` ni secretos en logs de diagnóstico.

# SGI La Comarca

Sistema de Gestión Integral en migración desde Google Apps Script y Google
Sheets hacia un monolito modular con TypeScript, Next.js, NestJS, Prisma y
PostgreSQL.

Estado: monolito modular desplegado como **piloto de staging** (Render + Neon,
ver [ADR-013](docs/decisions/ADR-013-free-staging-pilot.md)); todavía no hay
producción. El repositorio es público: nunca incluya credenciales, datos
privados ni IDs privados en un commit.

| Fase      | Estado                                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3A–3C     | Modelo estructural, autenticación/autorización y perfilador XLSX — completas.                                                                                                                                       |
| 4         | Importador legacy — Waves 1–2 importadas y verificadas en staging; Waves 3+ no han iniciado y siguen bloqueadas por decisiones abiertas.                                                                            |
| 5A–5C     | Read model, UI y ajustes transaccionales de inventario — completas.                                                                                                                                                 |
| 6         | Movimientos y transferencias atómicas e idempotentes — completa.                                                                                                                                                    |
| 7         | Ventas (esquema, API y UI): crear, confirmar en tránsito y cancelar — completa.                                                                                                                                     |
| 8         | Finanzas manuales y cierres diarios — completa.                                                                                                                                                                     |
| 9         | Conteo físico, reportes con CSV y analytics — completa.                                                                                                                                                             |
| 10        | Unificación de UI (responsive, dark mode, accesibilidad) — implementada; aceptación formal pendiente.                                                                                                               |
| Operativo | Entradas de mercancía, ficha de productos, importador del libro de conteo, panel de administración, enlace Alexa de solo lectura y llaves de integración de solo lectura para Marketplace — desplegados en staging. |
| 11+       | Hardening, rehearsal y cutover — pendientes.                                                                                                                                                                        |

Cada escritura operativa real en staging (primer conteo formal, primera venta,
primera entrada financiera, primer cierre, etc.) es un gate independiente; ver
[NEXT_PHASE](docs/handoff/NEXT_PHASE.md). El avance por fases está en el
[roadmap](docs/migration/phased-roadmap.md).

Consulte el
[informe canónico de FASE 3B](docs/reviews/phase-3b-completion-report.md),
[ADR-007](docs/decisions/ADR-007-phase-3b-authentication-authorization.md) y el
[runbook operativo](docs/deployment/phase-3b-auth-operations.md).

El diseño y la evidencia sanitizada de FASE 3C están en la
[guía del profiler](docs/migration/phase-3c-profiler.md) y su
[informe de cierre](docs/reviews/phase-3c-completion-report.md).

El alcance de FASE 4A se documenta en la
[guía del importer](docs/migration/phase-4-importer.md),
[ADR-008](docs/decisions/ADR-008-legacy-import-boundaries.md), el
[informe de readiness del commit](docs/reviews/phase-4-commit-readiness.md) y el
[informe sanitizado del dry-run](docs/reviews/phase-4-dry-run-report.md).

El estado operativo y el próximo gate se mantienen en
[CURRENT_STATE](docs/handoff/CURRENT_STATE.md) y
[NEXT_PHASE](docs/handoff/NEXT_PHASE.md).

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

Los valores de `.env.example` son solo locales. Las integraciones
(`ALEXA_INTEGRATION_ENABLED`, `INTEGRATION_KEYS_ENABLED`) están apagadas por
defecto, y `CLOSING_TOLERANCE` / `CLOSING_REOPENING_WINDOW_DAYS` configuran las
reglas de cierre diario (ADR-010). Los secretos y archivos `.env`
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

Páginas públicas: `/login`, `/activate`, `/session-expired`, `/unauthorized` y
`/alexa/link` (consentimiento OAuth de Alexa).

Páginas privadas (cada una exige sesión; los controles se muestran según los
permisos efectivos y la API es siempre la autoridad):

| Área           | Rutas                                                                                                                                                                    | Permiso principal                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Cuenta         | `/app`, `/account`, `/account/change-password`                                                                                                                           | sesión                                                                                                          |
| Productos      | `/products`, `/products/new`, `/products/:id`, `/products/:id/edit`, `/products/import`                                                                                  | `inventory.read`; edición/importación con `products.manage`                                                     |
| Inventario     | `/inventory`, `/inventory/movements`, `/inventory/adjustments/new`, `/inventory/receipts`, `/inventory/receipts/new`, `/inventory/receipts/:id`, `/inventory/valuations` | `inventory.read`; `inventory.adjust`, `stock-receipts.create`, `inventory.valuation.manage`                     |
| Conteo físico  | `/inventory/counts`, `/inventory/counts/:id`                                                                                                                             | `inventory.audit.create` / `inventory.audit.approve`                                                            |
| Ventas         | `/sales`, `/sales/:id`                                                                                                                                                   | `sales.read`; `sales.create`, `sales.confirm_in_transit`, `sales.cancel`                                        |
| Finanzas       | `/finances`, `/closings`, `/closings/:id`                                                                                                                                | `finances.read`, `closings.read`; `finances.manual.create`, `closings.create`, `closings.reopen`                |
| Reportes       | `/reports`, `/analytics`                                                                                                                                                 | `reports.read`, `analytics.read` más el permiso de lectura del dominio                                          |
| Administración | `/settings`, `/settings/integrations`                                                                                                                                    | `users.read`; `users.roles.manage` y `users.status.manage` para editar accesos (ADR-020); `integrations.manage` |

Ajustes, transferencias, entradas, ventas, finanzas y conteos actualizan
balances, ledger inmutable y auditoría dentro de una transacción, con
idempotencia persistente. Los 1069 movimientos legacy, incluidas sus 25
transferencias clasificadas, todavía no han sido importados. El catálogo
completo de endpoints está en
[api-conventions](docs/architecture/api-conventions.md) y la matriz de permisos
en [authorization-matrix](docs/architecture/authorization-matrix.md).

Swagger y `/api/docs` no están montados. `SWAGGER_ENABLED` permanece reservado
e inerte hasta que se apruebe una puerta autenticada.

## Seguridad de autenticación

La API usa sesiones opacas revocables en cookie `HttpOnly`, CSRF, validación
estricta de Host/Origin y autorización por permisos efectivos de PostgreSQL.
No usa JWT, `localStorage` ni `sessionStorage` para autenticación. Las rutas son
privadas por defecto; solo health, ready, activación, login y el intercambio
OAuth servidor-a-servidor de Alexa (`POST /api/v1/alexa/oauth/token`, ADR-016)
son públicas. Las llaves de integración de solo lectura (ADR-017) solo
autorizan `GET /api/v1/integrations/catalog`.

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

El último baseline verde completo (2026-09-17, checkout aislado) registra
formato, lint 9/9, typecheck 13/13, 291 pruebas unitarias, 349 de integración
PostgreSQL, build 8/8, validación Prisma y 54/54 E2E Chromium. Los detalles y su
evidencia están en
[CURRENT_STATE](docs/handoff/CURRENT_STATE.md#last-green-baseline); no
reutilice cifras de fases anteriores. Integración y E2E requieren PostgreSQL
activo y crean únicamente bases temporales descartables. CI
(`.github/workflows/ci.yml`) ejecuta las validaciones en cada PR y en `main`.

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

Los reportes son privados. Waves 1–2 preservaron 2,064/2,064 filas e importaron
en staging 14 Units, 144 Products, 357 balances y 357 valoraciones. Waves 3+
continúan sin iniciar.

## Solución de problemas

Si Docker no responde, confirme Docker Desktop/WSL 2 antes de reiniciar el
entorno. Si el puerto `5433` está ocupado, ajuste `POSTGRES_PORT` y
`DATABASE_URL` de forma coordinada. Para problemas de readiness revise:

```powershell
docker compose ps
docker compose logs postgres --tail 50
```

No imprima `DATABASE_URL` ni secretos en logs de diagnóstico.

# SGI La Comarca

Sistema de Gestión Integral en migración desde Google Apps Script y Google
Sheets hacia un monolito modular con TypeScript, Next.js, NestJS, Prisma y
PostgreSQL.

- FASE 3A: modelo estructural y migración inicial — completa.
- FASE 3B: autenticación, sesiones, autorización, administración limitada y
  frontend de autenticación — completa.
- FASE 3C: perfilador reproducible del XLSX — completa.
- FASE 4: importador y reconciliación legacy — Waves 1–2 fueron importadas y
  verificadas en staging; Waves 3+ no han iniciado.
- FASE 5A/5B: read model, API y UI de productos e inventario — completas.
- FASE 5C: ajustes manuales de inventario transaccionales y auditados.
- FASE 6: fundamento, API e interfaz de movimientos y transferencias — completa;
  la primera transferencia controlada en staging pasó y la regresión de sesión
  concurrente posterior quedó corregida y validada.
- FASE 7: ventas — siguiente fase definida, todavía no iniciada ni autorizada;
  su siguiente puerta es exclusivamente de planificación.

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

Vistas operativas disponibles para sesiones con `inventory.read`:

- `/products`
- `/products/:id`
- `/inventory`
- `/inventory/movements`

La API sigue siendo la autoridad de autorización. En `/inventory`, los usuarios
con `inventory.adjust` pueden registrar un delta firmado y un motivo obligatorio.
Quienes poseen `transfers.create` pueden transferir stock con preview e
idempotencia persistente. Ajustes y transferencias actualizan balances, ledger y
auditoría dentro de una transacción. Los 1069 movimientos legacy, incluidas sus
25 transferencias clasificadas, todavía no han sido importados.

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

El baseline de cierre de FASE 6, posterior al fix de concurrencia, registra 125
pruebas unitarias, 149 de integración/concurrencia y 17 E2E Chromium; format,
lint, typecheck, Prisma validate y build pasaron.

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

# FASE 8B — Reporte de cierre de la capa de aplicación

Estado: `PHASE_8B_COMPLETE`.

Este documento cierra 8B.1 a 8B.5: contratos y dominio puro, lectura, asiento
manual, cierres y reapertura, y la verificación final de cierre. No autoriza
UI (FASE 8C), despliegue a staging, importación legacy ni ninguna escritura
operacional real.

## 1. Bloques implementados

| Bloque | Commit | Contenido |
| --- | --- | --- |
| 8A | `c1d7d23` | Esquema: categorías, asientos, cierres y reaperturas. |
| 8B.1 | `3737e6b` | Contratos, cálculo de cierre, canonicalización, errores tipados. |
| 8B.2 | `800d6a9` | `GET /api/v1/finances`, `/finances/totals`, `/finances/categories`, `GET /api/v1/closings`, `/closings/:id`. |
| 8B.3 y 8B.4 | `3d3f4b1` | `POST /api/v1/finances`, `POST /api/v1/closings`, `POST /api/v1/closings/:id/reopen`; resolución de DEC-025. |
| fix | `a0b9cf6` | Lectura de cierre a través de la propia transacción. |
| verificación 8B.3/8B.4 | `5dfe833`, `65d243c` | 25 archivos / 244 pruebas de integración. |
| 8B.5 | este commit | Cierre: OpenAPI en memoria, revisión de seguridad, línea base completa, regresión E2E. |

## 2. Superficie HTTP resultante

| Método y ruta | Permiso | Idempotencia |
| --- | --- | --- |
| `GET /api/v1/finances` | `finances.read` | No |
| `GET /api/v1/finances/totals` | `finances.read` | No |
| `GET /api/v1/finances/categories` | `finances.read` | No |
| `POST /api/v1/finances` | `finances.manual.create` | `Idempotency-Key` obligatoria |
| `GET /api/v1/closings` | `closings.read` | No |
| `GET /api/v1/closings/:id` | `closings.read` | No |
| `POST /api/v1/closings` | `closings.create` | Obligatoria |
| `POST /api/v1/closings/:id/reopen` | `closings.reopen` | Obligatoria |

Los cinco permisos ya existían en el manifest desde antes de FASE 8; ninguno se
agregó. Todas las rutas son privadas.

## 3. Garantías implementadas

- Un asiento persistido es siempre manual; el ingreso de ventas se deriva al
  leer y nunca se materializa (DEC-022). Imposible duplicarlo por
  construcción.
- La fórmula del cierre (`efectivo + digital − ventas`, sin gastos) está
  grabada como CHECK en la base, no solo en el servicio (DEC-023).
- `balanced` se verifica contra la tolerancia registrada en el propio cierre,
  configurable y con default legacy 0.50 (DEC-024).
- Un cierre reporta las ventas en tránsito de la fecha sin tocarlas: no crea
  movimiento de inventario ni cancela nada (DEC-019). Verificado explícitamente
  contra PostgreSQL: estado, pago, `completedAt`, conteo de movimientos y
  `version`/cantidad del balance permanecen inalterados.
- Reapertura resuelta (DEC-025): ventana configurable en días desde la fecha
  de negocio, cierres posteriores no bloquean, un cierre reabierto no vuelve a
  cerrarse. El documento de reapertura se inserta antes del cambio de estado
  porque el trigger lo exige.
- Historial financiero y de cierres inmutable: la base rechaza `UPDATE`/`DELETE`
  sobre asientos y cierres ya escritos.
- Idempotencia por actor en las tres mutaciones; solo se persisten hashes.

## 4. Verificación de cierre (8B.5)

Ejecutada directamente en esta sesión contra el destino verificado
positivamente: contenedor `sgi-comarca-postgres-1`, `postgres:18.4-alpine`,
saludable, `localhost:5433`, `sgi_comarca_dev` / `sgi_dev`.

- `pnpm lint`: 8/8 tareas.
- `pnpm typecheck`: 7/7 tareas.
- `pnpm test`: 55 archivos / 194 pruebas.
- `pnpm test:integration`: 25 archivos / 244 pruebas.
- `pnpm build`: 7/7 tareas.
- `pnpm format:check`: limpio.
- `pnpm db:validate`: esquema Prisma válido.
- OpenAPI generado sólo en memoria (`SwaggerModule.createDocument`, nunca
  `SwaggerModule.setup`, ninguna ruta montada): 36 paths totales, 6 de
  finanzas/cierres, todos bajo `/api/v1` y ninguno público. Script temporal,
  no commiteado.
- Revisión de seguridad manual: RBAC exacto por ruta; SQL crudo con texto
  constante y valores de usuario solo como parámetros posicionales `$n`, sin
  interpolación; auditoría sin claves de idempotencia ni datos privados; DTOs
  con whitelist estricta (`forbidNonWhitelisted`); sin hallazgos críticos o
  altos.
- `pnpm test:e2e`: 24/24 Chromium. Un `next dev` huérfano de una sesión previa
  ocupaba el puerto 3000; se verificó su línea de comandos (proceso `next`
  del propio repo, sin relación con datos) antes de terminarlo. `next-env.d.ts`
  volvió a modificarse automáticamente y se restauró a su versión commiteada.
- Comprobación read-only de la base local de staging: última migración
  `20260820170000_phase_6a_transfer_foundation`, sin tablas de FASE 8A,
  `sales`/`sale_items` presentes desde FASE 3A con 0 filas, conteos
  históricos (`products` 144, `inventory_balances` 357, `inventory_movements`
  3, `inventory_transfers` 1, `import_batches` 1) sin cambios. Ninguna
  escritura.

Ningún constraint, trigger, esquema, migración ni permiso se modificó en este
bloque.

## 5. Estado

- `PHASE_7A_SCHEMA_COMPLETE`, `PHASE_7B_COMPLETE`, `PHASE_7C_COMPLETE`;
- `PHASE_8A_SCHEMA_COMPLETE`;
- `PHASE_8B_COMPLETE`;
- `PHASE_8C_NOT_STARTED`;
- `STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`;
- `FIRST_STAGING_SALE_NOT_AUTHORIZED`;
- `WAVES_3_PLUS_NOT_STARTED`.

Cerrar 8B cierra la implementación versionada de la capa de aplicación y API
de finanzas y cierres. No autoriza UI, staging, importación legacy ni ninguna
escritura operacional real. El siguiente bloque es FASE 8C (UI), sujeto a su
propia verificación.

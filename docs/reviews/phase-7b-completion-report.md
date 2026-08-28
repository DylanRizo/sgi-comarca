# FASE 7B — Reporte de implementación de la capa de ventas

Estado: `PHASE_7B_IMPLEMENTED_VERIFICATION_INCOMPLETE`.

Este documento registra lo implementado por los bloques 7B.1 a 7B.4 y, con la
misma claridad, la verificación que **no** pudo ejecutarse. No declara
`PHASE_7B_COMPLETION_CANDIDATE`, no autoriza UI, importación legacy, migración a
staging ni ninguna venta real.

## 1. Bloques implementados

| Bloque | Commit | Contenido |
| --- | --- | --- |
| 7B.1 | `4e52f09` | Contratos, DTO mínimo, dinero en enteros escalados, reparto de envío, canonicalización, errores tipados. |
| 7B.2 | `c3c7cee` | `GET /api/v1/sales` y `GET /api/v1/sales/:id` con `sales.read`. |
| 7B.3 | `9cdd454` | `POST /api/v1/sales` transaccional con `sales.create`. |
| 7B.4 | `9059af2` | Confirmación en tránsito y cancelación total. |

Documentación previa: [plan](phase-7b-sales-application-plan.md) y
[ADR-009](../decisions/ADR-009-sales-pricing-cost.md), commiteados en `4da66db`;
autorización del gate 7B.1 en `b784ef4`.

## 2. Superficie HTTP resultante

| Método y ruta | Permiso | Idempotencia |
| --- | --- | --- |
| `GET /api/v1/sales` | `sales.read` | No |
| `GET /api/v1/sales/:id` | `sales.read` | No |
| `POST /api/v1/sales` | `sales.create` | `Idempotency-Key` obligatoria |
| `POST /api/v1/sales/:id/confirm-in-transit` | `sales.confirm_in_transit` | Obligatoria |
| `POST /api/v1/sales/:id/cancel` | `sales.cancel` | Obligatoria |

Todas son privadas. No se añadió ninguna ruta pública ni permiso nuevo; los
cuatro permisos ya existían en el manifest versionado desde FASE 7A.

## 3. Garantías implementadas

- `origin = OPERATIONAL`, `paymentStatus = PENDING`, moneda y creador los fija
  el servidor; `saleNumber` se omite del INSERT para que PostgreSQL lo genere.
- Precio y costo se leen de la fila única y bloqueada de `InventoryBalance`
  (ADR-009). `NULL` de costo rechaza; cero es válido y se conserva. El override
  de precio se persiste y se audita con referencia y valor aplicado.
- `ProductWarehouseValuation` no se consulta ni se escribe.
- Todo el dinero se recalcula en el servidor con enteros escalados; el residuo
  del envío se reparte por ordinal validado y suma exactamente.
- Locks en el orden global `(product_id, warehouse_id)` definido por
  `transaction-design.md`; creación y cancelación usan el mismo orden.
- Idempotencia por actor con advisory lock; sólo se persisten el hash de la
  clave y el hash canónico del request.
- Una línea, un movimiento `SALE` coherente; una cancelación, un
  `SALE_CANCELLATION` coherente por línea.
- Confirmación no toca inventario ni pago; inserta el documento antes del
  UPDATE porque `guard_sale_write()` lo exige.
- `unitCostSnapshot` nunca se selecciona ni se emite en respuestas de lectura.

## 4. Verificación ejecutada

En esta sesión, sobre el monorepo completo:

- `pnpm lint`: 8/8 tareas.
- `pnpm typecheck`: 7/7 tareas.
- `pnpm build`: 7/7 tareas.
- `pnpm test` (unitarias): 51 archivos / 161 pruebas.
- Prettier aplicado a todos los archivos nuevos.

## 5. Verificación NO ejecutada — bloqueante para cerrar 7B

Las siguientes pruebas fueron **escritas pero nunca ejecutadas**:

- `apps/api/test/sales-creation.integration.spec.ts`;
- `apps/api/test/sales-lifecycle.integration.spec.ts`.

Motivo: el arnés de integración exige la base PostgreSQL de desarrollo en el
puerto 5433 provista por Docker Compose. En esta sesión Docker no estaba
disponible. El puerto 5432 tenía un servicio escuchando, pero apuntar las
pruebas a una base no verificada habría violado la verificación positiva de
destino exigida por `AGENTS.md`, así que no se intentó.

Tampoco se ejecutó la regresión E2E Playwright.

Consecuencias, explícitas:

- el código de 7B **no está validado contra PostgreSQL real**;
- los triggers y constraints de FASE 7A no fueron ejercitados por esta
  implementación;
- las pruebas de concurrencia previstas en el plan §14 no existen todavía;
- por lo tanto **no se declara `PHASE_7B_COMPLETION_CANDIDATE`**.

## 6. Trabajo pendiente antes de cerrar FASE 7B

1. Ejecutar en una sesión con Docker: `pnpm test:integration`, corrigiendo lo
   que las dos suites nuevas revelen.
2. Añadir las pruebas de concurrencia del plan §14: dos ventas sobre el mismo
   par, venta + ajuste, venta + transferencia, ventas cruzadas en orden
   inverso, confirmación + cancelación simultáneas, doble confirmación, doble
   cancelación y misma clave concurrente.
3. Ejecutar la línea base E2E como regresión.
4. Generar OpenAPI interno y revisión de seguridad.
5. Sólo entonces evaluar `PHASE_7B_COMPLETION_CANDIDATE`.

## 7. Estado

- `PHASE_7A_SCHEMA_COMPLETE`;
- `PHASE_7B_IMPLEMENTED_VERIFICATION_INCOMPLETE`;
- `PHASE_7B_COMPLETION_CANDIDATE_NOT_DECLARED`;
- `STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`;
- `FIRST_STAGING_SALE_NOT_AUTHORIZED`;
- `WAVES_3_PLUS_NOT_STARTED`.

Ninguna venta real fue creada, confirmada ni cancelada. Staging no fue tocado
ni revalidado durante FASE 7B.

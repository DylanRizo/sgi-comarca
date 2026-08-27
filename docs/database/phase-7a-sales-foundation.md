# FASE 7A — fundamento persistente de ventas

## Alcance

FASE 7A prepara la persistencia y autorización mínima para ventas operacionales.
La migración versionada `20260826232758_phase_7a_sales_foundation` endurece el
esquema existente de ventas; el cambio de bootstrap asociado agrega
`sales.read`. No implementa servicios, endpoints, UI, importación legacy ni una
venta real. Tampoco aplica la migración o el bootstrap a staging.

Las reglas estructurales se verificaron contra el SQL versionado, no contra el
plan histórico. Las reglas transaccionales futuras se describen en
[transaction-design.md](../architecture/transaction-design.md), y las decisiones
de origen, numeración, cumplimiento/pago y cancelación están resumidas en
[APPROVED_DECISIONS.md](../handoff/APPROVED_DECISIONS.md).

## Persistencia añadida

- `sale_origin` contiene exactamente `OPERATIONAL` y `LEGACY_IMPORT`.
  `sales.origin` es `NOT NULL` y deliberadamente no tiene default: todo escritor
  debe declarar el origen.
- `sales.created_by_user_id` es nullable físicamente para no inventar un actor
  legacy. Las ventas `OPERATIONAL` lo requieren mediante CHECK. Su FK a
  `users.id` usa `ON DELETE RESTRICT ON UPDATE RESTRICT`.
- `sales`, `sale_cancellations` e `in_transit_confirmations` reciben
  `idempotency_key_hash CHAR(64)` y `request_hash CHAR(64)`. En las tres tablas
  son físicamente nullable para compatibilidad con `LEGACY_IMPORT`; las reglas
  operacionales exigen ambos.
- La relación Prisma inversa `User.salesCreated` queda separada de
  `Sale.seller`: creador autenticado y vendedor son conceptos distintos.

## Numeración operacional

`operational_sale_number_seq` es una secuencia `BIGINT` con `START 1`,
`INCREMENT 1`, `MINVALUE 1`, `MAXVALUE 999999999`, `CACHE 1` y `NO CYCLE`. Está
asociada mediante `OWNED BY` a `sales.sale_number`. El default de la columna
produce `VTA-` más nueve dígitos con `lpad`, por ejemplo `VTA-000000001`.

`sales_operational_number_format` exige `^VTA-[0-9]{9}$` cuando
`origin = OPERATIONAL`; se conserva además la unicidad previa de
`sale_number`. Un cliente operacional nunca proporciona ese valor y ningún
escritor puede usar `MAX + 1`. `nextval` no es transaccional: los huecos se
aceptan y no se reutilizan. Un importador futuro deberá proporcionar
explícitamente su `saleNumber` legacy y no controlar ni consumir
deliberadamente la secuencia operacional.

## Constraints añadidos

La migración agrega los siguientes constraints con nombre estable:

| Tabla | Constraint | Garantía |
| --- | --- | --- |
| `sales` | `sales_created_by_user_id_fkey` | El creador referencia `users.id`; delete y update son `RESTRICT`. |
| `sales` | `sales_idempotency_hash_pair` | Los dos hashes son ambos nulos o ambos presentes. |
| `sales` | `sales_idempotency_hash_format` | El hash de clave, si existe, tiene 64 caracteres hexadecimales minúsculos. |
| `sales` | `sales_request_hash_format` | El hash canónico de request, si existe, tiene el mismo formato. |
| `sales` | `sales_money_nonnegative` | `shipping_amount`, `subtotal` y `total` son no negativos. |
| `sales` | `sales_operational_number_format` | El número operacional cumple `VTA-` más nueve dígitos. |
| `sales` | `sales_operational_persisted_shape` | Una venta operacional tiene creador y hashes, excluye estados desconocidos y mantiene la forma coherente de `status`, `payment_status` y `completed_at`. |
| `sale_items` | `sale_items_snapshot_money_nonnegative` | Precio/costo presentes, subtotal de línea y asignación de envío son no negativos. |
| `sale_cancellations` | `sale_cancellations_idempotency_hash_pair` | Los hashes de cancelación son ambos nulos o ambos presentes. |
| `sale_cancellations` | `sale_cancellations_idempotency_hash_format` | El hash de clave de cancelación, si existe, tiene formato hexadecimal de 64 caracteres. |
| `sale_cancellations` | `sale_cancellations_request_hash_format` | El request hash de cancelación, si existe, tiene ese formato. |
| `in_transit_confirmations` | `in_transit_confirmations_idempotency_hash_pair` | Los hashes de confirmación son ambos nulos o ambos presentes. |
| `in_transit_confirmations` | `in_transit_confirmations_idempotency_hash_format` | El hash de clave de confirmación, si existe, tiene formato hexadecimal de 64 caracteres. |
| `in_transit_confirmations` | `in_transit_confirmations_request_hash_format` | El request hash de confirmación, si existe, tiene ese formato. |

`sales_operational_persisted_shape` no autoriza estados iniciales adicionales.
El guard de inserción descrito abajo restringe una venta operacional nueva a
`IN_TRANSIT + PENDING` o `COMPLETED + PENDING`.

## Índices añadidos

| Índice | Tipo y alcance | Propósito |
| --- | --- | --- |
| `sales_creator_idempotency_key` | UNIQUE `(created_by_user_id, idempotency_key_hash)` | Claim de creación por actor. |
| `sale_cancellations_actor_idempotency_key` | UNIQUE `(cancelled_by_user_id, idempotency_key_hash)` | Claim de cancelación por actor. |
| `in_transit_confirmations_actor_idempotency_key` | UNIQUE `(confirmed_by_user_id, idempotency_key_hash)` | Claim de confirmación por actor. |
| `inventory_movements_sale_item_sale_key` | UNIQUE parcial sobre `sale_item_id WHERE type = 'SALE'` | Como máximo un movimiento `SALE` por línea. |
| `inventory_movements_sale_item_cancellation_key` | UNIQUE parcial sobre `sale_item_id WHERE type = 'SALE_CANCELLATION'` | Como máximo un movimiento de reposición por línea. |

Los índices parciales aportan la barrera de unicidad inmediata. Los triggers
diferidos completan la garantía de existencia y coherencia al commit.

## Funciones añadidas

| Función | Propósito real en el SQL |
| --- | --- |
| `guard_sale_write()` | Valida la forma inicial operacional; protege campos estables; congela el lifecycle legacy; limita las transiciones operacionales de cumplimiento, pago y `completed_at`. |
| `guard_sale_item_insert()` | Exige snapshots de precio y costo presentes para cada línea operacional. |
| `guard_sale_action_insert()` | Bloquea la venta con `FOR UPDATE`; exige hashes operacionales; limita confirmación/cancelación a `IN_TRANSIT + PENDING`; rechaza motivo de cancelación operacional vacío. |
| `enforce_operational_sale_has_items()` | Al final de la transacción rechaza una venta operacional sin líneas. |
| `check_operational_sale_item_ledger(uuid)` | Cuenta y compara los movimientos de una línea operacional con producto, almacén, cantidad y actor esperados. |
| `enforce_operational_sale_item_ledger()` | Enruta la validación de ledger desde inserciones de línea, movimiento o cancelación. |
| `enforce_operational_sale_documents()` | Comprueba al commit la coherencia entre estado final, `completed_at`, confirmación y cancelación. |

La migración reutiliza `prevent_immutable_row_change()`, creada anteriormente;
no la redefine. Esa función impide update/delete en filas históricas según los
triggers siguientes.

## Triggers añadidos

| Trigger | Momento/tabla | Función y propósito |
| --- | --- | --- |
| `sales_write_guard` | `BEFORE INSERT OR UPDATE` en `sales` | Ejecuta `guard_sale_write()`. |
| `sales_immutable_delete` | `BEFORE DELETE` en `sales` | Impide borrar encabezados. |
| `sale_items_operational_guard` | `BEFORE INSERT` en `sale_items` | Exige snapshots operacionales. |
| `sale_items_immutable` | `BEFORE UPDATE OR DELETE` en `sale_items` | Mantiene líneas append-only. |
| `sale_cancellations_operational_guard` | `BEFORE INSERT` en `sale_cancellations` | Valida estado, hashes y motivo. |
| `in_transit_confirmations_operational_guard` | `BEFORE INSERT` en `in_transit_confirmations` | Valida estado y hashes. |
| `sale_cancellations_immutable` | `BEFORE UPDATE OR DELETE` en `sale_cancellations` | Mantiene cancelaciones inmutables. |
| `in_transit_confirmations_immutable` | `BEFORE UPDATE OR DELETE` en `in_transit_confirmations` | Mantiene confirmaciones inmutables. |
| `sales_operational_requires_item` | Constraint trigger `AFTER INSERT`, diferido, en `sales` | Exige al menos una línea operacional al commit. |
| `sale_items_operational_ledger` | Constraint trigger `AFTER INSERT`, diferido, en `sale_items` | Valida el ledger desde la línea. |
| `inventory_movements_operational_sale_ledger` | Constraint trigger `AFTER INSERT`, diferido, en `inventory_movements` | Valida el ledger desde cada movimiento. |
| `sale_cancellations_operational_ledger` | Constraint trigger `AFTER INSERT`, diferido, en `sale_cancellations` | Revalida todas las líneas al cancelar. |
| `sales_operational_documents` | Constraint trigger `AFTER INSERT OR UPDATE`, diferido, en `sales` | Valida el estado/documentos al commit. |
| `sale_cancellations_operational_documents` | Constraint trigger `AFTER INSERT`, diferido, en `sale_cancellations` | Revalida estado y documentos al cancelar. |
| `in_transit_confirmations_operational_documents` | Constraint trigger `AFTER INSERT`, diferido, en `in_transit_confirmations` | Revalida estado y documentos al confirmar. |

Todos los constraint triggers listados son `DEFERRABLE INITIALLY DEFERRED`, de
modo que evalúan el resultado completo de la transacción y no un estado
intermedio legítimamente incompleto.

## Lifecycle protegido

Para `OPERATIONAL`, el esquema permite estas formas y transiciones:

| Caso | Estado final y documentos | Efecto de inventario exigido por ledger |
| --- | --- | --- |
| Creación en tránsito | `IN_TRANSIT + PENDING`, `completed_at = NULL`, sin confirmación ni cancelación | Un `SALE` coherente por línea. |
| Creación completada directamente | `COMPLETED + PENDING`, `completed_at` presente, sin confirmación ni cancelación | Un `SALE` coherente por línea. |
| Confirmación | `IN_TRANSIT → COMPLETED`; una confirmación y `completed_at = confirmed_at`; pago sin cambios | No legitima otro movimiento; permanece el único `SALE` por línea. |
| Cancelación | `IN_TRANSIT + PENDING → CANCELLED`; una cancelación, sin confirmación y `completed_at = NULL` | Un `SALE_CANCELLATION` coherente por línea. |

Una transición de cumplimiento debe conservar `payment_status`. Sin cambiar
`status`, el SQL solo permite la transición de pago `PENDING → PAID` cuando la
venta ya está `COMPLETED`; la implementación de ese flujo financiero no
pertenece a 7A ni 7B. `COMPLETED` y `CANCELLED` son terminales respecto del
cumplimiento. Para `LEGACY_IMPORT`, `status`, `payment_status` y `completed_at`
son inmutables después de insertar; 7A no inventa su interpretación histórica.

## Coherencia del ledger

Cada `SaleItem` operacional debe tener exactamente un `InventoryMovement` de
tipo `SALE` con el mismo producto y almacén, delta igual a `-quantity` y actor
igual a `Sale.createdByUserId`. No puede enlazar movimientos de otro tipo.

Sin cancelación debe haber cero movimientos `SALE_CANCELLATION`. Con una
cancelación debe existir exactamente uno por línea, con el mismo producto y
almacén, delta igual a `+quantity` y actor igual a
`SaleCancellation.cancelledByUserId`. Las unicidades parciales evitan
duplicados y los triggers diferidos exigen completitud y coherencia.

Estas garantías no sintetizan ni exigen movimientos históricos para
`LEGACY_IMPORT`. La excepción de completitud legacy no permite editar historia:
líneas, cancelaciones, confirmaciones y movimientos siguen siendo inmutables.

## Dinero y snapshots

- En el encabezado, `shipping_amount`, `subtotal` y `total` son no negativos.
- En las líneas, `line_subtotal` y `shipping_allocation` son no negativos.
- `unit_price_snapshot` y `unit_cost_snapshot`, cuando existen, son no
  negativos.
- Para `OPERATIONAL`, ambos snapshots son obligatorios; para `LEGACY_IMPORT`
  pueden ser nulos para preservar ausencia de evidencia.

FASE 7A no impone una suma de `shipping_allocation`, no recalcula totales entre
filas y no decide la fuente operacional de precio/costo. Cálculo canónico,
selección de la fuente vigente y validación transaccional pertenecen al gate de
planificación de 7B.

## Idempotencia por actor

El alcance único es actor + operación + hash de clave:

- creación: `(created_by_user_id, idempotency_key_hash)` en `sales`;
- cancelación: `(cancelled_by_user_id, idempotency_key_hash)` en
  `sale_cancellations`;
- confirmación: `(confirmed_by_user_id, idempotency_key_hash)` en
  `in_transit_confirmations`.

Se persisten exactamente el actor ya propio del documento, el SHA-256
hexadecimal minúsculo de la clave y el SHA-256 de una representación canónica
del request. La clave original nunca se persiste. PostgreSQL garantiza pareja,
formato, obligatoriedad operacional, unicidad e inmutabilidad; la futura capa
7B será responsable de calcular realmente SHA-256, definir la canonicalización
y resolver replay de mismo payload frente a reutilización con otro payload.

## Autorización asociada

El bootstrap versionado contiene 16 permisos y 15 grants de rol. FASE 7A agrega
`sales.read` exclusivamente a `SALES`. `ADMIN` no es superusuario ni tiene
bypass, un `DENY` directo activo prevalece y `sales.cancel` permanece como único
grant directo de Dylan. Este cambio de bootstrap no forma parte del SQL de la
migración y ejecutarlo contra staging requiere una autorización persistente
separada.

## Fuera de alcance y siguiente gate

FASE 7A no implementa:

- creación, lectura, confirmación o cancelación en la capa de aplicación/API;
- transacciones de balances, cálculo canónico, replay HTTP o auditoría de
  ventas;
- UI de ventas;
- importación legacy de `Ventas` ni Waves 3+;
- despliegue de esquema/RBAC o ventas reales en staging.

Esos servicios transaccionales pertenecen a FASE 7B y requieren primero
`PHASE_7B_PLANNING`. La UI, importación legacy y operaciones de staging conservan
gates independientes.

## Migración y staging

El SQL está envuelto en `BEGIN`/`COMMIT`. No contiene backfill, `DROP` ni
`CASCADE`. La ausencia de default para `origin` presupone las tablas de ventas
vacías; ese requisito se comprobó para el diseño, pero debe revalidarse read-only
contra el target real antes de un futuro gate de staging.

Estado operativo vigente:

- `PHASE_7A_SCHEMA_COMPLETE` en el repositorio;
- `STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`;
- `FIRST_STAGING_SALE_NOT_AUTHORIZED`;
- `WAVES_3_PLUS_NOT_STARTED`.

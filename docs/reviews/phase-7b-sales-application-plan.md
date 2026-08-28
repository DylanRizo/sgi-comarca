# FASE 7B — Plan de capa de aplicación y API de ventas

Estado: `PHASE_7B_PLAN_READY_FOR_OWNER_REVIEW`.

Este documento completa planificación. No autoriza implementación, cambios de
esquema, despliegue de FASE 7A, bootstrap/RBAC persistente, UI, importación
legacy ni escritura en staging. `PHASE_7B_NOT_AUTHORIZED` continúa vigente.

## 1. Objetivo y autoridad

FASE 7B implementará, tras una autorización separada, servicios de aplicación y
API REST para crear y leer ventas, confirmar tránsito y cancelar una venta
elegible. Se apoya en la fundación estructural ya versionada por FASE 7A; no
propone relajar, reemplazar ni duplicar sus invariantes.

Orden de autoridad aplicado:

1. Prisma, migración `20260826232758_phase_7a_sales_foundation`, manifest y
   pruebas versionadas;
2. [CURRENT_STATE.md](../handoff/CURRENT_STATE.md) y
   [APPROVED_DECISIONS.md](../handoff/APPROVED_DECISIONS.md);
3. [ADR-009](../decisions/ADR-009-sales-pricing-cost.md),
   [phase-7a-sales-foundation.md](../database/phase-7a-sales-foundation.md),
   [transaction-design.md](../architecture/transaction-design.md) y
   [authorization-matrix.md](../architecture/authorization-matrix.md).

## 2. Alcance y exclusiones

Incluye:

- contratos HTTP y DTOs de ventas;
- servicios transaccionales de creación, confirmación y cancelación;
- consultas paginadas de ventas y detalle;
- cálculo monetario canónico;
- stock multi-línea y multi-almacén;
- idempotencia por actor, auditoría, errores tipados y pruebas PostgreSQL;
- RBAC exacto con los permisos ya existentes.

Excluye:

- UI de ventas y cualquier componente web;
- importación legacy de Ventas, decisiones de agrupación/duplicados y Waves 3+;
- finanzas, pagos, cierres y cualquier transición `PENDING → PAID`;
- campos de entrega potencialmente sensibles y su política de exposición;
- escritura operacional de precio, costo o
  `ProductWarehouseValuation`;
- migraciones, cambios Prisma, nuevos permisos o modificación de triggers;
- aplicar FASE 7A/bootstrap a staging o crear, confirmar o cancelar ventas
  reales.

## 3. Superficie HTTP y permisos

Todas las rutas son privadas, responden con `Cache-Control: no-store` y usan la
envoltura definida en `api-conventions.md`. Un `DENY` directo activo prevalece;
`ADMIN` no es bypass.

| Método y ruta | Permiso | Idempotencia | Resultado previsto |
| --- | --- | --- | --- |
| `GET /api/v1/sales` | `sales.read` | No | `200`, listado paginado. |
| `GET /api/v1/sales/:id` | `sales.read` | No | `200`, encabezado, líneas, lifecycle y movimientos correlacionados. |
| `POST /api/v1/sales` | `sales.create` | `Idempotency-Key` obligatoria | `201` al crear; replay devuelve la representación persistida sin efectos. |
| `POST /api/v1/sales/:id/confirm-in-transit` | `sales.confirm_in_transit` | Obligatoria | `200`, venta completada y confirmación. |
| `POST /api/v1/sales/:id/cancel` | `sales.cancel` | Obligatoria | `200`, venta cancelada y reposición confirmada. |

El listado admite `page`, `pageSize` (máximo 100), `status`, `paymentStatus`,
`from`, `to`, `sellerUserId` y `warehouseId`; orden fijo
`businessDate DESC, id DESC`. El detalle expone precio aplicado, cantidades,
subtotales y envío, pero no `unitCostSnapshot` ni margen: `sales.read` no concede
permisos financieros. Tampoco expone hashes, claves, raw legacy ni metadata
privada de auditoría.

## 4. DTO de creación

Contrato mínimo propuesto:

```ts
interface CreateSaleRequest {
  businessDate: string; // YYYY-MM-DD, fecha civil Managua
  items: Array<{
    productId: string; // UUID
    quantity: string; // Decimal(18,4), > 0
    unitPrice?: string; // Decimal(18,2), >= 0
    warehouseId: string; // UUID
  }>;
  sellerUserId?: string; // UUID activo; ausencia se persiste como null
  shippingAmount?: string; // Decimal(18,2), >= 0; default canónico 0.00
  status: 'IN_TRANSIT' | 'COMPLETED';
}
```

El orden validado de `items` se conserva como ordinal semántico para reparto de
envío, movimientos y canonicalización. Varias líneas pueden usar el mismo
producto+almacén; se agregan solo para validar stock y bloquear una vez, pero se
persisten como líneas separadas con un movimiento `SALE` por línea.

El cliente nunca envía:

- `saleNumber`, `origin`, `paymentStatus` o `currencyCode`;
- `createdByUserId`, timestamps, hashes o actor;
- `unitCost`, `unitCostSnapshot` o `unitPriceSnapshot`;
- `lineSubtotal`, `shippingAllocation`, `subtotal` o `total`;
- ids de movimientos, confirmación, cancelación o auditoría;
- `deliveryPlace`, textos legacy o campos de finanzas/cierre.

El servidor fija `origin = OPERATIONAL`, `paymentStatus = PENDING`, moneda
`NIO`, creador autenticado y un único timestamp UTC de la transacción.
`saleNumber` queda ausente del INSERT para que PostgreSQL lo genere. Para una
creación directa `COMPLETED`, `completedAt` usa el timestamp del servidor; para
`IN_TRANSIT` permanece `NULL`. `departureAt` usa el mismo instante de creación.

El `sellerUserId` opcional debe resolver a un usuario activo. No se infiere que
el creador y el vendedor sean la misma persona: si se omite, se persiste `NULL`,
conforme a la nulabilidad actual. Ampliar el DTO con canal, entregador, lugar de
entrega u otros textos requiere otra revisión contractual y, para datos
personales, una decisión de exposición.

## 5. Fuente vigente de precio y costo

Dentro de la misma transacción y lock de stock, cada línea resuelve la fila
única de `InventoryBalance` por producto+almacén:

1. sin balance: `SALE_BALANCE_NOT_FOUND`, HTTP 422, con `productId` y
   `warehouseId` en detalles saneados;
2. costo: `unitCostSnapshot = currentUnitCost`; `NULL` produce
   `SALE_COST_MISSING`/422; cero es válido y nunca se reemplaza;
3. precio: `currentUnitPrice` es la referencia; `unitPrice` omitido usa esa
   referencia; referencia `NULL` sin override produce
   `SALE_PRICE_MISSING`/422;
4. un `unitPrice` explícito, incluido cero, prevalece tras validar escala,
   precisión y no negatividad;
5. valores negativos o fuera de `Decimal(18,2)` se rechazan antes de insertar,
   sin depender del CHECK como interfaz de error;
6. los flags `priceReviewRequired` y `costReviewRequired` no bloquean la venta.

La comparación referencia/override usa decimales canónicos, por lo que `10`,
`10.0` y `10.00` son iguales. Un valor explícito diferente —o explícito cuando
la referencia es `NULL`— genera metadata de override con `productId`,
`warehouseId`, `referenceUnitPrice` y `appliedUnitPrice`. Los flags de revisión
generan otra entrada saneada con producto, almacén y flags, sin datos privados
ni clave idempotente.

FASE 7B no consulta ni escribe `ProductWarehouseValuation`. Esa tabla conserva
evidencia histórica múltiple y append-only. ADR-006 exige protección adicional
antes de un futuro escritor operacional de valoraciones; este flujo solo lee y
bloquea `InventoryBalance`, por lo que no activa ese límite.

## 6. Cálculo monetario y reparto del envío

Todo cálculo usa Decimal o enteros escalados, nunca `number`/float.

1. Normalizar cantidad a cuatro decimales como máximo y dinero a dos.
2. Calcular cada `lineSubtotal = quantity × unitPriceSnapshot` y redondear una
   sola vez a centavos con `ROUND_HALF_UP`.
3. `subtotal` es la suma exacta de los subtotales de línea ya redondeados.
4. Convertir `shippingAmount` a centavos enteros `S` y usar `N` líneas:
   `base = floor(S / N)`, `residue = S mod N`.
5. Cada línea recibe `base`; las primeras `residue` líneas según el ordinal
   validado reciben un centavo adicional.
6. `total = subtotal + shippingAmount`.

Así, cada asignación es no negativa y la suma de
`shippingAllocation` es exactamente `shippingAmount`, incluido cualquier
residuo de redondeo. El ordinal forma parte del request canónico, por lo que el
reparto es estable en replays. No hay descuentos ni totales proporcionados por
el cliente.

FASE 7A impone no negatividad pero no una suma cruzada entre líneas. El servicio
y sus pruebas aplican la igualdad del reparto; no se propone un nuevo trigger ni
se relaja un constraint.

## 7. Orden de locks y frontera transaccional

Creación usa `READ COMMITTED` y una única transacción:

1. revalidar actor activo y permiso efectivo `sales.create` dentro de la
   transacción;
2. tomar advisory lock transaccional por operación+actor+hash de clave;
3. resolver replay o conflicto antes de bloquear stock;
4. normalizar pares producto+almacén y cantidades agregadas;
5. bloquear productos activos por `id ASC`;
6. bloquear almacenes activos por `id ASC`;
7. bloquear todas las filas objetivo de `inventory_balances` con
   `ORDER BY product_id ASC, warehouse_id ASC FOR UPDATE`;
8. resolver precio/costo desde esas mismas filas bloqueadas y validar todos los
   balances, flags y stock agregado antes de la primera escritura;
9. crear encabezado, líneas, actualizar cada balance, crear un `SALE` por línea
   y agregar exactamente un `sales.created` audit log;
10. commit; cualquier error revierte todo y los triggers diferidos validan la
    forma final.

El orden global `(product_id, warehouse_id)` es el definido en
`transaction-design.md`. Ajustes solo bloquean un par y transferencias ordenan
sus almacenes/balances; ventas no introducen un orden inverso. Para líneas
repetidas del mismo par, se valida stock agregado y se calcula una cadena
determinista de `balanceBefore/balanceAfter` según ordinal; el balance se
persiste al valor final y cada movimiento conserva su delta de línea.

Una venta no crea un balance ausente: lo rechaza con 422. Tampoco crea, copia ni
modifica valoraciones. Conflictos transitorios (`40001`, `40P01`, `55P03` o
equivalentes Prisma) se mapean a un 409 tipado; no existen reintentos ilimitados.

## 8. Apoyo de FASE 7A

| Garantía 7A | Responsabilidad de 7B |
| --- | --- |
| `sales_operational_persisted_shape` y `guard_sale_write()` | Proporcionar origen, actor, hashes, estado inicial permitido, pago `PENDING` y `completedAt` coherente. |
| Secuencia y CHECK de `saleNumber` | Omitir `saleNumber` del DTO/INSERT y devolver el número generado. |
| Snapshots operacionales obligatorios y checks monetarios | Resolver balance vigente, calcular Decimal y devolver errores tipados antes del INSERT. |
| `sales_operational_requires_item` diferido | Validar array no vacío y crear todas las líneas en la misma transacción. |
| UNIQUE parciales y triggers de ledger | Crear exactamente un `SALE` coherente por línea y, al cancelar, un `SALE_CANCELLATION`. |
| Guards/documents de lifecycle | Insertar primero confirmación/cancelación y después actualizar el estado en el orden exigido. |
| Índices de idempotencia por actor | Reclamar con advisory lock, comparar request hash y devolver replay/conflicto. |
| Triggers de inmutabilidad | No exponer updates/deletes de venta, líneas o documentos terminales. |

Las validaciones de DTO/dominio no sustituyen la base: ofrecen errores seguros
antes del commit. PostgreSQL sigue siendo la barrera final de integridad y
cualquier violación inesperada se trata como conflicto/invariante, no como razón
para desactivar un trigger.

## 9. Idempotencia canónica

Las tres mutaciones exigen una clave ASCII visible de 16–128 caracteres. Se
calcula `idempotencyKeyHash = SHA-256(UTF-8(key))`; la clave original nunca se
persiste, registra ni incluye en auditoría.

Cada request hash usa JSON UTF-8 con claves en orden fijo y valores ya
validados:

- creación: `businessDate`, `items` en orden semántico, `sellerUserId` como
  UUID o `null`, `shippingAmount` canónico y `status`; cada línea usa
  `productId`, `quantity` canónica, `unitPrice` canónico o `null`,
  `warehouseId`;
- confirmación: `{ saleId }`;
- cancelación: `{ reason, saleId }`, con motivo ya normalizado y no vacío.

No forman parte del request hash: actor, clave, referencia/costo leídos del
balance, timestamps, número generado, ids generados ni respuesta. El actor ya
forma parte del índice único. Misma operación+actor+clave+payload devuelve el
resultado comprometido sin balance, ledger o auditoría adicional. Misma clave
con otro request hash devuelve `409 IDEMPOTENCY_KEY_REUSED`.

El advisory lock por `sales.<operation>:<actor>:<keyHash>` evita la carrera
`SELECT → INSERT`. Un rollback no deja claim parcial. Una clave nueva sobre una
venta ya terminal no crea un segundo documento: si existe la confirmación o
cancelación coherente se devuelve el resultado terminal sin escritura; una
venta completada directamente no puede ser “confirmada” y devuelve estado
inválido.

## 10. Confirmación en tránsito

Flujo transaccional:

1. revalidar actor y `sales.confirm_in_transit`;
2. reclamar idempotencia y bloquear la fila `sales`;
3. exigir `IN_TRANSIT + PENDING`;
4. capturar `confirmedAt` UTC;
5. insertar `InTransitConfirmation` con actor y hashes;
6. actualizar únicamente `status = COMPLETED` y
   `completedAt = confirmedAt`;
7. agregar exactamente un `sales.in_transit_confirmed` audit log;
8. commit.

La inserción precede al UPDATE porque `guard_sale_write()` exige el documento
para autorizar la transición. El servicio no consulta, bloquea ni actualiza
`InventoryBalance`; no crea movimientos y no modifica `paymentStatus`. Los
constraint triggers verifican al commit una sola confirmación y la igualdad de
timestamps.

Confirmación y cancelación concurrentes se serializan mediante el lock de la
venta. La que obtiene el lock después observa el estado terminal y no produce
efectos.

## 11. Cancelación total

Flujo transaccional:

1. revalidar actor, `sales.cancel`, clave y motivo no vacío de hasta 500
   caracteres;
2. reclamar idempotencia y bloquear la venta;
3. exigir `IN_TRANSIT + PENDING` y cargar todas sus líneas;
4. bloquear los balances originales con el mismo orden global de creación;
5. validar la presencia de todos antes de escribir;
6. insertar `SaleCancellation` con actor, motivo, timestamp y hashes;
7. restaurar cada cantidad una sola vez y crear un
   `SALE_CANCELLATION` coherente por línea;
8. actualizar `status = CANCELLED`, conservar pago `PENDING` y
   `completedAt = NULL`;
9. agregar exactamente un `sales.cancelled` audit log y commit.

No existe cancelación parcial. No se recalculan precio, costo o totales y no se
consulta valoración alguna. Si falta un balance que debería existir, se trata
como conflicto de integridad y toda la operación revierte; no se inventa una
fila para ocultar la anomalía. La unicidad por `saleId`, los índices parciales y
los triggers diferidos impiden una segunda reposición.

## 12. Auditoría

Cada mutación crea exactamente un evento en su misma transacción:

| Acción | Evento | Metadata mínima saneada |
| --- | --- | --- |
| Crear | `sales.created` | `saleId`, estado, actor, vendedor opcional, totales, ids de línea/movimiento, balances anterior/nuevo, overrides de precio y flags de revisión. |
| Confirmar | `sales.in_transit_confirmed` | `saleId`, `confirmationId`, estado anterior/nuevo y timestamp. |
| Cancelar | `sales.cancelled` | `saleId`, `cancellationId`, motivo, ids de movimientos y balances anterior/nuevo. |

Nunca registrar clave idempotente, cookies, tokens, dirección/lugar de entrega,
raw legacy ni datos de cliente. En un override se guardan ambos precios
canónicos; para revisión se guardan únicamente producto, almacén y flags. Los
hashes persistidos no son metadata de negocio y no se exponen en respuestas.

## 13. Errores de dominio y HTTP

| HTTP | Código representativo | Condición |
| ---: | --- | --- |
| 400 | `SALES_REQUEST_INVALID`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_INVALID` | Forma, escala, precisión, UUID o clave inválida. |
| 401 | `AUTHENTICATION_REQUIRED` | Sin sesión válida. |
| 403 | `SALES_PERMISSION_DENIED`, errores Origin/CSRF | Permiso efectivo ausente o boundary HTTP inválido. |
| 404 | `SALE_NOT_FOUND` | Venta no visible/existente para lectura o acción. |
| 409 | `IDEMPOTENCY_KEY_REUSED`, `SALE_INVALID_STATE`, `SALE_CONCURRENCY_CONFLICT` | Payload distinto, lifecycle o conflicto transitorio. |
| 422 | `SALE_BALANCE_NOT_FOUND` | No existe balance para producto+almacén. |
| 422 | `SALE_COST_MISSING` | `currentUnitCost` es `NULL`; cero no activa este error. |
| 422 | `SALE_PRICE_MISSING` | Referencia `NULL` y sin override. |
| 422 | `SALE_REFERENCE_VALUE_INVALID` | Valor vigente negativo/fuera de rango. |
| 422 | `SALE_INSUFFICIENT_STOCK` | Stock agregado insuficiente. |
| 422 | `SALE_PRODUCT_UNAVAILABLE`, `SALE_WAREHOUSE_UNAVAILABLE` | Recurso inactivo o no utilizable. |

Los detalles 422 de balance/precio/costo incluyen `productId` y `warehouseId`,
sin valores privados. Una excepción inesperada de constraint no se convierte en
éxito ni se oculta; revierte y conserva el request ID para diagnóstico seguro.

## 14. Matriz de pruebas futura

### Unitarias

- parseo/canonicalización Decimal y límites de precisión;
- precio de referencia, override igual/diferente, referencia `NULL` con/sin
  override y precio cero;
- costo `NULL`, costo cero y flags de revisión;
- subtotal de línea, suma, `ROUND_HALF_UP`, reparto del residuo de envío y
  prueba de suma exacta;
- hash canónico estable, orden de items semántico y motivo normalizado;
- máquina de estados, mapping de errores y metadata de auditoría saneada.

### Integración PostgreSQL real y API

- creación simple, multi-línea, multi-almacén y líneas repetidas por par;
- ambas formas iniciales, número generado y pago siempre `PENDING`;
- balance/costo/precio faltante; cero; override; flags de revisión;
- prueba explícita de que no se consulta ni modifica
  `ProductWarehouseValuation`;
- un `SALE` exacto por línea, snapshots/totales persistidos, un audit log y
  rollback completo ante cualquier error;
- listados/detalle con `sales.read`, paginación/filtros y ausencia de costo,
  hashes o datos privados;
- permisos exactos para las cinco rutas, usuario inactivo y DENY directo sobre
  grant de rol;
- replay mismo payload, clave reutilizada, carrera de misma clave y ausencia de
  segundo efecto/audit;
- confirmación con documento/timestamp, sin acceso a inventario ni cambio de
  pago;
- cancelación total, reposición exacta, doble cancelación y estados prohibidos;
- intentos de violar cada trigger/constraint 7A relevante sin relajarlo.

### Concurrencia

- dos ventas sobre el mismo par con stock para una sola;
- venta + ajuste sobre el mismo balance;
- venta + transferencia sobre el mismo balance;
- ventas multi-par cruzadas con orden inverso de entrada, sin deadlock;
- venta + cancelación de otra venta sobre los mismos pares;
- confirmación + cancelación de la misma venta;
- doble confirmación, doble cancelación y misma clave concurrente;
- peticiones concurrentes con la misma sesión, sin regresión de renovación.

Cada suite de integración usa PostgreSQL temporal creado y eliminado por la
corrida; staging nunca es target. FASE 7B no agrega UI, por lo que no añade un
flujo Playwright de ventas; antes de declarar completion candidate se ejecuta la
línea base E2E existente como regresión, en una sesión con Docker autorizado.

## 15. Secuencia de implementación propuesta

Cada bloque requiere autorización de implementación previa y un commit
auditable separado; este plan no crea ninguno.

1. **7B.1 — contratos y dominio puro.** DTOs, contratos de respuesta, Decimal,
   reparto de envío, canonicalización, errores tipados y unit tests. Gate:
   revisión de contrato sin persistencia.
2. **7B.2 — lectura.** Repositorio/servicio read-only, listado y detalle con
   `sales.read`. Gate: HTTP/RBAC/integración, sin mutaciones de venta.
3. **7B.3 — creación transaccional.** Locks, `InventoryBalance`, snapshots,
   stock, ledger, auditoría e idempotencia. Gate: unitarias, integración y
   concurrencia de creación en PostgreSQL temporal.
4. **7B.4 — lifecycle.** Confirmación y cancelación con sus documentos,
   idempotencia, auditoría y carreras cruzadas. Gate: integración/concurrencia
   completa y verificación explícita de triggers 7A.
5. **7B.5 — cierre.** OpenAPI generado internamente, documentación, revisión de
   seguridad, format/lint/typecheck/unit/integration/build y E2E de regresión.
   Gate: `PHASE_7B_COMPLETION_CANDIDATE`, todavía sin staging ni UI.

No se prevé migración ni cambio de manifest. Si cualquier bloque requiere
alterar Prisma, relajar un constraint/trigger, añadir un permiso o escribir
staging, se detiene y solicita un gate separado. Bugs descubiertos se corrigen
en commits separados de features.

## 16. Estado al cerrar planificación

- `PHASE_7A_SCHEMA_COMPLETE`;
- `PHASE_7B_PLAN_READY_FOR_OWNER_REVIEW`;
- `PHASE_7B_NOT_STARTED`;
- `PHASE_7B_NOT_AUTHORIZED`;
- `STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`;
- `FIRST_STAGING_SALE_NOT_AUTHORIZED`;
- `WAVES_3_PLUS_NOT_STARTED`.

El siguiente paso posible es una revisión humana del plan. Solo una autorización
posterior y explícita puede iniciar 7B.1. Aprobar este documento no aplica
migraciones, no ejecuta bootstrap, no crea ventas y no autoriza staging.

# FASE 7 — Plan de ventas

Estado: `PHASE_7_PLANNING`. Este documento no autoriza implementación, cambios
de esquema, importación legacy ni escritura en staging.

Revisión de decisiones: R-03, R-04, R-12, R-15 y R-16 están aprobadas y
registradas. El diseño estructural/RBAC reducido de 7A queda congelado en este
documento, pero ninguna implementación, migración, ejecución de bootstrap ni
escritura en staging está autorizada.

El plan original se elaboró sobre el cierre funcional de FASE 6 y este diseño
final se revalidó contra el esquema y las migraciones versionadas, el manifest
RBAC, `docs/architecture/transaction-design.md`,
`docs/architecture/authorization-matrix.md`, `docs/legacy/**` y
`docs/migration/**`. El snapshot de staging citado es evidencia histórica de
solo lectura y deberá revalidarse antes de cualquier gate futuro.

## 1. Esquema de ventas ya existente

FASE 3A creó la estructura completa de ventas. FASE 7 no parte de cero.

### `Sale` (`sales`)

Encabezado con `saleNumber` único y normalizado a mayúsculas por CHECK,
`businessDate` (`date`), `status`, `paymentStatus`, `departureAt`,
`completedAt`, `sellerUserId` opcional, textos legacy preservados
(`legacySellerText`, `delivererText`, `salesChannelText`, `paymentMethodText`),
`deliveryPlace`, `shippingAmount`, `subtotal`, `total`, `currencyCode`,
`observations`, `createdAt`, `updatedAt`. Relaciones a `SaleItem`,
`SaleCancellation`, `InTransitConfirmation` y `LegacyRecord`. Índices por
fecha, estado+fecha y vendedor+fecha. Todas las FK son `RESTRICT`.

### `SaleItem` (`sale_items`)

`saleId`, `productId`, `warehouseId`, `quantity` `Decimal(18,4)` con CHECK
`quantity > 0`, `unitPriceSnapshot` y `unitCostSnapshot` opcionales
`Decimal(18,2)`, `lineSubtotal`, `shippingAllocation`, `legacyRecordId`
opcional y relación a `InventoryMovement`. **El almacén vive en la línea**, lo
que ya habilita una venta multi-almacén.

### `SaleCancellation` (`sale_cancellations`)

`saleId` único, `reason` obligatorio (`VarChar(500)`), `cancelledByUserId`,
`cancelledAt`. La unicidad de `saleId` ya impide estructuralmente una segunda
cancelación.

### `InTransitConfirmation` (`in_transit_confirmations`)

`saleId` único, `confirmedByUserId`, `confirmedAt`. La unicidad ya impide una
segunda confirmación.

### Enums

- `SaleStatus`: `LEGACY_UNKNOWN`, `IN_TRANSIT`, `COMPLETED`, `CANCELLED`.
- `PaymentStatus`: `UNKNOWN`, `PENDING`, `PAID`.
- R-12 añade `SaleOrigin`: `OPERATIONAL`, `LEGACY_IMPORT`.
- `InventoryMovementType` ya contiene `SALE` y `SALE_CANCELLATION`.

`InventoryMovement` ya tiene `saleItemId` con FK, el CHECK
`balance_before + quantity_delta = balance_after` y el trigger de
inmutabilidad. No se añade ningún valor a los enums existentes.

### Qué está listo y qué falta

Listo: forma de las entidades, multi-almacén por línea, snapshots de precio y
costo, motivo de cancelación obligatorio, unicidad de cancelación y de
confirmación, tipos de movimiento, trazabilidad legacy y `Decimal` en todo el
dinero.

Falta para producción: idempotencia persistente, inmutabilidad de filas,
coherencia obligatoria entre venta, líneas y ledger, coherencia monetaria,
actor de creación, implementación de la secuencia aprobada de `saleNumber` y
reglas de estado en base de datos. Se detalla en la sección 14.

### Snapshot de staging (solo lectura)

```text
Sale=0  SaleItem=0  SaleCancellation=0  InTransitConfirmation=0
legacy_records(source_entity='Ventas')=404  (STAGED, sin importar)
```

Confirmado hoy sin escribir nada.

## 2. Evidencia legacy de Ventas

Rango: 8 de noviembre de 2025 a 29 de julio de 2026. 404 filas, 17 columnas.

| Hecho | Valor |
| --- | ---: |
| Filas | 404 |
| IDs de venta únicos | 288 |
| IDs con una sola fila | 227 |
| IDs con 2 a 10 filas | 61 |
| Tokens `CODIGO:CANTIDAD` | 449, todos válidos y existentes |
| Combinaciones ID + item + almacén | 400 (no 404) |
| Pares duplicados exactos | 4 |
| Filas sin hora de finalización | 159 |
| Filas sin timestamp | 82 |
| Filas sin canal | 117 |
| Filas sin precio unitario | 126 |
| Filas sin estado explícito | 401 |

Columnas relevantes: ID Venta, Fecha, Hora Salida (fracción de día), Hora
Finalización, Vendedor (4 valores), Entregador (7 variantes ortográficas),
Items Vendidos, Monto Cobrado, Envío Cobrado, Total, Lugar Extracción (almacén
por línea), Lugar Entrega (**dato potencialmente sensible**), Observaciones (32
con etiqueta de pago), Timestamp, Canal Venta, Precio Unitario y una columna
`Columna 1` con solo 3 valores `Completado`, cuyo encabezado **no coincide** con
el `Estado de Pago` que espera el código legacy.

Dependencias: Productos (los 449 tokens resuelven), Inventario y Movimientos
(siete ventas sin movimiento, ocho IDs de movimiento sin venta), Finanzas (tres
ingresos automáticos derivados de ventas, con riesgo de doble conteo) y
CierresDiarios (cuatro cierres cuyos JSON cuadran exactamente con sus totales).

## 3. Reglas de negocio confirmadas vigentes

Verificadas hoy contra `manifest.ts`, `authorization-matrix.md`,
`APPROVED_DECISIONS.md` y `transaction-design.md`. **No hay contradicción**
entre el repositorio y las reglas históricas esperadas.

- `SALES` concede `sales.create` y `sales.confirm_in_transit`.
- `sales.cancel` es un permiso independiente, sin rol que lo conceda.
- Dylan es el único con `sales.cancel`, mediante GRANT directo.
- Dylan, Samantha, Jean y Luden tienen `SALES`.
- `ADMIN` no otorga ningún permiso de ventas ni hace bypass.
- Un `DENY` directo activo vence sobre cualquier concesión.
- Una venta puede contener varios artículos de varios almacenes.
- Una venta en tránsito **consume inventario al crearse**.
- Confirmar tránsito **no vuelve a descontar**.
- La cancelación es total, nunca parcial, y repone exactamente una vez.
- Solo una venta no pagada y en tránsito es cancelable.
- Creación, confirmación y cancelación son idempotentes.
- El dinero es `NUMERIC`/`Decimal`; las cantidades admiten decimales.
- Los movimientos son append-only y no se editan ni borran.
- R-03 aprobada: PostgreSQL genera `saleNumber` mediante una secuencia dedicada,
  con forma `VTA-` más nueve dígitos, sin `MAX + 1`, entrada de cliente ni
  reutilización de identificadores legacy; los huecos son aceptables.
- R-04 aprobada: confirmar tránsito cambia el cumplimiento a `COMPLETED`, pero
  no cambia `paymentStatus`, no marca `PAID` y no toca inventario.
- R-15 aprobada para implementación posterior: `sales.read` será un permiso
  nuevo concedido solo por `SALES`; no existe bypass `ADMIN` y `DENY` prevalece.
- R-12 aprobada: cada venta elige explícitamente `OPERATIONAL` o
  `LEGACY_IMPORT` mediante `Sale.origin`, sin default ni inferencia desde
  `LegacyRecord`; `LEGACY_UNKNOWN` queda reservado a `LEGACY_IMPORT`.
- R-16 aprobada: el cliente expresa `IN_TRANSIT` o `COMPLETED` como intención
  inicial acotada; el servidor valida ese conjunto y fija siempre
  `paymentStatus = PENDING`. El cliente no envía `paymentStatus` ni puede crear
  una venta `PAID`.

Estado documental: DEC-020 (confirmación) y DEC-021 (cancelación) están
`APPROVED_BY_PROJECT_CONSTRAINT` en su regla base; sus detalles operativos
siguen abiertos.

**Sin `NEEDS_RECONCILIATION`.** El repositorio y las decisiones aprobadas
coinciden.

## 4. Ambigüedades

Todas requieren decisión humana y ninguna se resuelve en este plan.

| ID | Asunto | Evidencia | Estado |
| --- | --- | --- | --- |
| DEC-006 | 4 pares de líneas duplicadas | Filas 124–125, 176/179, 214–215, 255/257 | `REQUIRES_HUMAN_APPROVAL` |
| DEC-007 | 7 ventas sin movimiento | Filas 30, 31, 38, 41, 48, 56, 75 | `REQUIRES_HUMAN_APPROVAL` |
| DEC-008 | 8 IDs de movimiento sin venta | Diferido a FASE 6, ya cerrada | Reasignación pendiente |
| DEC-016 | Estado de 401 líneas | Columna Q vacía; el código legacy las asume `Completado` | `REQUIRES_HUMAN_APPROVAL` |
| DEC-017 | 159 horas de finalización vacías | Vacío no equivale a tránsito | `REQUIRES_HUMAN_APPROVAL` |
| DEC-018 | Método de pago histórico | Solo 32 líneas etiquetadas | `REQUIRES_HUMAN_APPROVAL` |
| DEC-019 | Venta en tránsito al cierre | Legacy la cancela automáticamente | `REQUIRES_HUMAN_APPROVAL` |
| DEC-029 | Regla de deduplicación | El script legacy ignora el ID al formar la huella | `REQUIRES_HUMAN_APPROVAL` |
| DEC-030 | Fechas derivadas del ID | Estimación de hora de salida | `REQUIRES_HUMAN_APPROVAL` |
| DEC-012 | Normalización de personas | Variantes ortográficas de entregadores | `REQUIRES_HUMAN_APPROVAL` |
| DEC-013 | Normalización de canales | `Facebook` vs `Facebook Marketplace`, 117 vacíos | `REQUIRES_HUMAN_APPROVAL` |
| DEC-014 | Fuente de precio vigente | Productos vs 76 filas de Inventario | `REQUIRES_HUMAN_APPROVAL` |
| DEC-001 | Moneda canónica | UI legacy mezcla `$` y `C$` | `REQUIRES_HUMAN_APPROVAL` |
| DEC-022 | Ingresos automáticos en Finanzas | 3 filas; riesgo de doble conteo | `REQUIRES_HUMAN_APPROVAL` |

Adicionalmente, sin ID de decisión asignado:

- **Agrupación de ventas**: 404 filas contra 288 IDs y 400 combinaciones
  ID+item+almacén. La regla exacta de agrupación no está aprobada.
- **Lugar de Entrega**: dato potencialmente sensible; falta política de
  retención y de exposición por rol.
- **Precio/costo operacional vigente**: 7A congela la forma de los snapshots,
  pero la fuente operacional exacta que 7B debe consultar y validar antes de
  crear la venta todavía requiere una decisión separada.

## 5. Ciclo de vida propuesto

El enum actual es suficiente. **No proponemos estados nuevos** y no fusionamos
pago con entrega, que ya son atributos separados (`status` y `paymentStatus`).

Estados operacionales: `IN_TRANSIT`, `COMPLETED`, `CANCELLED`.
`LEGACY_UNKNOWN` queda reservado exclusivamente para filas importadas cuyo
estado no puede afirmarse; una venta operacional nunca lo usa.

| Desde | Hasta | Permiso | Efecto en inventario |
| --- | --- | --- | --- |
| — | `IN_TRANSIT` | `sales.create` | Descuenta |
| — | `COMPLETED` | `sales.create` | Descuenta |
| `IN_TRANSIT` | `COMPLETED` | `sales.confirm_in_transit` | **Ninguno** |
| `IN_TRANSIT` | `CANCELLED` | `sales.cancel` | Repone una vez |

`COMPLETED` y `CANCELLED` son terminales. No existe transición desde
`CANCELLED`, ni de `COMPLETED` a `CANCELLED`, ni retorno a `IN_TRANSIT`.

"Completada" significa que la entrega se cerró; **no** implica cobro. El cobro
vive en `paymentStatus`. Por R-04, confirmar tránsito marca `COMPLETED` y deja
`paymentStatus` exactamente sin cambios: nunca marca `PAID`, aunque la función
legacy se llamara `confirmarPagoVenta`.

Por R-16, el cliente expresa una intención inicial que solo puede ser
`IN_TRANSIT` o `COMPLETED`; el servidor rechaza `CANCELLED`, `LEGACY_UNKNOWN` y
cualquier otro valor. El servidor fija `paymentStatus = PENDING` y el cliente
no puede enviar ese campo ni crear una venta `PAID`. Son válidos
`IN_TRANSIT + PENDING` y `COMPLETED + PENDING`. Un flujo financiero futuro,
con su propio permiso y gate, decidirá la transición `PENDING → PAID`.

## 6. Efecto sobre inventario

Confirmado por `transaction-design.md`, secciones 4 a 7, y por
`APPROVED_DECISIONS.md`.

- El inventario se descuenta **al crear la venta**, tanto para `COMPLETED` como
  para `IN_TRANSIT`.
- La confirmación de tránsito **no lee, no bloquea y no escribe balances**, y no
  crea movimientos.
- La cancelación repone exactamente una vez por línea, en el almacén original.

Ledger esperado por línea: un `SALE` con `quantityDelta` negativo y
`saleItemId`; al cancelar, un `SALE_CANCELLATION` con delta positivo y el mismo
`saleItemId`. Ambos tipos ya existen en el enum. Los movimientos históricos
nunca se editan ni se borran; una corrección futura sería un movimiento nuevo.

## 7. Bloqueo y concurrencia de stock

Reutilizar el patrón ya probado en transferencias:

1. Agrupar la cantidad requerida por par producto–almacén antes de escribir.
2. Bloquear **todos** los balances implicados en orden determinista y estable
   (por ejemplo `productId` y luego `warehouseId`), para evitar deadlocks entre
   ventas que comparten productos.
3. Validar todos los balances **después** de bloquear y **antes** de cualquier
   escritura, dentro de la misma transacción.
4. Escribir balances, líneas y movimientos en esa transacción.
5. Cualquier línea insuficiente aborta la venta completa.

El CHECK `inventory_balances_quantity_nonnegative` es la red de seguridad final
contra la sobreventa, no el mecanismo primario. La lectura y la escritura nunca
se separan sin bloqueo, que es exactamente la clase de carrera que produjo el
defecto corregido en FASE 6.

## 8. Idempotencia

Sí, es necesaria, y para las **tres** mutaciones. Recomendamos reutilizar
literalmente el patrón de transferencias, ya validado en staging:

- `Idempotency-Key` obligatoria en la cabecera.
- Persistir solo el SHA-256 de la clave y un hash canónico del payload. La clave
  original nunca se almacena.
- Ámbito por actor: único `(actor, idempotencyKeyHash)` dentro de cada
  operación.
- Mismo actor + misma clave + mismo payload: replay del resultado ya
  comprometido, sin segundo efecto ni segundo evento de auditoría.
- Misma clave + payload distinto: `409 IDEMPOTENCY_KEY_REUSED`.

Se usa una sola representación, alojada en el documento que materializa cada
resultado: `Sale.createdByUserId + idempotencyKeyHash + requestHash` para crear,
`InTransitConfirmation.confirmedByUserId + los dos hashes` para confirmar y
`SaleCancellation.cancelledByUserId + los dos hashes` para cancelar. No se
duplica un `actorUserId`. Las unicidades de `saleId` que ya existen en las dos
tablas terminales aportan una segunda barrera estructural independiente de la
clave. Un reintento con una clave nueva sobre un estado ya terminal sigue la
regla de lifecycle; no crea otra confirmación, cancelación, movimiento ni audit.

## 9. Diseño de `SaleItem`

- Una venta admite varias líneas; el almacén es por línea, no por venta.
- `quantity > 0` ya está garantizado por CHECK.
- Una línea `OPERATIONAL` exige `unitPriceSnapshot` y `unitCostSnapshot`
  presentes y no negativos; ambos se congelan en la creación. Una línea
  `LEGACY_IMPORT` puede preservarlos nulos, pero un valor presente tampoco puede
  ser negativo.
- `lineSubtotal` se recalcula en el servidor; **el cliente nunca decide el
  total**.
- El envío se cobra una vez en el encabezado (`shippingAmount`). La coherencia
  y suma de `shippingAllocation` se difiere: 7A no agrega un trigger complejo
  para una funcionalidad que 7B no necesita.
- Moneda en el encabezado, por defecto `NIO`.
- Precisión: cantidades `Decimal(18,4)`, dinero `Decimal(18,2)`.
- **Descuentos: no existe campo y no hay evidencia legacy de descuentos.** No se
  debe inventar uno. Si el negocio los necesita, es una decisión y una migración
  aparte.

Separación estricta: una venta operacional exige precio y costo resueltos; una
fila legacy puede carecer de ambos (126 filas sin precio unitario) y debe poder
importarse con snapshot nulo, sin inferencia.

## 10. Precio y costo históricos

El esquema ya preserva los snapshots por línea, así que una venta histórica no
cambia de margen cuando después cambia el precio o el costo del producto. La
única diferencia estructural a resolver es que ambos campos son **opcionales**:
correcto para el import legacy, insuficiente para una venta operacional. La
obligatoriedad para ventas nuevas debe imponerse en el servicio y, si se
aprueba, con un CHECK condicionado al origen de la fila.

El origen del precio vigente sigue abierto (DEC-014).

## 11. Cancelación

`POST /api/v1/sales/:id/cancel`, permiso `sales.cancel`, `Idempotency-Key`
obligatoria, motivo obligatorio y no vacío.

Reglas: no parcial; solo `IN_TRANSIT` y no pagada; una venta `COMPLETED` o
`PAID` se rechaza; segunda cancelación devuelve la cancelación existente sin
efectos; reposición exactamente una vez por línea en el almacén original; ledger
append-only; un solo evento de auditoría; todo en una transacción.

Concurrencia a cubrir: cancel contra cancel (la unicidad de `saleId` más el
bloqueo de la fila de venta garantizan una sola), cancel contra confirm (el
bloqueo de la venta las serializa; la perdedora ve un estado inválido) y cancel
contra ajuste o transferencia sobre los mismos balances (orden de bloqueo
compartido con inventario).

## 12. Confirmación de tránsito

`POST /api/v1/sales/:id/confirm-in-transit`, permiso
`sales.confirm_in_transit`, `Idempotency-Key` obligatoria.

Confirma cualquier usuario con el permiso; hoy los cuatro usuarios iniciales lo
tienen por rol `SALES`. Es única por venta (unicidad de `saleId`) y **no
reversible**: no existe transición de salida de `COMPLETED`. Cambia `status` a
`COMPLETED` y registra actor y `confirmedAt`. **No toca inventario en
absoluto.** Genera un único evento de auditoría de transición.

R-04 cierra la ambigüedad operativa: no exige ni registra evidencia de pago y no
modifica `paymentStatus`. La confirmación no crea movimiento de inventario ni
realiza un segundo descuento.

## 13. Eventos de auditoría

Siguiendo la convención ya usada (`inventory.adjusted`,
`inventory.transferred`):

| Evento | Actor | Entidad | Metadata mínima |
| --- | --- | --- | --- |
| `sales.created` | creador autenticado | `Sale` | saleId, status, número de líneas, ids de línea, ids de movimiento, total |
| `sales.in_transit_confirmed` | confirmador | `Sale` | saleId, confirmationId, estado anterior y nuevo |
| `sales.cancelled` | cancelador autorizado | `Sale` | saleId, cancellationId, motivo, ids de línea, ids de movimiento de reposición |

Prohibido en la metadata: la `Idempotency-Key` original, cookies, tokens, el
Lugar de Entrega mientras no exista política de datos personales, y cualquier
dato de cliente. La relación con el ledger se expresa por ids de movimiento,
igual que en transferencias.

## 14. Diseño final reducido de FASE 7A

Este es el inventario ejecutable para una futura implementación de 7A. Congela
decisiones y nombres conceptuales; no crea ahora el enum, columnas, secuencia,
constraints, triggers, permisos ni migración.

### 14.1 Decisiones R-12 y R-16

**R-12 — APPROVED.** Se añade `SaleOrigin`, con exactamente `OPERATIONAL` y
`LEGACY_IMPORT`, y el campo obligatorio `Sale.origin`. No tiene default de
Prisma ni de PostgreSQL, no se infiere desde `LegacyRecord` y es inmutable. La
API de 7B fijará siempre `OPERATIONAL`; el importador futuro deberá enviar
`LEGACY_IMPORT`. `LEGACY_UNKNOWN` solo es válido para `LEGACY_IMPORT`.

Prisma y PostgreSQL no obligan ni recomiendan un default para este caso. Como
`sales` está vacía, una columna `NOT NULL` sin default es la opción más segura:
obliga a cada escritor a declarar su intención y evita que un import accidental
se clasifique como operacional.

**R-16 — APPROVED.** El request operacional expresa exactamente
`IN_TRANSIT` o `COMPLETED`; el servidor rechaza `CANCELLED` y
`LEGACY_UNKNOWN`. El servidor, no el cliente, fija siempre
`paymentStatus = PENDING`. `sales.create` no concede capacidad de pago. Ambos
estados iniciales descuentan stock una vez; confirmar `IN_TRANSIT` cambia solo
el fulfillment a `COMPLETED`; cancelar exige `IN_TRANSIT + PENDING`.

### 14.2 Clasificación final de los ocho cambios

| # | Cambio final | Clasificación | Decisión 7A |
| --- | --- | --- | --- |
| 1 | Hashes de idempotencia persistentes en los tres documentos | `REQUIRED_FOR_OPERATIONAL_SALES` | `APPROVED` |
| 2 | Inmutabilidad de líneas, cancelaciones y confirmaciones; campos estables del encabezado protegidos | `REQUIRED_FOR_OPERATIONAL_SALES` | `APPROVED` |
| 3 | Al menos una `SaleItem` por `Sale` operacional | `REQUIRED_FOR_OPERATIONAL_SALES` | `APPROVED` |
| 4 | Un `SALE` exacto por línea operacional y un `SALE_CANCELLATION` exacto cuando exista cancelación | `REQUIRED_FOR_OPERATIONAL_SALES` | `APPROVED` |
| 5 | No negativos y snapshots operacionales válidos; reparto de `shippingAllocation` fuera de 7A | `REQUIRED_FOR_OPERATIONAL_SALES`; reparto `DEFERRED` | `APPROVED` |
| 6 | `createdByUserId` separado de `sellerUserId` | `REQUIRED_FOR_OPERATIONAL_SALES` | `APPROVED` |
| 7 | Lifecycle y coherencia estado–documento condicionados por `origin` | `REQUIRED_FOR_OPERATIONAL_SALES` | `APPROVED`; desbloqueado por R-12/R-16 |
| 8 | Índices adicionales de listado/rendimiento | `NOT_JUSTIFIED` | Excluidos; solo se crean UNIQUE que materializan invariantes |

R-03 agrega la secuencia operacional como requisito estructural fuera de los
ocho puntos originales. R-15 agrega un cambio de bootstrap/RBAC, no de Prisma.

### 14.3 Matriz `OPERATIONAL` frente a `LEGACY_IMPORT`

| Invariant | `OPERATIONAL` | `LEGACY_IMPORT` |
| --- | --- | --- |
| `status` | Inicial `IN_TRANSIT` o `COMPLETED`; después solo las transiciones aprobadas; nunca `LEGACY_UNKNOWN` | Puede preservar `LEGACY_UNKNOWN` o un estado mapeado por decisiones futuras; 7A no infiere ni fuerza transiciones operacionales |
| `paymentStatus` | Inicial obligatorio `PENDING`, no enviado por cliente; confirmación no lo cambia | Puede preservar `UNKNOWN` u otro mapeo futuro; 7A no decide DEC-018 |
| `unitPriceSnapshot` | Presente y `>= 0` | Nullable; si está presente, `>= 0` |
| `unitCostSnapshot` | Presente y `>= 0` | Nullable; si está presente, `>= 0` |
| Líneas | Al menos una | 7A no impone agrupación ni mínimo al import futuro |
| Ledger `SALE` | Exactamente uno coherente por `SaleItem` | 7A no reproduce ni exige movimientos históricos |
| Ledger de cancelación | Cero sin cancelación; exactamente uno coherente por línea con cancelación | Fuera de 7A; no se sintetiza historial |
| `saleNumber` | Generado por PostgreSQL como `VTA-` + nueve dígitos; no input del cliente | Obligatorio y explícito desde el importador futuro; no controla ni usa deliberadamente la secuencia operacional; el identificador legacy permanece evidencia separada |
| `createdByUserId` | Obligatorio semánticamente; actor autenticado de la creación | Nullable físicamente para no inventar un actor histórico; un gate futuro puede registrar el operador del import si se aprueba |
| Estado/documento | Constraints operacionales completas | Sin reglas operacionales incompatibles; las reglas de import se diseñan en 7E |

`SaleItem`, `SaleCancellation`, `InTransitConfirmation` y
`InventoryMovement` permanecen históricos e inmutables cualquiera que sea el
origen. La excepción legacy es sobre completitud/interpretación, no sobre poder
editar historia después del commit.

### 14.4 A. Cambios representables en Prisma

| Prisma model/enum | Cambio exacto | Nullability/FK/UNIQUE/índice |
| --- | --- | --- |
| `SaleOrigin` | Enum con solo `OPERATIONAL`, `LEGACY_IMPORT`; `@@map("sale_origin")` | Tipo PostgreSQL nuevo; sin default |
| `Sale` | `origin SaleOrigin`; `createdByUserId String?`; `idempotencyKeyHash String? @db.Char(64)`; `requestHash String? @db.Char(64)` | `origin NOT NULL`; los otros tres nullable físicamente y requeridos por SQL cuando `origin=OPERATIONAL`; FK `createdByUserId → users.id` con `RESTRICT`; UNIQUE `(createdByUserId,idempotencyKeyHash)` |
| `User` | Relación inversa `salesCreated` separada de `SaleSeller` | Sin columna nueva en `users` |
| `Sale.saleNumber` | Default `dbgenerated` respaldado por la secuencia/expresión SQL de 14.5 | Sigue `NOT NULL` y conserva `sales_sale_number_key`; el DTO de 7B no expone el campo |
| `SaleCancellation` | `idempotencyKeyHash String? @db.Char(64)` y `requestHash String? @db.Char(64)` | Nullable para compatibilidad legacy; requeridos si la venta es operacional; UNIQUE `(cancelledByUserId,idempotencyKeyHash)`; `saleId` ya es UNIQUE |
| `InTransitConfirmation` | Los mismos dos hashes | Nullable para compatibilidad legacy; requeridos si la venta es operacional; UNIQUE `(confirmedByUserId,idempotencyKeyHash)`; `saleId` ya es UNIQUE |

Los tres UNIQUE de idempotencia y los dos UNIQUE parciales de ledger descritos
abajo son índices de integridad justificados. No se agrega un índice separado
para `createdByUserId`: el UNIQUE compuesto ya tiene ese campo como prefijo. Se
conservan los índices existentes de fecha, estado y vendedor.

### 14.5 B. SQL manual posterior al diff Prisma

La futura migración se debe revisar y completar manualmente con este inventario
exacto:

1. **Secuencia y número.** Crear
   `operational_sale_number_seq AS bigint START 1 INCREMENT 1 MINVALUE 1
   MAXVALUE 999999999 NO CYCLE`, asociarla a `sales.sale_number` y fijar el
   default de columna a `VTA-` concatenado con `lpad(nextval(...)::text, 9,
   '0')`. Mantener el UNIQUE y `sales_sale_number_normalized`; agregar
   `sales_operational_number_format`, condicionado a `origin=OPERATIONAL`, con
   regex `^VTA-[0-9]{9}$`. Los huecos no se reutilizan. Un import futuro debe
   enviar un `saleNumber` explícito; nunca usa `MAX()+1` ni toma el valor legacy
   como control de la secuencia.
2. **Hashes.** Agregar CHECK de pareja (ambos hashes nulos o ambos presentes) y
   formato `^[0-9a-f]{64}$` a `sales`, `sale_cancellations` e
   `in_transit_confirmations`. Para una venta/documento operacional, ambos son
   obligatorios. La `Idempotency-Key` original nunca se persiste.
3. **Dinero.** CHECK global `shipping_amount >= 0`, `subtotal >= 0` y
   `total >= 0`. En `sale_items`, cada snapshot es nulo o `>= 0`; el guard de
   origen exige que ambos sean no nulos para `OPERATIONAL`. No se agrega
   igualdad de `shippingAllocation`, suma entre filas ni trigger de reparto en
   7A.
4. **Inmutabilidad.** Reutilizar `prevent_immutable_row_change()` para impedir
   UPDATE/DELETE de `sale_items`, `sale_cancellations` e
   `in_transit_confirmations`, e impedir DELETE de `sales`. Un trigger específico
   de `sales` hace inmutables `origin`, `sale_number`, `created_by_user_id`, los
   hashes de create y los datos económicos/identificadores del documento; solo
   permite los campos de lifecycle expresamente previstos.
5. **Venta operacional válida.** Un guard `BEFORE INSERT` exige origen
   explícito, estado inicial permitido, `payment_status=PENDING`, creador y
   hashes, y coherencia de `completed_at` (`NULL` para `IN_TRANSIT`, presente
   para `COMPLETED`). Un guard de `sale_items` exige snapshots operacionales.
6. **Al menos una línea.** Constraint trigger `DEFERRABLE INITIALLY DEFERRED`
   sobre la inserción de `sales` comprueba al commit que una venta
   `OPERATIONAL` tiene al menos una `sale_items`; no se aplica a
   `LEGACY_IMPORT`.
7. **Ledger.** Crear UNIQUE parciales
   `inventory_movements_sale_item_sale_key` y
   `inventory_movements_sale_item_cancellation_key` sobre `sale_item_id` para
   `type='SALE'` y `type='SALE_CANCELLATION'`. Constraint triggers diferidos
   comprueban para cada línea operacional un `SALE` exacto con mismo producto,
   almacén, actor creador y delta `-quantity`; si existe cancelación, un
   `SALE_CANCELLATION` exacto con mismo producto, almacén, actor cancelador y
   delta `+quantity`; sin cancelación exigen cero movimientos de cancelación.
   Se disparan desde la línea, el movimiento y la cancelación para validar
   tanto create como cancel al estado final de la transacción. No validan replay
   de ledger para `LEGACY_IMPORT`.
8. **Lifecycle/documentos.** Guards inmediatos de inserción bloquean la fila de
   venta y permiten crear confirmación o cancelación solo mientras está
   `IN_TRANSIT + PENDING`. La transacción inserta primero el documento terminal
   y luego cambia el estado. Un guard de UPDATE permite solo
   `IN_TRANSIT→COMPLETED` con una confirmación ya insertada, o
   `IN_TRANSIT→CANCELLED` con una cancelación ya insertada; `COMPLETED` y
   `CANCELLED` son terminales. Constraint triggers diferidos verifican al
   commit la matriz siguiente.

| Estado final `OPERATIONAL` | Confirmación | Cancelación | `completedAt` | Inventario |
| --- | ---: | ---: | --- | --- |
| `IN_TRANSIT + PENDING` | 0 | 0 | `NULL` | Descontado una vez en create |
| `COMPLETED + PENDING` creado directamente | 0 | 0 | Presente | Descontado una vez en create |
| `COMPLETED + PENDING` confirmado | Exactamente 1; `confirmedAt = completedAt` | 0 | Presente | Cero writes durante confirmación |
| `CANCELLED + PENDING` | 0 | Exactamente 1 | `NULL` | Repuesto una vez por línea |

La base puede demostrar la coherencia de documentos, estados y ledger. La
ausencia causal de cualquier escritura de balance durante confirmación también
se exige en el servicio y en pruebas de integración: no existe una FK desde una
confirmación que pudiera legitimar un movimiento.

### 14.6 C. Bootstrap/RBAC

7A agrega al manifest el permiso `sales.read` y un grant de rol
`SALES → sales.read`. No hay migración Prisma para ese cambio. `ADMIN` conserva
solo sus cuatro permisos administrativos, no existe bypass y un `DENY` directo
activo sigue prevaleciendo. La implementación futura debe actualizar las
pruebas de manifest/bootstrap y la matriz de autorización.

Ejecutar el bootstrap contra staging es una mutación persistente separada de
aplicar la migración y requiere un gate explícito. Este documento no la ejecuta.

### 14.7 Idempotencia y replay

La representación mínima es la misma en las tres operaciones: actor ya presente
en el documento, SHA-256 de la clave y hash canónico del request. Mismo
actor/operación/clave y mismo request devuelve el resultado comprometido sin
efectos; payload distinto devuelve `409`. Los campos y su UNIQUE se congelan al
insertar. Las tablas de confirmación y cancelación pueden y deben alojar sus
propios hashes: son el resultado persistente único de esas operaciones y evitan
una tabla genérica sin necesidad demostrada.

### 14.8 Rollback, staging y rehearsal

- La migración DDL futura debe ejecutarse en una sola transacción. Un fallo
  revierte enum, columnas, FK, CHECK, UNIQUE, funciones y triggers.
- Prisma no genera down migrations. Si el gate ya fue comprometido, el rollback
  operacional es restaurar el checkpoint PRE verificado y desplegar la versión
  anterior; nunca borrar manualmente ventas, movimientos o grants.
- Antes del gate se revalidará en solo lectura que las cuatro tablas de ventas
  siguen vacías y que el target es staging. Solo entonces es seguro agregar
  `origin NOT NULL` sin default y crear la secuencia sin backfill.
- La secuencia no debe consumirse durante el gate de esquema porque 7A no crea
  ventas. `nextval` no es transaccional y acepta huecos, por lo que las pruebas
  de secuencia se ejecutan en PostgreSQL local efímero, no en staging.
- El despliegue exige checkpoint PRE, migración, verificación estructural y
  checkpoint POST. El bootstrap/RBAC tiene verificación y autorización propias.
- La migración no toca los tres movimientos existentes, el ajuste, la
  transferencia, balances, valuations, las 404 filas raw de Ventas ni Waves
  3+. El riesgo principal es una constraint diferida incompleta o un lock DDL;
  se cubre con pruebas estructurales exhaustivas y ventana de despliegue.

## 15. Estrategia de import legacy

**Separación estricta y obligatoria.** El soporte de ventas operacionales no
depende del import y debe entregarse primero. El import de Ventas legacy es Wave
3 y arrastra al menos diez decisiones humanas sin resolver, más la agrupación y
el tratamiento de datos personales.

FASES 7A–7D pertenecen exclusivamente a ventas operacionales nuevas. FASE 7E es
el carril separado para planificar y, solo tras sus propios gates, ejecutar la
importación de Ventas legacy. Las 404 filas, 288 IDs, R-01, R-02/DEC-016, la
discrepancia de referencias de producto y Waves 3+ no bloquean las ventas
operacionales salvo evidencia nueva y explícita.

Orden recomendado: primero la fundación y la operación nuevas con R-12/R-16 ya
resueltas; después, y por separado, la planificación del import, que no debe
empezar hasta que DEC-006, DEC-007, DEC-016, DEC-017, DEC-018, DEC-029 y
DEC-030 estén resueltas.

Ninguna venta legacy debe crear movimientos operacionales ni afectar balances
sin una decisión explícita, porque el saldo inicial ya lo fijó Inventario en
Waves 1–2 (DEC-009) y reproducir Ventas sobre esos balances los alteraría.

## 16. Referencias de producto pendientes

Hay una **discrepancia documental** que hay que aclarar antes de planificar el
import:

- `docs/legacy/data-quality-report.md` afirma 449/449 tokens válidos y
  existentes, y `sheet-data-dictionary.md` que todos los códigos parseados de
  Ventas existen en Productos.
- `docs/reviews/phase-4-dry-run-report.md` y `open-decisions.md` difieren a FASE
  7 "28 referencias de producto".

La lectura más probable es que las 28 sean **códigos distintos** referenciados
por Ventas cuyo mapeo a filas de `Product` se difirió, no referencias rotas. No
lo damos por cierto. **NEEDS_CLARIFICATION**: hay que recontar contra la
evidencia del profiler antes de cualquier import, y registrar el número real,
los códigos afectados y si requieren alias.

## 17. Dependencias con Finanzas y Cierres

No se diseña contabilidad aquí. Lo que FASE 7 debe **preservar desde ya** para
no bloquear FASE 8:

- `paymentMethodText` y una eventual clasificación estructurada de medio de pago
  (efectivo o digital), hoy solo texto libre.
- `paymentStatus` fiable en ventas operacionales.
- `businessDate`, que es la clave de agregación de un cierre diario.
- `completedAt` y `departureAt` con zona horaria correcta.
- `sellerUserId` resuelto, porque los cierres legacy agregan por vendedor.
- El total y el envío separados, ya presentes.

Riesgo conocido a no repetir: los ingresos automáticos de ventas **no deben
duplicarse** en Finanzas (invariante de `AGENTS.md`, DEC-022). Si FASE 7 no deja
marcada la procedencia del ingreso, FASE 8 no podrá evitar el doble conteo.

DEC-025 (reapertura de cierre) permanece fuera de alcance.

## 18. Matriz de transacciones

### CREATE SALE

- Lee: `products`, `warehouses`, `inventory_balances`, precios/costos vigentes.
- Bloquea: cada `inventory_balances` de par producto–almacén, en orden
  determinista.
- Escribe: `sales`, `sale_items`, `inventory_balances`, `inventory_movements`
  (`SALE`), `audit_logs`, registro de idempotencia.
- Inventario: descuenta una vez por par agrupado.
- Rollback: no se crea ninguna parte de la venta.

### CONFIRM IN TRANSIT

- Lee y bloquea: la fila de `sales`.
- Escribe: `sales.status`, `in_transit_confirmations`, `audit_logs`,
  idempotencia.
- Pago: `paymentStatus` permanece sin cambios; no se marca `PAID`.
- Inventario: **ningún** acceso, ni lectura ni bloqueo ni escritura.
- Rollback: sin cambio de estado.

### CANCEL SALE

- Lee y bloquea: la fila de `sales`, después cada balance original de las
  líneas, en el **mismo orden determinista** que la creación.
- Escribe: `inventory_balances`, `inventory_movements` (`SALE_CANCELLATION`),
  `sale_cancellations`, `sales.status`, `audit_logs`, idempotencia.
- Inventario: repone exactamente una vez por línea.
- Rollback: ninguna reposición parcial.

El orden de bloqueo debe ser idéntico al de ajustes y transferencias para que las
tres familias de operaciones no puedan formar un deadlock cruzado.

## 19. Matriz de concurrencia

| Caso | Resultado esperado |
| --- | --- |
| Venta + venta, mismo producto y almacén, stock para una | Una tiene éxito, la otra falla con stock insuficiente; sin balance negativo |
| Venta + ajuste sobre el mismo balance | Serializados; ambos resultados coherentes con el ledger |
| Venta + transferencia sobre el mismo balance | Serializados sin deadlock |
| Venta + cancelación de otra venta del mismo producto | Serializados; reposición y descuento exactos |
| Cancel + cancel de la misma venta | Una cancela; la otra devuelve la existente sin segundo efecto |
| Confirm + cancel de la misma venta | Una gana; la perdedora recibe estado inválido |
| Confirm + confirm | Una confirma; la otra es replay sin efecto |
| Misma clave de idempotencia y mismo payload | Replay sin segundo efecto ni segundo audit |
| Misma clave y payload distinto | `409` |
| Peticiones HTTP concurrentes con la misma sesión | Todas responden correctamente |

El último caso se añade explícitamente por el defecto corregido en FASE 6: la
renovación de sesión ya es monótona, y la suite de ventas debe cubrirlo para no
reintroducirlo por otra vía.

## 20. API propuesta

Sin endpoints innecesarios. Cinco en total.

| Método y ruta | Permiso | Idempotencia | Notas |
| --- | --- | --- | --- |
| `GET /api/v1/sales` | `sales.read` (**nuevo, aprobado en R-15**) | No | `page`, `pageSize` máx. 100, `status`, `paymentStatus`, `from`, `to`, `sellerUserId`, `warehouseId` |
| `GET /api/v1/sales/:id` | idem | No | Encabezado, líneas y movimientos asociados |
| `POST /api/v1/sales` | `sales.create` | Obligatoria | Devuelve venta, líneas, balances anterior/nuevo e ids de movimiento |
| `POST /api/v1/sales/:id/cancel` | `sales.cancel` | Obligatoria | Motivo obligatorio |
| `POST /api/v1/sales/:id/confirm-in-transit` | `sales.confirm_in_transit` | Obligatoria | Sin efecto en inventario |

Códigos según `api-conventions.md`: `400` DTO o clave malformada; `403` permiso
ausente, Origin o CSRF; `404` venta inexistente; `409` estado inválido,
idempotencia reutilizada o conflicto de concurrencia; `422` regla de dominio
como stock insuficiente (`INSUFFICIENT_STOCK`) o producto inactivo. Todas las
respuestas usan la envoltura `data`/`meta` y `Cache-Control: no-store`.

Las mutaciones son privadas por defecto y exigen sesión, Origin permitido y
CSRF, como el resto de la superficie autenticada.

## 21. UI propuesta

- `/sales` — listado con búsqueda, filtros por estado y fecha, paginación
  servidor, presentación móvil, y estados de carga, vacío, error y éxito.
- `/sales/new` — carrito: búsqueda de producto, selección de almacén por línea,
  cantidad, precio, stock disponible visible por almacén, resumen con subtotal,
  envío y total, preview antes de enviar y prevención de doble envío.
- `/sales/:id` — estado, líneas, movimientos asociados, actor, datos de tránsito
  y acciones de confirmar o cancelar solo si el permiso efectivo está presente.

Sin emojis como iconografía, en español, accesible por teclado y con
confirmación explícita para la cancelación, que es destructiva.

## 22. Gate futuro: primera venta en staging

Diseñado, **no autorizado**. Estado inicial:
**`FIRST_STAGING_SALE_NOT_AUTHORIZED`**.

Disciplina equivalente a los gates de ajuste y transferencia ya superados:

1. Preflight Git y fingerprint de staging con verificación positiva del target.
2. Checkpoint PRE nuevo, con tamaño, SHA-256 y `pg_restore --list` en verde.
3. Caso limpio: producto ordinario sin excepciones legacy, un solo artículo,
   cantidad pequeña, almacén con stock suficiente, sin datos personales en el
   lugar de entrega.
4. Preview obligatorio de balance origen antes y después y del total calculado.
5. Exactamente **una** venta, desde la UI, con una sola intención de clave.
6. Verificación en base de datos: una `Sale`, sus `SaleItem`, un `SALE` por
   línea, balance decrementado exactamente, sin balance negativo, un solo evento
   `sales.created`, sin valuation tocada y sin afectar la transferencia ni el
   ajuste previos.
7. Validación en la UI del estado, las líneas y los movimientos asociados.
8. Checkpoint POST con las mismas evidencias.

Sin transacción compensatoria y sin segunda venta. Un gate posterior e
independiente cubriría la primera confirmación y otro la primera cancelación.

## 23. Plan de pruebas

**Unitarias**: cálculo de subtotales, total y asignación de envío con `Decimal`;
máquina de estados; validación de motivo; agrupación por par producto–almacén.

**Estructurales/esquema**: cada constraint y trigger nuevo, incluido el intento
de venta sin líneas, ledger incompleto, doble `SALE` por línea, mutación de una
fila inmutable y violación de coherencia monetaria.

**Integración**: venta válida; multi-item; multi-almacén; stock insuficiente;
producto inactivo; almacén inválido; cantidad no positiva; sin autorización;
`DENY` que vence sobre el rol; replay idempotente; clave reutilizada con otro
payload; cancelación con reposición exacta; doble cancelación; cancelación
prohibida de venta pagada o completada; confirmación; doble confirmación;
confirmación que no toca inventario; ledger correcto; auditoría correcta;
ausencia de balances negativos.

**Concurrencia**: los diez casos de la sección 19.

**E2E Chromium**: venta simple; venta multi-item y multi-almacén; intento con
stock insuficiente; prevención de doble envío; confirmación desde la UI;
cancelación autorizada; ocultamiento de la acción de cancelar para un usuario sin
el permiso.

## 24. Riesgos y decisiones humanas

| ID | Asunto | Evidencia | Impacto | Recomendación | ¿Decisión humana? |
| --- | --- | --- | --- | --- | --- |
| R-01 | Agrupación de ventas legacy sin resolver | 404 filas, 288 IDs, 400 combinaciones | **BLOCKER** para el import | No iniciar Wave 3 hasta resolverla | Sí |
| R-02 | Estado histórico de 401 líneas | Columna Q vacía | **BLOCKER** para el import | Importar estado nulo y clasificación inferida aparte | Sí (DEC-016) |
| R-03 | Generación de `saleNumber` operacional | Aprobada secuencia DB, forma `VTA-` + 9 dígitos, única e inmutable; huecos aceptados | **RESOLVED** | Implementar en migración 7A; nunca `MAX + 1` ni entrada cliente | Aprobada |
| R-15 | No existe permiso de lectura de ventas | Aprobado `sales.read` concedido solo por `SALES` | **RESOLVED** | Gate RBAC separado; GET lo exige; sin bypass ADMIN | Aprobada |
| R-04 | Confirmar tránsito, ¿marca pagado? | Aprobado separar cumplimiento y pago | **RESOLVED** | Cambiar a `COMPLETED` sin tocar `paymentStatus` ni inventario | Aprobada |
| R-05 | Lugar de Entrega es dato personal | 160 valores únicos | **HIGH** | Política de retención y de exposición por rol | Sí |
| R-06 | Discrepancia de las 28 referencias de producto | Dos documentos en conflicto | **HIGH** | Recontar contra el profiler antes del import | Sí |
| R-07 | Doble conteo de ingresos en Finanzas | 3 filas legacy | **HIGH** | Marcar procedencia desde FASE 7 | Sí (DEC-022) |
| R-08 | Método de pago histórico | 32 de 404 líneas etiquetadas | **MEDIUM** | Importar `UNKNOWN`; inferencia aparte | Sí (DEC-018) |
| R-09 | 4 pares duplicados y 7 ventas sin movimiento | Filas identificadas | **MEDIUM** | Resolver caso por caso, sin script | Sí (DEC-006, DEC-007) |
| R-10 | Sin campo de descuento | No hay evidencia legacy | **MEDIUM** | No inventarlo; migración aparte si el negocio lo pide | Sí |
| R-11 | Deadlock entre ventas, ajustes y transferencias | Tres familias sobre los mismos balances | **MEDIUM** | Orden de bloqueo único y compartido; test dedicado | No |
| R-12 | `LEGACY_UNKNOWN` contra coherencia estado/documento | Aprobado `SaleOrigin` explícito, obligatorio, sin default | **RESOLVED** | Condicionar invariantes operacionales a `origin=OPERATIONAL` | Aprobada |
| R-13 | Variantes de entregador y canal | 7 y 5 variantes | **LOW** | Preservar sin fusionar | Sí (DEC-012, DEC-013) |
| R-14 | 8 IDs de movimiento sin venta | Diferidos a FASE 6, ya cerrada | **LOW** | Reasignar a FASE 7 o a Wave 3 explícitamente | Sí (DEC-008) |
| R-16 | Clasificación inicial de venta operacional | Cliente expresa `IN_TRANSIT`/`COMPLETED`; servidor fija `PENDING` | **RESOLVED** | Validar conjunto cerrado y excluir `paymentStatus` del request | Aprobada |

Decisiones pendientes por subfase:

- **7A:** ninguna decisión humana de diseño permanece abierta. Siguen
  pendientes la autorización para implementar, el gate de migración y el gate
  persistente de bootstrap/RBAC; son autorizaciones operacionales, no reglas por
  inventar.
- **7B:** permanece abierta la fuente operacional exacta de precio y costo que
  debe producir los snapshots no negativos. La resolución legacy de DEC-014 no
  define por sí sola el modelo de pricing vigente para una venta nueva. R-16 ya
  no bloquea 7B.
- **7E/legacy:** continúan fuera de 7A las 404 filas, 288 IDs, DEC-006,
  DEC-007, DEC-016, DEC-017, DEC-018, DEC-029, DEC-030, la discrepancia de 28
  referencias, agrupación, Finanzas y Cierres. `WAVES_3_PLUS_NOT_STARTED`.

## 25. Subfases recomendadas

La división mantiene la fundación estructural separada de API, UI, primera
escritura real e import legacy. R-12 y R-16 ya no bloquean; el import continúa
arrastrando decisiones adicionales que no deben debilitar la operación nueva.

### 7A — Fundación de esquema

Alcance: una migración con `SaleOrigin`, secuencia de número de venta,
idempotencia, inmutabilidad, coherencia venta–líneas–ledger, lifecycle,
coherencia monetaria y actor de creación; además, el cambio separado de
bootstrap/RBAC `SALES → sales.read`.
Excluye: API, UI, import y cualquier venta real.
Requisitos de diseño: R-03, R-12 y R-15 resueltas. Implementación todavía no
autorizada.
Pruebas: estructurales y de esquema.
Gate: despliegue de migración en staging con checkpoint, como en FASE 6A, y
gate persistente separado para ejecutar bootstrap/RBAC.
Commits: uno de esquema, uno de documentación.
Staging: solo DDL y, si se autoriza por separado, bootstrap; ninguna venta.

### 7B — API transaccional

Alcance: los cinco endpoints, servicios de dominio, idempotencia, bloqueo
determinista y auditoría.
Excluye: UI, import.
Requisitos: 7A cerrada; R-04, R-15 y R-16 resueltas; fuente operacional de
precio/costo resuelta. El alta de `sales.read` debe haber pasado su gate RBAC.
Pruebas: unitarias, integración y concurrencia completas.
Gate: baseline verde; sin escritura en staging.
Commits: contratos, persistencia, API y tests, separados.

### 7C — UI de ventas

Alcance: las tres vistas de la sección 21.
Excluye: import, finanzas.
Pruebas: E2E Chromium.
Gate: baseline verde.

### 7D — Primera venta controlada en staging

Alcance: exactamente una venta, según la sección 22.
Estado inicial: `FIRST_STAGING_SALE_NOT_AUTHORIZED`.
Gates posteriores e independientes: primera confirmación y primera cancelación.

### 7E — Planificación del import legacy (Wave 3)

Alcance: **solo planificación** hasta que R-01, R-02, R-06 y las DEC asociadas
estén resueltas. No es implementación.
Excluye: cualquier escritura persistente.
Staging: prohibido.

## 26. Estado

`PHASE_7A_DESIGN_READY`.

R-03, R-04, R-12, R-15 y R-16 están resueltas. No queda una decisión humana de
diseño abierta para 7A, pero ninguna implementación está autorizada todavía.
7B conserva la decisión de pricing operacional indicada en la sección 24 y 7E
permanece bloqueada por decisiones legacy.

`NEXT_GATE` continúa siendo `PHASE_7_PLANNING` hasta aprobación humana
explícita. Este documento no autoriza implementación, migración, importación ni
escritura en staging.

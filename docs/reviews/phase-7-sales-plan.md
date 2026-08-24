# FASE 7 — Plan de ventas

Estado: `PHASE_7_PLANNING`. Este documento no autoriza implementación, cambios
de esquema, importación legacy ni escritura en staging.

Revisión de decisiones: R-03, R-04 y R-15 están aprobadas y registradas. R-12
permanece `REQUIRES_HUMAN_DECISION` y bloquea FASE 7A. La clasificación inicial
de una venta operacional permanece abierta como R-16 y bloquea FASE 7B, no 7A.

Elaborado sobre `cb7b652f301090f80b27d37820dfc63fad6128a5` con árbol limpio y
`origin/main` en el mismo commit. La evidencia procede del esquema versionado,
las migraciones aplicadas, `docs/architecture/transaction-design.md`,
`docs/architecture/authorization-matrix.md`, `docs/legacy/**`,
`docs/migration/**` y una lectura estrictamente de solo lectura del snapshot de
staging.

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
- `InventoryMovementType` ya contiene `SALE` y `SALE_CANCELLATION`.

`InventoryMovement` ya tiene `saleItemId` con FK, el CHECK
`balance_before + quantity_delta = balance_after` y el trigger de
inmutabilidad. **No hace falta ningún enum nuevo.**

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
- **Clasificación inicial operacional (R-16)**: están admitidos conceptualmente
  `IN_TRANSIT` y `COMPLETED`, pero no está decidido si el cliente selecciona una
  intención acotada o si el servidor la deriva, ni qué `paymentStatus` inicial
  corresponde a cada caso. No se debe inferir esta regla.

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

La creación admite únicamente el conjunto operacional `IN_TRANSIT` o
`COMPLETED`; `CANCELLED` nunca es estado inicial y `LEGACY_UNKNOWN` nunca es
operacional. R-16 permanece `REQUIRES_HUMAN_DECISION`: todavía no se ha
aprobado quién selecciona o deriva el estado inicial ni la regla de pago
inicial. El descuento de inventario ocurre una sola vez al crear en cualquiera
de los dos estados admitidos y no depende de resolver R-16.

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
- Ámbito por actor: único `(actorUserId, idempotencyKeyHash)`.
- Mismo actor + misma clave + mismo payload: replay del resultado ya
  comprometido, sin segundo efecto ni segundo evento de auditoría.
- Misma clave + payload distinto: `409 IDEMPOTENCY_KEY_REUSED`.

Cada operación necesita su propio ámbito de idempotencia, porque son documentos
distintos: creación sobre `Sale`, confirmación sobre `InTransitConfirmation` y
cancelación sobre `SaleCancellation`. Las unicidades de `saleId` que ya existen
en esas dos tablas aportan una segunda barrera estructural independiente de la
clave.

## 9. Diseño de `SaleItem`

- Una venta admite varias líneas; el almacén es por línea, no por venta.
- `quantity > 0` ya está garantizado por CHECK.
- `unitPriceSnapshot` y `unitCostSnapshot` se congelan en la creación.
- `lineSubtotal` se recalcula en el servidor; **el cliente nunca decide el
  total**.
- El envío se cobra una vez en el encabezado (`shippingAmount`). Si se usa
  `shippingAllocation` por línea, la suma de asignaciones debe cuadrar
  exactamente con el encabezado.
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
| `sales.created` | vendedor | `Sale` | saleId, status, número de líneas, ids de línea, ids de movimiento, total |
| `sales.in_transit_confirmed` | confirmador | `Sale` | saleId, confirmationId, estado anterior y nuevo |
| `sales.cancelled` | Dylan | `Sale` | saleId, cancellationId, motivo, ids de línea, ids de movimiento de reposición |

Prohibido en la metadata: la `Idempotency-Key` original, cookies, tokens, el
Lugar de Entrega mientras no exista política de datos personales, y cualquier
dato de cliente. La relación con el ledger se expresa por ids de movimiento,
igual que en transferencias.

## 14. Auditoría de los ocho cambios de Prisma propuestos

Los ocho puntos originales se conservan y se clasifican sin añadir cambios de
esquema. Ningún enum nuevo está justificado.

| # | Modelo afectado | Estado actual | Cambio propuesto | Motivo | ¿Depende de ventas operacionales? | ¿Depende solo del legacy? | ¿Migración? | SQL/índice necesario | Riesgo | Clasificación |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `Sale`, `InTransitConfirmation`, `SaleCancellation` | Sin persistencia de idempotencia | Hash de clave y request; unicidad por actor/operación; validación hex | Replay seguro y carrera concurrente | Sí | No | Sí | Columnas, UNIQUE e invariantes de formato | Medio | `REQUIRED_FOR_OPERATIONAL_SALES` |
| 2 | `SaleItem`, `SaleCancellation`, `InTransitConfirmation` | Mutables; solo ledger/audit son append-only | Triggers de inmutabilidad | Proteger documentos históricos | Sí | No | Sí | Triggers SQL con patrón aprobado | Bajo | `REQUIRED_FOR_OPERATIONAL_SALES` |
| 3 | `Sale`, `SaleItem` | Una venta puede quedar sin líneas | Invariante diferida de al menos una línea | Atomicidad del documento | Sí | No | Sí | Constraint trigger diferible | Medio | `REQUIRED_FOR_OPERATIONAL_SALES` |
| 4 | `SaleItem`, `InventoryMovement` | No se exige ledger completo por línea | Exactamente un `SALE` por línea y, al cancelar, un `SALE_CANCELLATION` | Integridad stock–ledger | Sí | No | Sí | Índices parciales/uniques y constraint triggers diferibles | Alto | `REQUIRED_FOR_OPERATIONAL_SALES` |
| 5 | `Sale`, `SaleItem` | No hay coherencia monetaria completa | No negativos y coherencia de asignación de envío | Evitar documentos monetarios incoherentes | Sí, salvo la asignación si no se usa | No | Sí para lo requerido | CHECK para campos; la suma entre filas requiere trigger, no CHECK | Medio | `REQUIRED_FOR_OPERATIONAL_SALES` para no negativos; `OPTIONAL` para reparto hasta fijar que se use |
| 6 | `Sale`, `User` | `sellerUserId` no representa necesariamente al actor | `createdByUserId` con FK | Auditoría inequívoca | Sí | No | Sí | Columna, FK e índice | Bajo | `REQUIRED_FOR_OPERATIONAL_SALES` |
| 7 | `Sale`, confirmación/cancelación | Estado y documentos pueden divergir; no hay discriminador escalar operacional/legacy | Coherencia estado–documento | Integridad del lifecycle sin romper legacy | Sí | También afecta legacy | Sí, después de decidir R-12/R-16 | Constraint trigger diferible; un CHECK simple no puede validar tablas relacionadas | Alto | `BLOCKED_BY_R12_AND_R16`; concepto requerido, forma exacta no justificada aún |
| 8 | `Sale` y tablas idempotentes | Ya existe índice `status,businessDate`; los UNIQUE del punto 1 indexan replay | Índices de idempotencia y listado | Rendimiento | Solo si una consulta real lo demuestra | No | No adicional hoy | Evitar duplicar UNIQUE e índice existente | Bajo | `NOT_JUSTIFIED_AS_WRITTEN` |

R-03 añade un requisito que no estaba enumerado entre esos ocho: secuencia
PostgreSQL dedicada, default generado por DB y representación Prisma compatible
para `saleNumber`. El UNIQUE y el CHECK mayúsculas/trim ya existen. Esta adición
es `REQUIRED_FOR_OPERATIONAL_SALES`, requiere migración y debe validar que la
forma `VTA-000000001` satisface las restricciones existentes. R-15, en cambio,
es bootstrap/RBAC y no requiere migración Prisma.

Compatibilidad con staging: las cuatro tablas están **vacías**, así que la
migración no reescribe datos históricos y no toca la transferencia ni el ajuste
ya validados. Aun así exige su propio gate de despliegue con checkpoint, igual
que FASE 6A.

### R-12 — `LEGACY_UNKNOWN` contra coherencia de estado/documento

Definición exacta: el enum permite `LEGACY_UNKNOWN`, reservado para evidencia
legacy ambigua, mientras el punto 7 pretende exigir documentos compatibles con
el estado. Un control estricto podría rechazar la importación posterior, y
`Sale` no tiene hoy un discriminador escalar inequívoco entre fila operacional
y legacy.

Evidencia: 401 líneas legacy carecen de estado explícito; el plan reserva
`LEGACY_UNKNOWN`; el esquema solo aporta relaciones a `LegacyRecord`, no un
origen escalar sobre el cual basar de forma simple y segura la restricción.

Impacto:

- esquema: puede requerir un discriminador explícito o un predicado de DB
  igualmente fiable;
- transacciones: toda venta operacional tendría que fijar ese origen dentro de
  la misma transacción;
- API/UI: solo podrían crear ventas operacionales y nunca `LEGACY_UNKNOWN`;
- import legacy: debe poder conservar ambigüedad sin desactivar las garantías
  de las ventas nuevas.

Alternativas consideradas por el plan original: únicamente se propuso
condicionar la coherencia al origen de la fila; no se documentó una segunda
alternativa. Esa propuesta no puede aprobarse hasta definir cómo se representa
el origen. Por tanto R-12 queda `REQUIRES_HUMAN_DECISION` y bloquea 7A. No se
creará la migración mientras siga abierto.

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

Orden recomendado: primero la fundación y la operación nuevas, después de
resolver R-12/R-16 donde corresponda; después, y por separado, la planificación del
import, que no debe empezar hasta que DEC-006, DEC-007, DEC-016, DEC-017,
DEC-018, DEC-029 y DEC-030 estén resueltas.

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
| R-12 | `LEGACY_UNKNOWN` contra coherencia estado/documento | No existe discriminador escalar de origen; el control estricto puede romper legacy | **BLOCKER** para 7A | Definir representación/predicado de origen antes de migrar | Sí; `REQUIRES_HUMAN_DECISION` |
| R-13 | Variantes de entregador y canal | 7 y 5 variantes | **LOW** | Preservar sin fusionar | Sí (DEC-012, DEC-013) |
| R-14 | 8 IDs de movimiento sin venta | Diferidos a FASE 6, ya cerrada | **LOW** | Reasignar a FASE 7 o a Wave 3 explícitamente | Sí (DEC-008) |
| R-16 | Clasificación inicial de venta operacional | Admitidos `IN_TRANSIT`/`COMPLETED`, pero sin regla sobre selección/derivación ni pago inicial | **BLOCKER** para 7B, no 7A | Aprobar intención de request y `paymentStatus` inicial | Sí; `REQUIRES_HUMAN_DECISION` |

## 25. Subfases recomendadas

La división se justifica en que 7A queda detenida únicamente por R-12 y 7B por
R-16, mientras que el import arrastra al menos diez decisiones adicionales.
Mezclarlos bloquearía la operación nueva detrás de arqueología de datos.

### 7A — Fundación de esquema

Alcance: una migración con secuencia de número de venta, idempotencia,
inmutabilidad, coherencia
venta–líneas–ledger, coherencia monetaria y actor de creación. Documentación de
diseño.
Excluye: API, UI, import, RBAC.
Requisitos: R-03 ya resuelta; R-12 pendiente y bloqueante.
Pruebas: estructurales y de esquema.
Gate: despliegue de migración en staging con checkpoint, como en FASE 6A.
Commits: uno de esquema, uno de documentación.
Staging: solo migración, sin datos.

### 7B — API transaccional

Alcance: los cinco endpoints, servicios de dominio, idempotencia, bloqueo
determinista y auditoría.
Excluye: UI, import.
Requisitos: 7A cerrada; R-04 y R-15 ya resueltas; R-16 pendiente. El alta de
`sales.read` es un gate de RBAC separado y previo.
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

`PHASE_7_PLAN_REVIEW_READY`.

R-03, R-04 y R-15 están resueltas. R-12 bloquea 7A y R-16 bloquea 7B, por lo que
ninguna implementación está autorizada todavía. 7E permanece bloqueada por
decisiones humanas y no debe iniciarse.

`NEXT_GATE` continúa siendo `PHASE_7_PLANNING` hasta aprobación humana
explícita. Este documento no autoriza implementación, migración, importación ni
escritura en staging.

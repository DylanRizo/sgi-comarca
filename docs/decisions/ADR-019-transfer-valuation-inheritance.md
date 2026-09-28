# ADR-019 — Herencia de precio y costo operacional en transferencias

## Estado

`ACCEPTED` — regla de negocio aprobada por el propietario el 2026-09-26.

Esta decisión autoriza el cambio de código y sus pruebas locales. No autoriza
desplegarlo, escribir en staging ni corregir los saldos ya afectados; cada una
de esas acciones conserva su propio gate.

## Contexto

Una transferencia hacia una bodega sin saldo crea el `InventoryBalance` destino
en cero dentro de la misma transacción (FASE 6A/6B). Hasta ahora esa fila nacía
con `currentUnitPrice` y `currentUnitCost` en `NULL` y la transferencia solo le
sumaba cantidad. Con existencias reales, eso produjo dos efectos:

- la proyección del catálogo de integración (ADR-017) marca el producto completo
  con `priceIssue = 'MISSING'` en cuanto una bodega con stock carece de precio,
  y el publicador de Marketplace deja de publicarlo;
- ADR-009 rechaza cualquier venta desde esa bodega, porque el costo es propiedad
  del servidor y `NULL` produce `SALE_COST_MISSING`, y sin precio de referencia
  también se rechaza si el vendedor no envía uno.

El caso real fue un traslado de muñequeras desde Casa Dylan, con costo y precio
registrados, hacia Casa Jean, que quedó "Sin valoración registrada". Al
2026-09-26 había ocho productos afectados, que el propietario está completando a
mano en Inventario > Valoraciones.

## Decisión

Dentro de la transacción de la transferencia, con los balances de origen y
destino ya bloqueados (`SELECT … FOR UPDATE`):

1. Si `currentUnitCost` del destino es `NULL`, toma el `currentUnitCost` del
   origen y su `costReviewRequired`.
2. De forma independiente, si `currentUnitPrice` del destino es `NULL`, toma el
   `currentUnitPrice` del origen y su `priceReviewRequired`.
3. Nunca se sobrescribe un costo o precio del destino que ya exista, aunque sea
   distinto al del origen. Un cero persistido es un valor, no un hueco.
4. Si el origen también tiene `NULL`, el destino queda `NULL` y su flag de
   revisión no cambia: no se inventan valores. El flag viaja solo junto con un
   valor heredado.
5. La herencia vive solo en `InventoryBalance`. La transferencia sigue sin crear,
   copiar ni modificar `ProductWarehouseValuation`.
6. El evento `inventory.transferred` registra en `metadata.inheritedValuation`
   qué se heredó: `cost` como `{ unitCost, reviewRequired }` o `null`, y `price`
   como `{ unitPrice, reviewRequired }` o `null`. Es la única procedencia del
   valor, porque no existe fila de valoración que lo respalde. No se registran
   los valores del destino que no cambiaron ni otros datos del origen.

La escritura ocurre en el mismo `UPDATE` que suma la cantidad del destino e
incrementa `version`, así que no añade locks ni sentencias de escritura:

- una valoración concurrente sobre el destino queda antes que la transferencia
  (y la transferencia la respeta) o espera su lock y falla por `version`, igual
  que con cualquier transferencia previa;
- dos transferencias concurrentes hacia un destino ausente heredan una sola
  vez: la segunda ya encuentra los valores y no hereda nada;
- un replay idempotente devuelve la transferencia existente sin volver a
  heredar, aunque el destino haya sido corregido después.

## Relación con decisiones previas

La regla se revisó contra las decisiones aprobadas y no las contradice:

- "Transfers do not create, copy, or modify `ProductWarehouseValuation`"
  (FASE 6A, `APPROVED_DECISIONS.md`) se mantiene: la herencia no toca esa tabla.
- "A missing destination balance may be created at zero" se refiere a la
  cantidad y se mantiene.
- ADR-009 toma el precio y el costo de la venta del `InventoryBalance` bloqueado
  y no consulta valoraciones. Esta decisión solo hace que ese balance tenga
  valores cuando la mercadería llegó desde una bodega que sí los tenía.
- ADR-009 y DEC-015 rechazan promediar entre almacenes y sustituir `NULL` por
  cero. Aquí no se promedia ni se inventa: se copia el valor real del mismo
  producto desde la bodega de la que salieron las unidades, solo donde el
  destino no tenía ninguno, y un valor por almacén existente siempre prevalece.
  La regla de DEC-015 para Waves 1–2 del importador legacy no cambia.
- La auditoría de valoraciones (`inventory.valuation.completed`) ya registra
  valores de costo y precio; los audit logs no se exponen por la API.

## Datos afectados

- Escritura: `inventory_balances.current_unit_cost`, `current_unit_price`,
  `cost_review_required` y `price_review_required` del destino, solo cuando el
  valor correspondiente era `NULL` y el del origen no.
- Escritura: `audit_logs.metadata.inheritedValuation` del evento
  `inventory.transferred`.
- Sin cambio: esquema, migraciones, RBAC, contrato HTTP de la transferencia,
  `product_warehouse_valuations`, ledger, datos legacy y staging.

Los saldos ya afectados antes de este cambio no se corrigen automáticamente.
Una corrección de datos, si se quisiera, sería un gate aparte con aprobación,
target verificado y checkpoint.

## Consecuencias

Positivas:

- un traslado deja de sacar un producto del catálogo de Marketplace y de
  bloquear sus ventas en la bodega destino;
- la procedencia de cada valor heredado queda en la auditoría;
- los valores propios de cada bodega siguen mandando.

Costos:

- un precio o costo heredado puede no ser el que el propietario quiere para esa
  bodega; se corrige en Inventario > Valoraciones como cualquier otro valor;
- el balance puede tener un valor sin fila de `ProductWarehouseValuation` que lo
  respalde; su evidencia es el evento de auditoría.

## Verificación

- unitarias de la regla pura (`inventory-transfer-valuation.spec.ts`) y del
  evento de auditoría;
- integración PostgreSQL: destino nuevo hereda ambos, destino existente no se
  toca, solo se llena el lado vacío con su flag, origen sin precio deja el
  destino sin precio, replay sin efectos dobles, herencia única con
  transferencias concurrentes, venta desde el destino con el costo heredado y
  catálogo de integración sin `MISSING` tras la transferencia.

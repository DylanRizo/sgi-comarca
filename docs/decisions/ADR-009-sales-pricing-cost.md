# ADR-009 — Precio y costo operacional de ventas

- Estado: `ACCEPTED`
- Fecha: 2026-08-27
- Alcance: DEC-014, DEC-015 y planificación de FASE 7B
- Aprobador: propietario del proyecto

## Contexto

FASE 7A exige snapshots no negativos y no nulos de precio y costo en cada
`SaleItem` operacional, pero no decide su fuente. El flujo legacy usaba un
precio global de Productos para prellenar un campo editable; aceptaba cero y el
backend confiaba tanto en el precio como en el subtotal calculado en el
navegador. La hoja Ventas conserva precio unitario, pero ninguna de sus 17
columnas contiene costo.

El modelo actual ofrece dos representaciones distintas:

- `InventoryBalance` tiene una fila única por producto+almacén y materializa
  `currentUnitPrice`, `currentUnitCost` y sus flags de revisión;
- `ProductWarehouseValuation` es evidencia histórica append-only, admite
  múltiples observaciones por producto+almacén y no identifica por sí sola una
  fila vigente.

Durante Waves 1–2, el último snapshot válido ya resolvió los valores vigentes
del balance conforme a DEC-005 y DEC-015. Consultar el balance evita reabrir una
regla de precedencia histórica en el flujo operacional.

## Decisión

Para cada línea operacional, el servicio de ventas lee y bloquea la fila única
de `InventoryBalance` correspondiente al producto y almacén.

1. Si no existe balance, la venta completa se rechaza con error de dominio
   tipado y HTTP 422, identificando producto y almacén.
2. `unitCostSnapshot` siempre toma `currentUnitCost`. El cliente nunca envía
   costo. `NULL` produce `MissingCost`/HTTP 422; cero es válido y se conserva
   exactamente como cero.
3. `currentUnitPrice` es el precio de referencia. El cliente puede omitir
   `unitPrice` o enviar un decimal no negativo. Omitirlo usa la referencia; si
   ambos faltan, se rechaza con HTTP 422. El valor enviado prevalece como
   `unitPriceSnapshot` y, cuando difiere de la referencia o esta es `NULL`, el
   evento `sales.created` registra referencia y valor aplicado como override
   explícito con metadata saneada.
4. El servidor calcula con Decimal `lineSubtotal`, `subtotal`,
   `shippingAllocation` y `total`; ninguno de esos valores se acepta del
   cliente.
5. `priceReviewRequired` o `costReviewRequired` no bloquean la operación. El
   audit log registra producto, almacén y flags de revisión; no inventa ni
   sustituye valores.
6. FASE 7B no consulta ni escribe `ProductWarehouseValuation`. ADR-006 continúa
   exigiendo protección append-only antes de un futuro escritor operacional de
   valoraciones, pero una lectura de `InventoryBalance` no activa ese límite.

La columna legacy de precio es precedente del carácter sugerido y negociable
del precio, no de un snapshot operacional confiable. La inmutabilidad de
`unitPriceSnapshot`, el snapshot de costo y el cálculo canónico de servidor son
garantías nuevas.

## Datos afectados

- Lectura: `inventory_balances` por `(product_id, warehouse_id)`.
- Escritura futura de FASE 7B: `sale_items.unit_price_snapshot` y
  `sale_items.unit_cost_snapshot`, además de totales derivados y metadata
  saneada de `sales.created`.
- Sin lectura/escritura: `product_warehouse_valuations`.
- Sin efecto: datos legacy, importaciones, staging, finanzas y cierres.

## Consecuencias

Positivas:

- una fuente vigente, única y bloqueable por línea;
- precio negociable sin confiar en subtotales del navegador;
- costo siempre server-owned, con distinción explícita entre `NULL` y cero;
- revisión humana visible en auditoría sin detener la operación diaria;
- compatibilidad directa con snapshots obligatorios y checks no negativos de
  FASE 7A.

Costos:

- una venta puede fallar aunque exista stock si falta balance, costo o precio
  utilizable;
- el servicio y las pruebas deben distinguir referencia, override y flags de
  revisión;
- cambios futuros de precios/costos no alteran snapshots de ventas ya creadas.

## Alternativas rechazadas

- Precio global de `Product`: pierde la especificidad por almacén.
- Consultar directamente `ProductWarehouseValuation`: reintroduce ambigüedad
  entre observaciones históricas.
- Promediar valores entre almacenes: contradice DEC-015.
- Sustituir `NULL` por cero: inventa evidencia; solo un cero persistido es cero.
- Bloquear valores marcados para revisión: DEC-015 los conserva como usables
  pero sospechosos.
- Aceptar costo, subtotales o totales del cliente: repite el riesgo confirmado
  del legacy.

## Rollback y cambio futuro

Antes de implementar FASE 7B, esta decisión puede sustituirse únicamente con
otra decisión aprobada y una actualización explícita del plan. Después de crear
ventas, ningún cambio de política puede reescribir snapshots, ledger o audit
logs históricos; aplicará solo a nuevas ventas y requerirá su propio gate. No
existe rollback mediante edición de filas históricas.

## Aceptación verificable para la implementación futura

- pruebas unitarias de referencia, override, `NULL`, cero, flags y cálculo
  canónico;
- integración PostgreSQL para balance faltante, costo faltante, precio faltante
  sin override y snapshots persistidos;
- auditoría saneada de override y flags de revisión;
- prueba de que crear una venta no consulta ni modifica
  `ProductWarehouseValuation`;
- ninguna relajación de constraints o triggers de FASE 7A.

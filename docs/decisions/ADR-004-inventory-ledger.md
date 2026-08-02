# ADR-004 — Balance materializado y ledger inmutable

- Estado: `ACCEPTED`
- Fecha: 2026-08-01
- Alcance: inventario y movimientos

## Contexto

El legacy mezcla un saldo por producto–almacén en Inventario con `Stock Resultante` global por producto en Movimientos. Existen 157 diferencias comparables y cuatro claves sin contraparte. Reconstruir el saldo inicial desde movimientos perdería la fuente operacional aprobada.

## Decisión

Mantener:

1. `inventory_balances`: un balance materializado único por producto y almacén;
2. `stock_movements`: ledger append-only con delta firmado, almacén y fuente del documento.

Toda mutación futura actualiza balance y crea movimiento dentro de la misma transacción. No se permite saldo negativo. Transferencias crean salida y entrada vinculadas. Inventario determina cantidad, precio y costo iniciales; movimientos legacy se preservan con `legacy_resulting_stock` informativo.

## Consecuencias

Positivas:

- lecturas rápidas y consistentes de saldo;
- historial auditable por documento/almacén;
- locks claros para concurrencia;
- reconciliación explícita entre saldo inicial e historial legacy.

Costos:

- balance y ledger son datos redundantes que exigen transacción estricta;
- anomalías históricas no pueden imponerse directamente al constraint operacional;
- importación requiere staging/resoluciones.

## Alternativas rechazadas

- Solo ledger: el historial legacy no reconcilia por almacén.
- Solo balance: perdería trazabilidad obligatoria.
- Editar movimientos para cuadrar: viola preservación histórica.

## Invariantes

- único `(product_id, warehouse_id)`;
- balance `>= 0`;
- movimientos no editables/eliminables;
- cada movimiento futuro tiene source_type/source_id;
- cancelación repone al almacén original exactamente una vez.

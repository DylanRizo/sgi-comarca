# ADR-002 — PostgreSQL como sistema operacional

- Estado: `ACCEPTED`
- Fecha: 2026-08-01
- Alcance: persistencia y transacciones

## Contexto

Google Sheets permite duplicados, referencias débiles y escrituras parciales. El sistema necesita unicidad producto–almacén, dinero exacto, locks de concurrencia, foreign keys, idempotencia, auditoría y migraciones reproducibles.

## Decisión

Usar PostgreSQL con Prisma para persistencia operacional. PostgreSQL impondrá transacciones, constraints, foreign keys, índices y tipos `NUMERIC`; Prisma representará dinero/cantidades con `Decimal`.

El saldo inicial procede de Inventario. Movimientos se importa como historial legacy, no como fuente única para reconstruir el saldo. Google Sheets queda solo lectura después del corte.

## Consecuencias

Positivas:

- consistencia ACID para ventas, transferencias y cancelaciones;
- bloqueo de balances y prevención de stock negativo;
- consultas/reportes trazables;
- representación normalizada de ventas/cierres;
- soporte de JSONB para evidencia raw.

Costos:

- requiere operación, backups y restauración;
- migraciones de esquema deben ser compatibles y revisadas;
- RPO/RTO y retención siguen requiriendo aprobación.

## Alternativas rechazadas

- Google Sheets como DB: no ofrece las garantías requeridas.
- Base NoSQL: relaciones y transacciones del dominio favorecen un modelo relacional.
- SQLite en producción: no cumple el objetivo de concurrencia/despliegue administrado.

## Verificación

FASE 3 probará constraints, Decimal, índices y concurrencia contra PostgreSQL real. FASE 12 probará backup/restauración antes del corte.

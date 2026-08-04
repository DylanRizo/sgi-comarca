# ADR-006 — Modelo estructural inicial de FASE 3A

- Estado: ACCEPTED
- Fecha: 2026-08-03
- Alcance: esquema inicial, permisos técnicos y bootstrap

## Contexto

El modelo completo propuesto para V1 contiene entidades cuya lógica pertenece a
fases posteriores. FASE 3A necesita una frontera mínima que permita establecer
identidad, permisos explícitos, inventario, ventas estructurales y trazabilidad
legacy sin implementar operaciones de negocio.

Inventario legacy contiene precio y costo variables por almacén. Un único valor
global o una única valoración por producto–almacén perdería historia.

## Decisión

Crear exclusivamente las 23 entidades enumeradas en
docs/database/phase-3a-structural-model.md.

InventoryBalance conserva quantity, current_unit_price y current_unit_cost
vigentes, junto con flags de revisión. ProductWarehouseValuation es histórica,
admite múltiples filas por producto–almacén y no tiene updated_at ni unicidad
por la pareja.

Inventario será la fuente inicial futura de cantidad, precio y costo. Las
divergencias se preservan como evidencia y los valores dudosos se marcan antes
de usarlos en analítica.

Los permisos son capacidades explícitas. ADMIN y PARTNER no reciben privilegios
implícitos. SALES se crea sin usuarios. transfers.create existe sin grants.

El bootstrap se ejecuta manualmente, dentro de una transacción, es idempotente y
rechaza conflictos en lugar de sobrescribirlos. PasswordCredential y Session
permanecen vacías.

## SQL manual autorizado

- Tres checks estructurales.
- Normalización de códigos e identificadores.
- Tres índices únicos parciales para grants activos.
- Una función defensiva.
- Exactamente dos triggers: inventory_movements y audit_logs.

No se añaden triggers operativos de ventas, inventario o cierres.

## Límite de protección de valoraciones

ProductWarehouseValuation es append-only por contrato estructural, pero FASE
3A no instala un trigger de inmutabilidad sobre esa tabla. Actualmente tampoco
existe API ni servicio operacional que escriba valoraciones.

Antes de implementar cualquier escritura operacional de precios, costos o
valoraciones debe decidirse e implementarse su protección append-only. La
entrada a FASE 6 es el límite obligatorio de esta decisión: FASE 6 no puede
aprobarse mientras la protección permanezca sin resolver.

## Consecuencias

- PostgreSQL aporta integridad estructural verificable desde la migración
  inicial.
- El historial de valoraciones no se colapsa.
- La existencia de _prisma_migrations no altera el conteo de 23 tablas de
  aplicación.
- La lógica de cambio de valoración queda bloqueada hasta resolver su
  protección append-only, como máximo al entrar a FASE 6.
- La autenticación y la lógica operacional de inventario quedan para fases
  posteriores.
- No se importa ninguna fila legacy durante FASE 3A.

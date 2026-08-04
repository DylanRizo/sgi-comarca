# FASE 3A — Modelo estructural inicial

## Alcance

FASE 3A crea únicamente 23 tablas de aplicación: users, roles, permissions,
user_roles, role_permissions, user_permissions, password_credentials,
sessions, audit_logs, warehouses, units, products, inventory_balances,
product_warehouse_valuations, inventory_movements, sales, sale_items,
sale_cancellations, in_transit_confirmations, legacy_sources, import_batches,
legacy_records y reconciliation_issues.

La tabla _prisma_migrations es infraestructura técnica de Prisma y no cuenta
como entidad de aplicación. No se crean tablas adicionales.

La fase no implementa autenticación, endpoints, ventas operativas,
transferencias, finanzas, cierres ni importación.

## Inventario y valoración

InventoryBalance conserva el estado operacional vigente y único por producto y
almacén:

- quantity NUMERIC(18,4);
- current_unit_price NUMERIC(18,2) nullable;
- current_unit_cost NUMERIC(18,2) nullable;
- price_review_required;
- cost_review_required;
- version y timestamps.

ProductWarehouseValuation conserva evidencia histórica append-only:

- precio/costo Decimal nullable;
- moneda;
- instante observado e instante efectivo opcional;
- vínculo legacy opcional;
- indicador y motivo de revisión humana;
- created_at, sin updated_at.

No existe unicidad producto–almacén en valoraciones. El índice principal ordena
por producto, almacén y observed_at descendente.

En la migración futura, la hoja Inventario será la fuente inicial de quantity,
current_unit_price y current_unit_cost. Las diferencias con otras hojas se
preservarán como evidencia. Los valores dudosos quedarán marcados y no se
usarán silenciosamente para margen. FASE 3A no importa datos.

## Integridad SQL

PostgreSQL impone:

- quantity de balance no negativa;
- quantity de SaleItem positiva;
- balance_before + quantity_delta = balance_after;
- balance único por producto–almacén;
- códigos e identificadores canónicos y únicos;
- un grant activo por par, conservando historial revocado;
- una cancelación y una confirmación como máximo por venta;
- foreign keys con borrado restrictivo;
- rechazo de UPDATE y DELETE sobre inventory_movements y audit_logs.

No existen triggers de estados, reposición, confirmación, documentos, totales,
transferencias o cierres.

## Bootstrap

El bootstrap es un comando manual, transaccional e idempotente. Crea cuatro
usuarios pendientes de activación, seis roles estructurales, diez permisos y
tres almacenes. No crea contraseñas ni sesiones.

Asignaciones:

- FINANCE: Dylan y Samantha;
- INVENTORY_MANAGER: Dylan, Samantha, Jean y Luden;
- sales.cancel directo: solo Dylan;
- SALES, ADMIN, PARTNER y READ_ONLY: sin usuarios;
- ADMIN, PARTNER y READ_ONLY: sin permisos;
- transfers.create: sin grants.

No existe roles.manage_financial_access ni privilegio implícito.

## Migración y rollback

La migración se genera con create-only, se revisa, se amplía con el SQL manual
aprobado y se aplica con migrate deploy. El bootstrap se ejecuta aparte y nunca
desde build o desde la migración.

El rollback de esta migración inicial parte de un pg_dump validado de la base
vacía. Una restauración destructiva requiere aprobación específica.

## Verificación

Las pruebas separan:

1. las 23 tablas de aplicación;
2. la única tabla técnica _prisma_migrations;
3. la función defensiva;
4. exactamente dos triggers;
5. checks, índices ordinarios e índices parciales.

También verifican grants exactos, cero credenciales/sesiones, idempotencia,
restricciones de stock/items/movimientos e historial múltiple de valoraciones.

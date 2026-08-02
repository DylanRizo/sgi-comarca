# Límites de módulos

## Regla de organización

Cada módulo expone casos de uso y contratos; sus tablas se acceden a través de repositorios/servicios del mismo módulo. Los controladores traducen HTTP y delegan. Las transacciones que abarcan módulos son coordinadas por un servicio de aplicación propietario del flujo, no por controladores ni UI.

## Módulos de negocio

| Módulo | Responsabilidad | Entidades principales | Dependencias permitidas |
|---|---|---|---|
| `auth` | login, logout, activación, sesiones, CSRF y rate limiting | sessions, invitations | users, roles, audit-logs |
| `users` | cuentas, estado y perfil | users | roles, audit-logs |
| `roles` | roles, permisos y asignaciones | roles, permissions, user_roles | audit-logs |
| `products` | catálogo, precio vigente, desactivación y búsqueda | products | units, product-groups, audit-logs |
| `units` | catálogo de unidades | units | audit-logs |
| `product-groups` | catálogo de grupos/categorías | product_groups | audit-logs |
| `warehouses` | almacenes configurables | warehouses | audit-logs |
| `inventory` | balance único producto–almacén, alertas y consultas | inventory_balances | products, warehouses, stock-movements |
| `stock-movements` | ledger inmutable de cambios | stock_movements | products, warehouses, users |
| `stock-receipts` | entradas y sus artículos | stock_receipts, stock_receipt_items | inventory, stock-movements, products |
| `transfers` | transferencia entre almacenes | inventory_transfers, transfer_items | inventory, stock-movements, warehouses |
| `sales` | venta, artículos, estados, confirmación y cancelación | sales, sale_items | inventory, stock-movements, products, warehouses |
| `finances` | ingresos/gastos manuales y vista calculada de ventas | financial_categories, financial_transactions | sales, users, audit-logs |
| `daily-closings` | cierre, detalle por vendedor y reapertura | daily_closings, closing_details | sales, finances, audit-logs |
| `inventory-audits` | sesiones de conteo, aprobación y ajustes | inventory_audits, audit_items, inventory_adjustments | inventory, stock-movements, users |
| `reports` | consultas operativas, filtros, CSV e impresión | proyecciones de lectura | módulos propietarios, sin escritura |
| `analytics` | KPIs y series verificables | proyecciones de lectura | inventory, sales, finances, closings |
| `imports` | batches, staging, errores, mapeos y reconciliación | import_batches, import_errors, import staging | módulos propietarios mediante adaptadores |
| `settings` | moneda, zona, umbrales y configuración no secreta | system_settings | audit-logs |
| `audit-logs` | historial inmutable de mutaciones y seguridad | audit_logs | users; no depende de módulos de negocio |

## Propietario de cada flujo transversal

| Flujo | Coordinador | Escrituras atómicas |
|---|---|---|
| Entrada | `stock-receipts` | recepción, items, balances, movimientos, auditoría |
| Ajuste | `inventory` | ajuste, balance, movimiento, auditoría |
| Transferencia | `transfers` | documento, items, ambos balances, movimientos, auditoría |
| Venta | `sales` | encabezado, items, balances, movimientos, auditoría |
| Confirmación/cancelación | `sales` | estado/evento, reposición si aplica, movimientos, auditoría |
| Cierre | `daily-closings` | cierre, detalles y auditoría; no cancela tránsito silenciosamente |
| Auditoría física | `inventory-audits` | sesión aprobada, ajustes, balances, movimientos, auditoría |
| Importación | `imports` | lote delimitado y entidades destino o rollback del lote |

## Invariantes de frontera

- Solo `inventory` aplica deltas a `inventory_balances`.
- Solo `stock-movements` crea movimientos; nunca se actualizan o borran.
- `sales` no inserta ingresos automáticos en `financial_transactions`.
- `reports` y `analytics` son de lectura y no limpian datos.
- `imports` preserva identidad legacy y no usa servicios HTTP internos.
- `audit-logs` se escribe dentro de la misma transacción de la mutación cuando sea posible.
- Catálogos no se codifican en componentes UI.

## Decisiones aún abiertas

Permisos exactos de transferencias, asignación inicial de SALES, fórmula/tolerancia de cierre y dashboard canónico no se resuelven en estos límites. Los módulos permiten configurarlos sin cambiar fronteras.

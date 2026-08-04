# Plan final — FASE 3A: modelo estructural y migración inicial

Este documento autoriza únicamente la planificación de FASE 3A. No autoriza implementar FASE 3B, importar el XLSX, construir autenticación operativa ni desarrollar módulos de negocio.

## 1. Estado del repositorio

- HEAD verificado: ced7ca4e859a06f241dc7d9cf5916d43ee888061.
- Rama: main.
- Working tree verificado limpio antes de preparar este documento.
- PostgreSQL: 18.4, contenedor sgi-comarca-postgres-1, estado healthy.
- PostgreSQL acepta conexiones a sgi_comarca_dev.
- Volumen sgi-comarca_postgres_data montado en /var/lib/postgresql.
- PGDATA: /var/lib/postgresql/18/docker.
- Tablas fuera de pg_catalog e information_schema antes de 3A: cero.
- legacy/private/ está ignorado por Git.
- docs/business-sources/ está ignorado por Git.
- El schema Prisma base no contiene modelos persistentes.
- No se instalaron dependencias, no se crearon migraciones y no se ejecutó bootstrap durante la planificación.

Esta aprobación reemplaza dos decisiones antiguas que todavía aparecen en parte de la documentación:

- No crear roles.manage_financial_access.
- transfers.create no se concede a ADMIN, otro rol ni usuario.

## 2. Entidades exactas

FASE 3A puede crear exclusivamente estas 23 entidades:

1. User
2. Role
3. Permission
4. UserRole
5. RolePermission
6. UserPermission
7. PasswordCredential
8. Session
9. AuditLog
10. Warehouse
11. Unit
12. Product
13. InventoryBalance
14. ProductWarehouseValuation
15. InventoryMovement
16. Sale
17. SaleItem
18. SaleCancellation
19. InTransitConfirmation
20. LegacySource
21. ImportBatch
22. LegacyRecord
23. ReconciliationIssue

No se añadirán entidades auxiliares, tablas de documentos, idempotencia, invitaciones, throttling, transferencias, finanzas, cierres ni importación operativa.

## 3. Campos principales

Convenciones:

- PK técnicas UUID.
- Instantes TIMESTAMPTZ(6), persistidos en UTC.
- Fechas de negocio como DATE cuando representen un día local.
- Cantidades NUMERIC(18,4).
- Dinero NUMERIC(18,2).
- Evidencia raw JSONB.
- Foreign keys UUID.

### User

- id
- loginIdentifier
- displayName
- status
- activatedAt nullable
- createdAt
- updatedAt

No contiene email, teléfono ni contraseña.

### Role

- id
- code
- name
- description nullable
- createdAt
- updatedAt

### Permission

- id
- code
- description
- createdAt
- updatedAt

### UserRole

- id
- userId
- roleId
- grantedAt
- grantedByUserId nullable
- revokedAt nullable
- revokedByUserId nullable

### RolePermission

- id
- roleId
- permissionId
- grantedAt
- grantedByUserId nullable
- revokedAt nullable
- revokedByUserId nullable

### UserPermission

- id
- userId
- permissionId
- grantedAt
- grantedByUserId nullable
- revokedAt nullable
- revokedByUserId nullable

Los permisos directos son grants positivos explícitos. No se introduce un sistema implícito de privilegios ni un efecto DENY en esta fase.

### PasswordCredential

- id
- userId
- passwordHash
- passwordChangedAt
- createdAt
- updatedAt

La relación con User es uno a uno. La tabla existirá vacía en 3A.

### Session

- id
- userId
- tokenHash
- createdAt
- lastSeenAt nullable
- expiresAt
- revokedAt nullable
- revokeReason nullable

La tabla existirá sin sesiones en 3A.

### AuditLog

- id
- actorUserId nullable
- action
- entityType
- entityId nullable
- beforeData nullable
- afterData nullable
- requestId nullable
- metadata nullable
- occurredAt

No tendrá updatedAt ni borrado lógico porque es append-only.

### Warehouse

- id
- code
- name
- active
- createdAt
- updatedAt

### Unit

- id
- code
- name
- active
- createdAt
- updatedAt

### Product

- id
- code
- name
- description nullable
- unitId nullable
- minimumStock
- active
- createdAt
- updatedAt

unitId permanece nullable para no resolver automáticamente la ambigüedad Unidad/Unidades.

### InventoryBalance

- id
- productId
- warehouseId
- quantity Decimal(18,4)
- currentUnitPrice Decimal(18,2) nullable
- currentUnitCost Decimal(18,2) nullable
- priceReviewRequired Boolean
- costReviewRequired Boolean
- version
- createdAt
- updatedAt

Representa el saldo operacional vigente y único por producto y almacén. En la
migración futura, Inventario legacy será la fuente inicial de quantity,
currentUnitPrice y currentUnitCost. Los valores dudosos se marcarán para
revisión y no se usarán silenciosamente en analítica de margen.

### ProductWarehouseValuation

- id
- productId
- warehouseId
- unitPrice Decimal(18,2) nullable
- unitCost Decimal(18,2) nullable
- currencyCode
- observedAt
- effectiveAt nullable
- legacyRecordId nullable
- requiresHumanReview Boolean
- reviewReason nullable
- createdAt

Es append-only y admite múltiples valoraciones históricas para el mismo
producto y almacén. No fuerza un precio o costo global cuando la evidencia
legacy varía y no sobrescribe evidencia histórica.

### InventoryMovement

- id
- productId
- warehouseId
- type
- quantityDelta
- balanceBefore
- balanceAfter
- occurredAt
- actorUserId nullable
- sourceType nullable
- sourceId nullable
- saleItemId nullable
- observation nullable
- createdAt

No tendrá updatedAt. sourceType/sourceId son referencias descriptivas; las foreign keys concretas presentes siguen siendo restrictivas.

### Sale

- id
- saleNumber
- businessDate
- status
- paymentStatus
- departureAt nullable
- completedAt nullable
- sellerUserId nullable
- legacySellerText nullable
- delivererText nullable
- salesChannelText nullable
- paymentMethodText nullable
- deliveryPlace nullable
- shippingAmount
- subtotal
- total
- currencyCode
- observations nullable
- createdAt
- updatedAt

No se implementan transiciones operativas en 3A.

### SaleItem

- id
- saleId
- productId
- warehouseId
- quantity
- unitPriceSnapshot nullable
- unitCostSnapshot nullable
- lineSubtotal
- shippingAllocation
- legacyRecordId nullable
- createdAt

El almacén pertenece obligatoriamente a cada item.

### SaleCancellation

- id
- saleId
- reason
- cancelledByUserId
- cancelledAt
- createdAt

La estructura no implementa elegibilidad ni reposición.

### InTransitConfirmation

- id
- saleId
- confirmedByUserId
- confirmedAt
- createdAt

La estructura no vuelve a tocar inventario.

### LegacySource

- id
- code
- name
- type
- metadata nullable y sanitizado
- createdAt

No almacena secretos ni rutas privadas en logs.

### ImportBatch

- id
- legacySourceId
- mode
- status
- sourceChecksum
- mappingVersion nullable
- startedAt
- completedAt nullable
- summary nullable
- failureCode nullable
- createdAt
- updatedAt

No se implementará un importador en 3A.

### LegacyRecord

- id
- legacySourceId
- importBatchId
- sourceEntity
- legacyId nullable
- legacyRowNumber
- rawData
- rawHash
- status
- vínculos opcionales a destinos estructurales
- createdAt

Conserva legacy_id, legacy_row_number, import_batch_id y raw_data sin modificar la fuente original.

### ReconciliationIssue

- id
- importBatchId
- legacyRecordId nullable
- code
- severity
- status
- requiresHumanApproval
- message
- details nullable
- entityType nullable
- entityId nullable
- resolvedAt nullable
- resolvedByUserId nullable
- resolutionNote nullable
- createdAt
- updatedAt

No se crea LegacyResolution; una eventual resolución se registra en la propia incidencia.

## 4. Relaciones

- User posee una PasswordCredential opcional, sesiones, roles y permisos directos.
- Role recibe permisos mediante RolePermission.
- UserRole, RolePermission y UserPermission conservan historial mediante revokedAt.
- Product pertenece opcionalmente a Unit.
- Product y Warehouse forman InventoryBalance.
- Product y Warehouse forman ProductWarehouseValuation.
- InventoryMovement referencia Product y Warehouse.
- InventoryMovement puede referenciar actor y SaleItem.
- Sale contiene SaleItem.
- Cada SaleItem referencia Product y Warehouse.
- Sale admite cero o una SaleCancellation.
- Sale admite cero o una InTransitConfirmation.
- LegacySource contiene ImportBatch y LegacyRecord.
- ImportBatch contiene LegacyRecord y ReconciliationIssue.
- LegacyRecord conserva la evidencia raw y permite trazar sus destinos sin corregir datos.
- ReconciliationIssue puede referenciar LegacyRecord y un usuario que documente una resolución futura.
- Todas las foreign keys usarán ON DELETE RESTRICT.
- No habrá ON DELETE CASCADE.

## 5. Enums

### UserStatus

- PENDING_ACTIVATION
- ACTIVE
- DISABLED

### InventoryMovementType

- INITIAL_BALANCE
- LEGACY
- RECEIPT
- ADJUSTMENT
- TRANSFER_OUT
- TRANSFER_IN
- SALE
- SALE_CANCELLATION

### SaleStatus

- LEGACY_UNKNOWN
- IN_TRANSIT
- COMPLETED
- CANCELLED

### PaymentStatus

- UNKNOWN
- PENDING
- PAID

### LegacySourceType

- XLSX
- GOOGLE_SHEETS
- APPS_SCRIPT

### ImportMode

- DRY_RUN
- COMMIT

### ImportStatus

- PENDING
- RUNNING
- COMMITTED
- FAILED
- ROLLED_BACK

### LegacyRecordStatus

- STAGED
- IMPORTED
- REJECTED
- REQUIRES_HUMAN_APPROVAL

### ReconciliationSeverity

- INFO
- WARNING
- ERROR
- CRITICAL

### ReconciliationStatus

- OPEN
- REQUIRES_HUMAN_APPROVAL
- RESOLVED

La moneda no será un enum cerrado. Se almacena como código configurable, inicialmente NIO.

## 6. Restricciones Prisma

- UUID como PK en las 23 entidades.
- User.loginIdentifier único y normalizado.
- Role.code único.
- Permission.code único.
- Warehouse.code único.
- Unit.code único.
- Product.code único.
- LegacySource.code único.
- Sale.saleNumber único.
- PasswordCredential.userId único.
- Session.tokenHash único.
- InventoryBalance(productId, warehouseId) único.
- ProductWarehouseValuation no tiene unicidad por producto–almacén.
- SaleCancellation.saleId único.
- InTransitConfirmation.saleId único.
- Relaciones obligatorias con onDelete: Restrict.
- Cantidades y dinero representados por Prisma Decimal.
- JSON de evidencia representado por Json/JSONB.
- No se usarán cascadas.
- No se modelarán reglas de transición o totales agregados como constraints Prisma.

La unicidad de grants activos se implementará mediante índices parciales SQL, porque Prisma no representa ese constraint de manera directa.

## 7. SQL manual

La migración generada se extenderá únicamente con:

1. CHECK inventory_balances.quantity >= 0.
2. CHECK sale_items.quantity > 0.
3. CHECK inventory_movements.balance_before + quantity_delta = balance_after.
4. Checks de forma canónica:
   - login y permisos en minúsculas y sin espacios exteriores;
   - códigos técnicos en mayúsculas y sin espacios exteriores.
5. Índice único parcial para UserRole(user_id, role_id) cuando revoked_at IS NULL.
6. Índice único parcial para RolePermission(role_id, permission_id) cuando revoked_at IS NULL.
7. Índice único parcial para UserPermission(user_id, permission_id) cuando revoked_at IS NULL.
8. Una función defensiva que rechace UPDATE y DELETE.
9. Trigger de esa función sobre inventory_movements.
10. Trigger de esa función sobre audit_logs.

No se crearán triggers para:

- transiciones de venta;
- elegibilidad de cancelación;
- reposición de inventario;
- confirmación de tránsito;
- documentos con artículos;
- totales agregados;
- cierres o reaperturas;
- transferencias.

## 8. Índices

Además de PK y unique:

- users(status).
- Grants por foreign key inversa y revokedAt.
- sessions(userId, expiresAt).
- sessions(expiresAt, revokedAt).
- audit_logs(entityType, entityId, occurredAt).
- audit_logs(actorUserId, occurredAt).
- Catálogos por active y name.
- products(name).
- products(unitId, active).
- inventory_balances(warehouseId, productId).
- product_warehouse_valuations(productId, warehouseId, observedAt DESC).
- product_warehouse_valuations(legacyRecordId).
- product_warehouse_valuations(requiresHumanReview).
- inventory_movements(productId, warehouseId, occurredAt).
- inventory_movements(type, occurredAt).
- inventory_movements(saleItemId).
- inventory_movements(actorUserId).
- sales(businessDate).
- sales(status, businessDate).
- sales(sellerUserId, businessDate).
- sale_items(saleId).
- sale_items(productId, warehouseId).
- SaleCancellation e InTransitConfirmation por actor y fecha.
- import_batches(legacySourceId, status, startedAt).
- import_batches(sourceChecksum).
- legacy_records(importBatchId, sourceEntity, legacyRowNumber).
- legacy_records(legacySourceId, legacyId).
- reconciliation_issues(importBatchId, status, severity).
- reconciliation_issues(legacyRecordId).

## 9. Archivos que se modificarían

### Crear

- packages/database/prisma/migrations/20260804044231_phase_3a_initial_structure/migration.sql
- packages/database/src/bootstrap/manifest.ts
- packages/database/src/bootstrap/run-bootstrap.ts
- packages/database/src/bootstrap/cli.ts
- packages/database/test/manifest.spec.ts
- packages/database/test/schema.integration.spec.ts
- packages/database/test/bootstrap.integration.spec.ts
- docs/database/phase-3a-structural-model.md
- docs/decisions/ADR-006-phase-3a-structural-model.md

### Modificar

- packages/database/prisma/schema.prisma
- packages/database/package.json
- package.json
- pnpm-lock.yaml
- vitest.integration.config.ts
- .github/workflows/ci.yml
- README.md
- docs/project-brief.md
- docs/database/proposed-entities.md
- docs/legacy/open-decisions.md
- docs/architecture/system-context.md
- docs/architecture/authorization-matrix.md
- docs/architecture/security-model.md
- docs/architecture/transaction-design.md
- docs/decisions/ADR-005-session-authentication.md
- docs/migration/phased-roadmap.md
- docs/migration/traceability-matrix.md

Las actualizaciones documentales serán puntuales: registrar esta aprobación y eliminar referencias a privilegios implícitos o a roles.manage_financial_access.

## 10. Dependencias

Una sola dependencia adicional:

- tsx 4.23.4 como devDependency directa de @sgi/database.

La versión ya está fijada en el lockfile por apps/api. Se declarará directamente para ejecutar el bootstrap TypeScript mediante un comando explícito.

No se cargará desde build, migraciones ni Prisma seed.

## 11. Comandos

### Preflight

    git -c safe.directory='C:/Users/Raul Gonzalez/Desktop/sgi-comarca' rev-parse HEAD
    git -c safe.directory='C:/Users/Raul Gonzalez/Desktop/sgi-comarca' status --porcelain=v1 --untracked-files=all
    docker compose ps
    docker inspect --format '{{json .Mounts}}' sgi-comarca-postgres-1
    docker exec sgi-comarca-postgres-1 printenv PGDATA
    docker exec sgi-comarca-postgres-1 psql -U sgi_dev -d sgi_comarca_dev -Atc "SELECT schemaname || '.' || tablename FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1;"

### Dependencia, schema y migración

    pnpm.cmd add --save-dev --filter @sgi/database tsx@4.23.4
    pnpm.cmd db:generate
    pnpm.cmd --filter @sgi/database exec prisma validate --config prisma.config.ts
    pnpm.cmd --filter @sgi/database exec prisma migrate dev --config prisma.config.ts --name phase_3a_initial_structure --create-only
    pnpm.cmd db:migrate:deploy
    pnpm.cmd db:bootstrap
    pnpm.cmd db:bootstrap

### Calidad

    pnpm.cmd format:check
    pnpm.cmd lint
    pnpm.cmd typecheck
    pnpm.cmd test
    pnpm.cmd test:integration
    pnpm.cmd build
    git -c safe.directory='C:/Users/Raul Gonzalez/Desktop/sgi-comarca' diff --check
    git -c safe.directory='C:/Users/Raul Gonzalez/Desktop/sgi-comarca' status --short

No se ejecutará importación XLSX ni Playwright porque 3A no contiene un flujo web.

## 12. Estrategia de migración

1. Repetir las precondiciones.
2. Crear un pg_dump pre-3A bajo backups/phase-3a/, ruta ignorada.
3. Validar el dump con pg_restore --list.
4. Definir exclusivamente los 23 modelos.
5. Generar la migración con --create-only.
6. Revisar el SQL generado.
7. Añadir manualmente checks, índices parciales y triggers permitidos.
8. Comprobar que la migración crea exactamente 23 tablas de aplicación,
   excluyendo _prisma_migrations, y que no existe otra tabla técnica.
9. Aplicar con migrate deploy.
10. Ejecutar el bootstrap mediante un comando independiente.
11. Ejecutar el bootstrap una segunda vez para verificar idempotencia.
12. Verificar conteos, grants, ausencia de credenciales/sesiones y constraints.
13. Ejecutar la puerta completa de calidad.
14. No crear commit.

CI tendrá pasos separados para migrate deploy y bootstrap. Ninguno quedará implícito en build.

## 13. Rollback

- El respaldo pre-3A se validará antes de aplicar la migración.
- Si falla antes de aplicar, la base no cambia.
- Si falla el bootstrap, su transacción completa hace rollback.
- Una migración aplicada no se editará ni se marcará manualmente como revertida.
- Dado que la base aprobada está vacía, el rollback de datos/esquema será restaurar el dump pre-3A en una base limpia.
- Cualquier recreación o restauración destructiva requerirá confirmación específica antes de ejecutarse.
- Los cambios locales de código se conservarán para diagnóstico.
- No se usará git reset --hard ni git checkout --.
- No se creará ni ejecutará una migración down automática.
- El XLSX original nunca se modifica.

## 14. Pruebas

- El esquema contiene exactamente las 23 tablas de aplicación autorizadas.
- _prisma_migrations se clasifica y verifica aparte como la única tabla técnica.
- La función, los índices y exactamente dos triggers se verifican por separado.
- Una tabla de aplicación adicional hace fallar la prueba.
- Cada FK usa borrado restrictivo.
- Un balance negativo es rechazado.
- Un SaleItem con cantidad cero o negativa es rechazado.
- Un InventoryMovement con ecuación inconsistente es rechazado.
- Un segundo balance producto–almacén es rechazado.
- Múltiples valoraciones históricas para el mismo producto–almacén son
  aceptadas.
- Login y códigos duplicados tras normalización son rechazados.
- Un segundo grant activo equivalente es rechazado.
- Un grant histórico revocado permanece preservado.
- Una segunda cancelación para la misma venta es rechazada.
- Una segunda confirmación para la misma venta es rechazada.
- UPDATE y DELETE de InventoryMovement son rechazados.
- UPDATE y DELETE de AuditLog son rechazados.
- La primera y segunda ejecución de bootstrap dejan el mismo estado.
- Un registro existente incompatible provoca rollback completo sin sobrescritura.
- Existen exactamente los diez permisos aprobados.
- transfers.create tiene cero grants.
- SALES, ADMIN, PARTNER y READ_ONLY no tienen usuarios.
- ADMIN, PARTNER y READ_ONLY no tienen permisos.
- No existen PasswordCredential ni Session.
- El build no ejecuta bootstrap.
- Las migraciones no ejecutan bootstrap.
- Lint, typecheck, unitarias, integración y build pasan.

## 15. Bootstrap autorizado

### Usuarios

- dylan / Dylan
- samantha / Samantha
- jean / Jean
- luden / Luden

Todos quedan PENDING_ACTIVATION, sin email, teléfono, contraseña ni sesión.

### Almacenes

- CASA_DYLAN / Casa Dylan
- CASA_LUDEN / Casa Luden
- CASA_JEAN / Casa Jean

### Roles estructurales

- FINANCE
- INVENTORY_MANAGER
- SALES
- ADMIN
- PARTNER
- READ_ONLY

READ_ONLY se conserva por la definición base de AGENTS.md y queda sin grants ni usuarios.

### Permisos exactos

- finances.read
- finances.manual.create
- closings.read
- closings.create
- closings.reopen
- inventory.adjust
- sales.cancel
- sales.create
- sales.confirm_in_transit
- transfers.create

No se crea roles.manage_financial_access ni otro permiso.

### Grants exactos

FINANCE:

- finances.read
- finances.manual.create
- closings.read
- closings.create
- closings.reopen

INVENTORY_MANAGER:

- inventory.adjust

SALES:

- sales.create
- sales.confirm_in_transit

Usuarios:

- FINANCE → Dylan y Samantha.
- INVENTORY_MANAGER → Dylan, Samantha, Jean y Luden.
- sales.cancel → únicamente Dylan como permiso directo.

Sin usuarios:

- SALES
- ADMIN
- PARTNER
- READ_ONLY

Sin permisos:

- ADMIN
- PARTNER
- READ_ONLY

Sin grant para ningún usuario o rol:

- transfers.create

El bootstrap:

- usa una sola transacción;
- compara registros existentes contra un manifest canónico;
- crea únicamente faltantes compatibles;
- no actualiza registros incompatibles;
- revierte todo ante un conflicto;
- no crea credenciales ni sesiones;
- no reactiva grants revocados;
- no se ejecuta durante build;
- no se ejecuta automáticamente con migraciones;
- registra únicamente conteos sanitizados, sin contraseñas, tokens, emails, teléfonos o cadenas de conexión.

## 16. Riesgos

- Prisma no expresa checks ni índices únicos parciales; el SQL manual requiere revisión.
- Los triggers append-only obligan a usar rollback transaccional o un entorno efímero en pruebas, no DELETE.
- La documentación debe permanecer alineada para no reintroducir privilegios
  implícitos de ADMIN ni roles.manage_financial_access.
- La normalización debe coincidir entre manifest, aplicación y SQL.
- LegacyRecord debe admitir varias filas legacy por Sale y varios SaleItem derivados sin crear otra entidad.
- sourceType/sourceId no constituye una foreign key polimórfica; las foreign keys concretas seguirán siendo restrictivas.
- No se probarán reglas operativas de ventas, inventario o transferencias en 3A.
- Los estados históricos, pagos, Unidad/Unidades y anomalías individuales siguen sin resolverse y no deben corregirse en esta fase.
- Restaurar el dump es destructivo y requerirá autorización específica si llegara a ser necesario.

## 17. Criterios de aprobación y decisiones pendientes

### Criterios de aprobación

- Aceptación de las 23 entidades exactas.
- Aceptación de los campos y relaciones descritos.
- Aceptación de los nueve enums.
- Aceptación de READ_ONLY como rol vacío conservado por AGENTS.md.
- Aceptación de tsx 4.23.4.
- Aceptación de checks, índices parciales y dos triggers append-only.
- Aceptación del manifest exacto del bootstrap.
- Aceptación de los archivos y comandos previstos.
- Cero tablas o permisos adicionales.
- Cero credenciales y sesiones.
- Cero grants de transfers.create.
- Cero privilegios implícitos para ADMIN o PARTNER.
- Bootstrap transaccional, idempotente y conflict-safe.
- Migración reproducible contra PostgreSQL 18.4 real.
- Documentación alineada con las aprobaciones nuevas.
- Toda la puerta de calidad en verde.
- Revisión de Codex sin hallazgos críticos o altos.
- legacy/private permanece intacto.
- No se introducen secretos.
- No se crea commit salvo solicitud explícita posterior.

### Decisiones pendientes

- Confirmar expresamente la conservación de READ_ONLY como rol vacío, ya que procede de AGENTS.md pero no fue mencionado en las asignaciones del prompt de 3A.
- La asignación de SALES continúa pendiente; el rol se crea sin usuarios.
- ADMIN y PARTNER continúan sin usuarios y sin permisos implícitos.
- transfers.create permanece creado como capacidad técnica, pero sin grant.
- La normalización Unidad/Unidades continúa REQUIRES_HUMAN_APPROVAL.
- Las resoluciones individuales de duplicados y anomalías legacy continúan pendientes.
- No se decide en 3A la activación de usuarios, contraseñas, parámetros Argon2, sesiones, cookies, CSRF ni rate limiting.
- No se decide ni implementa la lógica operativa de ventas, cancelación, confirmación, inventario, transferencias, finanzas, cierres o importación.
- No se decide una migración down automática; el rollback aprobado es backup/restauración controlada.

La implementación debe detenerse hasta recibir aprobación humana explícita de este plan.

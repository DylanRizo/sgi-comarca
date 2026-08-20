# Convenciones de API REST

## Base y recursos

- Prefijo: `/api/v1`.
- JSON UTF-8 y contratos públicos validados. Swagger/OpenAPI HTTP no está
  montado hasta que exista una puerta autenticada aprobada.
- Recursos en plural y nombres de código en inglés.
- Controladores delgados; comandos delegados a servicios de aplicación.
- Fechas/hora de API en ISO 8601 UTC; fechas de negocio locales como `YYYY-MM-DD` cuando representen un día Managua.
- Dinero y cantidades se serializan como strings decimales, nunca `float` JSON.

## Respuesta

Éxito individual:

```json
{"data":{"id":"uuid"},"meta":{"requestId":"uuid"}}
```

Listado:

```json
{"data":{"items":[],"pagination":{"page":1,"pageSize":25,"totalItems":0,"totalPages":0}},"meta":{"requestId":"uuid"}}
```

Error:

```json
{"error":{"code":"INSUFFICIENT_STOCK","message":"Stock insuficiente.","details":[],"requestId":"uuid"}}
```

Los mensajes son seguros y localizables; el cliente decide el texto final en español usando `code` cuando corresponda.

## Paginación, filtros y orden

- `page` inicia en 1; `pageSize` tiene máximo documentado por recurso.
- `sort` solo acepta campos incluidos en allowlist.
- Filtros repetibles y tipados: fechas, estado, producto, almacén, vendedor, canal.
- La API devuelve `total` cuando sea razonable; exportaciones tienen límites independientes.
- Búsqueda/autocompletado usa `q` normalizado y `limit` acotado.

## Idempotencia y concurrencia

El diseño objetivo de mutaciones críticas requiere `Idempotency-Key`:

- entradas, ajustes, transferencias;
- crear, confirmar y cancelar ventas;
- movimientos financieros;
- crear/reabrir cierres;
- aprobar/aplicar auditorías;
- importaciones commit.

La clave se almacenará con usuario, operación, hash canónico del payload, estado
y respuesta. Reusar la clave con payload distinto producirá
`409 IDEMPOTENCY_KEY_REUSED`. Esta infraestructura persistente aún no existe en
el esquema actual: el ajuste de FASE 5C no acepta una clave que no puede honrar y
su UI bloquea doble envío y no reintenta automáticamente. Añadir idempotencia
persistente requiere una decisión y cambio de esquema separados.

Actualizaciones ordinarias usan versionado optimista (`version`/ETag) cuando un conflicto de edición sea posible. Stock usa bloqueo pesimista dentro de transacción.

## Endpoints implementados en FASE 3B

Todas las rutas usan el prefijo `/api/v1`. Solo health, ready, activación y
login son públicas.

| Módulo | Endpoint | Acceso |
|---|---|---|
| health | `GET /api/v1/health`, `GET /api/v1/ready` | Público explícito |
| auth | `POST /api/v1/auth/activate`, `POST /api/v1/auth/login` | Público explícito, Origin requerido |
| auth | `GET /api/v1/auth/session`, `GET /api/v1/auth/csrf` | Sesión vigente |
| auth | `POST /api/v1/auth/logout`, `POST /api/v1/auth/change-password`, `POST /api/v1/auth/sessions/revoke-all` | Sesión, Origin y CSRF |
| users | `POST /api/v1/users/:id/invitations` | `users.invitations.create` |
| users | `POST /api/v1/users/:id/credentials/revoke` | `users.credentials.revoke` |
| users | `POST /api/v1/users/:id/sessions/revoke` | `users.sessions.revoke` |
| users | `POST /api/v1/users/:id/deactivate` | `users.status.manage` |

Las respuestas sensibles usan `Cache-Control: no-store`. La invitación
administrativa devuelve exclusivamente el token de un uso después del commit;
los otros comandos administrativos devuelven `204`.

## Endpoints read-only implementados en FASE 5A

Todos requieren sesión vigente y el permiso exacto `inventory.read`. Un DENY
directo continúa prevaleciendo; `ADMIN` e `inventory.adjust` no constituyen
bypass. Son consultas sin CSRF porque usan `GET`, devuelven
`Cache-Control: no-store` y no escriben entidades de negocio.

| Recurso | Endpoint | Parámetros |
|---|---|---|
| Productos | `GET /api/v1/products` | `page`, `pageSize` (máximo 100), `search`, `active` |
| Producto | `GET /api/v1/products/:id` | UUID de producto |
| Unidades | `GET /api/v1/units` | `page`, `pageSize`, `search`, `active` |
| Unidad | `GET /api/v1/units/:id` | UUID de unidad |
| Almacenes | `GET /api/v1/warehouses` | `page`, `pageSize`, `search`, `active` |
| Almacén | `GET /api/v1/warehouses/:id` | UUID de almacén |
| Inventario consolidado | `GET /api/v1/inventory` | `page`, `pageSize`, `search`, `active`, `warehouseId`, `availableOnly` |
| Inventario de producto | `GET /api/v1/inventory/products/:productId` | UUID; `warehouseId` opcional |
| Inventario de almacén | `GET /api/v1/inventory/warehouses/:warehouseId` | UUID más los filtros del listado consolidado |

El orden de productos es código/ID y el de catálogos es nombre/ID. Cantidades,
precios y costos son strings decimales. Cada balance incluye las valoraciones
históricas existentes para su par producto–almacén; si no existe valoración,
la colección `valuations` queda vacía. No se fabrica `observedAt`, no se expone
`LegacyRecord` ni `ReconciliationIssue` y el stock total es una suma derivada,
no persistida.

## Mutación de inventario implementada en FASE 5C

| Recurso | Endpoint | Acceso | Resultado |
|---|---|---|---|
| Ajuste manual | `POST /api/v1/inventory/adjustments` | Sesión, Origin, CSRF y `inventory.adjust` | `201`, movimiento y saldos anterior/nuevo |

El body contiene UUID de producto y almacén, `quantityDelta` decimal firmado y
`reason` obligatorio. El servicio vuelve a autorizar dentro de la transacción,
bloquea el balance con `SELECT ... FOR UPDATE`, impide cero y saldo negativo y
crea exactamente un `InventoryMovement` `ADJUSTMENT`, la actualización del
balance y un `AuditLog` `inventory.adjusted`. Un DENY directo prevalece y
`ADMIN`, `inventory.read` o `inventory.adjust` por separado no conceden otros
permisos. La respuesta usa `Cache-Control: no-store`.

## Endpoints futuros propuestos

La tabla siguiente conserva destinos arquitectónicos para módulos aún no
construidos. No describe rutas actualmente disponibles.

| Módulo | Endpoints principales |
|---|---|
| users/roles | listados, creación, edición de perfil y asignación de roles por definir; no implementados en FASE 3B |
| products | Mutaciones futuras `POST /products`, `PATCH /products/{id}` y `POST /products/{id}/deactivate` |
| catalogs | Mutaciones futuras de `/units` y `/warehouses`; `/product-groups` completo continúa futuro |
| inventory | `GET /stock-movements`; transferencias, entradas y otras mutaciones continúan futuras |
| receipts | `GET/POST /stock-receipts`, `GET /stock-receipts/{id}` |
| transfers | `GET/POST /transfers`, `GET /transfers/{id}` |
| sales | `GET/POST /sales`, `GET /sales/{id}`, `POST /sales/{id}/confirm`, `POST /sales/{id}/cancel` |
| finances | `GET/POST /financial-transactions`, `GET /financial-summary` |
| closings | `GET/POST /daily-closings`, `GET /daily-closings/{id}`, `POST /daily-closings/{id}/reopen` |
| audits | `GET/POST /inventory-audits`, `PUT /inventory-audits/{id}/counts`, `POST /inventory-audits/{id}/approve` |
| reports | `GET /reports/{type}`, `GET /reports/{type}/export` |
| analytics | `GET /analytics/dashboard` y recursos KPI documentados |
| imports | `POST /imports/dry-run`, `POST /imports/{id}/commit`, `GET /imports/{id}/report` |
| settings/audit | `GET/PATCH /settings`, `GET /audit-logs` |

Estos nombres son propuestas históricas de FASE 1. Cada fase debe promover solo
las rutas realmente implementadas y probadas. Swagger permanece sin montar.

## Estados HTTP

- `200` lectura/acción idempotente existente;
- `201` recurso creado;
- `204` mutación sin cuerpo cuando aplique;
- `400` solicitud mal formada;
- `401` sin sesión;
- `403` sesión sin permiso;
- `404` recurso no visible/existente;
- `409` estado, idempotencia, unicidad o concurrencia;
- `422` regla de dominio/validación semántica;
- `429` rate limit;
- `500` error inesperado con request ID.

## Compatibilidad y eliminación

Cambios incompatibles requieren nueva versión o ventana documentada. Movimientos, audit logs y datos legacy no exponen endpoints de edición/eliminación. La desactivación usa acciones explícitas, no `DELETE` físico.

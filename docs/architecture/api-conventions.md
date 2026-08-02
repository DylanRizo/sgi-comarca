# Convenciones de API REST

## Base y recursos

- Prefijo: `/api/v1`.
- JSON UTF-8; OpenAPI generado desde contratos validados.
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
{"data":[],"meta":{"page":1,"pageSize":25,"total":0,"requestId":"uuid"}}
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

Mutaciones críticas requieren `Idempotency-Key`:

- entradas, ajustes, transferencias;
- crear, confirmar y cancelar ventas;
- movimientos financieros;
- crear/reabrir cierres;
- aprobar/aplicar auditorías;
- importaciones commit.

La clave se almacena con usuario, operación, hash canónico del payload, estado y respuesta. Reusar la clave con payload distinto produce `409 IDEMPOTENCY_KEY_REUSED`. Una operación en curso devuelve conflicto/reintento seguro; una completada devuelve la respuesta original.

Actualizaciones ordinarias usan versionado optimista (`version`/ETag) cuando un conflicto de edición sea posible. Stock usa bloqueo pesimista dentro de transacción.

## Endpoints propuestos

| Módulo | Endpoints principales |
|---|---|
| auth | `POST /auth/login`, `/auth/logout`, `/auth/activate`, `GET /auth/session` |
| users/roles | `GET/POST /users`, `PATCH /users/{id}`, `PUT /users/{id}/roles`, `DELETE /sessions/{id}` |
| products | `GET/POST /products`, `GET/PATCH /products/{id}`, `POST /products/{id}/deactivate`, `GET /products/search` |
| catalogs | `GET/POST/PATCH /units`, `/product-groups`, `/warehouses` |
| inventory | `GET /inventory-balances`, `GET /inventory-balances/{id}`, `GET /stock-movements`, `POST /inventory-adjustments` |
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

Los nombres son contratos propuestos para FASE 1; OpenAPI definitivo se genera al implementar cada fase.

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

# Manejo de errores

## Objetivo

Los errores deben distinguir validación, autorización, conflicto de dominio, dependencia e incidente inesperado sin ocultar fallos como listas vacías ni filtrar detalles internos.

## Catálogo inicial

| Código | HTTP | Condición |
|---|---:|---|
| `VALIDATION_FAILED` | 400/422 | DTO o regla semántica inválida |
| `AUTHENTICATION_REQUIRED` | 401 | sesión ausente, expirada o revocada |
| `PERMISSION_DENIED` | 403 | permiso o política de recurso denegada |
| `RESOURCE_NOT_FOUND` | 404 | recurso inexistente/no visible |
| `DUPLICATE_PRODUCT_CODE` | 409 | código único existente |
| `DUPLICATE_INVENTORY_BALANCE` | 409 | producto–almacén duplicado |
| `INSUFFICIENT_STOCK` | 422 | delta dejaría saldo negativo |
| `INVALID_SALE_STATE` | 409 | transición de venta no permitida |
| `SALE_ALREADY_COMPLETED` | 409 | confirmación/cancelación incompatible |
| `SALE_ALREADY_CANCELLED` | 409 | transición incompatible |
| `CANCELLATION_REASON_REQUIRED` | 422 | cancelación sin motivo |
| `CLOSING_ALREADY_EXISTS` | 409 | fecha ya cerrada |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | mutación crítica sin clave |
| `IDEMPOTENCY_KEY_REUSED` | 409 | misma clave con payload diferente |
| `CONCURRENT_MODIFICATION` | 409 | versión o bloqueo conflictivo |
| `IMPORT_CRITICAL_ERROR` | 422 | lote no puede confirmarse |
| `INTERNAL_ERROR` | 500 | fallo inesperado |

## Autenticación y administración implementadas

| Código público | HTTP | Condición pública |
|---|---:|---|
| `AUTHENTICATION_FAILED` | 401 | login inválido, sin revelar existencia o estado |
| `ACTIVATION_FAILED` | 400 | token de activación inválido, expirado, consumido o invalidado |
| `SESSION_INVALID` | 401 | cookie/sesión ausente, expirada o revocada |
| `REQUEST_VERIFICATION_FAILED` | 403 | Host, Origin o CSRF inválido |
| `PASSWORD_POLICY_REJECTED` | 400 | contraseña no cumple la política aprobada |
| `INVALID_REQUEST` | 400 | DTO, UUID o body inválido |
| `ADMIN_USER_NOT_FOUND` | 404 | usuario objetivo inexistente |
| `ADMIN_USER_STATE_CONFLICT` | 409 | estado incompatible con el comando |
| `LAST_ADMIN_PROTECTED` | 409 | la operación dejaría sin ADMIN habilitado |
| `ADMIN_OPERATION_CONFLICT` | 409 | conflicto concurrente administrativo |

Estos códigos nunca incorporan mensajes internos, SQL, stack, roles, tokens,
hashes, credenciales o sesiones. Los endpoints administrativos usan
`Cache-Control: no-store`.

## Errores de dominio

Los servicios lanzan errores tipados con código estable y datos seguros estructurados. No usan strings como control de flujo. Un filtro global traduce errores a HTTP y agrega `requestId`; solo errores inesperados generan stack en logs internos.

## Transacciones

- Cualquier error antes de `COMMIT` revierte documento, balances, movimientos y auditoría del flujo.
- No se captura un error para continuar una mutación parcial.
- Violaciones de constraint se traducen a códigos de dominio conocidos.
- Deadlocks/serialization failures pueden reintentarse internamente un número acotado solo si la operación es idempotente.
- Si se desconoce el resultado después de una interrupción, el cliente reconsulta con la misma clave de idempotencia.

## UI

- Errores se muestran de forma accionable, conservando datos del formulario cuando sea seguro.
- `401` dirige a login; `403` muestra acceso denegado; `409` refresca estado antes de reintentar.
- No se presenta “sin datos” cuando la consulta falló.
- Los botones permanecen protegidos mientras se resuelve la solicitud, pero la garantía real es backend.

## Observabilidad y privacidad

Cada error registra nivel, timestamp UTC, request ID, ruta, código, actor ID cuando exista y duración. Se redactan payloads sensibles, cookies, tokens, contraseñas, cadenas de conexión y datos privados. Los mensajes públicos no incluyen SQL, stack ni nombres internos.

## Importaciones

Errores por fila incluyen hoja, `legacy_row_number`, código, severidad y evidencia raw protegida en reporte privado. Un error crítico revierte el lote; advertencias no se descartan. Los reportes versionados contienen solo conteos y referencias, nunca datos empresariales privados.

# ADR-017 — Llaves de integración de solo lectura

## Estado

`ACCEPTED_FOR_IMPLEMENTATION` — aprobado por el propietario el 2026-09-12 para
conectar el publicador de Facebook Marketplace al inventario.

Esta decisión autoriza código, migración reproducible y pruebas locales. No
autoriza por sí sola ejecutar la migración, cambiar variables, desplegar ni
emitir llaves en staging. Esas acciones conservan el checkpoint operacional
explícito del proyecto.

## Contexto

Un programa desatendido del propietario publica en Facebook Marketplace los
productos con existencias, con su precio de venta. Necesita leer el inventario
sin una persona frente al navegador.

Las opciones existentes no sirven:

- Las sesiones del SGI son humanas: caducan por inactividad a los 30 minutos y
  por tiempo absoluto a las 8 horas. ADR-016 ya estableció que las cookies
  humanas no son una credencial válida para una máquina.
- La integración Alexa usa OAuth con PKCE porque Amazon lo exige para
  vincular cuentas. Está cableada a un único cliente, a los scopes fijos
  `inventory.read` y `sales.read`, y su endpoint de voz excluye precios.

Un programa en la computadora del propietario no tiene un proveedor de
identidad que exija OAuth, y el flujo de autorización añadiría una ruta pública
de tokens que aquí no aporta seguridad.

## Decisión

- Una persona con `integrations.manage` crea desde la web una llave con nombre
  y caducidad obligatoria de 1 a 90 días. La llave actúa **en nombre de esa
  persona** y lleva exactamente el scope `inventory.read`.
- La llave es un token aleatorio de 32 bytes (43 caracteres base64url) generado
  con `AuthTokenService`. Se muestra **una sola vez**; la base conserva solo su
  SHA-256 y un prefijo de 8 caracteres para distinguir llaves.
- Emitir una llave exige que el dueño ya tenga `inventory.read`: una llave nunca
  concede algo que su dueño no tiene.
- `GET /api/v1/integrations/catalog` exige `Authorization: Bearer <llave>` y
  usa `ExternalBearerRoute` + `ServerToServerRoute`, igual que
  `POST /api/v1/alexa/requests`. **No es una ruta pública**: sin llave válida
  responde `401`. No se añade ninguna ruta pública nueva.
- En cada petición se revalida la llave y a su dueño. Quedan invalidadas por
  revocación, caducidad, usuario no activo, credencial revocada o contraseña
  cambiada después de emitir la llave, que son los mismos límites de ADR-016.
  Retirar `inventory.read` al dueño produce `403`.
- Límite persistente de 60 peticiones por minuto por llave (`429` al excederlo).
- El catálogo delega en `InventoryReadService.list` con `availableOnly` y
  `active`, sin consultar tablas por su cuenta, y proyecta solo `code`, `name`,
  `description`, `totalQuantity`, `unitPrice` y `priceIssue`. **Costos,
  valoraciones y detalle por bodega no salen del servidor.**
- Un producto tiene precio publicable solo si todas las bodegas con existencias
  tienen el mismo `currentUnitPrice` y ninguna exige revisión. En otro caso
  `unitPrice` es `null` y `priceIssue` explica el motivo: `REVIEW` (alguna
  bodega exige revisión), `MISSING` (falta precio) o `MIXED` (precios
  distintos). El consumidor no debe adivinar un precio.
- Revocar es idempotente y siempre está disponible, incluso con la integración
  deshabilitada, porque es la respuesta ante una llave filtrada. Listar también.
- La integración está deshabilitada por defecto (`INTEGRATION_KEYS_ENABLED`).
- Se auditan la creación, la revocación y la lectura del catálogo con
  `entityType = INTEGRATION`. La lectura se audita una vez por sincronización
  (la página 1), no por cada página. La auditoría nunca incluye la llave, su
  hash ni cabeceras de la petición.

## Datos persistentes

La migración `20260912120000_integration_keys` crea `integration_keys` e
`integration_rate_limit_windows`. Restricciones en la base: hash único, nombre
no vacío, caducidad posterior a la creación y scopes limitados a
`inventory.read`.

## RBAC

Se añade el permiso `integrations.manage`, concedido solo al rol `ADMIN`.
Requiere volver a ejecutar el bootstrap en cada ambiente; la matriz de
break-glass y sus pruebas se actualizan en el mismo cambio.

## Consecuencias

El publicador guarda la llave cifrada con DPAPI en la computadora del
propietario. Una llave filtrada da lectura del catálogo con precios de venta
hasta que se revoca o caduca; por eso la caducidad es obligatoria y corta, y la
revocación inmediata.

Si el dueño pierde acceso, todas sus llaves dejan de funcionar sin pasos
adicionales.

## Alternativas descartadas

- **Generalizar el OAuth de Alexa a un segundo cliente**: patrón ya aprobado,
  pero añade una ruta pública de tokens y un flujo de consentimiento que un
  programa local no necesita.
- **Usuario de servicio con contraseña**: guarda una contraseña humana en disco,
  renueva sesión cada 30 minutos y contradice ADR-016.
- **Rol de base de datos de solo lectura**: evita la autoridad de la API y
  recalcularía reglas de inventario fuera de su módulo.

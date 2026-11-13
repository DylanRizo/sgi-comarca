# ADR-024 — Monitoreo y control remoto del Bot de Marketplace

## Estado

`ACCEPTED_FOR_IMPLEMENTATION` — aprobado por el propietario el 2026-11-13 para
converger la telemetría de cuentas, interesados (leads), anuncios y cola de
publicación del Bot de Marketplace dentro del SGI, con vista de consulta para
vendedores y acciones remotas exclusivas para administración.

Esta decisión autoriza código, migración reproducible y pruebas locales. No
autoriza por sí sola ejecutar la migración ni cambiar variables en staging o
producción sin el checkpoint operacional explícito del proyecto.

## Contexto

El Bot de Marketplace (`Bot_Market`) corre en una computadora local detrás de un
router doméstico (NAT), mientras que el SGI es el único sistema publicado y
accesible desde el trabajo. El propietario necesita:

1. Consultar desde el SGI el estado de las cuentas de Facebook Marketplace,
   los interesados (chats sin responder, actividad en los últimos 14 días y
   conversión de clics a leads por producto), los anuncios publicados con sus
   recomendaciones y la cola del calendario.
2. Permitir que los vendedores (`sales.read`) consulten esa información en modo
   solo lectura para atender rápido a los interesados y conocer qué productos
   tienen enfoque comercial.
3. Ejecutar acciones remotas sobre el bot (encender/pausar, generar semana,
   aprobar ítems de cola, renovar/eliminar/republicar/marcar agotado un anuncio,
   escanear bandeja, sincronizar catálogo SGI, pausar/reanudar cuentas, cambiar
   nivel de seguridad y resolver alertas) únicamente cuando el usuario tiene
   `integrations.manage`.

El SGI en la nube no puede abrir conexiones entrantes hacia la computadora local
del bot sin túneles externos. En cambio, el bot ya se comunica con el SGI por
HTTPS saliente usando su llave de integración (ADR-017).

## Decisión

- **Arquitectura Pull-on-Heartbeat sobre HTTPS saliente**:
  - En cada ciclo del worker local, el bot envía `POST /api/v1/integrations/marketplace-bot/sync`
    autenticado con su llave `Authorization: Bearer <llave>` (`ExternalBearerRoute` +
    `ServerToServerRoute` + `IntegrationKeyGuard`).
  - El cuerpo incluye la identidad de la instancia (`instanceKey`,
    `instanceName`, `botVersion`), un `snapshot` compacto y los resultados
    (`commandResults`) de los comandos que ejecutó en el pulso anterior.
  - En la misma respuesta, el SGI devuelve `pendingCommands` (en orden FIFO) y
    expira automáticamente (`EXPIRED`) cualquier comando que lleve más de 2 horas
    en estado `PENDING`, evitando que una orden vieja se ejecute horas después
    al encender la computadora.
- **Sanitización estricta del snapshot**:
  - `sanitizeMarketplaceBotSnapshot` recorta cadenas y acota cada colección
    (`accounts`, `leads.unanswered`, `leads.products`, `listings.items`,
    `queue.upcoming`, `alerts`) antes de persistirla en `marketplace_bot_instances`.
- **RBAC con separación entre lectura comercial y control administrativo**:
  - `GET /api/v1/integrations/marketplace-bot` exige `@RequirePermission('integrations.manage', 'sales.read')`
    (semántica OR). Devuelve `canControl: true` solo si la sesión incluye
    `integrations.manage`.
  - `POST /api/v1/integrations/marketplace-bot/:instanceId/commands` y
    `POST /api/v1/integrations/marketplace-bot/commands/:commandId/cancel`
    exigen `@RequirePermission('integrations.manage')`. Un vendedor con
    `sales.read` recibe `403`.
- **Auditoría**:
  - Encolar (`INTEGRATION_BOT_COMMAND_QUEUED`) y cancelar
    (`INTEGRATION_BOT_COMMAND_CANCELLED`) comandos remotos se registran en
    `audit_logs` con `entityType = INTEGRATION`.
- **Navegación web**:
  - La vista vive en `/settings/marketplace-bot` dentro del grupo
    **Administración** (`Bot Marketplace`), visible para `integrations.manage` y
    `sales.read`, manteniendo `/settings/integrations` exclusivo para
    `integrations.manage`.

## Datos persistentes

La migración `20261113180000_marketplace_bot_monitor` añade:

- `marketplace_bot_instances`: una fila por `(owner_id, instance_key)` con el
  último `snapshot` JSONB sanitizado y `last_heartbeat_at`.
- `marketplace_bot_commands`: cola de comandos con restricciones de tipo,
  estado (`PENDING`, `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED`) y
  consistencia de `completed_at`.

## Consecuencias

- No se requiere abrir puertos ni instalar demonios de túnel en la computadora
  que ejecuta el bot.
- Los vendedores pueden dar seguimiento a los chats sin responder desde el SGI
  sin tener acceso al control del bot ni a las llaves de integración.
- Si una llave se revoca o caduca (ADR-017), el endpoint de sincronización
  rechaza el pulso de inmediato con `401`.

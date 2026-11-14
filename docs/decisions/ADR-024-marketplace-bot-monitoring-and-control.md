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
  - En la misma respuesta, el SGI devuelve `pendingCommands` (en orden FIFO,
    hasta 25 por pulso).
- **Cada comando se entrega una sola vez**:
  - Al entregarlo, el SGI registra `delivered_at` y no vuelve a enviarlo en
    pulsos posteriores. Reenviarlo en cada pulso dejaría solo en manos del bot
    no eliminar o republicar dos veces el mismo anuncio. El bot debe ejecutar lo
    que recibe y reportar el resultado en un `commandResults` posterior.
  - Si la respuesta del pulso se pierde, el comando no se reintenta: termina
    como `EXPIRED` y una persona decide de nuevo.
  - Los resultados reportados se aplican antes que cualquier expiración, y se
    aceptan también para un comando entregado que el SGI ya había dado por
    expirado: lo que el bot dice que hizo es la verdad sobre lo que hizo. Un
    resultado para un comando nunca entregado se ignora.
  - `EXPIRED` distingue dos casos con textos distintos: el comando llevaba más
    de 2 horas sin ser entregado (nunca se entrega: una orden vieja no debe
    ejecutarse horas después al encender la computadora), o fue entregado y el
    bot no reportó resultado en 2 horas.
  - Cancelar solo es posible mientras el comando no ha sido entregado. Cancelar
    uno ya entregado responde `409` y lo deja `PENDING`: el SGI no puede
    retirarlo del bot y no debe afirmar que lo canceló. Cancelar uno ya
    terminado sigue siendo idempotente.
- **Idempotencia al encolar**:
  - `POST .../:instanceId/commands` exige `Idempotency-Key`, con la misma
    convención del resto de mutaciones: se guarda solo su hash, con alcance por
    actor. Repetir la clave con el mismo comando devuelve el comando ya
    encolado, sin segunda fila ni segunda auditoría; repetirla con otro comando
    responde `409`.
  - La web pide confirmación antes de encolar lo que el bot no puede deshacer
    (eliminar un anuncio, cancelar una publicación programada, resolver todas
    las alertas) y reutiliza la clave si la petición anterior quedó sin
    respuesta.
- **Tamaño del pulso**:
  - Solo la ruta de sincronización acepta cuerpos de hasta 1 MB; el resto de la
    API conserva el límite por defecto de 100 kB. Un cuerpo mayor responde
    `413` en cualquier ruta.
  - El `detail` de un resultado es opcional y no tiene tope en la validación:
    el servicio conserva los primeros 500 caracteres. Rechazar un mensaje largo
    rechazaría el pulso completo y el bot lo repetiría indefinidamente.
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

La migración `20261114120000_marketplace_bot_command_delivery` añade a
`marketplace_bot_commands`, sin reescribir filas:

- `delivered_at`: momento en que el comando se entregó al bot;
- `idempotency_key_hash` y `request_hash`, con índice único por
  `(created_by_user_id, idempotency_key_hash)`;
- dos restricciones: un comando `CANCELLED` no puede tener `delivered_at`, y
  los dos hashes existen juntos o no existen.

Ambas migraciones conservan el checkpoint operacional indicado en el estado de
esta decisión.

## Consecuencias

- No se requiere abrir puertos ni instalar demonios de túnel en la computadora
  que ejecuta el bot.
- Los vendedores pueden dar seguimiento a los chats sin responder desde el SGI
  sin tener acceso al control del bot ni a las llaves de integración.
- Si una llave se revoca o caduca (ADR-017), el endpoint de sincronización
  rechaza el pulso de inmediato con `401`.

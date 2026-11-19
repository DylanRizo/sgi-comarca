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
    autenticado con su propia llave de sincronización `Authorization: Bearer <llave>` (`ExternalBearerRoute` +
    `ServerToServerRoute` + `IntegrationKeyGuard`).
  - El cuerpo incluye la identidad de la instancia (`instanceKey`,
    `instanceName`, `botVersion`), un `snapshot` compacto y los resultados
    (`commandResults`, con `detail` opcional y recortado a 500 caracteres)
    de los comandos que ejecutó en el pulso anterior.
  - La ruta `POST /api/v1/integrations/marketplace-bot/sync` admite cuerpos
    JSON de hasta `1 MB` para aceptar snapshots completos antes de acotarlos;
    el resto de rutas mantiene el límite por defecto de `100 kB`, y cualquier
    cuerpo mayor responde `413` en lugar de `500`.
  - La credencial de sincronización lleva `marketplace-bot.sync`. Se vincula
    al par propietario e identificador de la instalación y revalida
    `integrations.manage` del propietario. La llave de ADR-017 conserva
    acceso exclusivo al catálogo. Ambas se revocan por separado.
  - El SGI marca cada orden `DISPATCHED` antes de devolverla en orden FIFO.
    Solo `PENDING` se puede cancelar. Las órdenes pendientes vencen a las
    dos horas. Las entregadas dejan de reenviarse al vencer y conservan su
    estado hasta que el bot reporte el resultado.
  - `MARKETPLACE_BOT_CONTROL_ENABLED` está apagado por defecto. El cliente
    declara `commandProtocolVersion: 1` para recibir órdenes. Debe respetar
    `expiresAt`, guardar el ID antes de ejecutar y conservar el resultado
    hasta que el SGI lo reciba. Si se interrumpe la ejecución, debe
    reconciliar la acción antes de repetirla. Los reenvíos usan el mismo ID.
  - Encolar una orden es idempotente por actor y `requestId`. La base guarda
    la huella del ID de solicitud. Reusarlo con otro destino o payload
    devuelve `409`.
- **Sanitización estricta del snapshot**:
  - `sanitizeMarketplaceBotSnapshot` recorta cadenas y acota cada colección
    (`accounts`, `leads.unanswered`, `leads.products`, `listings.items`,
    `queue.upcoming`, `alerts`) antes de persistirla en `marketplace_bot_instances`.
- **RBAC con separación entre lectura comercial y control administrativo**:
  - `GET /api/v1/integrations/marketplace-bot` exige `@RequirePermission('integrations.manage', 'sales.read')`
    (semántica OR). Devuelve `canControl: true` si el control está habilitado y la sesión incluye
    `integrations.manage`. Solo administración recibe el historial de órdenes.
  - `POST /api/v1/integrations/marketplace-bot/:instanceId/commands` y
    `POST /api/v1/integrations/marketplace-bot/commands/:commandId/cancel`
    exigen `@RequirePermission('integrations.manage')`. Un vendedor con
    `sales.read` recibe `403`.
- **Auditoría**:
  - Encolar (`INTEGRATION_BOT_COMMAND_QUEUED`) y cancelar
    (`INTEGRATION_BOT_COMMAND_CANCELLED`) comandos remotos se registran en
    `audit_logs` con `entityType = INTEGRATION`. Cada resultado aceptado
    registra un evento `INTEGRATION_BOT_COMMAND_RESULT`.
- **Navegación web**:
  - La vista vive en `/settings/marketplace-bot` dentro del grupo
    **Administración** (`Bot Marketplace`), visible para `integrations.manage` y
    `sales.read`, manteniendo `/settings/integrations` exclusivo para
    `integrations.manage`.
  - En la tabla de anuncios publicados, la columna de acciones solo ofrece
    botones válidos para el estado real de la publicación en Facebook (`in_stock`
    sin `relist` ni `renew` antes de los 7 días; `out_of_stock` con
    `mark_available`, `relist` y `delete`; sin botones cuando hay una acción en
    cola, revisión en curso, duplicado gemelo o estado `sold`/`pending`/`unknown`).
    El bot calcula `isExactTwin` sobre todos sus anuncios presentes antes de
    limitar el pulso a 50 filas. Un cliente anterior que omite la marca puede
    seguir sincronizando. El panel espera una marca explícita de anuncio único
    para ofrecer acciones y trata un estado ausente como `unknown`.

## Datos persistentes

La migración `20261113180000_marketplace_bot_monitor` añade:

- `integration_keys.marketplace_bot_instance_key` para vincular cada llave de
  sincronización a su instalación, con una restricción de propósito en la base.
- `marketplace_bot_instances`: una fila por `(owner_user_id, instance_key)` con el
  último `snapshot` JSONB sanitizado y `last_heartbeat_at`.
- `marketplace_bot_commands`: cola de comandos con una llave de solicitud única por actor,
  estado (`PENDING`, `DISPATCHED`, `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED`) y
  coherencia de `dispatched_at` y `completed_at`.

## Consecuencias

- No se requiere abrir puertos ni instalar demonios de túnel en la computadora
  que ejecuta el bot.
- Los vendedores pueden dar seguimiento a los chats sin responder desde el SGI
  sin tener acceso al control del bot ni a las llaves de integración.
- Si una llave se revoca o caduca (ADR-017), el endpoint de sincronización
  rechaza el pulso de inmediato con `401`.

## Enmienda 2026-11-18 — horario remoto y pulso independiente

Aprobada por el propietario el 2026-11-18 para controlar el bot desde el SGI
sin depender del panel local. No añade tablas ni columnas: `command_type` ya
admite texto de hasta 40 caracteres.

- `SET_SCHEDULE` cambia los días activos (0 = lunes … 6 = domingo), la hora
  inicial y final (`HH:mm`, hora local del equipo del bot), el máximo diario
  (1–20) y la separación mínima (30–1440 minutos). `regenerate: true` cancela
  las publicaciones futuras y genera la semana con el nuevo horario; las nuevas
  quedan por aprobar en modo semiautomático.
- `QUEUE_ITEM_ACTION` admite `move` (con `scheduledAt` en hora local del bot,
  `YYYY-MM-DDTHH:mm`, fecha real de calendario y solo en el futuro) y
  `publish_now` (aprueba y adelanta la publicación; el trabajador sigue
  aplicando horario y límites de seguridad). Solo se mueven publicaciones
  `planned`, `queued` o `retry`.
- Cada anuncio puede incluir `pendingActionId` junto a `pendingAction`; cuando
  llega informado, el panel permite encolar `CANCEL_LISTING_ACTION` desde la
  propia fila (si se omite, el panel conserva el estado `En cola` sin botón).
- Los nombres de cuenta de `PAUSE_ACCOUNT`, `RESUME_ACCOUNT` y `REQUEST_SCAN`
  aceptan letras con tilde y espacios internos ("Dylan Steven"), como el bot.
- El snapshot añade `schedule` (o `null` para clientes anteriores) y el bot
  informa `worker.currentItem` mientras publica.
- El bot envía el pulso desde un hilo propio. Mientras el trabajador está
  ocupado, el pulso omite `commandProtocolVersion`: informa su estado y entrega
  resultados, pero no recibe órdenes nuevas. Con el trabajador libre recibe las
  órdenes, las ejecuta y entrega el resultado en un pulso inmediato.
- Un rechazo de validación propio del bot (por ejemplo, una hora en el pasado)
  se devuelve como `detail`; los errores de bibliotecas siguen ocultos.

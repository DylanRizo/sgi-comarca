# Integración con el publicador de Facebook Marketplace

El publicador lee del SGI los productos activos con existencias y su precio de
venta mediante una llave de integración de solo lectura
([ADR-017](../decisions/ADR-017-integration-keys-read-only.md)). El catálogo
solo proyecta existencias y precios de venta.

## Habilitar en un ambiente

La integración está apagada por defecto. Antes de habilitarla en staging:

1. Verificar el ambiente objetivo y respaldar según el runbook.
2. Aplicar solo la migración `20260912120000_integration_keys` con
   `pnpm db:migrate:deploy`.
3. Ejecutar `pnpm db:bootstrap` para crear el permiso `integrations.manage` y
   su concesión al rol `ADMIN`.
4. Desplegar API y web.
5. Definir `INTEGRATION_KEYS_ENABLED=true` en la API y reiniciarla.

## Emitir una llave

1. Entrar al SGI con una cuenta que tenga `integrations.manage` e
   `inventory.read`.
2. Ir a **Configuración → Integraciones** y crear una llave con un nombre
   reconocible y una caducidad de hasta 90 días.
3. Copiar la llave en el momento: se muestra una sola vez y el SGI solo guarda
   su huella.
4. Pegarla en el panel del publicador, que la guarda cifrada con DPAPI.

No envíe la llave por chat, correo ni capturas de pantalla, y no la escriba en
archivos del repositorio.

## Consulta

```http
GET /api/v1/integrations/catalog?page=1&pageSize=100
Authorization: Bearer <llave>
```

Respuesta (`data`):

```json
{
  "items": [
    {
      "code": "CMP-NEG-M",
      "name": "CAMISA DE COMPRESIÓN MANGA CORTA NEGRA M",
      "description": null,
      "totalQuantity": "4",
      "unitPrice": "300.00",
      "priceIssue": null
    }
  ],
  "pagination": { "page": 1, "pageSize": 100, "totalItems": 1, "totalPages": 1 }
}
```

| `priceIssue` | Significado | Qué hacer |
|---|---|---|
| `null` | Precio único y vigente | Publicar con `unitPrice` |
| `MIXED` | Las bodegas con stock tienen precios distintos | Igualar el precio en el SGI |
| `REVIEW` | Alguna bodega marca el precio en revisión | Revisar la valoración en el SGI |
| `MISSING` | Falta precio en alguna bodega con stock | Completar el precio en el SGI (desde ADR-019 una transferencia ya copia el precio del origen a un destino sin precio) |

El publicador no publica un producto con `priceIssue` distinto de `null`.

## Respuestas de error

| Código | Motivo |
|---|---|
| `401` | Falta la llave, es inválida, está revocada o caducada, o el dueño cambió su contraseña, fue desactivado o perdió su credencial |
| `403` | El dueño ya no tiene `inventory.read` |
| `429` | Más de 60 consultas por minuto con la misma llave |
| `503` | La integración está deshabilitada en este ambiente |

## Revocar

En **Configuración → Integraciones**, pulsar **Revocar**. Surte efecto en la
siguiente consulta. Revocar funciona aunque la integración esté deshabilitada.

## Conectar el monitor (ADR-024)

1. Con la migración del monitor aplicada en el ambiente autorizado, crea una
   llave de **Sincronización del bot** en **Configuración → Integraciones**.
   Usa el mismo identificador estable de instalación en el formulario y en
   el bot. Guarda la llave en el almacén de credenciales del bot.
2. El bot envía `instanceKey`, `instanceName`, `botVersion` y `snapshot`
   a `POST /api/v1/integrations/marketplace-bot/sync` con el encabezado
   `Authorization: Bearer <llave de sincronización>`. El último estado
   aparece en **Bot Marketplace**. Sigue usando la llave de lectura para el
   catálogo.
3. Para rotar la llave, emite otra con el mismo propietario e identificador,
   actualízala en el bot, confirma un nuevo pulso y revoca la anterior.

Envía únicamente la proyección comercial necesaria. Utiliza etiquetas de
producto para los leads y excluye mensajes, información de contacto de
compradores y credenciales.

El piloto de consulta usa `MARKETPLACE_BOT_CONTROL_ENABLED=false`. Para
recibir órdenes en un entorno de prueba, el cliente compatible declara
`commandProtocolVersion: 1` y lee `data.pendingCommands`. Persiste cada
ID antes de iniciar la acción, respeta `expiresAt` y reenvía el resultado
por ID en `commandResults` hasta confirmar la recepción. Cada resultado
contiene `id`, `status` (`COMPLETED` o `FAILED`) y `detail`. Después
de una interrupción, verifica el efecto real de una orden en ejecución
antes de reintentar. Prueba con una acción inocua e incluye una pérdida
de conexión y un reinicio antes de habilitar control en staging.

## Cliente de control local

El cliente local incluye los adaptadores de las 13 acciones de ADR-024 y un
registro duradero de recepción y resultados en los ajustes de su SQLite.
`sgi.monitor.control_enabled=true` permite declarar el protocolo de órdenes.
La API también requiere `MARKETPLACE_BOT_CONTROL_ENABLED=true`, después del
gate operacional con respaldo verificado y las pruebas de entrega y recuperación.

La recepción de un ID repetido devuelve el resultado guardado. Las órdenes
vencidas se rechazan y los resultados se reenvían hasta una respuesta válida
del SGI. Una ejecución interrumpida queda señalada para verificar su efecto
local antes de pedir otra orden. Los resultados excluyen mensajes de error de
bibliotecas que puedan contener información privada.

Las órdenes de anuncio registran la acción en la cola local. Solicitar un
escaneo registra la revisión para el siguiente ciclo activo del trabajador.
El historial del SGI confirma la solicitud y el snapshot permite seguir el
trabajo posterior. El permiso administrativo se valida en el backend.

# Integración con el publicador de Facebook Marketplace

El publicador lee del SGI los productos activos con existencias y su precio de
venta mediante una llave de integración de solo lectura
([ADR-017](../decisions/ADR-017-integration-keys-read-only.md)). No escribe
nada en el SGI y nunca recibe costos.

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
| `MISSING` | Falta precio en alguna bodega con stock | Completar el precio en el SGI |

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

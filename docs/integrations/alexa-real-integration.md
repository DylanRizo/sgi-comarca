# Conexión real de Alexa con SGI La Comarca

Estado al 2026-09-09: implementación local preparada y todavía no desplegada
en staging. Esta guía separa la preparación segura del checkpoint que sí
modifica staging.

## Qué quedará habilitado

La Skill privada `Inventario Comarca` podrá responder en español de México:

- existencias de un producto en una bodega;
- total y resumen acotado de ventas en tránsito;
- detalle de una venta por número: fecha, productos, cantidades y bodegas.

No podrá escribir en SGI ni pronunciar precios, costos, totales, pagos,
clientes, contactos, direcciones, vendedores, repartidores u observaciones.

## Arquitectura

```text
Echo Dot → Skill Alexa-hosted → HTTPS + access token → API SGI
    ↑                                               ↓
app Alexa ← OAuth/PKCE ← consentimiento web SGI ← PostgreSQL
```

La cuenta Amazon identifica la Skill y el Echo. La cuenta SGI determina qué
persona y permisos autorizan las consultas. Nunca se ingresan credenciales SGI
en el código de Alexa ni credenciales Amazon en SGI.

## 1. Preparación local ya implementada

- Modelo de voz `es-MX` en `packages/alexa-adapter/models/es-MX.json`.
- Puente Alexa-hosted en
  `packages/alexa-adapter/alexa-hosted/lambda/index.js`.
- Consentimiento web en `/alexa/link`.
- OAuth en `/api/v1/alexa/oauth/*`.
- Recurso de voz protegido en `POST /api/v1/alexa/requests`.
- Migración `20260909120000_alexa_account_linking`.
- Revocación desde `Mi cuenta` del SGI.
- Tokens de acceso de una hora y tokens de renovación rotatorios de 180 días,
  con 60 segundos de tolerancia para renovaciones concurrentes de Alexa.

Validación local mínima:

```bash
pnpm db:generate
pnpm alexa:test:hosted
pnpm --filter @sgi/alexa-adapter typecheck
pnpm --filter @sgi/api typecheck
pnpm --filter @sgi/web typecheck
```

## 2. Checkpoint antes de modificar staging

Antes de continuar, verificar explícitamente el proyecto/servicio de staging,
el dominio `sgi.lacomarcanic.com`, la API `api-sgi.lacomarcanic.com`, la base
Neon esperada y que no se esté apuntando a producción. Hacer respaldo según el
runbook vigente y obtener aprobación para:

1. ejecutar la migración en staging;
2. desplegar API y web de esta rama/revisión;
3. agregar las cuatro variables Alexa;
4. reemplazar y desplegar `lambda/index.js` en la Skill Development.

No avanzar si cualquiera de esos destinos no coincide con el inventario de
staging aprobado.

## 3. Crear el cliente sin publicar secretos

Generar localmente un Client ID identificable y un secreto aleatorio de 32
bytes. El valor en claro se pega una sola vez en Alexa Developer Console. En
Render se guarda únicamente su SHA-256 hexadecimal. No pegar ninguno en chat,
Git, documentación, capturas o logs.

Variables de la API:

```dotenv
ALEXA_INTEGRATION_ENABLED=true
ALEXA_OAUTH_CLIENT_ID=<client-id-exacto>
ALEXA_OAUTH_CLIENT_SECRET_SHA256=<sha256-hex-del-secreto>
ALEXA_OAUTH_REDIRECT_URIS=<redirect-uri-1>,<redirect-uri-2>
```

Los redirect URI no se inventan. Se copian desde la sección Account Linking de
la Skill y deben pertenecer exactamente a los hosts Alexa permitidos. La API no
arranca con la integración activa si falta alguno de estos valores.

## 4. Configurar Account Linking en Alexa Developer Console

En la Skill `Inventario Comarca`, etapa `Development`:

1. Abra `Build` → `Account Linking`.
2. Active `Do you allow users to create an account or link to an existing
   account with you?`.
3. Use `Auth Code Grant`.
4. Authorization URI:
   `https://sgi.lacomarcanic.com/alexa/link`.
5. Access Token URI:
   `https://api-sgi.lacomarcanic.com/api/v1/alexa/oauth/token`.
6. Escriba el Client ID exacto configurado en la API.
7. Escriba el secreto en claro generado para Alexa. No use aquí su SHA-256.
8. En Client Authentication Scheme elija credenciales en el body de la
   solicitud (`REQUEST_BODY_CREDENTIALS`).
9. Agregue exactamente los scopes `inventory.read` y `sales.read`.
10. Active PKCE y seleccione `S256` cuando la consola lo solicite.
11. Copie todos los redirect URI mostrados por Amazon a
    `ALEXA_OAUTH_REDIRECT_URIS` en staging, separados por coma.
12. Guarde. No publique ni envíe a certificación.

Si la consola genera redirect URI después del primer guardado, actualizar la
variable de staging y redesplegar/reiniciar la API antes de intentar vincular.

## 5. Desplegar el puente Alexa-hosted

1. Abra `Code` → `lambda/index.js`.
2. Reemplace todo el contenido por
   `packages/alexa-adapter/alexa-hosted/lambda/index.js`.
3. No agregue contraseñas, cookies, tokens ni el secreto OAuth.
4. El destino no secreto predeterminado es
   `https://api-sgi.lacomarcanic.com`; opcionalmente puede declararse
   `SGI_API_BASE_URL` en el entorno Alexa-hosted si cambia el staging.
5. Pulse `Save` y después `Deploy`.
6. Mantenga la prueba habilitada únicamente en `Development`.

El puente usa solamente el módulo `node:https`, incluido en Node.js; no necesita
agregar dependencias.

## 6. Vincular la cuenta SGI desde la app Alexa

La app Alexa y el Echo deben usar la misma cuenta Amazon Developer con la que
se creó la Skill.

1. Abra la app Alexa.
2. Entre a `Más` → `Skills y juegos` → `Tus Skills` → `Dev`.
3. Abra `Inventario Comarca` y seleccione `Configuración`.
4. Pulse `Vincular cuenta`.
5. Se abrirá la página del SGI. Inicie sesión con su **usuario SGI**, no con la
   cuenta Amazon.
6. Revise los dos permisos mostrados y pulse `Vincular Alexa`.
7. La app debe confirmar que el enlace fue correcto.

No escriba las credenciales SGI en Alexa Developer Console. La contraseña solo
se envía a la pantalla HTTPS normal del SGI.

## 7. Prueba controlada

Probar primero en el simulador y luego en el Echo:

```text
Alexa, abre inventario comarca.
Alexa, pregúntale a inventario comarca cuántas existencias hay de <producto> en <bodega>.
Alexa, pregúntale a inventario comarca el resumen de ventas en tránsito.
Alexa, pregúntale a inventario comarca por la venta 123.
```

Verificar que:

- las cantidades coinciden con la interfaz SGI;
- una bodega/producto ambiguo pide aclaración;
- solo se enumeran tres ventas en el resumen y se anuncia cuántas faltan;
- ninguna respuesta contiene datos excluidos;
- el audit log registra la acción y el intent, nunca slots o tokens;
- la solicitud 31 dentro de un minuto recibe límite temporal.

## 8. Desvincular y recuperar

Se puede revocar desde `SGI → Mi cuenta → Alexa → Desvincular Alexa` o desde la
configuración de la Skill en la app Alexa. Después de revocar, el access token
debe producir una tarjeta para volver a vincular.

También queda invalidado el acceso al cambiar/revocar la contraseña, desactivar
el usuario o retirar `inventory.read`/`sales.read`. Ante un problema, desactive
`ALEXA_INTEGRATION_ENABLED`, vuelva a desplegar/reiniciar la API y desvincule la
Skill; esta acción no modifica inventario ni ventas.

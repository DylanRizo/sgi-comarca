# ADR-016 — Integración Alexa de solo lectura con vinculación de cuenta

## Estado

`ACCEPTED_FOR_IMPLEMENTATION` — POC local aprobado el 2026-09-07, conexión
real acotada aprobada por el propietario el 2026-09-09 y corrección del ciclo
de renovación aprobada el 2026-09-12.

Esta decisión autoriza código, migración reproducible y pruebas locales. No
autoriza por sí sola ejecutar la migración, cambiar variables, desplegar o
vincular datos reales en staging. Esas acciones conservan el checkpoint
operacional explícito del proyecto.

## Contexto

Se requiere consultar desde un Echo Dot existencias por producto/bodega,
resumen de ventas en tránsito y detalle operativo por número. Un Echo puede ser
compartido, por lo que la respuesta audible no debe transportar información
financiera, personal ni texto libre. Las cookies humanas del SGI no son una
credencial válida para Alexa.

## Decisión

- La Skill permanece privada en la etapa `Development`, con locale `es-MX` y
  alojamiento Alexa-hosted Node.js.
- El usuario vincula su propia cuenta SGI mediante OAuth 2.0 Authorization Code
  con PKCE `S256`. El cliente tiene exactamente los scopes `inventory.read` y
  `sales.read`.
- La autorización ocurre en la web del SGI con sesión y CSRF. Los códigos duran
  cinco minutos y se consumen una sola vez.
- El endpoint OAuth de tokens autentica `client_id` y `client_secret` enviados
  en el body. SGI conserva únicamente SHA-256 del secreto configurado.
- Los access tokens opacos duran una hora; los refresh tokens duran 180 días y
  rotan al usarse. Para tolerar renovaciones concurrentes de la infraestructura
  distribuida de Alexa, un refresh token recién rotado conserva una ventana de
  reutilización de 60 segundos que no se extiende al reutilizarlo. La base de
  datos conserva solamente SHA-256 de códigos y tokens.
- Cambiar/revocar la contraseña, deshabilitar el usuario, retirar un permiso o
  desvincular Alexa invalida el acceso efectivo. Reautorizar revoca códigos y
  tokens anteriores.
- `POST /api/v1/alexa/oauth/token` es la única nueva ruta pública explícita y
  está limitada a tráfico servidor-a-servidor con validación exacta de Host.
  `POST /api/v1/alexa/requests` no es pública: exige bearer token y revalida los
  dos permisos en cada consulta.
- La autorización, estado y revocación web usan sesión SGI; las mutaciones usan
  Origin y CSRF.
- Cada vínculo tiene un límite persistente de 30 consultas por minuto.
- Se auditan autorización, emisión de tokens, revocación y consulta. Los logs no
  incluyen secretos, tokens, slots, nombres de productos, bodegas ni números de
  venta.
- La Lambda Alexa-hosted es un puente HTTPS sin secretos SGI. Elimina contexto,
  identificadores y slots no permitidos antes de llamar a la API.
- La capa conversacional sigue usando `InventoryLookupPort` y
  `SaleLookupPort`; los gateways reales delegan en los servicios de lectura de
  los módulos propietarios y no consultan tablas ni recalculan stock.
- La proyección audible de ventas incluye únicamente número, estado, fecha de
  negocio, productos, cantidades y bodega. Excluye importes, precios, costos,
  pago, cliente, contacto, dirección, vendedor, repartidor, observaciones y
  cualquier otro texto libre.
- No existe ningún intent, ruta o puerto Alexa capaz de crear o modificar
  inventario, ventas o finanzas.

## Datos persistentes

La migración incorpora `alexa_account_links`, códigos de autorización de un
uso, tokens opacos hasheados y una ventana de rate limit. Los registros de
auditoría siguen usando `audit_logs`. No se persiste ninguna contraseña Amazon,
cookie SGI, access token o refresh token en claro.

## Consecuencias

La conexión real requiere desplegar simultáneamente migración, API y web, luego
configurar Account Linking en Alexa con los redirect URI exactos publicados
por Amazon. Hasta completar ese checkpoint, el código existente en la Skill
debe considerarse demo o puente no operativo.

La respuesta de voz depende de disponibilidad y latencia de staging. Un error,
token vencido o cuenta no vinculada produce una respuesta segura; un `401`
solicita volver a vincular la cuenta.

La ampliación de vigencias y la tolerancia de rotación siguen la guía de
Amazon para evitar desvinculaciones involuntarias: access token de al menos una
hora, refresh token de al menos 180 días y una gracia mínima de 30 segundos al
rotar. La gracia solo aplica al motivo técnico `ROTATED`; una revocación del
usuario, reautorización, cambio/revocación de contraseña o desactivación del
usuario continúa invalidando el acceso sin tolerancia.

## Alternativas descartadas

- Ruta anónima de inventario o ventas: expone datos operativos.
- Cookie de usuario guardada en Lambda: mezcla sesión humana con integración y
  dificulta revocación.
- Secreto SGI estático dentro de la Skill: cualquier copia tendría el mismo
  acceso y no identificaría al usuario.
- Prisma o PostgreSQL directo desde Lambda: rompe la frontera modular y evita
  autorización/auditoría del backend.
- Publicar la Skill durante el piloto: amplía usuarios y superficie sin
  necesidad.

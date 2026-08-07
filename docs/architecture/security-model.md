# Modelo de seguridad

Estado vigente: FASE 3B completa. Las decisiones se formalizan en
[ADR-007](../decisions/ADR-007-phase-3b-authentication-authorization.md) y su
evidencia en el [informe de cierre](../reviews/phase-3b-completion-report.md).

## Principios

- rutas privadas por defecto y allowlist pública explícita;
- autorización backend denegada por defecto y permisos explícitos;
- privilegio mínimo, roles combinables y `DENY` directo prevalente;
- sesiones revocables, secretos fuera del repositorio y logs redactados;
- CSRF, Host/Origin, CORS exacto, Helmet y protección contra fuerza bruta;
- auditoría transaccional de seguridad y mutaciones importantes.

## Alta e invitación

La primera invitación del único ADMIN se genera mediante CLI local TTY. Después
de activarlo, un usuario con `users.invitations.create` puede crear o regenerar
invitaciones HTTP únicamente para usuarios `PENDING_ACTIVATION`. El token es
Base64URL de 32 bytes, dura 24 horas y PostgreSQL almacena solo su SHA-256.
Regenerar invalida invitaciones pendientes anteriores y el consumo es atómico
y de un solo uso.

El frontend recibe el token mediante `/activate#token=<TOKEN>` y elimina el
fragmento inmediatamente. No existe entrega o recuperación por correo.

## Contraseñas y login

- 12–128 puntos de código Unicode, normalización NFC y espacios preservados;
- sin trim, truncamiento, rotación periódica o reglas arbitrarias de
  composición;
- blocklist local versionada y similitud determinista con el identificador;
- Argon2id `memoryCost=65536 KiB`, `timeCost=3`, `parallelism=4`,
  `hashLength=32`, con parámetros en el formato PHC;
- respuesta uniforme y hash ficticio para usuarios inexistentes, pendientes,
  deshabilitados o sin credencial utilizable.

El throttle reside en PostgreSQL y usa la combinación identificador
normalizado + HMAC-SHA-256 del origen canónico. Permite cuatro fallos en 15
minutos, aplica retrasos `0/500/1000/2000 ms` y bloquea 15 minutos después del
cuarto. Un éxito reinicia la fila y nunca existe bloqueo permanente automático.

## Sesiones

- token opaco Base64URL de 32 bytes; solo SHA-256 en PostgreSQL;
- 30 minutos de inactividad y 8 horas absolutas;
- renovación condicional sin superar el límite absoluto;
- sesiones expiradas o revocadas no se reactivan;
- logout idempotente y revocación global tras cambio/revocación de contraseña o
  desactivación;
- cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, sin `Domain`; producción usa
  `Secure` y `__Host-sgi_session`;
- sin JWT, `localStorage` o `sessionStorage` para autenticación.

## Frontera HTTP

`OriginGuard`, `SessionGuard`, `CsrfGuard` y `PermissionGuard` son globales. El
Host debe coincidir con `API_PUBLIC_URL`. Las mutaciones requieren un Origin
incluido en `WEB_ORIGINS`; CORS con credenciales nunca usa wildcard. Las
lecturas seguras pueden omitir Origin, pero mantienen validación de Host.

`trust proxy` se configura como `false` localmente o como un número positivo y
explícito de saltos en producción, nunca como `true`. Helmet está activo. El
CSRF se deriva de la sesión con un secreto independiente del HMAC de origen y
vive solo en memoria del frontend. Respuestas sensibles usan
`Cache-Control: no-store`. Swagger permanece sin montar.

Superficie pública aprobada:

- `GET /api/v1/health`;
- `GET /api/v1/ready`;
- `POST /api/v1/auth/activate`;
- `POST /api/v1/auth/login`.

Añadir otra ruta pública requiere decisión explícita y `PublicRoute`.

## Autorización

`EffectivePermissionsService` consulta grants activos por rol y usuario. Un
`UserPermission DENY` directo activo elimina el permiso aunque exista un grant
por rol. No hay wildcard, herencia, prefijo, superusuario ADMIN ni comparación
de nombres. `PermissionGuard` exige el código exacto declarado por
`RequirePermission`; los servicios aplican además políticas de recurso y
concurrencia.

## Último ADMIN y recuperación

La política consulta roles y estados dentro de la transacción. Impide dejar
cero ADMIN habilitados, desactivar al último ADMIN o revocar
administrativamente su credencial. Permite revocar sus sesiones, logout y
cambio normal de contraseña. La CLI local `auth:recover-admin` es la única
excepción break-glass y no crea otro ADMIN.

## Auditoría, secretos y errores

`audit_logs` registra actor, acción, entidad, timestamp UTC y metadatos
permitidos dentro de la transacción. Nunca acepta password, token, hash, cookie,
CSRF, Origin original, credencial o sesión completa. El logger redacta headers
sensibles y los errores externos no incluyen SQL, stack, roles o configuración.

En producción son obligatorios secretos independientes de al menos 32 bytes
para `AUTH_CSRF_HMAC_SECRET_BASE64` y
`AUTH_ORIGIN_HMAC_SECRET_BASE64`. Los secretos reales se administran fuera de
Git.

## Verificación

Las suites cubren rutas públicas/privadas, matriz de cuatro usuarios, DENY,
último ADMIN, login uniforme, throttle concurrente, CSRF, Host/Origin, cookies,
revocación, expiración idle/absoluta, administración API y ausencia de secretos.

# FASE 3B — Informe de cierre

## Estado y autoridad

**FASE 3B — COMPLETE**

Este informe es la fuente canónica del estado implementado y aprobado de FASE
3B. Resume las decisiones registradas en
[ADR-007](../decisions/ADR-007-phase-3b-authentication-authorization.md), los
procedimientos del
[runbook operativo](../deployment/phase-3b-auth-operations.md) y la evidencia
de los bloques versionados. El plan original se conserva como historia de la
planificación, no como descripción del estado actual.

Bloqueos: ninguno.

Hallazgos críticos/altos abiertos: ninguno.

Deuda aceptada: documentada y no bloqueante.

## Alcance terminado

FASE 3B entrega autenticación first-party, sesiones opacas, autorización por
permisos efectivos, bootstrap y recuperación administrativa, cuatro comandos
HTTP de administración de usuarios y la experiencia web mínima de
autenticación. No entrega módulos operacionales de inventario, ventas,
transferencias, finanzas o cierres, importación legacy ni UI administrativa.

## Trazabilidad de implementación

| Bloque | Objetivo | Commit | Resultado |
|---|---|---|---|
| 1 | Persistencia de autenticación | `2229ecd4edb9cd3fccc664b24698d1a3697e8d1b` | Modelos, migración segura y constraints |
| 2 | Bootstrap y recuperación administrativa | `053a6d884264fc5ae440c4bf8be543e32d2f48a8` | Matriz inicial, CLI y último ADMIN |
| 3 | Servicios de autenticación | `0c79490843b16a87e13c8e29ad2ddedb5defda83` | Passwords, login, throttle, activación y sesiones |
| 4 | Frontera HTTP segura | `3042772a2dc2bd1f585d39d9eb432ce6621cdaf2` | Guards, Origin, CSRF, cookies y permisos efectivos |
| 5 | Endpoints de autenticación | `583aa28a8a928f96d19416976dcf1d9883a2bb3e` | Siete endpoints HTTP de auth |
| Reparación | CSRF determinista | `01be60593a1f79d8d0a87722595d08cb0cfb1c2e` | Regresión estable sin cambio de producción |
| 6 | Experiencia web | `e574d8be5cc007a0ea1a9a7825e41c9d884a4bcf` | Activación, login, cuenta y expiración |
| 7 | Cobertura de aceptación | `bf646d6475f88fdffb5a817ffacb7166ab393807` | Matriz, DENY, superficie pública y expiración E2E |
| 7A | Administración de usuarios | `88bd53ec722255926e79732afa5f6a46dfa5a38e` | Cuatro comandos administrativos protegidos |
| 8 | Reconciliación documental | Sin commit en este bloque | Fuentes alineadas y cierre formal |

## Arquitectura resultante

- Monolito modular: Next.js, NestJS, Prisma y PostgreSQL.
- Tres migraciones aplicadas: estructura 3A, modelos de autenticación y efecto
  de permisos directos.
- PostgreSQL conserva hashes, estado revocable, throttle, grants y auditoría.
- La API es la autoridad de autenticación y autorización. El frontend usa los
  permisos retornados solo para experiencia de usuario.
- Las rutas son privadas por defecto; solo `PublicRoute` puede abrir una ruta
  previamente aprobada.

## Matriz inicial

| Usuario | Roles activos | Permiso directo | Permisos efectivos |
|---|---|---|---:|
| Dylan | `ADMIN`, `FINANCE`, `INVENTORY_MANAGER`, `SALES` | `sales.cancel` | 13 |
| Samantha | `FINANCE`, `INVENTORY_MANAGER`, `SALES` | — | 8 |
| Jean | `INVENTORY_MANAGER`, `SALES` | — | 3 |
| Luden | `INVENTORY_MANAGER`, `SALES` | — | 3 |

`ADMIN` tiene exactamente `users.invitations.create`,
`users.credentials.revoke`, `users.sessions.revoke` y `users.status.manage`.
`SALES` tiene exactamente `sales.create` y `sales.confirm_in_transit`.
`FINANCE` conserva cinco grants, `INVENTORY_MANAGER` conserva
`inventory.adjust`, `transfers.create` no tiene grants y `PARTNER` y
`READ_ONLY` no tienen usuarios. Existen 14 permisos, 11 `UserRole` activos, 12
`RolePermission` activos y un `UserPermission` directo inicial.

Los grants no se infieren por el nombre del rol. `UserPermission` admite
`GRANT` o `DENY`; un `DENY` directo activo prevalece sobre cualquier grant por
rol. No existen wildcards, herencia ni bypass de `ADMIN`.

## Autenticación y activación

- Contraseñas: 12–128 puntos de código Unicode, normalización NFC, espacios
  preservados, sin trim ni reglas arbitrarias de composición.
- Blocklist local versionada y regla determinista de similitud con el login.
- Argon2id: `memoryCost=65536 KiB`, `timeCost=3`, `parallelism=4` y
  `hashLength=32`; los parámetros quedan en el formato PHC.
- Invitaciones: token aleatorio Base64URL de 32 bytes, solo SHA-256 en DB, 24
  horas exactas, un solo uso y regeneración invalidante.
- La web recibe activaciones mediante `/activate#token=<TOKEN>` y elimina el
  fragmento inmediatamente.
- Login con mensaje uniforme y hash ficticio para categorías inválidas.
- Throttle PostgreSQL por identificador normalizado + HMAC-SHA-256 del origen:
  cuatro fallos en 15 minutos, retrasos `0/500/1000/2000 ms` y bloqueo de 15
  minutos.

## Sesiones

- Token opaco Base64URL de 32 bytes; solo SHA-256 en PostgreSQL.
- Inactividad máxima de 30 minutos y duración absoluta de 8 horas.
- Renovación condicional sin superar el límite absoluto; una sesión expirada o
  revocada no se reactiva.
- Logout idempotente; cambio de contraseña y revocación administrativa de
  credencial revocan todas las sesiones.
- Cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, sin `Domain`; en producción usa
  `Secure` y `__Host-sgi_session`.
- No se usan JWT, `localStorage` ni `sessionStorage` para autenticación.

## Seguridad HTTP y autorización

La API valida Host y Origin, limita CORS a los orígenes configurados, usa
Helmet y configura `trust proxy` como `false` o número explícito de saltos. Las
mutaciones autenticadas requieren CSRF derivado de la sesión. Los guards
globales resuelven Origin, sesión, CSRF y permiso efectivo. Las respuestas
sensibles usan `Cache-Control: no-store`; cookies, tokens, passwords, hashes y
orígenes originales se redactan de logs y errores. Swagger no se monta hasta
que exista una puerta autenticada aprobada.

Superficie pública exacta:

- `GET /api/v1/health`
- `GET /api/v1/ready`
- `POST /api/v1/auth/activate`
- `POST /api/v1/auth/login`

Endpoints privados de autenticación:

- `GET /api/v1/auth/session`
- `GET /api/v1/auth/csrf`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/change-password`
- `POST /api/v1/auth/sessions/revoke-all`

## Administración API

| Endpoint | Permiso | Efecto |
|---|---|---|
| `POST /api/v1/users/:id/invitations` | `users.invitations.create` | Crea/regenera invitación solo para `PENDING_ACTIVATION` |
| `POST /api/v1/users/:id/credentials/revoke` | `users.credentials.revoke` | `ACTIVE → PENDING_ACTIVATION`, revoca credencial y sesiones, sin crear invitación |
| `POST /api/v1/users/:id/sessions/revoke` | `users.sessions.revoke` | Revoca todas las sesiones del objetivo de forma idempotente |
| `POST /api/v1/users/:id/deactivate` | `users.status.manage` | `ACTIVE/PENDING_ACTIVATION → DISABLED`, revoca sesiones e invalida invitaciones |

Las invitaciones administrativas entregan el token solo después del commit.
Dos generaciones simultáneas producen un `201` y un
`409 ADMIN_OPERATION_CONFLICT`; una solicitud posterior puede regenerar. La
desactivación conserva la credencial y `activatedAt`; la revocación de
sesiones no cambia estado, credencial o invitaciones.

## Último ADMIN y CLI

Dylan es el único ADMIN inicial, pero la política consulta roles y estados de
PostgreSQL y no depende de su nombre o ID. No se puede dejar cero ADMIN
habilitados, desactivar al último ADMIN ni revocar administrativamente su
credencial. Sí se permite logout, cambio normal de contraseña y revocación de
sus sesiones.

- `pnpm auth:bootstrap-admin-invitation`: invitación inicial antes del primer
  ADMIN activo.
- `pnpm auth:recover-admin`: recuperación local break-glass del único ADMIN.

Ambas CLI son manuales, requieren TTY y confirmación, rechazan argumentos y
muestran el token una sola vez. La recuperación no crea otro ADMIN ni cambia
la matriz. Consulte el runbook operativo antes de usarlas.

## Frontend

Páginas entregadas: `/activate`, `/login`, `/app`,
`/account/change-password`, `/unauthorized` y `/session-expired`. El token de
sesión permanece inaccesible a JavaScript, el CSRF vive solo en memoria y no se
exponen roles o hashes. No existe UI administrativa en FASE 3B.

## Evidencia final

- Unitarias: **47/47**.
- Integración PostgreSQL/HTTP: **85/85**.
- E2E Chromium: **11/11**.
- `format:check`, lint, typecheck y build: correctos.
- Cobertura: cuatro usuarios, matriz exacta, DENY, último ADMIN, concurrencia,
  activación, login, throttle, sesiones, CSRF, Origin, expiración idle y
  absoluta, administración API y ausencia de secretos.

## Deuda aceptada

- recalibrar Argon2id en Railway;
- reevaluar mínimo de 15 caracteres y MFA si aumenta la exposición;
- evaluar throttles independientes por identificador y por origen;
- definir limpieza/retención de sesiones, invitaciones y throttles expirados;
- validar `TRUST_PROXY_HOPS` y rotación de secretos HMAC en producción;
- montar Swagger/OpenAPI solo detrás de una puerta autenticada;
- construir UI administrativa en una fase posterior;
- retirar el aviso de compatibilidad de Nest para el patrón legacy `/api/*`
  durante hardening.

Estas tareas no son requisitos pendientes de FASE 3B.

# ADR-007 — Autenticación y autorización de FASE 3B

- Estado: `ACCEPTED`
- Fecha: 2026-08-07
- Alcance: identidad, sesiones, autorización y administración limitada
- Supersede: detalles diferidos de ADR-005
- Extiende: fotografía estructural de FASE 3A en ADR-006

## Contexto

ADR-005 eligió sesiones opacas y ADR-006 registró la matriz mínima de FASE 3A.
FASE 3B cerró las decisiones operativas, añadió los modelos necesarios y
probó la superficie HTTP y web. La historia de 3A permanece válida; este ADR
define el estado vigente posterior.

## Decisión

### Matriz inicial

| Usuario | Roles activos | Permiso directo |
|---|---|---|
| Dylan | `ADMIN`, `FINANCE`, `INVENTORY_MANAGER`, `SALES` | `sales.cancel` |
| Samantha | `FINANCE`, `INVENTORY_MANAGER`, `SALES` | — |
| Jean | `INVENTORY_MANAGER`, `SALES` | — |
| Luden | `INVENTORY_MANAGER`, `SALES` | — |

`ADMIN` tiene exactamente:

- `users.invitations.create`;
- `users.credentials.revoke`;
- `users.sessions.revoke`;
- `users.status.manage`.

`SALES` tiene exactamente `sales.create` y
`sales.confirm_in_transit`. `transfers.create` no tiene grants. `PARTNER` y
`READ_ONLY` no tienen usuarios iniciales.

Los permisos se conceden exclusivamente mediante `RolePermission` y
`UserPermission` activos. `UserPermission` admite `GRANT` y `DENY`; un `DENY`
directo prevalece. No hay wildcard, herencia, prefijos, bypass administrativo
ni lógica equivalente a `role === ADMIN => allow`. Un usuario ADMIN solo recibe
los cuatro grants administrativos más los roles o grants explícitos que posea.

### Contraseñas, invitaciones y login

- Contraseñas de 12–128 puntos de código, normalizadas NFC, sin trim y con
  espacios permitidos.
- Blocklist local versionada y similitud determinista con el identificador.
- Argon2id con parámetros actuales `65536 KiB`, `timeCost=3`,
  `parallelism=4`, `hashLength=32` y formato PHC.
- Invitación Base64URL de 32 bytes, 24 horas, un uso, regeneración invalidante
  y solo SHA-256 en PostgreSQL.
- Respuesta uniforme de login y verificación con hash ficticio para cuentas no
  utilizables.
- Throttle persistente por identificador normalizado + HMAC-SHA-256 del origen:
  cuatro fallos en 15 minutos, retrasos `0/500/1000/2000 ms` y bloqueo fijo de
  15 minutos.

No se implementan MFA, OAuth, Google login, recuperación por correo ni rotación
periódica obligatoria.

### Sesiones

La sesión usa un token opaco Base64URL de 32 bytes y PostgreSQL almacena solo
su SHA-256. La expiración idle es 30 minutos y la absoluta 8 horas. La
renovación nunca supera el límite absoluto ni reactiva sesiones expiradas o
revocadas. La cookie es `HttpOnly`, `SameSite=Lax`, `Path=/`, sin `Domain`; en
producción usa `Secure` y `__Host-sgi_session`. No se usan JWT ni Web Storage
para autenticación.

### Frontera HTTP

- Host y Origin se validan contra configuración exacta.
- CORS con credenciales usa allowlist, nunca wildcard.
- `trust proxy` es `false` localmente o un número de saltos explícito en
  producción, nunca el booleano `true`.
- Helmet está activo.
- Toda mutación autenticada exige CSRF derivado de la sesión.
- Las rutas son privadas por defecto; `PublicRoute` abre únicamente la
  allowlist aprobada.
- `PermissionGuard` consulta permisos efectivos en PostgreSQL.
- Respuestas sensibles usan `Cache-Control: no-store`.
- Swagger no está montado y no debe habilitarse sin una puerta autenticada.

### Administración limitada

FASE 3B expone únicamente:

| Operación | Endpoint | Permiso |
|---|---|---|
| Crear/regenerar invitación | `POST /api/v1/users/:id/invitations` | `users.invitations.create` |
| Revocar credencial | `POST /api/v1/users/:id/credentials/revoke` | `users.credentials.revoke` |
| Revocar sesiones | `POST /api/v1/users/:id/sessions/revoke` | `users.sessions.revoke` |
| Desactivar usuario | `POST /api/v1/users/:id/deactivate` | `users.status.manage` |

No se crean usuarios, asignan roles/permisos, reactivan usuarios deshabilitados
ni revocan sesiones ajenas individuales. No existe UI administrativa.

### Último ADMIN

La política se basa en `UserRole`, rol `ADMIN` y estado de usuario dentro de la
transacción; no depende de Dylan. Impide dejar cero ADMIN habilitados,
desactivar al último ADMIN y revocar administrativamente su credencial. Permite
revocar sus sesiones, logout y cambio normal de contraseña.

La CLI local `auth:recover-admin` es la única excepción break-glass: exige TTY,
matriz compatible y exactamente un ADMIN asignado; invalida acceso anterior,
devuelve el usuario a `PENDING_ACTIVATION` y crea una invitación nueva sin crear
otro ADMIN.

## Consecuencias

La revocación y los cambios de permisos son inmediatos; el navegador no porta
claims autónomos. Cada solicitud autenticada consulta estado actual y las
mutaciones sensibles coordinan transacciones PostgreSQL. El costo aceptado es
mantener sesiones/throttles persistentes, operar secretos por ambiente y
recalibrar Argon2 en producción.

## Relación con ADR anteriores

ADR-005 queda `SUPERSEDED_IN_PART_BY_ADR_007` solo respecto de matriz,
duraciones, parámetros, throttle, recuperación y superficie final. Su elección
de sesiones opacas permanece vigente. ADR-006 continúa siendo una fotografía
histórica correcta de FASE 3A; este ADR registra las extensiones posteriores.

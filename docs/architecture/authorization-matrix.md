# Matriz de autorización

Estado vigente: el manifiesto desplegado contiene 27 permisos, 27 grants por rol
y 2 grants directos (`packages/database/src/bootstrap/manifest.ts` es la fuente
ejecutable). La base es
[ADR-007](../decisions/ADR-007-phase-3b-authentication-authorization.md),
ampliada por las decisiones aprobadas de FASE 5A (lectura de inventario), 6A
(transferencias), 7A (lectura de ventas), 9 (conteos, reportes y analytics), el
release operativo de productos/entradas/valoraciones, el panel de
administración ([plan](../plans/admin-settings-panel.md)), ADR-017 (llaves de
integración) y ADR-018 (registro de pagos de ventas, `sales.record_payment`).

## Modelo de evaluación

- `RolePermission` concede un permiso explícito a un rol.
- `UserPermission GRANT` concede directamente un permiso.
- `UserPermission DENY` activo prevalece sobre grants directos o por rol.
- Grants revocados no tienen efecto.
- Ausencia de grant significa denegación.
- No existen herencia, wildcard, prefijos o bypass de `ADMIN`.

`ADMIN` no significa superusuario. Un usuario ADMIN obtiene exclusivamente sus
siete grants administrativos (cuatro de cuentas, `users.read`,
`users.roles.manage` e `integrations.manage`) más cualquier rol o grant
adicional asignado de forma explícita.

## Roles y RolePermission iniciales

| Rol | Permisos activos exactos |
|---|---|
| `ADMIN` | `integrations.manage`, `users.read`, `users.roles.manage`, `users.invitations.create`, `users.credentials.revoke`, `users.sessions.revoke`, `users.status.manage` |
| `PARTNER` | Ninguno |
| `INVENTORY_MANAGER` | `products.manage`, `stock-receipts.create`, `inventory.adjust`, `inventory.read`, `inventory.audit.create`, `transfers.create`, `reports.read`, `analytics.read` |
| `SALES` | `sales.create`, `sales.confirm_in_transit`, `sales.read`, `sales.record_payment`, `reports.read`, `analytics.read` |
| `FINANCE` | `finances.read`, `finances.manual.create`, `closings.read`, `closings.create`, `closings.reopen`, `inventory.valuation.manage` |
| `READ_ONLY` | Ninguno |

Existen 27 `RolePermission` activos: siete ADMIN, seis FINANCE, ocho
INVENTORY_MANAGER y seis SALES. `transfers.create` se concede exclusivamente a
`INVENTORY_MANAGER`; no es un privilegio implícito de `ADMIN`.
`inventory.valuation.manage` (completar costos y precios por bodega) pertenece a
`FINANCE`, y `products.manage` y `stock-receipts.create` a `INVENTORY_MANAGER`.

El 2026-08-31 el propietario aprobó los grants de FASE 9: `inventory.audit.create`
a `INVENTORY_MANAGER`, y `reports.read` y `analytics.read` a `INVENTORY_MANAGER`
y `SALES`. Difundir la lectura de reportes es seguro por diseño y no por
confianza: cada reporte exige además el permiso de lectura de su dominio, y toda
columna monetaria exige `finances.read`, que ninguno de esos dos roles tiene.

## UserRole y UserPermission iniciales

| Usuario | Roles activos exactos | UserPermission activo |
|---|---|---|
| Dylan | `ADMIN`, `FINANCE`, `INVENTORY_MANAGER`, `SALES` | `GRANT sales.cancel`, `GRANT inventory.audit.approve` |
| Samantha | `FINANCE`, `INVENTORY_MANAGER`, `SALES` | Ninguno |
| Jean | `INVENTORY_MANAGER`, `SALES` | Ninguno |
| Luden | `INVENTORY_MANAGER`, `SALES` | Ninguno |

`PARTNER` y `READ_ONLY` no tienen usuarios. Dylan es el único ADMIN inicial,
pero ninguna política de autorización depende de su nombre, login o ID.

Los `UserPermission` directos contienen únicamente lo que ningún rol otorga.
`inventory.audit.approve` permanece ahí a propósito: aprobar un conteo escribe
stock por la ruta de ajuste de FASE 5C, así que quien cuenta una bodega no puede
aprobar su propio conteo al libro. Cualquier usuario con `INVENTORY_MANAGER`
puede capturar conteos; solo el ADMIN los aprueba.

## Permisos efectivos iniciales

| Capacidad | Dylan | Samantha | Jean | Luden |
|---|---:|---:|---:|---:|
| `users.invitations.create` | Sí | No | No | No |
| `users.credentials.revoke` | Sí | No | No | No |
| `users.sessions.revoke` | Sí | No | No | No |
| `users.status.manage` | Sí | No | No | No |
| `users.read` | Sí | No | No | No |
| `users.roles.manage` | Sí | No | No | No |
| `integrations.manage` | Sí | No | No | No |
| `inventory.valuation.manage` | Sí | Sí | No | No |
| `products.manage` | Sí | Sí | Sí | Sí |
| `stock-receipts.create` | Sí | Sí | Sí | Sí |
| `finances.read` | Sí | Sí | No | No |
| `finances.manual.create` | Sí | Sí | No | No |
| `closings.read` | Sí | Sí | No | No |
| `closings.create` | Sí | Sí | No | No |
| `closings.reopen` | Sí | Sí | No | No |
| `inventory.adjust` | Sí | Sí | Sí | Sí |
| `inventory.read` | Sí | Sí | Sí | Sí |
| `inventory.audit.create` | Sí | Sí | Sí | Sí |
| `inventory.audit.approve` | Sí | No | No | No |
| `reports.read` | Sí | Sí | Sí | Sí |
| `analytics.read` | Sí | Sí | Sí | Sí |
| `sales.create` | Sí | Sí | Sí | Sí |
| `sales.confirm_in_transit` | Sí | Sí | Sí | Sí |
| `sales.read` | Sí | Sí | Sí | Sí |
| `sales.record_payment` | Sí | Sí | Sí | Sí |
| `sales.cancel` | Sí | No | No | No |
| `transfers.create` | Sí | Sí | Sí | Sí |
| Total | 27 | 18 | 12 | 12 |

La API de sesión devuelve estos códigos ordenados, no roles. Un DENY directo se
refleja en la siguiente solicitud y su revocación restaura inmediatamente el
grant que continúe vigente.

## Políticas de recurso

Conceder una capacidad no evita las reglas del recurso. La cancelación exige
venta elegible y motivo; confirmación solo aplica a tránsito y no vuelve a
descontar stock. Registrar pago exige una venta operacional completada y
pendiente, crea evidencia inmutable y no toca inventario. Los módulos nuevos
deben exigir códigos de permiso exactos,
no listas del tipo `FINANCE/ADMIN` o `INVENTORY_MANAGER/ADMIN`.

`users.read` habilita el directorio de usuarios (`GET /users`, `GET /users/:id`,
`GET /roles`, `GET /permissions`) del panel de administración.

## Asignaciones editadas desde el panel (ADR-020)

Las tablas de este documento describen la **siembra** del manifiesto. Una vez
que el sistema está en uso, el administrador cambia roles y excepciones de cada
persona desde `/settings`, así que las asignaciones vigentes se consultan en el
directorio, no aquí. Reglas que el panel aplica en la API:

- `PUT /users/:id/roles` y `PUT /users/:id/permissions` exigen
  `users.roles.manage` y reemplazan el conjunto completo; repetirlos no cambia
  nada. `POST /users/:id/reactivate` exige `users.status.manage`: devuelve la
  cuenta a `ACTIVE` si conserva credencial y activación, y si no, a
  `PENDING_ACTIVATION`.
- El rol `ADMIN` no se asigna ni se retira desde el panel. Sigue habiendo
  exactamente un ADMIN.
- Los permisos reservados al administrador (`sales.cancel`,
  `inventory.audit.approve` y los siete permisos del rol `ADMIN`) solo se
  conceden como excepción `GRANT` a quien tiene `ADMIN`. Denegarlos a cualquiera
  sí está permitido.
- A quien tiene `ADMIN` no se le puede denegar `users.read` ni
  `users.roles.manage`.

Detalle y consecuencias en
[ADR-020](../decisions/ADR-020-user-access-administration.md).

Las llaves de integración (ADR-017) no son permisos de usuario: cada petición revalida `inventory.read` del usuario propietario de la
llave y solo expone `GET /api/v1/integrations/catalog`.

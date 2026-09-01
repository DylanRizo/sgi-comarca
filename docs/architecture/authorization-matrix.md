# Matriz de autorización

Estado vigente: FASE 3B completa, ampliado por las decisiones aprobadas de FASE
5A para lectura de productos e inventario, FASE 6A para transferencias y FASE
7A para lectura de ventas. La fuente base es
[ADR-007](../decisions/ADR-007-phase-3b-authentication-authorization.md).

## Modelo de evaluación

- `RolePermission` concede un permiso explícito a un rol.
- `UserPermission GRANT` concede directamente un permiso.
- `UserPermission DENY` activo prevalece sobre grants directos o por rol.
- Grants revocados no tienen efecto.
- Ausencia de grant significa denegación.
- No existen herencia, wildcard, prefijos o bypass de `ADMIN`.

`ADMIN` no significa superusuario. Un usuario ADMIN obtiene exclusivamente los
cuatro grants administrativos más cualquier rol o grant adicional asignado de
forma explícita.

## Roles y RolePermission iniciales

| Rol | Permisos activos exactos |
|---|---|
| `ADMIN` | `users.invitations.create`, `users.credentials.revoke`, `users.sessions.revoke`, `users.status.manage` |
| `PARTNER` | Ninguno |
| `INVENTORY_MANAGER` | `inventory.adjust`, `inventory.read`, `transfers.create` |
| `SALES` | `sales.create`, `sales.confirm_in_transit`, `sales.read` |
| `FINANCE` | `finances.read`, `finances.manual.create`, `closings.read`, `closings.create`, `closings.reopen` |
| `READ_ONLY` | Ninguno |

Existen 20 `RolePermission` activos: cuatro ADMIN, cinco FINANCE, seis
INVENTORY_MANAGER y cinco SALES. `transfers.create` se concede exclusivamente a
`INVENTORY_MANAGER`; no es un privilegio implícito de `ADMIN`.

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
| `sales.cancel` | Sí | No | No | No |
| `transfers.create` | Sí | Sí | Sí | Sí |
| Total | 20 | 14 | 9 | 9 |

La API de sesión devuelve estos códigos ordenados, no roles. Un DENY directo se
refleja en la siguiente solicitud y su revocación restaura inmediatamente el
grant que continúe vigente.

## Políticas de recurso

Conceder una capacidad no evita las reglas del recurso. La cancelación exige
venta elegible y motivo; confirmación solo aplica a tránsito y no vuelve a
descontar stock. Los módulos futuros deben exigir códigos de permiso exactos,
no listas del tipo `FINANCE/ADMIN` o `INVENTORY_MANAGER/ADMIN`.

Asignar otro ADMIN, editar roles/permisos o reactivar usuarios deshabilitados no
forma parte de FASE 3B y requiere una decisión posterior.

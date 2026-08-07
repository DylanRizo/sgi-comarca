# Matriz de autorización

Estado vigente: FASE 3B completa. La fuente de decisión es
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
| `INVENTORY_MANAGER` | `inventory.adjust` |
| `SALES` | `sales.create`, `sales.confirm_in_transit` |
| `FINANCE` | `finances.read`, `finances.manual.create`, `closings.read`, `closings.create`, `closings.reopen` |
| `READ_ONLY` | Ninguno |

Existen 12 `RolePermission` activos: cuatro ADMIN, cinco FINANCE, uno
INVENTORY_MANAGER y dos SALES. `transfers.create` existe como permiso técnico,
pero no tiene grants.

## UserRole y UserPermission iniciales

| Usuario | Roles activos exactos | UserPermission activo |
|---|---|---|
| Dylan | `ADMIN`, `FINANCE`, `INVENTORY_MANAGER`, `SALES` | `GRANT sales.cancel` |
| Samantha | `FINANCE`, `INVENTORY_MANAGER`, `SALES` | Ninguno |
| Jean | `INVENTORY_MANAGER`, `SALES` | Ninguno |
| Luden | `INVENTORY_MANAGER`, `SALES` | Ninguno |

`PARTNER` y `READ_ONLY` no tienen usuarios. Dylan es el único ADMIN inicial,
pero ninguna política de autorización depende de su nombre, login o ID.

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
| `sales.create` | Sí | Sí | Sí | Sí |
| `sales.confirm_in_transit` | Sí | Sí | Sí | Sí |
| `sales.cancel` | Sí | No | No | No |
| `transfers.create` | No | No | No | No |
| Total | 13 | 8 | 3 | 3 |

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

# Matriz de autorización

## Roles y composición inicial

| Rol | Propósito |
|---|---|
| `ADMIN` | Administración general, seguridad y permisos; su asignación inicial permanece pendiente |
| `PARTNER` | Lectura operacional amplia no financiera; no concede mutaciones sensibles por sí solo |
| `INVENTORY_MANAGER` | Productos/inventario/entradas/ajustes y, cuando se apruebe, transferencias |
| `SALES` | Registrar ventas y confirmar tránsito |
| `FINANCE` | Finanzas y cierres, incluida reapertura auditada |
| `READ_ONLY` | Lectura no financiera permitida, sin mutaciones |

Asignación mínima derivada de aprobaciones:

| Usuario | Roles/capacidades iniciales confirmadas | Pendiente |
|---|---|---|
| Dylan | `FINANCE`, `INVENTORY_MANAGER`; permiso directo `sales.cancel` | `ADMIN`, `SALES` y `PARTNER` requieren asignación explícita |
| Samantha | `FINANCE`, `INVENTORY_MANAGER` | `SALES`/`PARTNER` según responsabilidad aprobada |
| Jean | `INVENTORY_MANAGER` | `SALES`/`PARTNER`; sin Finanzas inicialmente |
| Luden | `INVENTORY_MANAGER` | `SALES`/`PARTNER`; sin Finanzas inicialmente |

La configuración inicial debe registrar estas asignaciones. Ninguna se deriva de textos de vendedores, responsables o emails legacy.

## Matriz por operación

Leyenda: `R` lectura, `W` escritura, `A` administración, `—` denegado. Las políticas de recurso pueden restringir aún más.

| Módulo/operación | ADMIN | PARTNER | INVENTORY_MANAGER | SALES | FINANCE | READ_ONLY |
|---|---:|---:|---:|---:|---:|---:|
| Dashboard operacional | R | R | R | R | R | R |
| Usuarios/roles/sesiones ajenas | A | — | — | — | — | — |
| Productos listar/detalle | R | R | R | R | R | R |
| Productos crear/editar/desactivar | W | — | W | — | — | — |
| Unidades/grupos administrar | A | — | W | — | — | — |
| Almacenes administrar | A | — | — | — | — | — |
| Inventario/alertas/historial | R | R | R | R | R | R |
| Entrada de productos | W | — | W | — | — | — |
| Ajuste positivo/negativo | W | — | W | — | — | — |
| Transferencia | W | — | `PENDING` | — | — | — |
| Venta registrar | W | — | — | W | — | — |
| Venta en tránsito listar | R | R | R | R | R | R |
| Confirmar tránsito | W | — | — | W | — | — |
| Cancelar venta elegible | —* | —* | —* | —* | —* | —* |
| Finanzas leer/importes | R | — | — | — | R | — |
| Ingreso/gasto manual | W | — | — | — | W | — |
| Cierre leer/crear/reabrir | W | — | — | — | W | — |
| Auditoría física capturar | W | — | W | — | — | — |
| Auditoría aprobar/aplicar | A | — | `PENDING` | — | — | — |
| Reportes no financieros | R | R | R | R | R | R |
| Reportes financieros | R | — | — | — | R | — |
| Analytics no financiero | R | R | R | R | R | R |
| Analytics financiero | R | — | — | — | R | — |
| Importaciones/mapeos | A | — | — | — | — | — |
| Settings sensibles | A | — | — | — | — | — |
| Audit logs | R | — | — | — | — | — |

`PENDING` significa denegado hasta aprobación y asignación explícita. `*` La cancelación requiere el permiso técnico `sales.cancel`, asignado inicialmente solo a Dylan; no se deriva automáticamente de ningún rol.

## Políticas de recurso

- Confirmación: solo `IN_TRANSIT`; no toca stock; repetición devuelve el mismo resultado sin efecto.
- Cancelación: requiere permiso `sales.cancel`, actor Dylan inicialmente, motivo, venta no pagada/en tránsito y reposición completa.
- Cierre: solo ADMIN/FINANCE; reapertura exige motivo y auditoría.
- Finanzas: la API filtra antes de consultar/proyectar importes; ocultar UI no es suficiente.
- Ajuste: requiere motivo y captura anterior/nueva dentro de la transacción.
- Desactivación: producto con historial nunca se borra físicamente.

## Cambios de permisos

FASE 3A no crea permisos de administración de roles ni concede capacidades
implícitas a `ADMIN`. Una futura administración de acceso requiere decisión y
permiso técnico explícitos. La autorización se evalúa por capacidades, no
mediante comparaciones de nombres.

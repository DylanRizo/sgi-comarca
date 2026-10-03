# ADR-020 — Administración de roles y excepciones desde el panel

## Estado

`ACCEPTED_FOR_IMPLEMENTATION` — aprobado por el propietario el 2026-10-02 al
pedir que se completara la Fase A del
[plan del panel de administración](../plans/admin-settings-panel.md).

Numerada 020 porque ADR-018 (pagos de ventas) y ADR-019 (valoración en
transferencias) se aprobaron antes en la línea desplegada. El manifiesto
vigente tiene 27 permisos; esta decisión no añade ninguno.

Esta decisión autoriza código y pruebas locales. No autoriza por sí sola
desplegar, ejecutar `db:bootstrap` ni cambiar asignaciones en staging. Esas
acciones conservan el checkpoint operacional explícito del proyecto.

## Contexto

`users.roles.manage` existe en el manifiesto y está concedido a `ADMIN` desde
el 2026-09-10, pero ninguna ruta lo usaba: no había forma de asignar roles,
conceder o denegar permisos individuales, ni reactivar a una persona
desactivada sin editar la base a mano.

Implementarlo chocaba con tres piezas existentes:

1. **`db:bootstrap`**, en una base ya en uso (con credenciales o sesiones),
   exigía que los roles de cada persona coincidieran exactamente con el
   manifiesto y rechazaba grants directos no declarados. El primer cambio
   hecho desde el panel habría hecho fallar el siguiente bootstrap de staging.
2. **`auth:recover-admin`** (break-glass) exigía la matriz aprobada exacta,
   incluidos los cuatro perfiles de roles por persona. Un cambio de roles
   habría inutilizado la herramienta de último recurso.
3. **Decisiones aprobadas**: ADR-007 fija un solo ADMIN; DEC-021 asigna
   `sales.cancel` solo a Dylan; y `inventory.audit.approve` es la única barrera
   para que quien cuenta no apruebe su propio conteo, porque la aprobación no
   compara aprobador con creador.

## Decisión

### Fuente de verdad

- Una vez que la base está en uso, **las asignaciones por persona (roles y
  excepciones) pertenecen al panel**. El manifiesto solo las siembra en una
  base nueva.
- El **catálogo** sigue perteneciendo al manifiesto: roles, permisos y grants
  por rol. Bootstrap y break-glass lo siguen validando exactamente.
- En una base en uso, `db:bootstrap` ya no compara ni crea asignaciones por
  persona. Valida en su lugar los invariantes de abajo.
- `auth:recover-admin` ya no exige los perfiles por persona. Valida el catálogo
  exacto y los mismos invariantes.

### Invariantes que el panel no puede romper

- Existe exactamente **una** asignación activa de `ADMIN`. El panel no asigna
  ni retira el rol `ADMIN` a nadie, incluida la propia cuenta administradora.
- Los **permisos reservados al administrador** solo pueden concederse como
  excepción `GRANT` a quien tiene el rol `ADMIN`:
  - `sales.cancel` (DEC-021) e `inventory.audit.approve` (separación entre
    contar y aprobar);
  - los siete permisos del rol `ADMIN` (`users.*` e `integrations.manage`).
    Concederlos sueltos equivaldría a crear otro administrador por partes, que
    esta misma decisión prohíbe.
- Nadie puede denegar a quien tiene `ADMIN` los permisos `users.read` ni
  `users.roles.manage`: sin ellos la cuenta administradora perdería el acceso
  al panel y no podría deshacer el cambio.
- Las excepciones `DENY` sobre cualquier otro permiso, las excepciones `GRANT`
  sobre permisos no reservados y los demás roles (`FINANCE`,
  `INVENTORY_MANAGER`, `SALES`, `PARTNER`, `READ_ONLY`) quedan libres para el
  administrador.

### Rutas

| Ruta | Permiso | Semántica |
|---|---|---|
| `PUT /api/v1/users/:id/roles` | `users.roles.manage` | Reemplaza el conjunto completo de roles vigentes |
| `PUT /api/v1/users/:id/permissions` | `users.roles.manage` | Reemplaza el conjunto completo de excepciones `GRANT`/`DENY` |
| `POST /api/v1/users/:id/reactivate` | `users.status.manage` | `DISABLED` → `ACTIVE` si conserva credencial vigente y fecha de activación; si no, `PENDING_ACTIVATION` |

La reactivación ya estaba desplegada desde `14fcb20` con otra regla: respondía
409 si la cuenta no había activado o no conservaba credencial. El propietario
eligió el 2026-10-03 la regla de esta decisión, que en ese caso devuelve la
cuenta a `PENDING_ACTIVATION` para poder invitarla de nuevo en lugar de dejarla
bloqueada como `DISABLED`.

- `PUT` declara el estado deseado: repetirlo con el mismo cuerpo no cambia nada
  ni escribe auditoría, así que es idempotente sin almacenar claves.
- Nada se borra: un rol o excepción retirado recibe `revoked_at` y
  `revoked_by_user_id`; uno nuevo es una fila nueva con `granted_by_user_id`.
  Cambiar `GRANT` por `DENY` revoca la fila anterior y crea otra.
- Cada cambio efectivo escribe un `AuditLog` en la misma transacción
  `Serializable`, que bloquea la fila del usuario y el rol `ADMIN`.
- Reactivar a alguien que no está `DISABLED` no hace nada (tampoco responde
  409, a diferencia de la regla anterior).

## Consecuencias

- El panel resuelve la operación diaria sin scripts ni SQL manual.
- Añadir un permiso nuevo al catálogo sigue haciéndose con el manifiesto y
  `db:bootstrap`. **Concedérselo a una persona concreta en una base en uso se
  hace ahora desde el panel**, no con el manifiesto. La FASE 9 lo resolvió por
  bootstrap (`inventory.audit.approve` para Dylan); ese camino ya no existe
  para bases en uso.
- Si alguna vez se decide tener un segundo administrador, se requiere una
  decisión nueva que modifique este ADR, el bootstrap y el break-glass.
- El manifiesto deja de describir las asignaciones vigentes de staging; la
  fuente para consultarlas es el directorio (`GET /users`) o la base.

# Plan — Panel de administración y configuración (`/settings`)

Reescritura del plan propuesto, ajustada al repositorio real. El objetivo se
mantiene: administrar usuarios, bodegas y parámetros desde la interfaz, sin
consola ni scripts. Lo que cambia es el punto de partida, porque una parte ya
está construida y otra exige decisiones que aún no se han tomado.

## 1. Lo que ya existe y debe reutilizarse

| Pieza | Dónde | Estado |
|---|---|---|
| `UserAdministrationService` | `apps/api/src/auth/application/user-administration.service.ts` | Crea invitaciones, revoca credenciales y sesiones, desactiva usuarios |
| Controlador de usuarios | `apps/api/src/auth/controllers/user-administration.controller.ts` | Cuatro rutas `POST /users/:id/…`, cada una con su permiso |
| `LastAdminPolicy` | `apps/api/src/auth/application/last-admin-policy.ts` | Ya implementada, con seis comprobaciones y bloqueo de fila |
| `EffectivePermissionsService` | `apps/api/src/auth/application/` | Resuelve permisos efectivos de un actor |
| `FinancialCategory` | `packages/database/prisma/schema.prisma` | Modelo con `code`, `name`, `entryType`, `active` |
| Roles del manifiesto | `packages/database/src/bootstrap/manifest.ts` | ADMIN, PARTNER, INVENTORY_MANAGER, SALES, FINANCE, READ_ONLY |
| Diálogo modal accesible | `apps/web/lib/use-modal-dialog.ts` | Trampa de foco, Escape y restauración |

**No se rediseña `LastAdminPolicy`.** Existe y ya cubre: quitar el rol ADMIN,
desactivar al usuario, revocar su credencial e invalidar su invitación.

## 2. Restricciones que el plan debe respetar

1. **Sin dependencias nuevas de interfaz.** No hay Zod, Radix, Shadcn ni
   TanStack Query en el proyecto, y ADR-012 más la decisión aprobada de la
   mejora operativa lo prohíben. Los contratos son interfaces TypeScript
   planas; la validación de entrada vive en DTOs de `class-validator` en la
   API. Las pestañas se construyen con los primitivos existentes.
2. **Autorización por permiso, nunca por rol.** ADMIN está definido como «rol
   estructural sin permisos implícitos». Ocultar el panel por rol mostraría el
   acceso a quien no puede usarlo. El ítem de navegación y cada acción se
   filtran por permiso, como el resto de la aplicación.
3. **`admin.manage` no existe y no debe crearse.** El modelo es granular y así
   se mantiene.
4. **Convenciones de prueba.** Integración: `apps/api/test/*.integration.spec.ts`.
   Navegador: `apps/web/e2e/NN-nombre.e2e.ts`; Playwright solo recoge
   `**/*.e2e.ts` y **el número importa**, según se documenta en
   `playwright.config.ts`.
5. **El shell se llama `authenticated-shell.tsx`**, no `Sidebar.tsx`.
6. **El enlace de activación no se registra en ningún log ni archivo.** Se
   muestra en pantalla para copiarlo y nada más.

## 3. Decisiones pendientes — `REQUIRES_HUMAN_APPROVAL`

Ninguna fase que dependa de estas debe empezar antes de resolverlas.

**D1. Correo electrónico.** `User` solo tiene `loginIdentifier` (64) y
`displayName` (160). El plan original asume `email` en el DTO, en la tabla y en
el login de pruebas. Decidir: ¿se añade identidad por correo? ¿Quién lo envía,
si hoy el sistema no manda correo y el enlace se entrega por canal privado?
Mientras no se decida, el directorio muestra identificador y nombre.

**D2. Responsable de bodega.** `Warehouse` solo tiene `code`, `name`, `active`.
Decidir si «socio a cargo» otorga permisos sobre esa bodega o es informativo.
Son dos diseños distintos: el primero toca RBAC, el segundo es una columna.

**D3. Parámetros del sistema.** No existe tabla de parámetros y la tolerancia
de cierre es la constante `defaultClosingTolerance = '0.50'` en
`apps/api/src/finances/daily-closing.calculation.ts`. Decidir quién puede
cambiarla y con qué efecto: cada cierre ya persiste su `toleranceApplied`, así
que un cambio no altera cierres pasados, y eso debe seguir siendo cierto.

## 4. Fase A — Usuarios y accesos

No depende de ninguna decisión pendiente y concentra la mayor parte del valor.

### Permisos nuevos

El manifiesto pasa de 23 a **25**:

- `users.read` — leer el directorio, el detalle y los roles disponibles.
- `users.roles.manage` — asignar roles y excepciones de permisos.

Son filas de bootstrap, **no requieren migración**: se añaden al manifiesto y se
aplican con `db:bootstrap`, que es idempotente. Sí requieren su puerta de
despliegue.

### Rutas a añadir

| Ruta | Permiso | Nota |
|---|---|---|
| `GET /api/v1/users` | `users.read` | Paginado, búsqueda por identificador o nombre, filtro por estado y rol |
| `GET /api/v1/users/:id` | `users.read` | Roles y permisos efectivos, reutilizando `EffectivePermissionsService` |
| `GET /api/v1/roles` | `users.read` | Los seis roles del manifiesto |
| `PUT /api/v1/users/:id/roles` | `users.roles.manage` | Pasa por `LastAdminPolicy.assertCanRemoveAdminAssignment` |
| `PUT /api/v1/users/:id/permissions` | `users.roles.manage` | Excepciones `GRANT`/`DENY` |
| `POST /api/v1/users/:id/reactivate` | `users.status.manage` | Permiso ya existente |

Las cuatro rutas existentes (invitar, revocar credencial, revocar sesiones,
desactivar) no se tocan: solo se exponen en la interfaz.

Toda mutación lleva `Idempotency-Key` y auditoría, como el resto del sistema.

### Interfaz

`apps/web/app/(private)/settings/page.tsx`, con pestañas resueltas como botones
con `role="tab"` y paneles `role="tabpanel"` —sin biblioteca—, reutilizando
`.work-panel`, `FormField`, `.data-table` y `.status-badge`.

- **Directorio:** tabla con identificador, nombre, roles, estado y acciones.
- **Invitar:** formulario con nombre e identificador; al confirmar, el enlace
  aparece en pantalla con botón de copiar. No se persiste ni se registra.
- **Editar roles y permisos:** selector de roles y una sección desplegable de
  excepciones, mostrando el permiso efectivo resultante.
- El ítem de navegación aparece solo con `users.read`.

### Pruebas

- `apps/api/test/user-administration.integration.spec.ts`: un actor sin
  `users.read` recibe 403; crear invitación deja al usuario en
  `PENDING_ACTIVATION`; `LastAdminPolicy` bloquea quitar el último ADMIN;
  reactivar restablece el acceso.
- `apps/web/e2e/07-settings.e2e.ts`.

**Restricción de diseño de la prueba E2E:** el `reset()` del fixture
(`apps/web/e2e/support/authentication-database.ts`) solo restablece a `dylan` y
borra sesiones, credenciales e invitaciones; **no elimina usuarios creados por
una prueba**. Una spec que cree usuarios dejaría residuo para las siguientes.
Por eso la prueba debe operar sobre los cuatro usuarios del manifiesto —
invitar, cambiar rol, revocar, reactivar— en lugar de crear cuentas nuevas, o
bien ampliar el `reset()` de forma explícita.

## 5. Fase B — Bodegas

Depende de **D2**. Hoy `GET /warehouses` y `GET /warehouses/:id` existen; no hay
escritura.

- Migración aditiva para los campos que se aprueben.
- `POST /api/v1/warehouses` y `PATCH /api/v1/warehouses/:id`.
- Desactivar una bodega debe rechazarse, o advertirse, si tiene saldo distinto
  de cero: es una regla de inventario, no un detalle de interfaz.

## 6. Fase C — Parámetros del sistema

Depende de **D3** y es la más costosa: tabla de parámetros, auditoría de
cambios y propagación al servicio de cierres. Mientras no se aborde, la
tolerancia sigue siendo la constante actual.

Los canales de venta y métodos de pago son hoy **texto libre** en la venta
(`salesChannelText`, `paymentMethodText`). Convertirlos en catálogos es otro
cambio de esquema y debe tratarse como tal, no como una pestaña informativa.

Crear y activar categorías financieras sí es barato: el modelo ya existe y solo
faltan `POST /finances/categories` y `PATCH /finances/categories/:id` con
`finances.manual.create`. Puede adelantarse a la Fase A si hace falta.

## 7. Orden recomendado

1. Fase A completa, con su puerta y despliegue.
2. Categorías financieras, si urgen.
3. Resolver D1, D2 y D3 por escrito en `docs/decisions/`.
4. Fases B y C según lo decidido.

## 8. Fuera de alcance

Envío de correo, recuperación de contraseña por el propio usuario, importación
masiva de usuarios y cualquier cambio en el modelo de sesiones. La política del
último administrador no se reescribe.

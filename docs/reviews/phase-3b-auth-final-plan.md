# FASE 3B — Plan final de autenticación y sesiones

> Estado: `HISTORICAL_IMPLEMENTED`. Este documento conserva el plan aprobado y
> la evidencia del incidente de migración. El estado vigente se encuentra en el
> [informe de cierre](phase-3b-completion-report.md) y en
> [ADR-007](../decisions/ADR-007-phase-3b-authentication-authorization.md).

## 1. Estado y autoridad

Este documento incorporó las decisiones finales aprobadas por el propietario
para FASE 3B. En el momento de escribirse autorizaba el plan, pero no su
implementación. Los BLOQUES 1–7A fueron autorizados y versionados
posteriormente; BLOQUE 8 cerró la reconciliación documental.

En esta actualización documental no se permite:

- modificar `schema.prisma`;
- crear o aplicar migraciones;
- instalar dependencias o cambiar el lockfile;
- implementar controladores, servicios, guards, UI o pruebas;
- ejecutar el perfilador o leer/modificar el XLSX como parte de FASE 3B;
- crear commits.

La implementación esperó autorizaciones posteriores y conservó las
restricciones de `AGENTS.md`, ADR-005 y el modelo estructural aprobado en FASE
3A, salvo los cambios expresamente aprobados bloque por bloque.

## 2. Objetivo y límites

FASE 3B implementará, cuando sea autorizada, autenticación first-party por
contraseña y sesiones opacas revocables para los cuatro usuarios iniciales.
También implementará activación manual mediante invitaciones, throttle de
login persistente, CSRF, validación de origen y autorización backend por
permisos explícitos.

Quedan fuera de alcance:

- MFA;
- OAuth;
- JWT como sesión de navegador;
- Google login;
- recuperación o entrega por correo;
- tokens en `localStorage`;
- asignación de `PARTNER` o `READ_ONLY`;
- grants de `transfers.create`;
- permisos implícitos o comodines para `ADMIN`;
- perfilado o importación del XLSX;
- implementación de ventas, inventario, transferencias, finanzas o cierres.

## 3. Matriz final de roles y permisos

Los roles son composables. Ningún rol hereda de otro y la autorización se
resuelve exclusivamente mediante `RolePermission` y `UserPermission` activos.

| Rol | Permisos activos exactos |
|---|---|
| `ADMIN` | `users.invitations.create`, `users.credentials.revoke`, `users.sessions.revoke`, `users.status.manage` |
| `PARTNER` | Ninguno |
| `INVENTORY_MANAGER` | `inventory.adjust` |
| `SALES` | `sales.create`, `sales.confirm_in_transit` |
| `FINANCE` | `finances.read`, `finances.manual.create`, `closings.read`, `closings.create`, `closings.reopen` |
| `READ_ONLY` | Ninguno |

Reglas obligatorias de la matriz:

- `ADMIN` no es un superusuario y no implica todos los permisos.
- Los cuatro permisos administrativos se vinculan individualmente a `ADMIN`
  mediante cuatro registros activos de `RolePermission`.
- Crear un permiso nuevo no crea automáticamente un `RolePermission` para
  `ADMIN` ni para ningún otro rol.
- `ADMIN` no concede capacidades financieras, de inventario o de ventas.
- `ADMIN` no concede `transfers.create`.
- `SALES` tiene exclusivamente los dos permisos de ventas indicados.
- `FINANCE` e `INVENTORY_MANAGER` conservan exactamente sus grants aprobados.
- `transfers.create` continúa como capacidad técnica sin grants de rol ni de
  usuario.
- No existe autorización basada en comparar nombres personales en código.

## 4. Asignaciones iniciales definitivas

| Usuario | Roles activos exactos | Permisos directos activos |
|---|---|---|
| Dylan | `ADMIN`, `FINANCE`, `INVENTORY_MANAGER`, `SALES` | `sales.cancel` |
| Samantha | `FINANCE`, `INVENTORY_MANAGER`, `SALES` | Ninguno |
| Jean | `INVENTORY_MANAGER`, `SALES` | Ninguno |
| Luden | `INVENTORY_MANAGER`, `SALES` | Ninguno |

Dylan es el único administrador inicial. `ADMIN` no sustituye ninguno de sus
otros tres roles. Samantha, Jean y Luden no reciben `ADMIN`. `PARTNER` y
`READ_ONLY` permanecen sin usuarios.

### Capacidades efectivas iniciales

| Capacidad | Dylan | Samantha | Jean | Luden |
|---|---:|---:|---:|---:|
| Crear/regenerar invitaciones | Sí | No | No | No |
| Revocar credenciales | Sí | No | No | No |
| Revocar sesiones ajenas | Sí | No | No | No |
| Administrar estado de usuario | Sí | No | No | No |
| Leer/crear movimientos financieros y cierres | Sí | Sí | No | No |
| Ajustar inventario | Sí | Sí | Sí | Sí |
| Crear ventas | Sí | Sí | Sí | Sí |
| Confirmar ventas en tránsito | Sí | Sí | Sí | Sí |
| Cancelar ventas elegibles | Sí | No | No | No |
| Crear transferencias | No | No | No | No |

Las políticas de recurso siguen restringiendo una capacidad concedida; por
ejemplo, `sales.cancel` solo permite cancelar una venta elegible y con motivo.

## 5. Modelos de seguridad previstos

Estos modelos se documentan para una implementación posterior. Este plan no
modifica todavía el esquema.

### UserInvitation

Campos previstos:

- `id`: UUID;
- `userId`: FK restrictiva a `User`;
- `tokenHash`: hash SHA-256 único del token, nunca el token original;
- `expiresAt`: creación + 24 horas;
- `consumedAt`: nullable;
- `invalidatedAt`: nullable;
- `createdByUserId`: nullable únicamente para bootstrap inicial; después debe
  identificar al ADMIN que emitió la invitación;
- `invalidatedByUserId`: nullable;
- `invalidationReason`: nullable;
- `createdAt`.

Restricciones previstas:

- token aleatorio de al menos 256 bits, codificado Base64URL para entrega;
- uso único;
- `consumedAt` e `invalidatedAt` mutuamente excluyentes;
- una sola invitación pendiente por usuario mediante índice parcial;
- regenerar invalida atómicamente todas las invitaciones pendientes anteriores;
- consumo condicional y atómico para impedir doble activación concurrente;
- el token no se almacena, registra ni devuelve nuevamente.

### LoginThrottle

Campos previstos:

- `id`: UUID;
- `normalizedIdentifier`: identificador normalizado con la misma función usada
  por login;
- `originHash`: HMAC-SHA-256 del origen canónico con secreto independiente;
- `windowStartedAt`;
- `failedAttemptCount`;
- `lastFailedAt`: nullable;
- `blockedUntil`: nullable;
- `createdAt`;
- `updatedAt`;
- unicidad compuesta `(normalizedIdentifier, originHash)`.

Política aprobada:

- máximo cuatro fallos dentro de quince minutos;
- retrasos de `0`, `500`, `1000` y `2000` ms para los fallos primero a cuarto;
- el cuarto fallo inicia un bloqueo de quince minutos;
- bloqueos posteriores duran también quince minutos;
- nunca se crea bloqueo permanente automático;
- un login exitoso reinicia el contador de la combinación correspondiente;
- el estado reside en PostgreSQL y sobrevive reinicios de la API;
- las respuestas no revelan existencia, estado o bloqueo de una cuenta.

El throttle compuesto es una primera defensa aprobada. Antes de producción
pública o crecimiento significativo deberá evaluarse como deuda de seguridad
la adición de límites independientes por identificador y por origen. Esa
evaluación no autoriza implementarlos dentro de FASE 3B.

## 6. Contraseñas

Política cerrada:

- mínimo 12 y máximo 128 puntos de código Unicode;
- normalización NFC antes de contar y hashear;
- espacios, frases, pegado y administradores de contraseñas permitidos;
- no recortar espacios ni truncar el valor;
- sin requisitos arbitrarios de mayúsculas, números o símbolos;
- rechazo de contraseñas comunes mediante blocklist local versionada;
- rechazo de contraseñas iguales o demasiado similares al login mediante una
  regla determinista, documentada y probada;
- Argon2id con sal individual y parámetros calibrados;
- contraseñas y hashes excluidos de respuestas y logs;
- sin rotación periódica obligatoria;
- cambio por el usuario y revocación administrativa;
- cambio o revocación de credencial revoca todas las sesiones del usuario.

El mínimo de 12 caracteres es una decisión consciente del propietario para
esta fase, aun cuando exista una recomendación más estricta de 15 caracteres
para sistemas de contraseña sin MFA. La diferencia debe permanecer visible en
la documentación de seguridad y reevaluarse antes de exposición pública o al
cambiar el perfil de riesgo.

Los parámetros Argon2id exactos se seleccionarán mediante calibración en el
ambiente objetivo, con un piso no inferior a la recomendación vigente adoptada
por el proyecto. La calibración técnica no puede reducir la política aprobada.

## 7. Sesiones, renovación y CSRF

Política cerrada:

- sesión opaca con token aleatorio de alta entropía;
- solo el hash del token se almacena en PostgreSQL;
- inactividad máxima de 30 minutos;
- duración absoluta de 8 horas desde la creación;
- renovación deslizante controlada que nunca supera el límite absoluto;
- una actualización tardía no puede reactivar una sesión expirada;
- cambio de contraseña, revocación de credencial o desactivación revoca todas
  las sesiones del usuario;
- logout idempotente;
- sesiones expiradas o revocadas no se reactivan;
- ninguna sesión o token se guarda en `localStorage`.

Cookie de producción:

- `HttpOnly`;
- `Secure`;
- `SameSite=Lax`;
- `Path=/`;
- sin atributo `Domain`;
- nombre con prefijo `__Host-` cuando sea compatible con el ambiente.

Toda mutación autenticada exige token CSRF asociado a la sesión y validación
estricta de `Origin`/`Host` contra el origen configurado. CORS con credenciales
no admite comodines.

## 8. Flujo de bootstrap del primer administrador

La CLI privada es el único mecanismo autorizado antes de que exista un ADMIN
activo.

1. El bootstrap estructural deja a Dylan con los roles `ADMIN`, `FINANCE`,
   `INVENTORY_MANAGER` y `SALES`, más `sales.cancel` directo, pero todavía en
   estado `PENDING_ACTIVATION` y sin credencial o sesión.
2. Un operador autorizado ejecuta manualmente la CLI en una terminal privada.
3. La CLI exige TTY interactiva y obtiene el identificador objetivo mediante
   prompt; el token nunca se recibe como argumento de proceso.
4. El modo bootstrap verifica que no existe ningún ADMIN activo y que el
   usuario objetivo posee un grant activo de `ADMIN`. Con el manifest inicial,
   solo Dylan satisface esa condición.
5. En una transacción, invalida invitaciones pendientes anteriores, crea una
   invitación de 24 horas y guarda únicamente el hash del token.
6. La CLI muestra el token una sola vez directamente en la terminal. No lo
   envía al logger, no lo guarda en archivos, no lo copia al historial y no lo
   imprime dentro de un comando reproducible.
7. El operador entrega el token a Dylan manualmente mediante un canal privado.
8. Dylan activa su cuenta, define una contraseña válida y obtiene su primera
   sesión.
9. Desde ese momento la CLI de bootstrap rechaza nuevas emisiones. Dylan usa la
   API administrativa para emitir o regenerar invitaciones de Samantha, Jean y
   Luden.
10. Cada regeneración invalida las invitaciones pendientes anteriores; cada
    token sigue siendo de 24 horas y uso único.

El flujo no presupone correo, SMS, MFA u otro canal automático. En este punto
histórico la recuperación aún estaba pendiente. Posteriormente se aprobó e
implementó `pnpm auth:recover-admin` como CLI local TTY break-glass; no crea un
segundo ADMIN y es la única excepción a la protección normal de su credencial.

## 9. Endpoints administrativos protegidos

Todos los endpoints usan el prefijo `/api/v1`, sesión vigente, CSRF, validación
de origen, DTO estricto y autorización backend por permiso efectivo.

| Método y ruta | Permiso requerido | Resultado previsto |
|---|---|---|
| `POST /users/{id}/invitations` | `users.invitations.create` | Invalida pendientes y devuelve el nuevo token una sola vez |
| `POST /users/{id}/credentials/revoke` | `users.credentials.revoke` | Revoca credencial y todas las sesiones |
| `POST /users/{id}/sessions/revoke` | `users.sessions.revoke` | Revoca idempotentemente todas las sesiones del usuario |
| `POST /users/{id}/deactivate` | `users.status.manage` | Desactiva usuario, invalida invitaciones y revoca sesiones |

Reglas comunes:

- solo Dylan puede invocarlos con la asignación inicial;
- Samantha, Jean y Luden reciben `403` aunque posean otros roles;
- una sesión anónima o expirada recibe `401`;
- la API nunca autoriza comparando el nombre `Dylan`;
- el token de invitación no aparece en logs y la respuesta usa
  `Cache-Control: no-store`;
- las operaciones de revocación y desactivación son idempotentes donde
  corresponda;
- no se exponen endpoints para asignar roles o permisos dentro de FASE 3B;
- no existe endpoint de recuperación por correo.

Endpoints de autenticación finales:

- `POST /api/v1/auth/activate`;
- `POST /api/v1/auth/login`;
- `GET /api/v1/auth/session`;
- `GET /api/v1/auth/csrf`;
- `POST /api/v1/auth/logout`;
- `POST /api/v1/auth/change-password`;
- `POST /api/v1/auth/sessions/revoke-all` para las sesiones propias.

## 10. Reconciliación propuesta del roadmap

El roadmap no se modifica en esta actualización porque el propietario autorizó
únicamente este documento. La actualización posterior deberá ser explícita y
atómica en todos los documentos que referencian fases.

Propuesta de mínima renumeración:

| Identificador | Resultado posterior propuesto | Tratamiento |
|---|---|---|
| FASE 3A | Modelo estructural y migración inicial | Sin cambios |
| FASE 3B | Autenticación y sesiones | Sustituye la etiqueta colisionada y absorbe el alcance de autenticación de la antigua FASE 5 |
| FASE 3C | Perfilador reproducible del XLSX | Nueva subfase posterior a 3B y anterior al importador; no se ejecuta en 3B |
| FASE 4 | Importador XLSX dry-run/reconciliación | Sin cambios; depende de 3C |
| Antigua FASE 5 | Autenticación, usuarios y permisos | Se marca como `ABSORBIDA_EN_FASE_3B`, sin segunda ejecución ni fase operativa duplicada |
| FASES 6–14 | Alcances existentes | Conservan su numeración |

Esta estrategia evita renumerar silenciosamente FASES 6–14 y conserva una
traza explícita para referencias históricas. La actualización posterior debe:

- modificar `docs/migration/phased-roadmap.md`;
- alinear los dos runbooks que todavía ubican autenticación en FASE 5;
- actualizar fechas límite y referencias FASE 5 de decisiones de identidad;
- actualizar diagramas y enlaces de trazabilidad afectados;
- declarar FASE 3C como perfilado únicamente, sin importación;
- conservar FASE 4 como primera fase autorizable para dry-run/importación;
- registrar en una nota de cambio la absorción de la antigua FASE 5;
- no cambiar la numeración de FASES 6–14 sin una decisión posterior explícita.

## 11. Pruebas de matriz y ADMIN único

### Manifest y PostgreSQL

- existen exactamente los roles iniciales aprobados;
- existe exactamente un `UserRole` activo `Dylan → ADMIN`;
- Samantha, Jean y Luden no tienen `ADMIN`;
- `PARTNER` y `READ_ONLY` no tienen usuarios activos;
- Dylan mantiene simultáneamente `FINANCE`, `INVENTORY_MANAGER` y `SALES`;
- el grant directo `Dylan → sales.cancel` existe y no se deriva de `ADMIN`;
- `ADMIN` tiene exactamente cuatro `RolePermission` activos, uno por cada
  capacidad administrativa aprobada;
- `SALES`, `FINANCE` e `INVENTORY_MANAGER` tienen exactamente sus permisos
  aprobados;
- `transfers.create` tiene cero grants activos;
- el bootstrap repetido conserva exactamente la misma matriz;
- un estado existente incompatible provoca rollback en vez de añadir permisos.

### Ausencia de permisos implícitos

- crear un permiso técnico nuevo en una prueba no lo vincula a `ADMIN`;
- asignar `ADMIN` a un usuario de prueba solo concede los cuatro permisos
  vinculados expresamente;
- `ADMIN` sin `FINANCE` no puede consultar finanzas;
- `ADMIN` sin `INVENTORY_MANAGER` no puede ajustar inventario;
- `ADMIN` sin `SALES` no puede crear o confirmar ventas;
- `ADMIN` no puede crear transferencias;
- eliminar/revocar un `RolePermission` administrativo elimina inmediatamente
  esa capacidad efectiva sin modificar el rol.

### API

- Dylan obtiene éxito en cada endpoint administrativo con sesión y CSRF
  válidos;
- Samantha, Jean y Luden obtienen `403` en los cuatro endpoints;
- usuarios anónimos, con sesión revocada o expirada obtienen `401`;
- cambiar `displayName` o `loginIdentifier` de Dylan no altera la autorización;
- un usuario distinto llamado "Dylan" no obtiene capacidades administrativas;
- revocación/desactivación repetida es idempotente;
- ningún error, log o audit log contiene token, contraseña, cookie o origen
  original.

### Flujos de bootstrap y activación

- la CLI inicial acepta solamente un usuario con `ADMIN` activo y pendiente de
  activación;
- con el manifest aprobado, únicamente Dylan puede recibir la primera
  invitación;
- la CLI rechaza ejecución sin TTY;
- la CLI se deshabilita después de activar al primer ADMIN;
- el token aparece una sola vez y no entra al logger o archivos;
- regenerar invalida el token anterior;
- dos consumos concurrentes producen un solo éxito;
- expiración a 24 horas y replay se rechazan.

## 12. Confirmación de autorización explícita

La implementación no debe contener una condición equivalente a
`role === ADMIN => allow`. El guard calcula permisos efectivos consultando
grants activos:

1. roles activos del usuario;
2. `RolePermission` activos de esos roles;
3. `UserPermission` directos activos;
4. unión exacta de códigos activos;
5. política de recurso adicional en el servicio de aplicación.

No existe wildcard `*`, herencia, prefijo administrativo ni auto-grant. Las
nuevas filas de `Permission` quedan sin efecto hasta que exista un
`RolePermission` o `UserPermission` explícito y autorizado.

## 13. Decisiones cerradas

- Nombre de la fase: `FASE 3B — Autenticación y sesiones`.
- Dylan es el único ADMIN inicial.
- Asignaciones exactas de los cuatro usuarios.
- Cuatro permisos explícitos y únicos de ADMIN.
- ADMIN no implica otras capacidades ni permisos futuros.
- Grants exactos de SALES, FINANCE e INVENTORY_MANAGER.
- `sales.cancel` directo solo para Dylan.
- `transfers.create` sin grants.
- PARTNER y READ_ONLY sin usuarios.
- Invitación de 24 horas, hash-only, un solo uso y regeneración invalidante.
- CLI privada como bootstrap del primer ADMIN y API posterior gestionada por
  Dylan.
- Login: cuatro fallos en quince minutos, retrasos
  `0/500/1000/2000 ms`, bloqueo fijo de quince minutos y sin bloqueo permanente.
- Throttle compuesto por identificador normalizado y origen hasheado,
  persistente en PostgreSQL.
- Contraseñas de 12–128 caracteres, frases/espacios, blocklist, similitud con
  login, Argon2id y sin rotación periódica.
- Decisión consciente de 12 caracteres pese a recomendación más estricta para
  sistemas sin MFA.
- Sesión con 30 minutos de inactividad y 8 horas absolutas.
- Cookie `HttpOnly`, `Secure` en producción, `SameSite=Lax`, `Path=/` y sin
  `Domain`.
- Revocación por cambio de contraseña o desactivación.
- Logout idempotente, CSRF y validación de origen.
- Sin MFA, OAuth, JWT, Google login, correo o tokens en `localStorage`.
- Perfilador XLSX fuera de 3B y traslado propuesto a FASE 3C.

## 14. Pendientes históricos y deuda final

La reconciliación documental, blocklist, regla de similitud, recuperación
break-glass y protección del último ADMIN fueron resueltas. La deuda no
bloqueante que permanece al cierre es:

- calibrar y documentar los parámetros exactos de Argon2id en el ambiente
  objetivo antes de aprobar autenticación en staging;
- validar la configuración de proxy confiable y rotación del secreto HMAC de
  origen para Railway;
- definir retención y limpieza de invitaciones, throttles y sesiones expiradas;
- evaluar límites independientes por identificador y por origen antes de
  producción pública o crecimiento significativo;
- reevaluar el mínimo de 12 caracteres y MFA antes de exposición pública o si
  aumenta el riesgo;
- montar Swagger solo detrás de una puerta autenticada;
- construir UI administrativa en una fase posterior;
- retirar el aviso de compatibilidad Nest del patrón legacy `/api/*` durante
  hardening.

## 15. Puerta histórica para autorizar implementación

Antes de iniciar código, el propietario deberá aprobar explícitamente que este
documento es el baseline de implementación y autorizar por separado:

- archivos a modificar;
- dependencias y versiones estables compatibles;
- migración Prisma create-only revisada;
- cambios al bootstrap y manifest;
- cambios de contratos, API y web;
- estrategia de pruebas y comandos de calidad;
- actualización coordinada del roadmap.

Esta puerta fue satisfecha mediante las aprobaciones separadas de BLOQUES 1–7A.

## 16. Correccion operativa registrada durante el Bloque 1

El primer intento de generar la migracion create-only uso el wrapper
`db:migrate` con un separador `--`. pnpm reenvio ese separador como argumento
literal y Prisma invoco:

`prisma migrate dev --config prisma.config.ts "--" "--create-only" "--name" "phase_3b_authentication_models"`

Prisma no reconocio `--create-only`; creo y aplico accidentalmente la migracion
`20260804155048`. El incidente se reparo mediante backup validado, ensayo en
base descartable, rollback transaccional y reconciliacion limitada al registro
exacto de esa migracion. No se modifico la migracion de FASE 3A.

Para evitar la repeticion, la generacion aprobada del Bloque 1 uso directamente
el binario local del proyecto, sin wrapper y sin separador literal:

```powershell
Push-Location packages/database
.\node_modules\.bin\prisma.cmd migrate dev --config prisma.config.ts --create-only --name phase_3b_authentication_models
Pop-Location
```

No se cambio ningun script de `package.json`; cualquier futura generacion
create-only debe usar una forma equivalente que entregue las opciones
directamente a Prisma.

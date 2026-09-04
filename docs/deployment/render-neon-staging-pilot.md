# Despliegue piloto de staging — Render Free + Neon Free

## Alcance

Este procedimiento despliega una prueba para cuatro personas. No es producción,
no importa datos privados y no autoriza ventas, movimientos, asientos, cierres o
conteos reales. La decisión y sus límites están en
[ADR-013](../decisions/ADR-013-free-staging-pilot.md).

## Topología

```text
Navegador
  -> sgi-comarca-web-staging.onrender.com (Next.js, Render Free)
  -> sgi-comarca-api-staging.onrender.com (NestJS, Render Free)
  -> sgi-comarca-staging (PostgreSQL 18, Neon Free)
```

Render y Neon están ubicados en Virginia / AWS `us-east-1`. Los dominios
propios se agregan después de comprobar los dominios temporales de plataforma.

## Estado verificado al 2026-09-04

- Neon autenticado con un perfil local separado, fuera del repositorio.
- Proyecto `sgi-comarca-staging` creado sin secretos en la salida.
- PostgreSQL `18.6`, base `sgi_comarca_staging`, rol
  `sgi_staging_owner`, rama `main`.
- Gate 1 autorizado y completado: checkpoint
  `checkpoint-empty-2026-09-04` creado desde la base vacía, sin cómputo propio.
- Las siete migraciones versionadas están aplicadas en `main`: 35 tablas
  públicas, siete filas Prisma terminadas y cero migraciones inconclusas.
- Gate 2 autorizado y completado: checkpoint
  `checkpoint-pre-bootstrap-2026-09-04` creado antes del bootstrap, sin cómputo
  propio.
- El bootstrap creó 6 roles, 20 permisos, 4 usuarios pendientes, 3 almacenes,
  11 asignaciones de rol, 20 permisos por rol, 2 permisos directos y 1 evento
  de auditoría. No creó credenciales, sesiones, invitaciones ni datos de
  negocio.
- Ningún servicio de Render creado todavía.
- `render.yaml` preparado con dos servicios gratuitos, despliegue automático
  desactivado y secretos fuera de Git.
- Gate 3 autorizado y completado: `codex/staging-pilot` contiene commits
  separados para el fix del bootstrap, la UI revisada y este despliegue.

La fotografía externa no es verdad permanente: debe revalidarse justo antes de
cada mutación.

## Gates y orden de ejecución

### Gate 1 — esquema de staging

**Completado el 2026-09-04.** Fue autorizado explícitamente para aplicar
migraciones al proyecto Neon; no autorizó bootstrap ni datos.

1. Confirmar por nombre, región, base y rol que el destino es
   `sgi-comarca-staging`; no imprimir la cadena de conexión.
2. Confirmar que el esquema sigue vacío y que no existe una operación Neon
   pendiente.
3. Crear una rama/checkpoint de la base vacía.
4. Obtener una conexión **directa** de Neon en el entorno del proceso, sin
   copiarla a `.env`, argumentos persistentes, logs o historial.
5. Ejecutar `pnpm db:migrate:deploy`.
6. Verificar el historial Prisma, el conjunto de tablas y los invariantes de
   esquema. No ejecutar bootstrap en este gate.

### Gate 2 — bootstrap estructural

**Completado el 2026-09-04.** Fue autorizado explícitamente para crear solo la
estructura inicial; no autorizó activaciones, invitaciones ni datos operativos.

1. Revalidar el destino y el historial de migraciones.
2. Crear un checkpoint posterior al esquema y anterior al bootstrap.
3. Ejecutar `pnpm db:bootstrap` una vez.
4. Verificar los conteos sanitizados descritos en
   [phase-3b-auth-operations.md](phase-3b-auth-operations.md).
5. Repetir la comprobación de idempotencia solo si el procedimiento aprobado lo
   requiere.

Los dos primeros intentos agotaron el timeout interactivo predeterminado de
Prisma y se revirtieron por completo. Se aumentó únicamente el timeout de la
transacción del bootstrap a 30 segundos, manteniendo aislamiento
`Serializable`. Formato, lint y tipos del paquete de base de datos, más 7/7
pruebas de integración del bootstrap, pasaron antes del reintento exitoso. La
verificación final confirmó los conteos anteriores, cero grants revocados,
cero credenciales/sesiones/invitaciones, cero datos operativos y cero
operaciones Neon activas.

### Gate 3 — versión desplegable en Git

**Completado el 2026-09-04.** El propietario autorizó crear commits y publicar
únicamente `codex/staging-pilot`.

1. Crear la rama `codex/staging-pilot` desde el estado aprobado.
2. Añadir únicamente código/UI revisado, `render.yaml` y documentación de
   despliegue.
3. Excluir `.env`, `.agents/`, `.codex/`, `legacy/private/`, reportes privados,
   backups y cualquier credencial.
4. Ejecutar lint, tipos, unitarias, integración, build y E2E relevantes.
5. Revisar el diff y el escaneo de secretos.
6. Mantener el fix del timeout del bootstrap en un commit auditable separado de
   la UI y de la configuración/documentación del piloto.
7. Hacer push de esa rama solamente.

La validación final pasó: Prisma válido, lint 8/8, tipos 7/7, unitarias
249/249, integración PostgreSQL 318/318, build 7/7 y Playwright 42/42. Todos
los archivos del gate pasan Prettier explícito, `git diff --check` y el escaneo
de secretos. El comando global `pnpm format:check` sigue detectando 223 archivos
preexistentes fuera del alcance, incluida la caché no versionada `.agents/`;
no se reformatearon ni se incluyeron en los commits.

### Gate 4 — servicios Render

1. Crear o acceder a la cuenta gratuita de Render.
2. Conectar GitHub solo al repositorio `DylanRizo/sgi-comarca`.
3. Crear un Blueprint desde `render.yaml` en `codex/staging-pilot`.
4. Confirmar antes de aplicar:
   - dos servicios `web` con plan `free`;
   - región `virginia`;
   - `autoDeployTrigger: off`;
   - ninguna base Render y ningún recurso de pago.
5. Proporcionar `DATABASE_URL` como secreto usando la conexión **agrupada** de
   Neon. Render genera los dos secretos HMAC.
6. Aplicar el Blueprint y observar ambos builds. No ejecutar migraciones ni
   bootstrap desde Render.

`TRUST_PROXY_HOPS=1` corresponde al balanceador HTTPS inmediato de Render. Se
considera provisional hasta que el smoke test confirme Host, Origin, IP y
cookie; no se aumenta sin evidencia de otro proxy real.

### Gate 5 — smoke test HTTPS

1. Confirmar `GET /api/v1/health` y `GET /api/v1/ready`.
2. Abrir `/login` desde el servicio web y verificar que no existan errores de
   CORS ni contenido mixto.
3. Confirmar que la cookie es host-only, `Secure`, `HttpOnly`, `SameSite=Lax` y
   `Path=/`.
4. Esperar más de 15 minutos y medir el arranque en frío de ambos servicios.
5. Revisar logs sanitizados: sin cookies, tokens, contraseñas ni conexiones.

### Gate 6 — activación inicial

Requiere autorización separada y un canal privado para entregar el token.

1. Ejecutar `pnpm auth:bootstrap-admin-invitation` desde un entorno local
   controlado con la conexión directa en memoria.
2. No registrar el token. Entregar solo por canal privado una URL con fragmento:
   `/activate#token=<TOKEN>`.
3. Activar el primer administrador y verificar login/logout.
4. Invitar a las otras tres personas mediante el flujo administrativo, sin
   compartir contraseñas.

## Operación del piloto

- Render Free suspende cada servicio tras inactividad; un primer acceso lento
  es esperado y no equivale por sí solo a una caída.
- Los dos servicios comparten el cupo mensual gratuito. Revisar consumo cada
  semana durante la prueba.
- Mantener despliegues manuales. Cada nueva versión repite calidad, diff,
  migración aplicable y smoke test.
- No agregar dominios Hostinger hasta que los dos dominios `onrender.com`
  funcionen de punta a punta.
- No importar el XLSX ni usar datos empresariales reales durante este piloto
  sin un gate de importación y reconciliación.

## Rollback y cierre

- Fallo de aplicación: volver al deploy anterior de Render y conservar la base.
- Fallo de esquema: detener tráfico y restaurar desde el checkpoint aprobado;
  no editar ni borrar filas manualmente.
- Fin del piloto: exportar solo evidencia sanitizada y solicitar autorización
  antes de pausar o eliminar servicios, proyecto, ramas o credenciales.

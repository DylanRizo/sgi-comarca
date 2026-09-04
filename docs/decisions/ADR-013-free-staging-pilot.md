# ADR-013 — Piloto gratuito de staging en Render y Neon

- Estado: `APPROVED_BY_OWNER`
- Fecha: 2026-09-03
- Alcance: fase de prueba para cuatro usuarios
- Excepción temporal a: Railway como plataforma aprobada de producción

## Contexto

La cuenta disponible de Railway no ofrece el plan gratuito necesario para el
piloto. El propietario confirmó que la aplicación será probada inicialmente por
solo cuatro personas y aprobó continuar con la alternativa gratuita propuesta.
El objetivo inmediato es validar despliegue, autenticación y flujos críticos;
no declarar el sistema listo para producción.

## Decisión

El staging piloto usará dos servicios web gratuitos de Render y un proyecto
PostgreSQL gratuito e independiente en Neon:

- `sgi-comarca-web-staging`: Next.js en Render, región Virginia;
- `sgi-comarca-api-staging`: NestJS en Render, región Virginia;
- `sgi-comarca-staging`: PostgreSQL 18 en Neon, región AWS `us-east-1`.

Los servicios se describen en `render.yaml`, sin secretos. Las migraciones, el
bootstrap y la invitación inicial continúan siendo operaciones manuales y
separadas, cada una detrás de su gate. No se ejecutan durante build, inicio ni
despliegue. Los despliegues automáticos permanecen desactivados durante el
piloto.

Esta decisión no sustituye Railway para una futura producción. Cualquier paso a
producción exige una revisión nueva de capacidad, disponibilidad, backups,
restauración, costos y soporte.

## Límites aceptados

- Los servicios gratuitos de Render se suspenden tras inactividad y el primer
  acceso puede tardar alrededor de un minuto.
- Las horas gratuitas son compartidas por los dos servicios. El piloto debe
  vigilar el consumo y no asumir disponibilidad continua.
- El plan gratuito no ofrece una consola operativa equivalente a un servicio
  de producción ni un pre-deploy de pago; por eso las migraciones se ejecutan
  desde un entorno controlado.
- Neon puede suspender el cómputo cuando no se usa. Se emplea una conexión
  agrupada para la API y una conexión directa solo para operaciones de esquema.
- El piloto comienza sin datos empresariales reales. Importar datos privados es
  otro gate y no queda autorizado por esta decisión.

## Seguridad y separación

- Staging conserva base, secretos, sesiones, dominios y usuarios separados de
  cualquier entorno previo o futuro.
- `DATABASE_URL` se configura directamente en Render y nunca se versiona.
- Los secretos HMAC son independientes y generados por Render.
- Las cookies de producción mantienen el nombre `__Host-sgi_session`, HTTPS,
  `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` y sin atributo `Domain`.
- La API permanece privada por defecto salvo las cuatro rutas públicas
  aprobadas. Swagger sigue sin montarse.

## Evidencia inicial

El 2026-09-03 se creó el proyecto Neon vacío y se verificó de forma directa:

- proyecto `sgi-comarca-staging`;
- PostgreSQL `18.6` en `aws-us-east-1`;
- base `sgi_comarca_staging` y rol `sgi_staging_owner`;
- rama predeterminada `main`;
- cero tablas en `public` y ausencia de `_prisma_migrations`;
- ninguna credencial o identificador privado incorporado al repositorio.

La fotografía anterior debe revalidarse antes de cualquier escritura.

### Gate de esquema — 2026-09-04

El propietario autorizó explícitamente el gate de migración, sin bootstrap ni
datos. Tras revalidar el destino vacío se creó
`checkpoint-empty-2026-09-04` desde `main`, sin cómputo propio, y se aplicaron
las siete migraciones versionadas con `pnpm db:migrate:deploy`. La verificación
directa confirmó 35 tablas públicas, siete migraciones terminadas, cero
inconclusas, cero operaciones Neon activas y cero filas en las tablas de
bootstrap y negocio inspeccionadas.

### Gate de bootstrap estructural — 2026-09-04

El propietario autorizó explícitamente crear la estructura inicial, sin
credenciales, invitaciones ni datos operativos. Se creó
`checkpoint-pre-bootstrap-2026-09-04` desde `main`, sin cómputo propio. Dos
intentos agotaron el timeout interactivo predeterminado de Prisma y revirtieron
todos sus cambios. Tras ampliar únicamente el timeout de esa transacción a 30
segundos, manteniendo aislamiento `Serializable`, pasaron formato, lint, tipos
y las 7/7 pruebas de integración del bootstrap.

El reintento creó exactamente 6 roles, 20 permisos, 4 usuarios pendientes, 3
almacenes activos, 11 asignaciones de rol, 20 permisos por rol, 2 permisos
directos y 1 registro de auditoría. La verificación directa confirmó cero
grants revocados, credenciales, sesiones, invitaciones y datos operativos, así
como cero operaciones Neon activas. La activación inicial y cualquier dato de
negocio continúan detrás de gates separados.

## Criterios de salida del piloto

- migraciones y bootstrap aplicados con checkpoint y evidencia sanitizada;
- API `health` y `ready` responden correctamente;
- login, sesión, CSRF, CORS y cookie segura verificados sobre HTTPS;
- cuatro cuentas activables sin compartir contraseñas;
- smoke tests de los flujos críticos acordados sin datos reales;
- consumo y latencia de arranque considerados aceptables por el propietario.

## Rollback

Ante un fallo se detienen los servicios de Render y se conserva el checkpoint
de Neon. No se corrige el ledger manualmente ni se borran filas históricas. La
eliminación de los recursos gratuitos requiere una autorización destructiva
separada.

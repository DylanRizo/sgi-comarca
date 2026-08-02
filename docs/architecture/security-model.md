# Modelo de seguridad

## Principios

- autenticación obligatoria para toda ruta operacional;
- autorización backend denegada por defecto;
- privilegio mínimo y roles combinables;
- sesiones revocables, secretos fuera del repositorio y logs redactados;
- defensa contra CSRF, XSS, fuerza bruta y doble envío;
- auditoría de eventos de seguridad y mutaciones importantes.

## Alta e invitación

1. Un ADMIN crea una invitación para una identidad explícita.
2. Se almacena solo el hash de un token aleatorio, con uso único y expiración.
3. El usuario abre la invitación, define contraseña y activa la cuenta.
4. La API aplica Argon2id con parámetros vigentes definidos en configuración y crea una sesión nueva.
5. La invitación queda consumida atómicamente.

Los nombres legacy nunca crean cuentas ni asignan roles. Los cuatro usuarios iniciales se configurarán de manera explícita.

## Sesiones

- Identificador opaco aleatorio de alta entropía.
- La base almacena hash del token, usuario, fechas de creación/último uso/expiración, revocación y metadatos mínimos.
- Cookie en producción: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` y nombre con prefijo seguro cuando la topología lo permita.
- Rotación al autenticar y ante cambios sensibles; revocación en logout, cierre de todas las sesiones, desactivación o cambio de contraseña.
- Expiración absoluta y por inactividad serán configurables; sus duraciones exactas se fijarán y probarán en FASE 5.
- No se usan JWT ni tokens en `localStorage`.

## CSRF y origen

La cookie de sesión autentica automáticamente, por lo que toda mutación exige:

- `SameSite=Lax` como primera barrera;
- validación estricta de `Origin`/`Host` contra el frontend configurado;
- token CSRF asociado a sesión para `POST`, `PUT`, `PATCH` y `DELETE`;
- CORS restringido al origen exacto de cada ambiente, sin comodines con credenciales.

## Autorización

Los guards NestJS resuelven sesión, usuario activo, roles y permisos. Los servicios vuelven a comprobar políticas dependientes del recurso, por ejemplo estado de venta, pertenencia del almacén o permiso financiero.

Permisos aprobados:

- Dylan y Samantha: Finanzas y crear/reabrir cierres;
- los cuatro usuarios: ajustes de inventario;
- vendedores autorizados: confirmar ventas en tránsito;
- Dylan: cancelar ventas elegibles;
- transferencias: denegadas hasta asignar un permiso aprobado.

Los nombres se usan solo para la asignación inicial; el código autoriza capacidades, no compara nombres personales.

## Login y contraseñas

- Hash Argon2id; nunca se registra ni devuelve el hash.
- Validación de credenciales con respuesta genérica para no enumerar usuarios.
- Rate limiting por identidad y origen, con límites exactos a definir en FASE 5.
- Registro auditado de login exitoso/fallido, logout, revocación, invitación, activación y cambios de rol.
- Recuperación de contraseña requerirá un flujo seguro antes de habilitarse; no se inventan canales no aprobados.

## Seguridad de aplicación

- DTOs validados y propiedades desconocidas rechazadas.
- Renderizado de observaciones como texto, CSP restrictiva y sin HTML no confiable.
- Prisma parametriza SQL; consultas raw excepcionales requieren parámetros y revisión.
- Cabeceras: CSP, `frame-ancestors`, `X-Content-Type-Options`, Referrer-Policy y HSTS en producción.
- Errores externos no incluyen stack, SQL, IDs privados ni configuración.
- Logs JSON incluyen request/correlation ID y actor ID, pero no cookies, tokens, contraseñas, direcciones completas ni observaciones sensibles.

## Auditoría

`audit_logs` registra actor, acción, entidad, ID, cambios permitidos, request ID, timestamp UTC y metadatos de origen mínimos. Contraseñas, tokens y secretos se excluyen siempre. Los registros son append-only y se escriben en la transacción de la mutación cuando corresponda.

## Secretos y ambientes

Cada ambiente tiene secretos y cookies independientes. Variables se configuran en Railway/GitHub; `.env*` real no se versiona. PostgreSQL no se expone públicamente salvo acceso temporal controlado y documentado.

## Verificación mínima

- rutas anónimas rechazadas;
- permisos verticales y horizontales probados;
- Finanzas denegada a Jean/Luden;
- CSRF, revocación y expiración probados;
- rate limiting de login;
- texto malicioso no se ejecuta;
- doble solicitud no duplica mutaciones;
- audit log presente y sin secretos.

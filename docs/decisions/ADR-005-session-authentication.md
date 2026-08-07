# ADR-005 — Autenticación por sesiones opacas

- Estado: `SUPERSEDED_IN_PART_BY_ADR_007`
- Fecha: 2026-08-01
- Alcance: identidad y acceso

## Contexto

El web app legacy permite acceso anónimo. V1 es una aplicación web first-party con cuatro usuarios iniciales, requiere revocación, permisos cambiantes y no necesita que el navegador porte claims autónomos.

> Nota de supersesión (2026-08-07): la elección central de sesiones opacas
> permanece aceptada. La matriz, duraciones, parámetros Argon2id, throttle,
> recuperación del último ADMIN y superficie administrativa fueron cerrados en
> [ADR-007](ADR-007-phase-3b-authentication-authorization.md).

## Decisión

Usar sesiones opacas revocables:

- token aleatorio en cookie `HttpOnly`, `Secure`, `SameSite=Lax`;
- solo hash del token en PostgreSQL;
- expiración absoluta/inactividad y revocación;
- invitación/activación explícita;
- contraseñas con Argon2id;
- CSRF para mutaciones y validación estricta de origen;
- autorización por roles/permisos en backend.

No se almacenan tokens en `localStorage` ni se usan JWT como sesión de navegador.

## Consecuencias

Positivas:

- revocación inmediata y cierre de todas las sesiones;
- permisos se evalúan con estado actual;
- tokens/roles no quedan expuestos a JavaScript;
- modelo adecuado para administración de cuatro usuarios y crecimiento moderado.

Costos:

- cada solicitud requiere resolver sesión, mitigable con índices y consulta eficiente;
- se necesita limpieza de sesiones expiradas;
- CSRF y configuración de cookies/orígenes deben probarse por ambiente.

## Asignación inicial aprobada

- Dylan: FINANCE e INVENTORY_MANAGER; permiso directo `sales.cancel`.
- Samantha: FINANCE e INVENTORY_MANAGER.
- Jean y Luden: INVENTORY_MANAGER, sin Finanzas inicialmente.
- SALES se asignará explícitamente a vendedores autorizados; no se deriva del legacy.
- ADMIN, PARTNER y READ_ONLY quedan sin usuarios ni permisos en FASE 3A.
- `transfers.create` existe como capacidad técnica sin grants.
- No se crea `roles.manage_financial_access`.

## Alternativas rechazadas

- JWT en localStorage: mayor exposición XSS y revocación/roles obsoletos.
- Acceso anónimo: contradice requisitos obligatorios.
- Autorización solo UI: no protege endpoints.

## Detalles diferidos — histórico

Esta sección describe el estado al aprobar ADR-005. Los valores entonces
diferidos fueron implementados en FASE 3B, no en una FASE 5 futura: 30 minutos
idle, 8 horas absolutas, Argon2id `65536/3/4/32` y throttle de cuatro fallos en
15 minutos con bloqueo de 15 minutos. Consulte ADR-007 para la decisión vigente.

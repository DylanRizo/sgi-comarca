# ADR-005 — Autenticación por sesiones opacas

- Estado: `ACCEPTED`
- Fecha: 2026-08-01
- Alcance: identidad y acceso

## Contexto

El web app legacy permite acceso anónimo. V1 es una aplicación web first-party con cuatro usuarios iniciales, requiere revocación, permisos cambiantes y no necesita que el navegador porte claims autónomos.

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

- Dylan: FINANCE e INVENTORY_MANAGER; permisos explícitos `sales.cancel` y `roles.manage_financial_access`.
- Samantha: FINANCE e INVENTORY_MANAGER.
- Jean y Luden: INVENTORY_MANAGER, sin Finanzas inicialmente.
- SALES se asignará explícitamente a vendedores autorizados; no se deriva del legacy.
- La asignación inicial de ADMIN y los permisos de transferencias permanecen pendientes; staging los deniega salvo una capacidad aprobada explícitamente.

## Alternativas rechazadas

- JWT en localStorage: mayor exposición XSS y revocación/roles obsoletos.
- Acceso anónimo: contradice requisitos obligatorios.
- Autorización solo UI: no protege endpoints.

## Detalles diferidos

Duraciones exactas, parámetros Argon2 y límites de login se seleccionarán con valores estables y pruebas en FASE 5; no son reglas de negocio.

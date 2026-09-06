# ADR-014 — Subdominios personalizados para el staging piloto

- Estado: `APPROVED_BY_OWNER`
- Fecha: 2026-09-04
- Alcance: staging piloto para cuatro usuarios
- Complementa: [ADR-013](ADR-013-free-staging-pilot.md)

## Contexto

El staging piloto ya funcionaba de punta a punta en los dominios temporales de
Render. El propietario administra `lacomarcanic.com` en Hostinger y aprobó usar
dos subdominios exclusivos para la prueba sin cambiar el dominio raíz, `www`, el
correo ni el sitio de la tienda existente.

## Decisión

Los orígenes primarios del staging piloto son:

- web: `https://sgi.lacomarcanic.com`;
- API: `https://api-sgi.lacomarcanic.com`.

Hostinger publica dos CNAME: `sgi` apunta a
`sgi-comarca-web-staging.onrender.com` y `api-sgi` apunta a
`sgi-comarca-api-staging.onrender.com`. Render administra y renueva TLS para
ambos subdominios.

`API_PUBLIC_URL` usa el origen personalizado de la API.
`NEXT_PUBLIC_API_URL` se compila con ese mismo origen. `WEB_ORIGINS` admite el
origen web personalizado y conserva temporalmente el origen `onrender.com` de
la web como respaldo operativo. El origen personalizado es el enlace que se
entrega a los usuarios del piloto.

Los subdominios `onrender.com` permanecen habilitados para rollback y
diagnóstico. Deshabilitarlos requiere otra decisión y una verificación de que
el dominio personalizado funciona durante todo el piloto.

## Verificación

El 2026-09-04 se comprobó:

- ambos CNAME propagados y ambos dominios `verified` en Render;
- HTTPS 200 en `/login`, `/api/v1/health` y `/api/v1/ready`;
- el bundle web contiene la API personalizada y no el origen API anterior;
- CORS acepta exactamente el origen web personalizado con credenciales;
- la cookie de sesión sigue siendo host-only, `Secure`, `HttpOnly`,
  `SameSite=Lax` y `Path=/`;
- no existen referencias HTTP inseguras en la página de login.

## Límites

Esta decisión no selecciona un dominio de producción ni autoriza activaciones,
invitaciones, importaciones o datos empresariales reales. El dominio raíz y la
tienda permanecen fuera del alcance. Los servicios continúan siendo Render
Free y conservan sus límites de suspensión, capacidad y disponibilidad.

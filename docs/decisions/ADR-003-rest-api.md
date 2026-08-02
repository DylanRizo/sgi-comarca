# ADR-003 — API REST con OpenAPI

- Estado: `ACCEPTED`
- Fecha: 2026-08-01
- Alcance: interfaz web–backend

## Contexto

El contrato Apps Script actual consiste en funciones globales sin versionado, respuestas inconsistentes y validación insuficiente. La nueva UI necesita recursos claros, paginación, errores tipados, idempotencia y documentación verificable.

## Decisión

Exponer una API REST NestJS bajo `/api/v1`, documentada con OpenAPI. Usar recursos HTTP, DTOs validados, respuestas consistentes, paginación servidor, strings decimales y errores de dominio estables.

Mutaciones críticas requieren `Idempotency-Key`. La autenticación usa cookie de sesión, CSRF y orígenes restringidos.

## Consecuencias

Positivas:

- contrato observable y testeable;
- integración directa con Next.js/TanStack Query;
- autorización y validación centralizadas;
- evolución versionada y generación de documentación.

Costos:

- requiere diseñar endpoints y compatibilidad;
- algunas pantallas analíticas necesitan endpoints de consulta especializados;
- serialización Decimal/fechas debe ser consistente.

## Alternativas rechazadas

- GraphQL: no aporta una necesidad demostrada y amplía superficie/complejidad.
- Acceso directo desde Next.js a DB: mezcla presentación, autorización y dominio.
- Replicar nombres RPC legacy: conservaría contratos globales inconsistentes.

## Criterio de éxito

OpenAPI representa todas las operaciones de la trazabilidad; permisos, validación, idempotencia, paginación y errores tienen pruebas API.

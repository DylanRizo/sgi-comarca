# ADR-001 — Monolito modular en monorepo

- Estado: `ACCEPTED`
- Fecha: 2026-08-01
- Alcance: arquitectura de aplicación

## Contexto

SGI La Comarca requiere 21 módulos estrechamente relacionados y transacciones que atraviesan ventas, inventario, movimientos y auditoría. El equipo necesita migración gradual, bajo costo operacional y consistencia fuerte. El presupuesto objetivo inicial es USD 15/mes.

## Decisión

Construir un monolito modular en un monorepo pnpm/Turborepo:

- `apps/web`: Next.js;
- `apps/api`: NestJS REST;
- `packages/database`, `contracts`, `ui` y `config`;
- PostgreSQL como única base operacional.

Los módulos mantienen límites de código y propiedad de datos, pero comparten proceso API y transacciones PostgreSQL. No se usan microservicios ni comunicación distribuida.

## Consecuencias

Positivas:

- transacciones atómicas sencillas;
- despliegue, pruebas y observabilidad con menor costo;
- refactor progresivo sin contratos de red internos;
- una base reproducible para un equipo pequeño.

Costos:

- requiere disciplina para evitar dependencias cíclicas;
- un despliegue API contiene todos los módulos;
- escalado es conjunto hasta que evidencia justifique separar.

## Alternativas rechazadas

- Microservicios: complejidad, costo y consistencia distribuida sin necesidad demostrada.
- Apps Script mejorado: no resuelve transacciones, seguridad ni modelo relacional adecuadamente.
- Un único proyecto sin módulos: facilitaría acoplamiento y archivos gigantes ya observados.

## Criterio de reconsideración

Solo evidencia de carga, equipos independientes, aislamiento regulatorio o límites de despliegue justificaría evaluar una extracción futura mediante otro ADR.

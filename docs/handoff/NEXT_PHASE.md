# Next Gate — Selección del propietario

FASE 7B está cerrada en el repositorio versionado: la capa de aplicación y la
API REST de ventas están implementadas y verificadas localmente sobre
PostgreSQL real. El propietario declaró el cierre el 2026-08-28.

Evidencia: [reporte de cierre](../reviews/phase-7b-completion-report.md),
[plan aprobado](../reviews/phase-7b-sales-application-plan.md) y
[ADR-009](../decisions/ADR-009-sales-pricing-cost.md).

## Estado actual

- **`PHASE_7A_SCHEMA_COMPLETE`**
- **`PHASE_7B_COMPLETE`**
- **`STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`**
- **`FIRST_STAGING_SALE_NOT_AUTHORIZED`**
- **`WAVES_3_PLUS_NOT_STARTED`**
- **`NEXT_GATE = NOT_SELECTED`**

Cerrar FASE 7B no autorizó ninguna acción operacional. Este documento no
selecciona ni autoriza el siguiente gate: sólo enumera los candidatos para que
el propietario elija uno de forma explícita.

## Gates candidatos

Ninguno está autorizado. Cada uno requiere su propia decisión y, cuando toca
estado externo, su propio checkpoint operativo.

### A. Despliegue de FASE 7A/7B a staging

Aplicar la migración `20260826232758_phase_7a_sales_foundation` y el cambio de
bootstrap/RBAC al entorno de staging. Requiere verificación positiva del
destino, checkpoint previo y posterior, y revalidación read-only de que
`sales`, `sale_items`, `sale_cancellations` e `in_transit_confirmations` siguen
vacías. No incluye crear ninguna venta real: `FIRST_STAGING_SALE` es un gate
separado y posterior.

### B. UI de ventas

Interfaz para crear, listar, confirmar y cancelar ventas sobre la API ya
implementada. No requiere cambios de esquema ni permisos nuevos. Debe respetar
que `sales.read` no concede permisos financieros y que el costo no se expone.

### C. Importación legacy de `Ventas` (Waves 3+)

Requiere resolver antes las decisiones humanas todavía abiertas en
[open-decisions.md](../legacy/open-decisions.md): DEC-012, DEC-013, DEC-016,
DEC-017 y las de agrupación y duplicados. No puede inferirse ninguna regla
desde la implementación operacional de FASE 7B.

### D. Finanzas y cierres diarios

Módulos `finances` y `daily-closings`. Interactúa con el invariante de que los
ingresos automáticos de ventas no deben duplicarse en Finanzas, por lo que
necesita su propio diseño y decisiones aprobadas.

## Deuda menor pendiente

No bloquea ningún gate, pero conviene resolverla en la próxima sesión con
Docker disponible:

- volver a ejecutar `pnpm test:integration` para cubrir el commit `d982477`,
  posterior a la última corrida de integración. Ese commit no cambia
  comportamiento en ejecución.

## Estado operacional que permanece inalterado

- Las 1,069 filas legacy de `Movimientos` siguen sin importar.
- Las 25 filas clasificadas históricamente como transferencias siguen sin
  importar.
- Las ventas legacy continúan diferidas y sin materializar.
- `WAVES_3_PLUS_NOT_STARTED` continúa vigente.
- Los movimientos históricos del ledger nunca se editan ni eliminan a mano.
- El snapshot de staging del 2026-08-23 es evidencia histórica, no verdad live.
  Antes de cualquier gate de migración debe revalidarse el target read-only.

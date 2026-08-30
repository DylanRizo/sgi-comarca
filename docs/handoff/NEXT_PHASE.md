# Next Gate — FASE 9A, esquema de auditoría física

El 2026-08-30 el propietario seleccionó **FASE 9** como siguiente fase y
aprobó su estructura por bloques y su separación de lectura financiera. La
planificación está en
[phase-9-audits-reports-plan.md](../reviews/phase-9-audits-reports-plan.md).
Seleccionar la fase no autoriza implementar: el esquema, el cambio de RBAC y
el despliegue a staging siguen siendo gates separados.


FASE 8 está cerrada de punta a punta en el repositorio versionado: 8A el
esquema, 8B la aplicación y API, 8C la interfaz. Todo fue verificado
directamente el 2026-08-29 contra PostgreSQL local.

El 2026-08-30 el propietario autorizó y se ejecutó el despliegue de FASE 7A
y 8A a staging (esquema y RBAC únicamente). Evidencia completa en
[CURRENT_STATE.md § "FASE 7A/8A schema deployed to staging"](CURRENT_STATE.md).
Ninguna venta, asiento o cierre real fue creado en staging; ese despliegue
no autorizó ninguno de esos, y cada uno sigue siendo un gate separado.

Con esto, FASE 7 y FASE 8 están ambas cerradas de punta a punta en el
repositorio versionado, y su esquema/RBAC ya están desplegados en staging.
Ningún módulo de negocio queda pendiente de implementación local salvo lo
que dependa de decisiones humanas todavía abiertas o de importación legacy.

Evidencia: [CURRENT_STATE.md](CURRENT_STATE.md),
[reporte de FASE 8B](../reviews/phase-8b-completion-report.md),
[reporte de FASE 8C](../reviews/phase-8c-completion-report.md),
[ADR-010](../decisions/ADR-010-finances-closings-rules.md).

## Estado actual

- **`PHASE_7A_SCHEMA_COMPLETE`**, **`PHASE_7B_COMPLETE`**,
  **`PHASE_7C_COMPLETE`**
- **`PHASE_8A_SCHEMA_COMPLETE`**, **`PHASE_8B_COMPLETE`**,
  **`PHASE_8C_COMPLETE`**
- **`PHASE_8_COMPLETE`**
- **`STAGING_PHASE_7A_8A_SCHEMA_APPLIED`** (2026-08-30; ver CURRENT_STATE.md)
- **`FIRST_STAGING_SALE_NOT_AUTHORIZED`**
- **`FIRST_STAGING_FINANCIAL_ENTRY_NOT_AUTHORIZED`**
- **`FIRST_STAGING_CLOSING_NOT_AUTHORIZED`**
- **`WAVES_3_PLUS_NOT_STARTED`**
- **`PHASE_9_PLANNING_COMPLETE`**, **`PHASE_9A_NOT_STARTED`**
- **`NEXT_GATE = PHASE_9A_SCHEMA`**

Cerrar FASE 8 no autorizó ninguna acción operacional, y desplegar su esquema
a staging tampoco autorizó ninguna. Seleccionar FASE 9 tampoco autoriza
implementarla.

## Gate seleccionado

### FASE 9A — esquema de auditoría física

Sesión de auditoría, líneas de conteo y vínculo inmutable a los ajustes
generados al aprobar. Requiere migración nueva y cuatro permisos nuevos
(`inventory.audit.create`, `inventory.audit.approve`, `reports.read`,
`analytics.read`), así que es su propio bloque con su propio gate, y su
despliegue a staging es otro distinto.

Pendiente antes de escribir esquema: los grants por rol de los cuatro permisos
nuevos, y la convención de nombres que evita la colisión con el
`InventoryAuditService` existente. Detalle en
[phase-9-audits-reports-plan.md](../reviews/phase-9-audits-reports-plan.md).

## Otros gates candidatos, no seleccionados

### A. Importación legacy de `Ventas` y `Finanzas` (Waves 3+)

El 2026-08-30 el propietario resolvió cuatro de las decisiones que bloqueaban
este gate mediante
[ADR-011](../decisions/ADR-011-legacy-sales-import-decisions.md): DEC-012
(normalización de personas), DEC-013 (canales), DEC-016 (estado de las 404
líneas de venta) y DEC-017 (hora final vacía). Ninguna de las cuatro cambia el
esquema ni requiere migración.

Sigue bloqueado por decisiones humanas todavía abiertas en
[open-decisions.md](../legacy/open-decisions.md): DEC-018 (método de pago
histórico), DEC-006 (cuatro líneas de venta duplicadas), DEC-007 (siete ventas
sin movimiento) y DEC-026 (importación CSV legacy). Ninguna regla puede
inferirse desde la implementación operacional de FASE 7 u 8.

Además, el importador legacy de `Ventas` no existe todavía: `legacySellerText`,
`delivererText` y `salesChannelText` no están referenciados en ningún `.ts` del
repositorio. Resolver las decisiones restantes habilita planificarlo; no lo
implementa ni autoriza escritura alguna.

### B. Deuda técnica menor

No es una fase; son mejoras acotadas que pueden agruparse:

- el arnés E2E ahora numera sus archivos (01-04) para fijar el orden de
  ejecución; cualquier especificación nueva debe respetar esa numeración o
  revisar la nota en `playwright.config.ts`;
- divergencia entre el plan de FASE 7B §13, que preveía `productId` y
  `warehouseId` en los `details` de los 422, y el filtro global, que siempre
  devuelve `details` vacío para toda la API;
- el arranque en frío del API puede exceder el timeout de salud de 60 s del
  runner E2E; subir ese timeout es una decisión separada.

## Estado operacional que permanece inalterado

- Las 1,069 filas legacy de `Movimientos` siguen sin importar.
- Las 25 filas clasificadas históricamente como transferencias siguen sin
  importar.
- Las ventas legacy continúan diferidas y sin materializar.
- `WAVES_3_PLUS_NOT_STARTED` continúa vigente.
- Los movimientos históricos del ledger nunca se editan ni eliminan a mano.
- Staging tiene ahora el esquema y RBAC de FASE 7A/8A aplicados
  (2026-08-30), verificado directamente ese día; `sales`, `sale_items`,
  `sale_cancellations`, `in_transit_confirmations`, `financial_entries`,
  `financial_categories`, `daily_closings` y `daily_closing_reopenings`
  siguen todas vacías ahí. Antes de cualquier gate operacional futuro sobre
  staging debe revalidarse el target read-only; el estado aquí descrito no
  es verdad live indefinida.

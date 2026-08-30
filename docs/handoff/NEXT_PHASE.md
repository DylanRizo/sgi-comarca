# Next Gate — Selección del propietario

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
- **`NEXT_GATE = NOT_SELECTED`**

Cerrar FASE 8 no autorizó ninguna acción operacional, y desplegar su esquema
a staging tampoco autorizó ninguna. Este documento no selecciona ni autoriza
el siguiente gate: enumera los candidatos para que el propietario elija uno
de forma explícita.

## Gates candidatos

### A. Importación legacy de `Ventas` y `Finanzas` (Waves 3+)

Bloqueado por decisiones humanas todavía abiertas en
[open-decisions.md](../legacy/open-decisions.md): DEC-012 (normalización de
personas), DEC-013 (canales), DEC-016 (estado de 401 líneas de venta),
DEC-017 (hora final vacía), agrupación y duplicados. Ninguna regla puede
inferirse desde la implementación operacional de FASE 7 u 8.

Antes de planificar este gate, el propietario debe resolver esas decisiones.

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

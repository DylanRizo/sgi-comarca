# Next Gate — FASE 8B, aplicación y API de finanzas y cierres

FASE 7 está cerrada de punta a punta en el repositorio versionado: 7A el
esquema, 7B la aplicación y API, 7C la interfaz. Todo fue verificado localmente
contra PostgreSQL real el 2026-08-28. Nada se desplegó y staging nunca fue
tocado.

Evidencia: [CURRENT_STATE.md](CURRENT_STATE.md),
[reporte de FASE 7B](../reviews/phase-7b-completion-report.md),
[plan de FASE 7B](../reviews/phase-7b-sales-application-plan.md) y
[ADR-009](../decisions/ADR-009-sales-pricing-cost.md).

## Estado actual

- **`PHASE_7A_SCHEMA_COMPLETE`**
- **`PHASE_7B_COMPLETE`**
- **`PHASE_7C_COMPLETE`**
- **`STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`**
- **`FIRST_STAGING_SALE_NOT_AUTHORIZED`**
- **`WAVES_3_PLUS_NOT_STARTED`**
- **`PHASE_8_SELECTED`** — finanzas y cierres, elegida por el propietario el
  2026-08-28.
- **`PHASE_8_PLANNING_COMPLETE`**
- **`PHASE_8A_SCHEMA_COMPLETE`**
- **`PHASE_8B_NOT_AUTHORIZED`**
- **`NEXT_GATE = PHASE_8B_APPLICATION`**

Cerrar FASE 7 no autorizó ninguna acción operacional. El propietario eligió
como siguiente tramo finanzas y cierres diarios, y el 2026-08-29 resolvió las
decisiones que bloqueaban su planificación. El plan está en
[el plan de FASE 8](../reviews/phase-8-finances-closings-plan.md) y la decisión
formal en [ADR-010](../decisions/ADR-010-finances-closings-rules.md).

Reglas aprobadas que fijan el módulo:

- **DEC-022** — Finanzas deriva los ingresos de ventas al leer y no los
  persiste; un asiento persistido es siempre manual y ninguna lectura borra
  filas;
- **DEC-023** — la diferencia del cierre conserva la fórmula legacy y los
  gastos no participan;
- **DEC-024** — la tolerancia `Cuadrado` se conserva pero configurable, y cada
  cierre registra la aplicada;
- **DEC-019** — el cierre reporta las ventas en tránsito sin tocarlas y nunca
  repone inventario como efecto secundario.

Siguen abiertas las partes de DEC-025 sobre límite temporal de reapertura,
reapertura con cierres posteriores y nueva aprobación tras modificar. Se
resolverán antes del bloque que implemente la reapertura.

## FASE 8A — completada

La fundación de esquema está implementada y verificada el 2026-08-29 contra el
PostgreSQL local de Docker Compose: la migración
`20260829144239_phase_8a_finances_closings_foundation` aplica limpia sobre una
base temporal y las 213 pruebas de integración pasan. Nada se desplegó y la
base local `sgi_comarca_staging` se verificó intacta.

Lo que la base ya garantiza por sí sola:

- un asiento financiero persistido es siempre manual, con monto positivo,
  categoría del mismo tipo y activa cuando es operacional;
- el historial financiero es inmutable: corregir exige un asiento inverso;
- un único cierre por fecha, con la fórmula aprobada como CHECK y sin gastos;
- `balanced` se verifica contra la tolerancia registrada en el propio cierre;
- las cifras del cierre son inmutables y sólo admite `CLOSED → REOPENED`, con
  su documento de reapertura presente y el historial completo preservado.

Volver a cerrar un cierre reabierto queda deliberadamente fuera de 8A porque
DEC-025 sigue abierta en ese punto.

## FASE 8B — pendiente de autorización

Servicios transaccionales, lectura paginada, creación manual de asientos,
creación y reapertura de cierres, idempotencia por actor, auditoría saneada y
RBAC exacto con los cinco permisos que ya existen en el manifest. No se prevé
permiso nuevo ni migración adicional.

Antes del bloque que implemente la reapertura hay que resolver las partes
abiertas de DEC-025: límite temporal, reapertura con cierres posteriores y
nueva aprobación tras modificar.

Los demás candidatos siguen sin seleccionar y sin autorizar.

## Gates candidatos

### A. Despliegue de FASE 7 a staging

Aplicar la migración `20260826232758_phase_7a_sales_foundation` y el cambio de
bootstrap/RBAC al entorno de staging. Requiere verificación positiva del
destino, checkpoint previo y posterior con su SHA-256 verificado, y
revalidación read-only de que `sales`, `sale_items`, `sale_cancellations` e
`in_transit_confirmations` siguen vacías.

No incluye crear ninguna venta real: `FIRST_STAGING_SALE` es un gate separado y
posterior. Es el único candidato que muta estado externo.

### B. Importación legacy de `Ventas` (Waves 3+)

Bloqueado por decisiones humanas todavía abiertas en
[open-decisions.md](../legacy/open-decisions.md): DEC-012 (normalización de
personas), DEC-013 (canales), DEC-016 (estado de 401 líneas de venta), DEC-017
(hora final vacía), además de agrupación y duplicados. Ninguna regla puede
inferirse desde la implementación operacional de FASE 7.

Antes de planificar este gate, el propietario debe resolver esas decisiones.

### C. Finanzas y cierres diarios

Módulos `finances` y `daily-closings`. Es el candidato más grande que no toca
estado externo. Debe respetar el invariante aprobado de que los ingresos
automáticos de ventas no se dupliquen en Finanzas, y DEC-025 sobre reapertura
de cierres. Requiere su propio gate de planificación antes de implementar.

### D. Deuda técnica menor

No es una fase; son mejoras acotadas que pueden agruparse:

- fragilidad de orden en el arnés E2E: con la inmutabilidad del ledger
  respetada, un producto de fixture con movimientos ya no se elimina, así que
  agregar una prueba de inventario después de la que muta stock provocaría una
  colisión de código en el seed. Hoy no falla; conviene endurecer el seed;
- divergencia entre el plan de FASE 7B §13, que preveía `productId` y
  `warehouseId` en los `details` de los 422, y el filtro global, que siempre
  devuelve `details` vacío para toda la API. Hay que alinear una de las dos;
- el arranque en frío del API excedió el timeout de salud de 60 s del runner
  E2E en dos intentos. Subir ese timeout es una decisión separada.

## Estado operacional que permanece inalterado

- Las 1,069 filas legacy de `Movimientos` siguen sin importar.
- Las 25 filas clasificadas históricamente como transferencias siguen sin
  importar.
- Las ventas legacy continúan diferidas y sin materializar.
- `WAVES_3_PLUS_NOT_STARTED` continúa vigente.
- Los movimientos históricos del ledger nunca se editan ni eliminan a mano.
- El snapshot de staging del 2026-08-23 es evidencia histórica, no verdad live.
  Antes de cualquier gate de migración debe revalidarse el target read-only.

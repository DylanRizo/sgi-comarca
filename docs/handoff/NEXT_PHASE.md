# Next Gate — Selección del propietario

El propietario seleccionó el **gate B: UI de ventas**, ahora identificado como
**FASE 7C**. FASE 7B está cerrada en el repositorio versionado: la capa de
aplicación y la API REST de ventas están implementadas y verificadas localmente
sobre PostgreSQL real.

Evidencia: [reporte de cierre](../reviews/phase-7b-completion-report.md),
[plan aprobado](../reviews/phase-7b-sales-application-plan.md) y
[ADR-009](../decisions/ADR-009-sales-pricing-cost.md).

## Estado actual

- **`PHASE_7A_SCHEMA_COMPLETE`**
- **`PHASE_7B_COMPLETE`**
- **`NEXT_GATE = PHASE_7C_SALES_UI`**
- **`STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`**
- **`FIRST_STAGING_SALE_NOT_AUTHORIZED`**
- **`WAVES_3_PLUS_NOT_STARTED`**

Seleccionar FASE 7C autoriza trabajo de interfaz en el repositorio versionado y
nada más. No autoriza desplegar a staging, aplicar la migración
`20260826232758_phase_7a_sales_foundation`, ni crear, confirmar o cancelar una
venta real. `FIRST_STAGING_SALE` sigue siendo un gate separado y posterior.

## FASE 7C — Alcance autorizado

FASE 7C construye la interfaz sobre la API ya implementada. No introduce
cambios de esquema, migraciones, permisos nuevos ni reglas de negocio: si una
pantalla parece necesitar una regla que la API no expone, eso es una decisión
humana pendiente, no algo que la UI pueda inventar.

| Bloque | Alcance |
|---|---|
| 7C.1 | Listado de ventas con filtros y paginación del servidor, y detalle de una venta con sus líneas y totales. |
| 7C.2 | Crear una venta con varias líneas, posiblemente desde distintos almacenes. |
| 7C.3 | Confirmar una venta en tránsito y cancelar una venta. |

## Reglas que la UI debe respetar

Estas reglas no son preferencias de presentación; se derivan de `AGENTS.md`,
de ADR-009 y de la superficie que la API realmente expone.

1. **Ocultar un botón no es autorizar.** La navegación puede esconder lo que el
   usuario no puede usar, pero cada operación la autoriza el backend contra su
   permiso (`sales.read`, `sales.create`, `sales.confirm_in_transit`,
   `sales.cancel`). La UI nunca asume el resultado de esa autorización.
2. **El costo nunca se muestra.** `sales.read` no concede permiso financiero.
   La API no emite `unitCostSnapshot`, y la UI tampoco puede reconstruir costo
   ni margen a partir de precio, subtotal o total.
3. **El cliente no manda totales.** Subtotal, envío por línea y total los
   calcula el servidor. La UI puede previsualizar, pero jamás envía dinero
   calculado ni un `saleNumber`, `origin` o `paymentStatus`.
4. **Toda mutación lleva `Idempotency-Key`.** Crear, confirmar y cancelar son
   idempotentes por actor. La UI genera una clave por intento del usuario, la
   reutiliza al reintentar el mismo envío, y previene el doble envío.
5. **Entrega y pago son estados separados.** `status` y `paymentStatus` se
   muestran siempre como dos estados independientes; ninguno implica al otro.
6. **La fecha de negocio es una fecha civil.** `businessDate` es un `YYYY-MM-DD`
   sin instante asociado y se presenta sin desplazamiento de zona. Los
   timestamps reales (`createdAt`, `departureAt`, `completedAt`) sí se muestran
   en `America/Managua`.

## Gates candidatos no seleccionados

Ninguno está autorizado. Cada uno requiere su propia decisión y, cuando toca
estado externo, su propio checkpoint operativo.

### A. Despliegue de FASE 7A/7B a staging

Aplicar la migración `20260826232758_phase_7a_sales_foundation` y el cambio de
bootstrap/RBAC al entorno de staging. Requiere verificación positiva del
destino, checkpoint previo y posterior, y revalidación read-only de que
`sales`, `sale_items`, `sale_cancellations` e `in_transit_confirmations` siguen
vacías.

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

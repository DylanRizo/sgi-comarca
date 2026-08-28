# Next Gate — FASE 7C, UI de ventas

FASE 7B está cerrada en el repositorio versionado: la capa de aplicación y la
API REST de ventas están implementadas y verificadas localmente sobre
PostgreSQL real. El propietario declaró el cierre el 2026-08-28.

Evidencia: [reporte de cierre](../reviews/phase-7b-completion-report.md),
[plan aprobado](../reviews/phase-7b-sales-application-plan.md) y
[ADR-009](../decisions/ADR-009-sales-pricing-cost.md).

## Estado actual

- **`PHASE_7A_SCHEMA_COMPLETE`**
- **`PHASE_7B_COMPLETE`**
- **`PHASE_7C_AUTHORIZED`** — UI de ventas, seleccionada por el propietario el
  2026-08-28.
- **`STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`**
- **`FIRST_STAGING_SALE_NOT_AUTHORIZED`**
- **`WAVES_3_PLUS_NOT_STARTED`**
- **`NEXT_GATE = PHASE_7C_SALES_UI`**

Cerrar FASE 7B no autorizó ninguna acción operacional. El propietario eligió
como siguiente gate la UI de ventas. Los demás candidatos siguen sin
seleccionar y sin autorizar.

## FASE 7C — alcance autorizado

Interfaz en español sobre la API ya implementada y cerrada en FASE 7B. No
requiere migraciones, cambios de esquema, permisos nuevos ni escritura en
staging.

Incluye:

- listado paginado de ventas con filtros y presentación móvil;
- detalle de una venta con sus líneas y su ciclo de vida;
- creación de venta con múltiples líneas y almacenes;
- confirmación de una venta en tránsito;
- cancelación total con confirmación explícita;
- estados de carga, vacío, error y éxito; prevención de doble envío.

Reglas que la UI debe respetar:

- botones y vistas se ocultan por permiso, pero la autorización real es del
  backend; ocultar no es autorizar;
- `sales.read` no concede permisos financieros: el costo y el margen nunca se
  muestran, porque la API tampoco los expone;
- el cliente nunca envía `saleNumber`, `paymentStatus`, costo, subtotales ni
  totales; son del servidor;
- toda mutación envía `Idempotency-Key` y previene doble envío;
- el dinero se presenta con dos decimales; la cantidad se muestra tal como la
  entrega la API, sin imponer escala.

Fuera de FASE 7C: staging, importación legacy, finanzas, cierres y cualquier
venta real.

### Secuencia y estado

1. **7C.1** — cliente HTTP, presentación, navegación, listado y detalle con
   `sales.read`. Completado en `fbabe58`.
2. **7C.2** — creación de venta con múltiples líneas. Completado en `05b6b4d`.
3. **7C.3** — confirmación y cancelación. Completado en `6c64717`.
4. **7C.4** — E2E de flujos críticos y cierre. Las pruebas están escritas pero
   **no ejecutadas**: el arnés E2E necesita el PostgreSQL de Docker Compose, no
   disponible en la sesión que las escribió. FASE 7C no puede cerrarse hasta
   ejecutarlas.

### Verificación pendiente de FASE 7C

Ejecutar `pnpm test:e2e` en una sesión con Docker y corregir lo que revele
`apps/web/e2e/sales.e2e.ts`. Cubre: venta multi-almacén con un movimiento
`SALE` por línea, detalle sin costo, confirmación que no toca inventario ni
pago, cancelación total con motivo obligatorio y reposición exacta, rechazo por
costo ausente, bloqueo por stock insuficiente antes de enviar, y `DENY` directo
sobre `sales.read` y `sales.create`.

El `reset()` del arnés se ajustó a un invariante de FASE 7A: ventas, líneas y
documentos son inmutables y no pueden borrarse, así que los productos de
fixture ya vendidos se conservan como historia y cada prueba siembra productos
con código único. La base E2E es temporal y el runner la elimina.

## Gates no seleccionados

Siguen disponibles y sin autorizar: despliegue de FASE 7A/7B a staging (con
verificación positiva del destino, checkpoints y revalidación read-only de que
las cuatro tablas de ventas siguen vacías); importación legacy de `Ventas`,
que exige resolver antes DEC-012, DEC-013, DEC-016, DEC-017, agrupación y
duplicados en [open-decisions.md](../legacy/open-decisions.md); y finanzas y
cierres diarios, sujetos al invariante de no duplicar los ingresos automáticos
de ventas.

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

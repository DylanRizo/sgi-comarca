# Next Gate — revisión y cierre de FASE 7C

FASE 7C está implementada y verificada localmente como candidata de cierre. El
propietario todavía debe revisar la evidencia y declarar el cierre; este
documento no lo declara por anticipado.

Evidencia: [reporte de cierre](../reviews/phase-7b-completion-report.md),
[plan aprobado](../reviews/phase-7b-sales-application-plan.md) y
[ADR-009](../decisions/ADR-009-sales-pricing-cost.md).

## Estado actual

- **`PHASE_7A_SCHEMA_COMPLETE`**
- **`PHASE_7B_COMPLETE`**
- **`PHASE_7C_AUTHORIZED`**
- **`PHASE_7C_COMPLETION_CANDIDATE`**
- **`STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`**
- **`FIRST_STAGING_SALE_NOT_AUTHORIZED`**
- **`WAVES_3_PLUS_NOT_STARTED`**
- **`NEXT_GATE = PHASE_7C_OWNER_REVIEW`**

La candidatura de cierre no autoriza staging, importación legacy, finanzas,
cierres ni ventas reales. El siguiente tramo de producto sólo puede elegirse
después de la revisión del propietario.

## Resultado implementado de FASE 7C

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

### Secuencia cerrada técnicamente

1. **7C.1** — cliente HTTP, presentación, navegación, listado y detalle con
   `sales.read`. Completado en `fbabe58`.
2. **7C.2** — creación de venta con múltiples líneas. Completado en `05b6b4d`.
3. **7C.3** — confirmación y cancelación. Completado en `6c64717`.
4. **7C.4** — E2E de flujos críticos escritos en `fb21e22` y ejecutados el
   2026-08-28 tras corregir los defectos revelados por PostgreSQL y Playwright.

### Evidencia real de verificación

- `pnpm test:e2e`: 24/24 en Chromium (3.5 min), incluidos los 7 flujos de
  ventas.
- `pnpm test:integration`: 21 archivos / 195 pruebas.
- `pnpm test`: 53 archivos / 175 pruebas.
- `pnpm lint`: 8/8 tareas.
- `pnpm typecheck`: 7/7 tareas.
- `pnpm build`: 7/7 tareas.
- `pnpm format:check`: pasa.

Integración y E2E usaron exclusivamente bases temporales creadas y eliminadas
por sus runners contra PostgreSQL 18.4 de Docker Compose en `localhost:5433`.
Staging nunca fue target.

La verificación corrigió tres clases de defecto sin relajar FASE 7A:

- el `reset()` dejó de intentar borrar movimientos inmutables y conserva los
  productos ya referenciados por ledger o ventas;
- los locators de ventas quedaron acotados a controles, venta y estados
  concretos para evitar falsos positivos por textos o elementos repetidos;
- los errores públicos tipados de ventas ahora atraviesan el filtro global, de
  modo que `SALE_COST_MISSING` conserva su código público HTTP 422 y la UI puede
  mostrar el mensaje específico.

La base E2E se elimina al final de cada corrida. Dos intentos previos no llegaron
a Playwright porque el arranque frío del API excedió el timeout de salud; ambos
limpiaron su base. El intento completo posterior pasó 24/24.

## Decisión requerida del propietario

Revisar el diff y la evidencia y decidir si declara `PHASE_7C_COMPLETE`. Si la
declara, debe seleccionar por separado el siguiente gate. No se infiere una
autorización operacional ni de implementación a partir del cierre.

## Gates no seleccionados

Siguen disponibles y sin autorizar: despliegue de FASE 7A/7B a staging (con
verificación positiva del destino, checkpoints y revalidación read-only de que
las cuatro tablas de ventas siguen vacías); importación legacy de `Ventas`,
que exige resolver antes DEC-012, DEC-013, DEC-016, DEC-017, agrupación y
duplicados en [open-decisions.md](../legacy/open-decisions.md); y finanzas y
cierres diarios, sujetos al invariante de no duplicar los ingresos automáticos
de ventas.

## Estado operacional que permanece inalterado

- Las 1,069 filas legacy de `Movimientos` siguen sin importar.
- Las 25 filas clasificadas históricamente como transferencias siguen sin
  importar.
- Las ventas legacy continúan diferidas y sin materializar.
- `WAVES_3_PLUS_NOT_STARTED` continúa vigente.
- Los movimientos históricos del ledger nunca se editan ni eliminan a mano.
- El snapshot de staging del 2026-08-23 es evidencia histórica, no verdad live.
  Antes de cualquier gate de migración debe revalidarse el target read-only.

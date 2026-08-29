# Next Gate — FASE 8C, UI de finanzas y cierres

FASE 7 está cerrada de punta a punta. FASE 8B (bloques 8B.1–8B.5) está cerrada
en el repositorio versionado y verificada directamente contra PostgreSQL local
el 2026-08-29. Falta FASE 8C: la UI de finanzas y cierres.

Las fuentes vigentes son [CURRENT_STATE.md](CURRENT_STATE.md),
[APPROVED_DECISIONS.md](APPROVED_DECISIONS.md),
[ADR-010](../decisions/ADR-010-finances-closings-rules.md) y el
[reporte de cierre de 8B](../reviews/phase-8b-completion-report.md).

## Estado actual

- **`PHASE_7A_SCHEMA_COMPLETE`**
- **`PHASE_7B_COMPLETE`**
- **`PHASE_7C_COMPLETE`**
- **`PHASE_8A_SCHEMA_COMPLETE`**
- **`PHASE_8B_COMPLETE`**
- **`PHASE_8C_NOT_STARTED`**
- **`STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`**
- **`FIRST_STAGING_SALE_NOT_AUTHORIZED`**
- **`WAVES_3_PLUS_NOT_STARTED`**
- **`NEXT_GATE = PHASE_8C_UI`**

Cerrar 8B no autoriza staging, importación legacy ni ninguna escritura
operacional real.

## Evidencia de cierre de 8B (2026-08-29)

Verificación ejecutada directamente contra el destino local identificado
positivamente: `sgi-comarca-postgres-1`, `postgres:18.4-alpine`, saludable,
`localhost:5433`, `sgi_comarca_dev` / `sgi_dev`.

- lint 8/8, typecheck 7/7, build 7/7, `format:check` y `db:validate` limpios;
- unitarias: 55 archivos / 194 pruebas;
- integración: 25 archivos / 244 pruebas;
- E2E: 24/24 Chromium;
- OpenAPI generado sólo en memoria (nunca montado): 36 paths totales, 6 de
  finanzas/cierres, todos privados;
- revisión de seguridad manual sin hallazgos: RBAC exacto, SQL crudo sin
  interpolación de datos de usuario, auditoría saneada, DTOs con whitelist
  estricta;
- comprobación read-only de la base local de staging: sigue en la migración
  de FASE 6A, sin tablas de FASE 8A, `sales`/`sale_items` presentes desde
  FASE 3A con 0 filas, conteos históricos sin cambios.

Detalle completo en
[phase-8b-completion-report.md](../reviews/phase-8b-completion-report.md).

## Alcance disponible hasta 8B

- lectura combinada de finanzas (asientos manuales + ingreso de ventas
  derivado, nunca duplicado) y de cierres, paginada;
- creación de asiento manual con categoría/responsable validados;
- creación de cierre diario con fórmula y tolerancia registradas, sin tocar
  ventas ni inventario;
- reapertura de cierre según DEC-025: ventana configurable, cierres
  posteriores no bloquean, sin volver a cerrar.

## FASE 8C — alcance propuesto

UI en español sobre la API ya cerrada de FASE 8B. Mismas reglas que FASE 7C:

- ocultar un control es presentación, no autorización; el backend decide;
- `finances.read`/`closings.read` no exponen nada que la API no exponga
  primero — en particular, ningún ingreso de venta se muestra como asiento
  editable ni borrable, y el detalle de cierre no permite alterar cifras
  congeladas;
- toda mutación (asiento manual, crear cierre, reabrir) envía
  `Idempotency-Key` y previene doble envío;
- reabrir un cierre debe pedir motivo explícito, igual que cancelar una venta
  en FASE 7C;
- dinero con dos decimales; nada de `float` en el cliente.

No requiere cambios de esquema, migración ni permisos nuevos. Sujeta a su
propia verificación E2E antes de declararse cerrada.

## Estado operacional inalterado

- Staging no fue objetivo de pruebas ni recibió escrituras.
- La migración de FASE 7A y el bootstrap posterior siguen sin aplicarse a
  staging.
- No se creó, confirmó ni canceló una venta real.
- Las 1,069 filas legacy de `Movimientos` y las 25 clasificadas históricamente
  como transferencias siguen sin importar.
- Las ventas legacy y Waves 3+ continúan diferidas.
- Los movimientos históricos del ledger nunca se editan ni eliminan a mano.

Cerrar cualquier bloque de FASE 8 en el repositorio no autoriza despliegue,
importación legacy ni escritura operacional. Cada acción externa requiere su
propio gate explícito.

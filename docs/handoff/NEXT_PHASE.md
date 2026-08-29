# Next Gate — continuación de FASE 8B

FASE 7 está cerrada de punta a punta en el repositorio versionado. FASE 8 sigue
en curso: 8A y los bloques 8B.1–8B.4 están implementados, mientras que 8B.5 y
8C quedaron deliberadamente fuera de la verificación del 2026-08-29.

Las fuentes vigentes son [CURRENT_STATE.md](CURRENT_STATE.md),
[APPROVED_DECISIONS.md](APPROVED_DECISIONS.md),
[ADR-010](../decisions/ADR-010-finances-closings-rules.md) y
[el plan de FASE 8](../reviews/phase-8-finances-closings-plan.md). Cuando el
plan histórico todavía presenta DEC-025 como parcial, manda la resolución
posterior aceptada en ADR-010 y reflejada por el código probado.

## Estado actual

- **`PHASE_7A_SCHEMA_COMPLETE`**
- **`PHASE_7B_COMPLETE`**
- **`PHASE_7C_COMPLETE`**
- **`PHASE_8_PLANNING_COMPLETE`**
- **`PHASE_8A_SCHEMA_COMPLETE`**
- **`PHASE_8_IN_PROGRESS`**
- **8B.1–8B.4 implementados y verificados localmente**
- **8B.5 no iniciado por este gate; continuación reservada al propietario**
- **8C no iniciado**
- **`STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`**
- **`FIRST_STAGING_SALE_NOT_AUTHORIZED`**
- **`WAVES_3_PLUS_NOT_STARTED`**
- **`NEXT_GATE = PHASE_8B.5_OWNER_CONTINUATION`**

Este handoff registra evidencia; no autoriza implementar 8B.5, iniciar 8C ni
mutar staging.

## Evidencia cerrada el 2026-08-29

El destino local fue identificado positivamente antes de las pruebas:
`sgi-comarca-postgres-1`, imagen `postgres:18.4-alpine`, saludable, publicado en
`localhost:5433`, con `sgi_comarca_dev` / `sgi_dev`. Las pruebas de integración
y E2E usaron exclusivamente bases temporales creadas y eliminadas por sus
runners.

- 8B.3, asiento manual: 12/12 pruebas enfocadas contra PostgreSQL;
- 8B.4, creación y reapertura de cierres: 9/9 pruebas enfocadas contra
  PostgreSQL;
- integración y concurrencia completa: 25 archivos, 243/243 pruebas;
- unitarias: 55 archivos, 194/194 pruebas;
- regresión E2E: 24/24 en Chromium;
- lint: 8/8 tareas; typecheck: 7/7; build: 7/7; formato: limpio.

La suite de 8B.4 cubre fecha civil sin corrimiento, fecha sin ventas, suma de
ventas `COMPLETED`, conteo separado de `IN_TRANSIT`, idempotencia por actor,
permisos, auditoría, cifras congeladas, documento previo al cambio de estado,
borde exacto de la ventana de reapertura, reapertura con un cierre posterior y
errores tipados. Ningún constraint o trigger se relajó.

## Implementación existente hasta 8B.4

- 8B.1: contratos y cálculo monetario puro;
- 8B.2: lectura paginada de finanzas y cierres, con ingreso de ventas derivado
  y sin duplicarlo en `financial_entries`;
- 8B.3: asiento manual transaccional, categoría/responsable validados,
  idempotencia y auditoría saneada;
- 8B.4: creación y reapertura transaccional de cierres conforme a DEC-019,
  DEC-022, DEC-023, DEC-024 y DEC-025.

DEC-025 está resuelta: ventana configurable con valor inicial de 30 días; un
cierre posterior no bloquea la reapertura; reabrir conserva motivo, actor,
fecha/hora, historial y auditoría; un cierre reabierto no vuelve a cerrarse.

## Próximo bloque

8B.5 es la continuación de aplicación/API reservada por el propietario. Este
gate no lo implementó ni redefinió su alcance. Antes de retomarlo se debe correr
el preflight obligatorio, inspeccionar cualquier commit nuevo y preservar la
línea base verde registrada aquí. No debe mezclarse con 8C.

FASE 8C sigue siendo la UI de finanzas y cierres en español, responsive,
accesible y protegida por los permisos existentes. Requiere su propia
autorización y pruebas E2E; no comenzó en este gate.

## Estado operacional inalterado

- Staging no fue objetivo de pruebas ni recibió escrituras. Una comprobación
  read-only confirmó que sigue en la migración de FASE 6A y con los conteos
  históricos clave sin cambios.
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

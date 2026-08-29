# FASE 8 — Plan de finanzas y cierres diarios

Estado: `PHASE_8_PLANNING_BLOCKED_ON_OWNER_DECISIONS`.

Este documento completa la planificación inicial. No autoriza implementación,
migración, cambio de esquema, bootstrap, UI ni escritura en staging.

## 1. Estado verificado

Verificado contra el código, no contra documentación previa:

- **no existe ningún modelo Prisma** de finanzas ni de cierres diarios en
  `packages/database/prisma/schema.prisma`;
- los cinco permisos **ya existen** en el manifest versionado:
  `finances.read`, `finances.manual.create`, `closings.read`,
  `closings.create`, `closings.reopen`, todos otorgados por el rol `FINANCE`;
- FASE 7 está cerrada: las ventas operacionales ya producen encabezado,
  líneas, ledger y auditoría.

Consecuencia de alcance: a diferencia de FASE 7B y 7C, **FASE 8 requiere una
migración**. `AGENTS.md` prohíbe introducir una migración en silencio, así que
el esquema es su propio bloque con su propio gate.

## 2. Decisiones de negocio que bloquean la implementación

Ninguna puede inferirse del legacy ni del código. Mientras sigan abiertas, no
se implementa la regla afectada.

### DEC-022 — ingresos automáticos de ventas en Finanzas

`REQUIRES_HUMAN_APPROVAL`. El legacy incorporaba las ventas completadas como
ingresos dinámicos y borraba las filas automáticas antiguas en una lectura.
`AGENTS.md` exige que los ingresos automáticos de ventas no se dupliquen en
Finanzas. Falta decidir si Finanzas **deriva** los ingresos de ventas al leer,
sin persistirlos, o si los **materializa** con una marca de origen.

### DEC-023 — fórmula de diferencia del cierre

`REQUIRES_HUMAN_APPROVAL`. El legacy calcula
`diferencia = efectivo real + digital real − ventas del sistema` y **no resta
los gastos**. La documentación marca esa intención como ambigua. Falta decidir
si los gastos entran en la fórmula.

### DEC-024 — tolerancia `Cuadrado`

`REQUIRES_HUMAN_APPROVAL`. El legacy considera cuadrado un
`abs(diferencia) < 0.5`. Falta decidir si esa tolerancia se conserva, se
parametriza o se elimina.

### DEC-019 — venta en tránsito al cerrar el día

`REQUIRES_HUMAN_APPROVAL`. El legacy **cancela automáticamente** las ventas en
tránsito de la fecha al guardar el cierre. Eso hoy sería una cancelación con
reposición de inventario disparada por un cierre, sin acción explícita del
operador. Falta decidir entre bloquear el cierre, reportarlas sin tocarlas, o
cancelarlas con confirmación explícita.

### DEC-025 — reapertura de cierres

`PARTIALLY_RESOLVED`. Ya aprobado: Dylan y Samantha pueden crear y reabrir;
la reapertura exige motivo, actor, fecha/hora, conservación del cierre y su
historial, `audit_log` y ausencia de borrado físico. Siguen abiertos el límite
temporal, la reapertura cuando existen cierres posteriores y la nueva
aprobación tras modificar el cierre.

## 3. Reglas ya firmes

No dependen de una decisión pendiente y se implementarán tal cual:

- movimiento manual con tipo ingreso/gasto, categoría, monto mayor que cero,
  responsable y fecha;
- un único cierre por fecha;
- ventas en tránsito y canceladas nunca cuentan como ingreso;
- el dinero es `NUMERIC`/`Decimal`, nunca `float`;
- los timestamps se guardan en UTC y se presentan en `America/Managua`;
- toda mutación registra actor, fecha, entidad y cambios en `audit_logs`;
- las filas automáticas legacy se preservan como evidencia raw;
- las categorías no se escriben directamente en componentes de UI;
- no se muestra información financiera a roles no autorizados.

## 4. Secuencia propuesta

Cada bloque requiere autorización previa y commits auditables separados.

1. **8A — fundación de esquema.** Modelos de asiento financiero y cierre
   diario, con su migración, constraints, unicidad por fecha e inmutabilidad
   del historial. Gate: revisión de esquema y migración reproducible.
2. **8B — aplicación y API.** Servicios transaccionales, lectura paginada,
   creación manual, creación y reapertura de cierre, idempotencia por actor,
   auditoría saneada y RBAC exacto con los permisos existentes.
3. **8C — UI.** Vistas en español, con las mismas reglas de FASE 7C.

No se prevé permiso nuevo. Si algún bloque lo requiriera, se detiene y se pide
un gate separado.

## 5. Condiciones de parada

Detener y pedir decisión antes de implementar si aparece un requisito no
resuelto sobre la relación entre ventas y finanzas, la fórmula o tolerancia del
cierre, el tratamiento de ventas en tránsito al cerrar, la reapertura, o
cualquier escritura en staging.

## 6. Estado al cerrar esta planificación

- `PHASE_7A_SCHEMA_COMPLETE`, `PHASE_7B_COMPLETE`, `PHASE_7C_COMPLETE`;
- `PHASE_8_PLANNING_BLOCKED_ON_OWNER_DECISIONS`;
- `STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`;
- `FIRST_STAGING_SALE_NOT_AUTHORIZED`;
- `WAVES_3_PLUS_NOT_STARTED`.

El siguiente paso es que el propietario resuelva DEC-019, DEC-022, DEC-023,
DEC-024 y las partes abiertas de DEC-025. Sólo entonces puede autorizarse 8A.

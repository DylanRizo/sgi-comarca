# Next Gate — Revisión de cierre de FASE 7B

FASE 7B está implementada y verificada localmente sobre PostgreSQL real. La
integración completa, la matriz de concurrencia del plan, la regresión E2E y la
línea base del monorepo pasan. Este estado es un candidato para revisión del
propietario; no declara la fase cerrada y no autoriza ningún despliegue o dato
operacional.

Documentos de evidencia:

- [reporte de candidato](../reviews/phase-7b-completion-report.md);
- [plan aprobado](../reviews/phase-7b-sales-application-plan.md);
- [ADR-009](../decisions/ADR-009-sales-pricing-cost.md).

## Estado actual

- **`PHASE_7A_SCHEMA_COMPLETE`**
- **`PHASE_7B_PLANNING_COMPLETE`**
- **`PHASE_7B_COMPLETION_CANDIDATE`**
- **`STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`**
- **`FIRST_STAGING_SALE_NOT_AUTHORIZED`**
- **`WAVES_3_PLUS_NOT_STARTED`**
- **`NEXT_GATE = PHASE_7B_COMPLETION_REVIEW`**

No existe todavía una declaración `PHASE_7B_COMPLETE`. Sólo el propietario
puede aprobar el cierre después de revisar el diff y la evidencia.

## Evidencia para la revisión

Revalidación local del 2026-08-28:

- `pnpm test:integration`: 21 archivos / 195 pruebas;
- concurrencia específica de ventas: 9/9;
- `pnpm test:e2e`: 17/17 Chromium y eliminación confirmada de la base temporal;
- `pnpm test`: 51 archivos / 162 pruebas;
- lint 8/8, typecheck 7/7, build 7/7;
- formato y esquema Prisma válidos;
- OpenAPI generado sólo en memoria: 30 paths, incluidos los cuatro paths de
  ventas, con Swagger sin montar;
- revisión de seguridad sin hallazgos críticos o altos.

Las pruebas usaron únicamente bases temporales sobre el PostgreSQL 18.4 del
Docker Compose local en el puerto 5433. Staging nunca fue target.

## Alcance de la revisión del propietario

La revisión debe decidir:

1. si acepta la corrección de escala monetaria en la superficie read;
2. si la matriz de concurrencia satisface el plan §14;
3. si autoriza commits separados y auditables para:
   - `fix(sales): preserve canonical money scale`;
   - `test(sales): add phase 7b concurrency coverage`;
   - documentación de cierre/candidato;
4. si, después de esos commits y una revisión final del diff, declara
   `PHASE_7B_COMPLETE`.

No se hizo commit ni push durante la verificación actual.

## Fuera de este gate

Ni el estado candidato ni una futura declaración de cierre autorizan:

- aplicar la migración o bootstrap/RBAC de FASE 7A a staging;
- crear, confirmar o cancelar una venta real en staging;
- implementar UI de ventas;
- importar `Ventas` legacy o comenzar Waves 3+;
- resolver agrupación, duplicados o interpretación histórica de estado/pago;
- implementar finanzas, pagos o cierres diarios;
- editar o eliminar movimientos históricos del ledger.

Cada acción anterior requiere su propio gate explícito. Después de cerrar 7B,
el propietario debe elegir cuál gate planificar; este documento no selecciona
ni autoriza automáticamente UI, staging o importación.

## Estado operacional que permanece inalterado

- Las 1,069 filas legacy de `Movimientos` siguen sin importar.
- Las 25 filas clasificadas históricamente como transferencias siguen sin
  importar.
- Las ventas legacy continúan diferidas y sin materializar.
- `WAVES_3_PLUS_NOT_STARTED` continúa vigente.
- El snapshot de staging registrado el 2026-08-23 sigue siendo evidencia
  histórica, no verdad live.
- Antes de cualquier gate de migración se debe revalidar el target read-only,
  incluida la condición operativa de tablas de ventas vacías.

# Next gates — consolidación, baseline verde y primer conteo controlado

Updated: 2026-09-16.

Este documento ordena los siguientes gates; no autoriza saltarse ninguno. La
línea desplegada está en `codex/staging-pilot` (`b61e711`) y permanece 32
commits por delante de `origin/main` (`37e97e4`). La consolidación se trabaja
desde `codex/consolidate-staging`.

## Gate 1 — consolidar la línea desplegada

1. revisar los 32 commits y las 11 migraciones existentes;
2. preservar los temporales locales sensibles y mantenerlos fuera de Git;
3. reconciliar `CURRENT_STATE.md`, este archivo y el roadmap;
4. comprobar que el diff contra `main` no contiene secretos, datos privados ni
   cambios legacy;
5. mantener cambios de consolidación separados de nuevas funcionalidades.

Estado: `IN_PROGRESS`. La rama de consolidación parte exactamente de
`b61e711`; los temporales ejecutables `*.tmp.mjs` y `*.tmp.mts` ya están
ignorados sin ser eliminados.

## Gate 2 — baseline reproducible

Debe pasar desde un checkout limpio, con PostgreSQL local identificado
positivamente y sin apuntar a staging:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm db:validate
pnpm test:e2e
```

No se acepta como baseline verde una corrida completa roja aunque los casos
pasen en aislamiento. Primero se debe distinguir entre defecto de producto,
aislamiento de fixtures, paralelismo del runner y normalización CRLF; luego se
corrige la causa sin debilitar aserciones.

## Gate 3 — integrar a `main`

Solo después del Gate 2:

1. publicar la rama de consolidación;
2. abrir un PR hacia `main` para activar CI;
3. revisar migraciones, RBAC, superficie pública y diff de secretos;
4. exigir CI verde y ausencia de hallazgos críticos o altos;
5. fusionar sin reescribir el historial desplegado;
6. confirmar que `main`, el commit desplegado y el handoff quedan trazables.

## Gate 4 — primer conteo físico formal en staging

Es el siguiente gate operacional seleccionado. No debe basarse en la fotografía
histórica de 144 productos y 357 saldos. La última evidencia registrada de Neon
contiene 28 productos y 20 saldos; ambos números deben revalidarse directamente
antes del gate.

Secuencia obligatoria:

1. verificar proyecto, región, rama, base, rol, PostgreSQL y migraciones;
2. reconciliar el import operativo de 28 variantes / 62 unidades mediante sus
   recibos, movimientos y auditoría, sin repetirlo;
3. comprobar que no existe otra sesión de conteo abierta o pendiente;
4. crear un checkpoint privado y verificarlo con `pg_restore --list`;
5. seleccionar una sola bodega y un alcance pequeño, registrando saldos antes;
6. crear, capturar, enviar y aprobar exactamente una sesión desde la UI;
7. verificar movimientos `ADJUSTMENT`, saldos, vínculos de líneas, auditoría e
   idempotencia; nunca editar el ledger manualmente;
8. crear y verificar el checkpoint posterior;
9. documentar evidencia sanitizada y detenerse. El gate no concede permiso
   general para conteos posteriores.

## Gates posteriores independientes

- primera venta, confirmación y eventual cancelación controladas;
- primera entrada financiera manual;
- primer cierre diario;
- primera clave de integración para Marketplace y prueba del catálogo;
- unlink/relink final de Alexa tras el cambio de rotación;
- Waves 3+ del import legacy, después de resolver DEC-006, DEC-007, DEC-018 y
  DEC-026 y construir el importador correspondiente;
- FASE 11 de hardening: observabilidad, seguridad, carga moderada,
  backup/restore, RPO/RTO y runbooks;
- rehearsal, UAT y cutover de producción.

Cada escritura real conserva su autorización, preflight y checkpoint propios.

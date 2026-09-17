# Next gates — consolidación, baseline verde y primer conteo controlado

Updated: 2026-09-17.

Este documento ordena los siguientes gates; no autoriza saltarse ninguno. El
repositorio consolidado está en `main` (`fa85292`) mediante PR #1. La línea
externamente desplegada permanece en `codex/staging-pilot` (`b61e711`); la
diferencia posterior es solo de higiene, documentación e infraestructura de
validación, sin migraciones ni cambios funcionales.

## Gate 1 — consolidar la línea desplegada

1. revisar los 32 commits y las 11 migraciones existentes;
2. preservar los temporales locales sensibles y mantenerlos fuera de Git;
3. reconciliar `CURRENT_STATE.md`, este archivo y el roadmap;
4. comprobar que el diff contra `main` no contiene secretos, datos privados ni
   cambios legacy;
5. mantener cambios de consolidación separados de nuevas funcionalidades.

Estado: `COMPLETE`. La rama parte exactamente de `b61e711`; los temporales
ejecutables `*.tmp.mjs` y `*.tmp.mts` están ignorados sin eliminar archivos del
operador. El diff fue normalizado, revisado y mantenido separado de nuevas
funcionalidades.

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

Estado: `COMPLETE` el 2026-09-17 desde el checkout aislado. Pasaron formato,
lint 9/9, typecheck 13/13, unitarias 291/291, integración PostgreSQL 349/349,
build 8/8, generación/validación Prisma y Playwright Chromium 54/54. Se
corrigieron el orden de compilación requerido por el typecheck limpio y la
invocación de pnpm del runner E2E en Windows. Staging no fue destino de prueba.

## Gate 3 — integrar a `main`

Estado: `COMPLETE` el 2026-09-17. PR #1 pasó CI remoto y fue fusionado mediante
merge commit `fa85292`, sin reescribir el historial desplegado.

Solo después del Gate 2:

1. publicar la rama de consolidación;
2. abrir un PR hacia `main` para activar CI;
3. revisar migraciones, RBAC, superficie pública y diff de secretos;
4. exigir CI verde y ausencia de hallazgos críticos o altos;
5. fusionar sin reescribir el historial desplegado;
6. confirmar que `main`, el commit desplegado y el handoff quedan trazables.

## Gate 4 — primer conteo físico formal en staging

Estado: `WAITING_FOR_PHYSICAL_OBSERVATION`. El preflight directo de solo
lectura del 2026-09-17 confirmó el target, las 11 migraciones, 119 productos,
91 saldos positivos, 267 unidades, cero saldos negativos, dos sesiones
históricas canceladas sin líneas y ninguna sesión abierta o pendiente. La
trazabilidad de las 267 unidades quedó reconciliada mediante recibos,
movimientos y auditoría. No se creó checkpoint ni sesión porque todavía no
existe una observación física fresca que pueda registrarse sin inventar un
dato de negocio.

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

# FASE 4 — Importer legacy y dry-run

## Estado

- FASE 4A: `FRAMEWORK READY` y `DRY_RUN PASSED`.
- FASE 4B, Waves 1–2: `READY`.
- FASE 4C.1: motor persistente y guardrails `IMPLEMENTED / READY FOR REVIEW`.
- FASE 4: `IN_PROGRESS`.
- **PERSISTENT IMPORT NOT AUTHORIZED.**

El dry-run continúa siendo el modo operativo autorizado. La CLI reconoce
estructuralmente `--commit`, pero solo tras verificar todos los guardrails de
FASE 4C.1. La existencia del mecanismo no autoriza usarlo contra la base
persistente.

## Arquitectura

```text
Perfil y manifest FASE 3C
          ↓
Verificación de identidad/checksums
          ↓
Import plan determinista + mapping versionado
          ↓
Persistence target: dry-run temporal o commit protegido
          ↓
Transacción Serializable + locks global/source/plan/tablas
          ↓
LegacyRecord raw + entidades Waves 1–2 + reconciliación
          ↓
Reportes privados deterministas
```

`@sgi/legacy-profiler` continúa siendo read-only y no usa Prisma. El paquete
`@sgi/legacy-importer` planifica, simula, reconcilia y contiene el motor
persistente protegido. Dry-run y commit comparten verificación, parser,
mapping, plan, identidades, reconciliación y escritura; solo cambia el target.

## Ejecución autorizada

```powershell
pnpm import:legacy -- --dry-run `
  --input legacy/private/datos-inventario.xlsx `
  --source-code legacy-inventory-xlsx `
  --profile-dir reports/private/profiling/legacy-inventory-xlsx/<SOURCE_SHA256> `
  --mapping-file packages/legacy-importer/config/legacy-inventory-xlsx.mapping.json `
  --report-dir reports/private/importing
```

Son obligatorios `--dry-run`, input, source-code, profile-dir y mapping-file.
En dry-run la CLI rechaza opciones de commit y cualquier alias de escritura. La
URL de PostgreSQL solo se recibe mediante `DATABASE_URL`; nunca por argumento ni
en la salida.

## Guard de PostgreSQL

La CLI crea una base de nombre aleatorio, instala un fingerprint con nonce
criptográfico y lo verifica positivamente antes de escribir. Aplica migraciones
y bootstrap, ejecuta una transacción `Serializable`, obtiene un advisory lock
por batch y elimina siempre la base. El dry-run valida dentro de la transacción
los conteos realmente escritos antes de marcar el batch como completado.

## Identidad e idempotencia

El `batchKey` de FASE 4B se conserva como identidad histórica de la ejecución
dry-run aprobada. `approvedPlanKey` representa fuente, manifest, mapping,
versión y plan de negocio canónico sin incorporar el modo. Por ello es idéntico
entre `DRY_RUN` y `COMMIT` si el plan no cambia. La ejecución persistente tiene
un `executionId` separado. El primer commit es create-only: cualquier source,
batch o entidad target preexistente produce aborto, sin upsert ni overwrite.

## Motor persistente protegido

Una futura invocación `--commit` deberá declarar de forma individual:

- ambiente y fingerprint esperado del target;
- SHA de fuente, manifest, mapping y cinco artefactos aprobados;
- `approvedPlanKey`, batch key histórico y versión del importer;
- `operatorUserId` ACTIVE con asignación ADMIN activa;
- backup custom-format, sus checksums y evidencia estructurada de restore;
- acuse de ventana de mantenimiento.

Además exige stdin/stdout TTY y una frase interactiva derivada del fingerprint.
No existe `--force`, no se acepta confirmación por pipe/env/argumento y
`DATABASE_URL` continúa solo por entorno.

El fingerprint positivo combina ambiente, nombre/servidor de base, migraciones
aplicadas y la identidad de los tres warehouses bootstrap; nunca contiene
passwords. Bajo la transacción se obtienen locks global, source y plan, se
bloquean las tablas relevantes y se revalidan target vacío, operador, backup y
evidencia. Cualquier diferencia TOCTOU aborta.

No existe un permiso de importación en la matriz actual. Por tratarse de una CLI
local excepcional, el guard exige temporalmente un operador ACTIVE con rol
ADMIN asignado; esto no concede permisos implícitos de aplicación ni introduce
un bypass HTTP. Crear un permiso específico requeriría otra decisión.

## Backup y recuperación

El backup debe ser PostgreSQL custom-format, tener SHA-256 esperado, superar
`pg_restore --list` y estar ligado a evidencia JSON cuyo checksum también fue
aprobado. La evidencia registra fingerprint origen/restaurado, timestamps,
migraciones, conteos sanitizados y resultado `PASS` de una restauración en base
descartable. Backup y evidencia permanecen bajo `backups/` e ignorados.

La recuperación posterior al commit es exclusivamente restauración completa del
backup verificado durante una ventana de mantenimiento. No existe comando para
borrar o compensar selectivamente una importación.

## Transacción persistente

Una sola transacción `Serializable` crea raw primero y luego exactamente 14
Unit, 144 Product, 357 balances y 357 valoraciones, 189 issues, un AuditLog y
finaliza el ImportBatch `RUNNING → COMMITTED`. Los raw se enlazan después de
crear las entidades target, dentro de la misma transacción. Fallos inyectados en
Unit 10, Product 80, Balance 200, Valuation 300, issues, AuditLog y finalización
del batch prueban rollback completo.

La transacción persistente tiene un timeout local y acotado de 10 segundos. No
cambia la configuración global de Prisma: se fijó después de mover preparación
determinista y validaciones estructurales fuera de la transacción, con un margen
de dos veces el máximo observado bajo carga global antes de fijarlo y sin
permitir locks indefinidos.

## Preservación raw

Las 2,064 filas se conservan como `LegacyRecord`, con hoja, fila física,
celdas, tipo/formato/fórmula/cache disponible, raw hash y estado de mapping.
Ninguna fila se elimina por parsing, duplicación, orphan o decisión pendiente.

## Mapping aprobado para Waves 1–2

El registro canónico es
`packages/legacy-importer/config/legacy-inventory-xlsx.mapping.json`; su default
permanece `UNRESOLVED`.

- Unit: catálogo explícito de 14 valores; alias versionado `Unidad → Unidades`.
- Product: 144 productos lógicos. DGGR-X fila 29 es canónica; la fila 30 queda
  enlazada únicamente como evidencia raw, sin merge de campos.
- Warehouse: solo `Casa Dylan`, `Casa Luden` y `Casa Jean` se resuelven a los
  tres códigos existentes. Las rutas de Movimientos no crean warehouses.
- InventoryBalance: 357 claves producto+warehouse; el snapshot más reciente
  manda para CCWH-L y las cantidades nunca se suman.
- ProductWarehouseValuation: costo y precio se preservan por warehouse. Un
  costo cero permanece cero y genera revisión.
- Inventario filas 153 y 154: crean balance, conservan raw y generan
  `VALUATION_OBSERVED_AT_MISSING`; no crean valoración ni reciben fecha
  artificial. `observedAt` continúa obligatorio en Prisma.
- Inventario es la fuente del saldo inicial. Cada diferencia con Movimientos
  genera issue; una clave exclusiva de Movimientos no crea balance sintético.
- Movimientos, Ventas, Finanzas, CierresDiarios, Entrada de Productos y Grupos
  permanecen raw-only en estas waves. No se crean movimientos, ventas ni items.

## Reconciliación del dry-run aprobado

```text
TOTAL_SOURCE_ROWS = 2064
RAW_PRESERVED_ROWS = 2064
DROPPED_ROWS = 0
UNITS_SIMULATED = 14
PRODUCTS_SIMULATED = 144
INVENTORY_BALANCES_SIMULATED = 357
VALUATIONS_SIMULATED = 357
VALUATION_OBSERVED_AT_MISSING = 2
```

Los 24 hallazgos `blocksPhase4` de FASE 3C conservan `findingId`, `ruleCode` y
ubicación. Las reglas resueltas quedan trazadas como `RESOLVED`; las decisiones
de módulos futuros quedan `OPEN` con disposición explícita. El dry-run de
Waves 1–2 produce además issues por diferencias Inventario/Movimientos, claves
sin contraparte, costo cero y las dos fechas ausentes.

## Reportes privados

```text
reports/private/importing/<source>/<sha>/<batch-key>/
  import-plan.json
  dry-run-summary.json
  reconciliation.json
  row-results.json
  commit-preview.md
```

Los reportes no se versionan. `dry-run-summary.json` incluye conteos por entidad
y por código de reconciliación. `commit-preview.md` describe una simulación; no
autoriza una importación.

Una futura ejecución commit produce, bajo un directorio privado por execution,
`commit-run.json`, `commit-summary.json`, `reconciliation.json`,
`row-results.json` y `audit-receipt.json`. Un aborto previo genera solamente un
reporte de fallo sanitizado. Ningún reporte contiene rawData ni valores de
celda.

## Privacidad

La documentación versionada contiene únicamente conteos, hashes, códigos,
severidades y filas físicas aprobadas. XLSX, `rawData`, reportes privados, PII y
valores financieros permanecen ignorados.

## Alcance diferido

- Movimientos operacionales y rutas: FASE 6.
- Agrupación, duplicados, orphans, referencias y usuarios de Ventas: FASE 7.
- Cierres y aspectos pendientes de DEC-025: FASE 8.
- Ejecución persistente: el mecanismo existe, pero requiere backup/restore real,
  operador ACTIVE, fingerprint aprobado, ventana y autorización humana separada.

# FASE 4 — Importer legacy y dry-run

## Estado

- FASE 4A: `FRAMEWORK READY` y `DRY_RUN PASSED`.
- FASE 4B, Waves 1–2: `READY`.
- FASE 4: `IN_PROGRESS`.
- **PERSISTENT IMPORT NOT AUTHORIZED.**

La única ejecución habilitada continúa siendo un dry-run sobre PostgreSQL
temporal. No existe `--commit` ni una ruta de escritura persistente.

## Arquitectura

```text
Perfil y manifest FASE 3C
          ↓
Verificación de identidad/checksums
          ↓
Import plan determinista + mapping versionado
          ↓
PostgreSQL temporal verificado
          ↓
Transacción Serializable + advisory lock
          ↓
LegacyRecord raw + entidades Waves 1–2 + reconciliación
          ↓
Reportes privados deterministas
```

`@sgi/legacy-profiler` continúa siendo read-only y no usa Prisma. El paquete
`@sgi/legacy-importer` planifica, simula y reconcilia en una base descartable.

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
La CLI rechaza opciones de commit, write, apply, production e import. La URL de
PostgreSQL solo se recibe mediante `DATABASE_URL`; nunca por argumento ni en la
salida.

## Guard de PostgreSQL

La CLI crea una base de nombre aleatorio, instala un fingerprint con nonce
criptográfico y lo verifica positivamente antes de escribir. Aplica migraciones
y bootstrap, ejecuta una transacción `Serializable`, obtiene un advisory lock
por batch y elimina siempre la base. El dry-run valida dentro de la transacción
los conteos realmente escritos antes de marcar el batch como completado.

## Identidad e idempotencia

`batchKey` incorpora source code, SHA del workbook, SHA del manifest, SHA del
mapping, versión del importer y modo. Los UUID de fuente, batch, filas y
entidades simuladas se derivan de evidencia canónica. Repetir la misma
identidad devuelve el mismo batch sin duplicar ni sobrescribir filas.

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

## Privacidad

La documentación versionada contiene únicamente conteos, hashes, códigos,
severidades y filas físicas aprobadas. XLSX, `rawData`, reportes privados, PII y
valores financieros permanecen ignorados.

## Alcance diferido

- Movimientos operacionales y rutas: FASE 6.
- Agrupación, duplicados, orphans, referencias y usuarios de Ventas: FASE 7.
- Cierres y aspectos pendientes de DEC-025: FASE 8.
- Importación persistente: requiere aprobación separada, backup, identidad de
  operador, estrategia de rollback y una señal inequívoca todavía inexistente.

# FASE 4A — Importer framework, raw preservation y dry-run

## Estado

`FRAMEWORK READY` y `DRY_RUN PASSED`.

**PERSISTENT IMPORT NOT AUTHORIZED.** FASE 4 permanece `IN_PROGRESS`.

## Arquitectura

```text
Perfil y manifest FASE 3C
          ↓
Verificación de identidad/checksums
          ↓
Import plan determinista
          ↓
Parsers + mapping registry versionado
          ↓
PostgreSQL temporal + transacción Serializable
          ↓
Raw preservation + reconciliation
          ↓
Reportes privados deterministas
```

El núcleo de planificación no depende de filesystem ni PostgreSQL. Los
adaptadores de entrada, persistencia y reportes se mantienen separados.

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
La CLI rechaza `--commit`, `--write`, `--apply`, `--production`, `--import` y
variantes equivalentes. No acepta una URL de base como argumento.

La sesión del operador debe proporcionar `DATABASE_URL` por entorno para que
la CLI pueda administrar la base descartable. No existe fallback embebido; la
URL nunca se acepta como argumento ni se imprime. El gestor cambia el destino
a una base nueva antes de ejecutar cualquier escritura del dry-run.

## Guard de PostgreSQL

La CLI crea una base con identidad aleatoria, instala un comentario-fingerprint
con nonce criptográfico y lo vuelve a consultar antes de escribir. El nombre o
la desigualdad respecto de una URL conocida no bastan. Si la identidad y el
marcador no coinciden, la operación termina con `TEMP_DATABASE_GUARD_REJECTED`.

Después se aplican las migraciones aprobadas y el bootstrap. La base se elimina
incluso cuando el plan falla.

## Identidad e idempotencia

`batchKey` incorpora source code, SHA del workbook, SHA del manifest, SHA del
mapping, versión del importador y modo. Los UUID de batch y fila se derivan de
evidencia canónica. Repetir el mismo input no crea registros duplicados. Un
workbook o mapping cambiado produce otra identidad y requiere un dry-run nuevo.

## Preservación raw

Cada fila se representa como `LegacyRecord` con hoja, fila física, celdas y
tipos físicos, formato/fórmula/cache disponibles, raw hash y estado de mapping.
No se incorporan paths, hostname, username ni timestamps a la identidad.

`legacy_sources.code` usa la forma uppercase requerida por el constraint de la
base. El source code lógico minúsculo permanece en metadata, evidencia e
identidades deterministas.

## Mapping y decisiones

El registro aprobado está en
`packages/legacy-importer/config/legacy-inventory-xlsx.mapping.json`. Su default
es `UNRESOLVED` y no habilita escrituras de negocio. En particular:

- Unit: DEC-011 abierta; las 14 filas generan candidatos/issues.
- Productos: DGGR-X sigue requiriendo aprobación.
- Inventario: CCWH-L, DEC-009 y DEC-015 siguen abiertos.
- Ventas: agrupación y cuatro pares duplicados siguen abiertos.
- Movimientos, Finanzas, CierresDiarios, Grupos, cancelaciones y tránsito:
  raw-only.

## Reconciliación

Los 24 hallazgos `blocksPhase4` se copian con su identidad, regla, ubicación y
estado humano. El dry-run real añadió 14 issues `UNIT_MAPPING_UNRESOLVED` y dos
issues agregados `WAREHOUSE_MAPPING_UNRESOLVED`, sin exponer ubicaciones.

Invariantes obligatorias:

```text
TOTAL_SOURCE_ROWS = 2064
RAW_PRESERVED_ROWS = 2064
DROPPED_ROWS = 0
BUSINESS_ENTITY_WRITES = 0
```

## Reportes privados

```text
reports/private/importing/<source>/<sha>/<batch-key>/
  import-plan.json
  dry-run-summary.json
  reconciliation.json
  row-results.json
  commit-preview.md
```

Los reportes no se versionan. `commit-preview.md` describe exclusivamente una
posible ejecución futura; no es autorización.

## Privacidad

La salida versionada contiene solo conteos, hashes de artefacto, códigos y
severidades. No copie `rawData`, row-results, XLSX, PII ni valores financieros a
`docs/`.

## Transición futura

Una ruta persistente requiere aprobación separada, decisiones de mapping
cerradas, estrategia de backup/rollback operacional y una señal inequívoca. No
se debe añadir `--commit` como parte de mantenimiento ordinario de FASE 4A.

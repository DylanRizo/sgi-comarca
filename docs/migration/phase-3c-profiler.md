# FASE 3C — Perfilador reproducible del XLSX legacy

## Alcance

FASE 3C inspecciona el workbook legacy en modo de solo lectura y produce
evidencia privada para diseñar FASE 4. No importa, corrige ni transforma datos;
no usa Prisma, `DATABASE_URL` ni PostgreSQL.

La fuente aprobada es `legacy-inventory-xlsx`. Su archivo permanece en
`legacy/private/` y su identidad combina el código lógico, el SHA-256 completo
del workbook y `profileSchemaVersion = 1`.

## Arquitectura

```text
CLI read-only
  -> SheetJS CE reader
  -> neutral workbook model
     -> structural and column profilers
     -> quality rules
     -> candidate relation detector
     -> target model comparator
  -> canonical evidence
     -> private JSON
     -> sanitized private Markdown
```

El núcleo recibe estructuras en memoria. Solo la CLI, el lector y el escritor
de reportes acceden al filesystem. No existe acoplamiento con Nest, Next,
Prisma o una base de datos.

SheetJS Community Edition 0.20.3 se obtiene exclusivamente del tarball oficial
fijado en el lockfile. El inspector OOXML complementario se limita a
`dimension`, fórmulas compartidas, valores cacheados, tablas y relaciones que
la API pública no presenta con suficiente detalle. Rechaza DTD, ENTITY,
traversal, cifrado y archivos o ratios que excedan los límites configurados; no
evalúa fórmulas, macros ni enlaces externos.

## Ejecución

Desde la raíz:

```powershell
pnpm profile:legacy -- `
  --input legacy/private/datos-inventario.xlsx `
  --source-code legacy-inventory-xlsx `
  --output reports/private/profiling
```

`--input` y `--source-code` son obligatorios. `--output` usa
`reports/private/profiling` por defecto. Las opciones de importación, commit o
escritura en base de datos son rechazadas.

| Código | Significado |
|---:|---|
| 0 | Perfil completo sin `blocksProfiling` |
| 2 | Argumentos inválidos o entrada inexistente |
| 3 | XLSX corrupto, inseguro o no soportado |
| 4 | Evidencia generada con hallazgos que bloquean el profiling |
| 5 | Fallo controlado al escribir reportes |
| 6 | Incumplimiento de hash, manifest o determinismo |

La salida de consola solo contiene código de fuente, SHA del workbook y
conteos. Nunca imprime valores de celdas.

## Modelo y métricas

El modelo neutral conserva valor y tipo físicos, formato, fórmula, resultado
cacheado, coordenada y metadata estructural. Las formas normalizadas son
observaciones: no sustituyen ni alteran la representación original.

El perfil separa `physicalRange` de `logicalDataRange`; una celda incluida en
`!ref` por formato residual no se cuenta automáticamente como dato. Por hoja
registra visibilidad, encabezado, bandas contiguas, merges, filtros, tablas,
columnas vacías y métricas independientes de celdas con fórmula, definiciones
de fórmula y resultados cacheados.

Cada columna incluye completitud, cardinalidad, tipos físicos y aparentes,
longitudes, rangos numéricos y de fecha, escala decimal, errores, whitespace,
casing, NFC, Unicode sospechoso, números como texto y señales de identificador.
No incluye listas completas de valores.

## Calidad y decisiones

Los hallazgos usan `INFO`, `WARNING`, `ERROR` o `BLOCKER` y distinguen:

- `blocksProfiling`: la evidencia técnica no puede considerarse completa;
- `blocksPhase4`: la importación no debe resolver ni consumir ese caso sin una
  decisión o tratamiento explícito;
- `requiresHumanDecision`: registra `REQUIRES_HUMAN_DECISION`.

Las reglas cubren duplicados exactos y por clave candidata, identificadores
vacíos/duplicados, fechas inválidas o ambiguas, mezcla de tipos, whitespace,
Unicode, errores Excel, referencias rotas observables, fórmulas sin cache,
rangos inflados, encabezados y filas inconsistentes, patrones inesperados y
los controles legacy DGGR-X, CCWH-L, ventas/movimientos huérfanos y diferencias
Inventario/Movimientos.

DEC-004 a DEC-009, los aspectos pendientes de DEC-015 y DEC-025, las
agrupaciones dudosas de ventas y los mappings de cancelación o confirmación de
tránsito no se resuelven aquí. Pueden bloquear FASE 4 sin bloquear el profiling
técnico.

## Relaciones y mappings

Las coincidencias entre hojas se publican únicamente como
`CANDIDATE_RELATION`, con cardinalidad candidata, cobertura, huérfanos y
confianza. Nunca se declaran foreign keys automáticamente. Se observan códigos
de producto, catálogos de unidades/grupos, agrupación de líneas de venta y la
ubicación legacy como candidata conceptual a `Warehouse`. Los textos de
personas no se convierten en referencias a `User`.

Los mappings al modelo objetivo se clasifican como `CONFIRMED`, `CANDIDATE`,
`UNRESOLVED` o `NOT_APPLICABLE`; expresan intención para FASE 4 y no crean
registros.

## Evidencia y privacidad

La ruta privada es:

```text
reports/private/profiling/<source-code>/<source-sha256>/
  run.json
  manifest.json
  workbook-profile.json
  findings.json
  candidate-relations.json
  target-mappings.json
  summary.md
```

`run.json` contiene timestamps, duración y versión de Node. Los otros
artefactos son deterministas; `manifest.json` registra sus SHA-256 y excluye
`run.json`. El JSON canónico ordena claves y conjuntos semánticos, usa UTF-8,
LF y newline final, y rechaza `undefined` y números no finitos.

`reports/private/`, el XLSX y cualquier dato real permanecen ignorados. Los
reportes no usan muestras por defecto ni hashes de valores de baja entropía.
El resumen versionado de la fase contiene solo hashes de fuente, conteos,
severidades, códigos y métricas sanitizadas.

## Relación con FASE 4

FASE 4 verificará el manifest antes de consumir evidencia. Solo entonces podrá
crear `LegacySource`, `ImportBatch`, `LegacyRecord` o
`ReconciliationIssue`. FASE 3C realiza cero escrituras en PostgreSQL y no
cambia el esquema Prisma.

# Informe de cierre — FASE 3C

## Estado

**FASE 3C — COMPLETE**

- `blocksProfiling`: 0.
- Escrituras o conexiones del profiler a PostgreSQL: 0.
- Cambios de Prisma o migraciones: 0.
- FASE 4: `NEXT`, no iniciada.

Los hallazgos que requieren decisión de negocio se conservaron como evidencia
para FASE 4. No impiden cerrar el perfilado técnico.

## Alcance entregado

`@sgi/legacy-profiler` implementa una CLI read-only, lector SheetJS CE 0.20.3,
inspector OOXML limitado, modelo neutral, perfiles estructurales y de columna,
reglas de calidad, relaciones candidatas, mappings observacionales y reportes
privados canónicos. La arquitectura y operación se documentan en
[`phase-3c-profiler.md`](../migration/phase-3c-profiler.md).

No se importaron registros, no se transformó el workbook y no se crearon
`LegacySource`, `ImportBatch`, `LegacyRecord` o `ReconciliationIssue`.

## Identidad y reproducibilidad

| Control | Resultado |
|---|---|
| Source code | `legacy-inventory-xlsx` |
| Profile schema | 1 |
| SHA-256 del workbook antes | `d0bb929d9498db888295d2c556a51e1a90f3d5834e9c4d544d9b1bb65d46e550` |
| SHA-256 del workbook después | `d0bb929d9498db888295d2c556a51e1a90f3d5834e9c4d544d9b1bb65d46e550` |
| Ejecuciones reales comparadas | 2 |
| Evidencia determinista byte-idéntica | Sí |
| Checksums del manifest | Válidos |

Checksums de la evidencia final:

| Artefacto | SHA-256 |
|---|---|
| `workbook-profile.json` | `698c45a28b12f01204e0a10d293e867973608dd33d7d92813d06e63484cbaac4` |
| `findings.json` | `23d1a8a2888188c722b81b072dac8f5fd8280a727b9b3b9a88be461d0ccca558` |
| `candidate-relations.json` | `963041612dd2ff91850f8df78f08e543eb56c69b51934cba290178d3170a15c3` |
| `target-mappings.json` | `a96dd18b11a2025e11e6c2e33b59014c189895b34a9080098216918d57888643` |
| `summary.md` | `8fa8dd0b4bcc73e1f478fd32a84efe61149dcac007e21d1b339887d151e2c9f6` |
| `manifest.json` | `a1230c205202a788089ad7a52ad4c1630a8b698b9832a895e7071e4647501cb3` |

`run.json` se excluye deliberadamente de la evidencia determinista porque
contiene timestamps y duración.

## Inventario sanitizado de hojas

| Hoja | Filas de datos | Columnas | Rango lógico | Fórmulas físicas | Caches | Definiciones compartidas |
|---|---:|---:|---|---:|---:|---:|
| Productos | 145 | 7 | `A1:G146` | 0 | 0 | 0 |
| Finanzas | 6 | 7 | `A1:G7` | 0 | 0 | 0 |
| CierresDiarios | 4 | 12 | `A1:L5` | 0 | 0 | 0 |
| Movimientos | 1,069 | 9 | `A1:I1070` | 0 | 0 | 0 |
| Entrada de Productos | 52 | 7 | `A14:G66` | 0 | 0 | 0 |
| Inventario | 359 | 8 | `A1:H360` | 359 | 359 | 1 |
| Ventas | 404 | 17 | `A1:Q405` | 0 | 0 | 0 |
| Unidades | 14 | 1 | `A1:A15` | 0 | 0 | 0 |
| Grupos | 11 | 1 | `A1:A12` | 0 | 0 | 0 |

Los rangos físicos inflados se conservaron como metadata y no aumentaron los
conteos lógicos.

## Calidad

El perfil produjo 39 hallazgos sanitizados:

| Severidad | Cantidad |
|---|---:|
| INFO | 12 |
| WARNING | 22 |
| ERROR | 5 |
| BLOCKER | 0 |

- 24 hallazgos pueden bloquear o condicionar FASE 4.
- 15 hallazgos requieren decisión humana.
- 0 hallazgos bloquean el profiling.

Controles legacy reproducidos sin publicar valores:

- DGGR-X: un grupo duplicado, dos filas afectadas.
- CCWH-L: dos grupos producto–ubicación duplicados, cuatro filas afectadas.
- Ventas duplicadas exactas: cuatro grupos.
- Ventas sin movimiento relacionado: 7.
- Movimientos de venta sin registro correspondiente: 8.
- Inventario frente al último saldo comparable: 157 diferencias, dos claves
  solo en Inventario y dos solo en Movimientos.

También se cuantificaron rangos inflados, dimensiones OOXML ausentes, mezcla de
tipos, variantes de casing y whitespace. Las reglas para fechas, errores Excel,
Unicode, headers, caches y patrones inesperados permanecen activas aunque una
regla produzca cero hallazgos en esta fuente.

## Relaciones candidatas

Se generaron siete observaciones `CANDIDATE_RELATION`:

| Origen | Destino | Intersección | Huérfanos origen | Confianza |
|---|---|---:|---:|---|
| Inventario.código | Movimientos.código | 143 | 0 | HIGH |
| Inventario.ubicación | `Warehouse` conceptual | no aplica | no aplica | MEDIUM |
| Movimientos.código | Entrada de Productos.código | 52 | 92 | LOW |
| Productos.código | Inventario.código | 143 | 1 | HIGH |
| Productos.grupo | Grupos.grupo | 3 | 0 | HIGH |
| Productos.unidad | Unidades.unidad | 2 | 1 | LOW |
| Ventas.ID Venta | agrupación de líneas | 288 | 0 | HIGH |

Ninguna observación se declara foreign key. Los textos legacy de personas no
se mapearon a `User`.

## Mappings al modelo objetivo

| Estado | Cantidad |
|---|---:|
| CONFIRMED | 7 |
| CANDIDATE | 5 |
| UNRESOLVED | 2 |
| NOT_APPLICABLE | 1 |

`SaleCancellation` e `InTransitConfirmation` permanecen `UNRESOLVED`.
`Warehouse`, `Unit`, `InventoryMovement`, `Sale` y `SaleItem` son candidatos.
Los modelos de procedencia de FASE 4 quedan confirmados como intención, sin
registros creados.

## Decisiones humanas pendientes

La evidencia registra `REQUIRES_HUMAN_DECISION` para:

- DEC-004 a DEC-009;
- aspectos pendientes de DEC-015 y DEC-025;
- agrupaciones dudosas de ventas;
- mapping de cancelaciones;
- mapping de confirmaciones de tránsito;
- reconciliaciones y catálogos que FASE 4 debe resolver explícitamente.

No se aplicó ninguna corrección automática.

## Privacidad y supply chain

- No existen muestras de valores en outputs ni en este informe.
- No se usan hashes de valores individuales como anonimización.
- El XLSX real, los reportes privados y los tarballs permanecen fuera de Git.
- SheetJS CE 0.20.3 conserva el tarball e integridad aprobados y no añade
  dependencias transitivas.
- El audit final del 8 de agosto de 2026 reporta 5 altas y 2 moderadas. La alta
  adicional frente al baseline observado durante el Gate 1 corresponde a
  `nanoid` por rutas preexistentes de Vitest/Vite; no cambia el lockfile ni es
  transitiva de SheetJS. SheetJS introduce cero advisories nuevos. Esta deuda
  del toolchain queda fuera del alcance de FASE 3C y no se ocultó mediante
  `audit fix`, overrides o resolutions.

## Evidencia de pruebas

| Suite | Resultado |
|---|---|
| Pruebas del profiler | 11 unitarias + 4 integración |
| Unitarias globales | 58/58 |
| Integración PostgreSQL global | 89/89 |
| E2E Chromium | 11/11 |
| SheetJS Gate smoke | PASS en Node 24.13.0 |
| Build monorepo | PASS |

Los fixtures XLSX sintéticos se generan temporalmente y se eliminan. No hay
binarios `.xlsx` versionados.

## Cierre

El profiler cubre todas las hojas y columnas, preserva privacidad, verifica
determinismo y manifest, no modifica la fuente y no tiene `BLOCKER` técnico.

**FASE 3C — COMPLETE**

**FASE 4 — NEXT, no iniciada.**

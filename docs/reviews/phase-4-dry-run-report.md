# Informe sanitizado — FASE 4A dry-run

## Declaración

- **FRAMEWORK READY**
- **DRY_RUN PASSED**
- **PERSISTENT IMPORT NOT AUTHORIZED**

FASE 4 permanece `IN_PROGRESS`. Este informe no declara importación real ni
autoriza `--commit`.

## Fuente y evidencia

- Source code: `legacy-inventory-xlsx`
- SHA-256 del workbook:
  `d0bb929d9498db888295d2c556a51e1a90f3d5834e9c4d544d9b1bb65d46e550`
- Profile schema: 1
- Batch key:
  `9ff60b221506e08f75a2ed7d2e75a4f38577cd75491d2497c457c4e042635ab4`
- Manifest y checksums FASE 3C: verificados antes de abrir PostgreSQL.

## Resultado

| Control | Resultado |
|---|---:|
| Hojas | 9 |
| Filas fuente | 2,064 |
| LegacyRecord preservados | 2,064 |
| Filas descartadas | 0 |
| Hallazgos FASE 3C trazados | 24/24 |
| Issues adicionales Unit unresolved | 14 |
| Issues adicionales Warehouse unresolved | 2 |
| Issues totales | 40 |
| ERROR | 5 |
| WARNING | 35 |
| Requieren decisión humana | 31 |
| Escrituras de negocio | 0 |
| Escrituras persistentes | 0 |

Dos ejecuciones consecutivas produjeron evidencia determinista byte-idéntica.

## Checksums de reportes privados

| Artefacto | SHA-256 |
|---|---|
| `import-plan.json` | `b9887c311def8210e9889572b67f6e2f41a3218c1d47d2bc31e58c521ff3dd53` |
| `dry-run-summary.json` | `617604bc1d265ec19ecca391af6f39c030520578500a96a90149913ddfbb5101` |
| `reconciliation.json` | `3c4a5554b30b91f83a8be17493774609175d320d04c0892fb9f39c6612ed43cb` |
| `row-results.json` | `b2bf1127ba643e3ac710f996c3f1115368817382d216181326a6bacf6e536b47` |
| `commit-preview.md` | `061b6811af4944a3f7e0cd89e65f2ff97292bc3b3eddea2d286fd2dbdc836d1d` |

Los artefactos permanecen ignorados bajo `reports/private/`.

## Controles técnicos

- PostgreSQL temporal con fingerprint positivo.
- Migraciones y bootstrap aplicados en la base descartable.
- Transacción `Serializable` y advisory lock por batch.
- Idempotencia verificada.
- Conflicto concurrente explícito verificado.
- Rollback integral ante constraint failure verificado.
- SHA del workbook idéntico antes y después.
- Prisma y migraciones sin cambios.
- Base persistente intacta.

## Decisiones abiertas

DEC-004–009, DEC-011, DEC-015, aspectos de DEC-025, DGGR-X, CCWH-L,
agrupación/duplicados de ventas, cancelaciones y tránsito históricos permanecen
abiertos. Los issues resultantes bloquean mappings concretos, no la preservación
técnica raw.

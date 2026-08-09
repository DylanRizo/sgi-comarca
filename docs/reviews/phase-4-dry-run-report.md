# Informe sanitizado — FASE 4A y FASE 4B Waves 1–2

## Declaración

- **FRAMEWORK READY**
- **DRY_RUN PASSED**
- **FASE 4B — READY**
- **FASE 4 — IN_PROGRESS**
- **PERSISTENT IMPORT NOT AUTHORIZED**

Este informe no declara una importación real, no autoriza `--commit` y no
inicia FASE 4C.

## Fuente y evidencia

- Source code: `legacy-inventory-xlsx`
- SHA-256 del workbook:
  `d0bb929d9498db888295d2c556a51e1a90f3d5834e9c4d544d9b1bb65d46e550`
- Profile schema: 1
- Mapping: `phase-4b.1`
- Batch key:
  `f3601d23e410a60b1c99cee411a95f6e8d0ca742b645bafd1bcb00868e2a2f33`
- Manifest y checksums FASE 3C: verificados antes de abrir PostgreSQL temporal.

## Resultado Waves 1–2

| Control | Resultado |
|---|---:|
| Hojas | 9 |
| Filas fuente | 2,064 |
| LegacyRecord preservados | 2,064 |
| Filas descartadas | 0 |
| Hallazgos FASE 3C trazados | 24/24 |
| Unit simuladas | 14 |
| Product lógicos simulados | 144 |
| Filas Productos raw | 145 |
| InventoryBalance simulados | 357 |
| Filas Inventario raw | 359 |
| ProductWarehouseValuation simuladas | 357 |
| `VALUATION_OBSERVED_AT_MISSING` | 2 |
| InventoryMovement creados | 0 |
| Sale / SaleItem creados | 0 / 0 |
| Issues totales | 189 |
| ERROR | 5 |
| WARNING | 179 |
| INFO | 5 |
| `RESOLVED` | 13 |
| `OPEN` | 173 |
| `REQUIRES_HUMAN_APPROVAL` | 3 |
| Escrituras simuladas de negocio | 872 |
| Escrituras persistentes | 0 |

Las filas físicas 153 y 154 de Inventario no tienen fecha fiel. Ambas crean su
balance, permanecen como `LegacyRecord`, omiten exclusivamente la valoración y
generan un issue abierto sanitizado. No se deriva ni inventa `observedAt`.

Dos ejecuciones consecutivas produjeron evidencia byte-idéntica y mantuvieron
el workbook byte-idéntico.

## Checksums de reportes privados

| Artefacto | SHA-256 |
|---|---|
| `import-plan.json` | `a54cb2d4b51b0dc3ef79a02327479a80cad367bffc8889401ff75b8ceb136282` |
| `dry-run-summary.json` | `3e900f788dac700ac9470af8a7a37ef01df9daa10984d7e2017734d26291b616` |
| `reconciliation.json` | `61ebefe71648f3f6f9d79981b5751b44067fb17a91b7fd567ee3e162ae017267` |
| `row-results.json` | `8ef65fe00e8c73b4a862daffc5e4a131f4482c044112e10ea0b4edb96400fee1` |
| `commit-preview.md` | `f6aa69cd837be229f7c6c198769072a9e51d0db4b69f1ad85a9fe83e591609fb` |

Los artefactos permanecen ignorados bajo `reports/private/`.

## Decisiones aplicadas

- DEC-004: DGGR-X se materializa una vez; la segunda fila queda raw.
- DEC-005: CCWH-L usa el snapshot más reciente para balance y conserva sus
  observaciones válidas sin sumar cantidades.
- DEC-009: Inventario es autoritativo; 157 diferencias se registran sin
  reconstruir saldos desde Movimientos.
- DEC-011: catálogo de 14 Units y alias exacto `Unidad → Unidades`.
- DEC-015 para Waves 1–2: costo/precio por warehouse; cero preservado con
  revisión; sin promedio ni valor global.
- Warehouses: tres mappings exactos; no se crean warehouses nuevos.

## Reconciliación restante

- 157 `INVENTORY_MOVEMENT_BALANCE_DIFFERENCE`.
- 2 `INVENTORY_ONLY_BALANCE_KEY`.
- 2 `MOVEMENT_ONLY_BALANCE_KEY` sin balance sintético.
- 1 `PRODUCT_WITHOUT_INVENTORY_BALANCE` permitido.
- 1 `LEGACY_ZERO_COST_REVIEW`.
- 2 `VALUATION_OBSERVED_AT_MISSING`.
- Ventas difiere a FASE 7 su agrupación, cuatro pares duplicados, siete ventas
  sin Movimiento, 28 referencias de producto y mappings de usuarios.
- Movimientos difiere a FASE 6 las rutas entre warehouses y ocho IDs sin venta.
- Cancelaciones, tránsito y cierres permanecen diferidos a sus fases aprobadas.
  Su evidencia raw y los 24 hallazgos de FASE 3C permanecen trazables.

## Controles técnicos

- PostgreSQL temporal con fingerprint positivo.
- Migraciones y bootstrap aplicados únicamente en la base descartable.
- Transacción `Serializable` y advisory lock por batch.
- Conteos de persistencia temporal comprobados dentro de la transacción.
- Idempotencia, conflicto concurrente, liberación de lock y rollback probados.
- SHA del workbook idéntico antes y después.
- Prisma, migraciones, bootstrap y base persistente sin cambios.

## Historial FASE 4A

El primer dry-run raw-first preservó 2,064/2,064 filas, produjo 40 issues y no
creó entidades de negocio. FASE 4B sustituye únicamente los estados y conteos
de mapping de Waves 1–2; no reescribe esa evidencia histórica ni habilita una
importación persistente.

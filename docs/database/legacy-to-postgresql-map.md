# Mapeo legacy a PostgreSQL

> Estado FASE 4A: este documento expresa mappings objetivo. El importer actual
> preserva todas las filas como `LegacyRecord` y solo simula entidades de negocio
> mediante reglas explícitamente aprobadas. No existe importación persistente y
> la ausencia de mapping significa `UNRESOLVED`.

## Reglas generales

- El XLSX se lee sin modificar y cada fila conserva hoja, número original, batch y raw data.
- No se crean usuarios desde nombres/emails legacy.
- Inventario define cantidad, precio y costo operativos iniciales.
- Movimientos se conserva como historial heredado; `Stock Resultante` es informativo, no balance por almacén.
- Duplicados y huérfanos se preservan en staging y requieren resolución individual versionada.
- Las fechas Excel se interpretan como hora local `America/Managua` cuando representen instantes legacy y se convierten a UTC; el raw permanece.

## Mapa por hoja

| Hoja | Filas/rango | Destino principal | Tratamiento |
|---|---:|---|---|
| Productos | 145, `A1:G146` | `products`, `units`, `product_groups` | Catálogo y evidencia; duplicado `DGGR-X` queda candidato hasta resolución |
| Inventario | 359, `A1:H360` | `inventory_balances`, snapshots/evidencia de `products` | Fuente inicial de cantidad/precio/costo; duplicados `CCWH-L` no se fusionan automáticamente |
| Movimientos | 1,069, `A1:I1070` | `stock_movements` | Historial legacy inmutable; identidad por fila; rutas de transferencia se descomponen solo con evidencia preservada |
| Ventas | 404, `A1:Q405` | `sales`, `sale_items` | Agrupar 288 IDs; separar tokens; preservar cohortes y estados desconocidos |
| Entrada de Productos | 52, `A14:G66` | `stock_receipts`/items o evidencia acumulada según mapeo | Encabezado fila 14; la hoja es acumulado por código, no documentos completos |
| Finanzas | 6, `A1:G7` | `financial_transactions` o `LEGACY_REFERENCE` | Manuales operacionales; 3 ventas automáticas solo evidencia para evitar doble conteo |
| CierresDiarios | 4, `A1:L5` | `daily_closings`, `daily_closing_details` | Expandir JSON válido, conservar JSON raw y reconciliar totales |
| Unidades | 14, `A1:A15` | `units` | `Unidad` usado en Productos no se fusiona con `Unidades` sin mapeo aprobado |
| Grupos | 11, `A1:A12` | `product_groups` | Todos los usados tienen referencia |

## Mapeo de campos

### Productos

| Legacy | Destino | Nota |
|---|---|---|
| Código | `products.code`, `legacy_id` | mayúsculas; unicidad bloqueada hasta resolver duplicado |
| Nombre | `products.name` | preservar original |
| Unidad | `units` + `products.unit_id` | singular fuera de catálogo queda pendiente |
| Grupo | `product_groups` | referencias existentes |
| Stock Mínimo | `products.minimum_stock` | Decimal |
| Precio | evidencia legacy en product/raw | precio operativo inicial viene de Inventario |
| Fecha Creación | `created_at` derivado + raw | zona Managua a UTC cuando aplique |

### Inventario

| Legacy | Destino | Nota |
|---|---|---|
| Código | `product_id` | resolver contra candidato aprobado |
| Nombre/Descripción | raw/evidencia | no sobrescribe catálogo silenciosamente |
| Cantidad | `inventory_balances.quantity` | fuente de saldo inicial |
| Costo | `products.current_cost` y evidencia de balance/fila | fuente aprobada inicial; variación por almacén documentada |
| Precio | `products.current_price` y evidencia de balance/fila | fuente aprobada inicial; variación por almacén documentada |
| Ubicación | `warehouse_id` | catálogo configurable |
| Fecha/hora | instante derivado + raw | dos vacíos permanecen nulos |

Un mismo producto tiene costos diferentes por almacén/filas en 19 códigos y precios diferentes en 9 códigos. El modelo guarda evidencia por fila; elegir un único valor global para esos casos requiere resolución individual, aunque Inventario sea la fuente operativa aprobada.

### Movimientos

| Legacy | Destino | Nota |
|---|---|---|
| Código | `product_id` | todos existen en Productos |
| Fecha/Timestamp | `occurred_at` y raw | timestamps repetidos; fila es identidad |
| Tipo/Cantidad | `type`, `quantity_delta` | VENTA se convierte negativa; AJUSTE conserva signo; ingreso positivo |
| Usuario | `legacy_actor_text`/raw | no crear cuenta |
| Observaciones | `observation`, referencia legacy | extraer sale ID sin eliminar texto |
| Stock Resultante | `legacy_resulting_stock` | no poblar balance desde este campo |
| Ubicación | `warehouse_id` o datos de ruta | transferencia legacy preserva `origen → destino` |

### Ventas

| Legacy | Destino | Nota |
|---|---|---|
| ID Venta | `sales.sale_number`, `legacy_id` | agrupa líneas; no es PK técnica |
| Fecha/horas/Timestamp | campos temporales + raw | nulos y cohortes se preservan |
| Vendedor/Entregador | texto legacy y vínculo opcional aprobado | nunca crea usuario automáticamente |
| Items Vendidos | `sale_items` | separar cada `CODIGO:CANTIDAD`; preservar texto raw |
| Monto/Envío/Total | `line_subtotal`, asignación, encabezado | agrupar sin contar envío más de una vez; duplicados pendientes |
| Lugar Extracción | `sale_items.warehouse_id` | almacén por línea |
| Lugar Entrega/Observaciones | encabezado + raw protegido | dato sensible; pago puede extraerse como inferencia separada |
| Canal | `sales_channels`/raw | valores vacíos y variantes no se normalizan automáticamente |
| Precio Unitario | snapshot nullable | 126 faltantes |
| Columna 1/estado | estado legacy raw + clasificación | 401 vacíos; no forzar completado como hecho histórico |

### Entrada, Finanzas y Cierres

| Origen | Destino | Tratamiento clave |
|---|---|---|
| Entrada.Código/Cantidad | receipt/item o evidencia acumulada | no inventar documentos individuales donde no existen |
| Entrada.Costo/Precio | snapshots/raw | 4 costos cero conservados |
| Finanzas manual | `financial_transactions` | NIO Decimal, actor textual preservado |
| Finanzas `Ventas de Sistema` | `LEGACY_REFERENCE`/raw | excluida de agregados para no duplicar ventas |
| Cierre encabezado | `daily_closings` | una fecha por cierre; fórmula/tolerancia quedan versionadas |
| Datos JSON | `daily_closing_details` | los 4 JSON se expanden y reconcilian; raw intacto |

## Anomalías y disposición

| Caso | Disposición de importación |
|---|---|
| `DGGR-X` duplicado | dos filas staging; resolución individual antes de constraint operativo |
| `CCWH-L` producto–almacén duplicado | cuatro filas staging; no primera/última/suma automática |
| 157 diferencias + 4 claves sin contraparte | saldo inicial Inventario; reporte detallado; historial preservado |
| 4 pares de venta duplicados | `duplicate_candidate`; exclusión solo tras aprobación |
| 7 ventas sin movimiento | conservar venta; no sintetizar movimiento |
| 8 IDs de movimiento sin venta | conservar movimiento; no sintetizar venta |
| 3 ingresos automáticos | evidencia, no ingreso operacional adicional |
| estados/pagos/canales faltantes | `UNKNOWN`/nullable + raw; no inferencia irreversible |

## Dos procesos de importación distintos

| Proceso | Propósito | Estado futuro |
|---|---|---|
| CSV legacy (`importarInventarioMasivo`) | Carga histórica de ocho posiciones y tres almacenes hard-coded | Documentado y probado como baseline; no se usa para migración/producción |
| XLSX nuevo | Migración trazable de las nueve hojas | Dry-run/commit, batches, transacciones, mapeos versionados, reportes e idempotencia |

## Reconciliación obligatoria

El reporte compara filas por entidad, 144 códigos únicos más candidatos, stock total 366 y 135/92/139, 1,069 movimientos por tipo, 404 líneas/288 ventas, duplicados, huérfanos, finanzas, cierres y JSON. Ninguna diferencia inexplicada permite aprobar `--commit` o producción.

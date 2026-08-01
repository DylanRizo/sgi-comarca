# Reporte de calidad y reconciliación de datos legacy

## Política

Ninguna anomalía fue corregida. Los identificadores de negocio no se copian a este documento cuando una referencia por hoja y fila es suficiente.

## Controles del runbook

| Control | Esperado | Observado | Resultado |
|---|---:|---:|---|
| Componentes Apps Script | 22 | 22 | confirmado |
| Productos, filas | 145 | 145 | confirmado |
| Códigos de producto únicos | 144 | 144 | confirmado |
| Inventario, filas | 359 | 359 | confirmado |
| Movimientos, filas | 1,069 | 1,069 | confirmado |
| Ventas, filas | 404 | 404 | confirmado |
| Ventas únicas | 288 | 288 | confirmado |
| Entrada de Productos, filas | 52 | 52 | confirmado |
| Finanzas, filas | 6 | 6 | confirmado |
| CierresDiarios, filas | 4 | 4 | confirmado |
| Unidades, filas | 14 | 14 | confirmado |
| Grupos, filas | 11 | 11 | confirmado |
| Stock total | 366 | 366 | confirmado |
| Casa Dylan | 135 | 135 | confirmado |
| Casa Jean | 92 | 92 | confirmado |
| Casa Luden | 139 | 139 | confirmado |
| INGRESO | 505 | 505 | confirmado |
| VENTA | 446 | 446 | confirmado |
| AJUSTE | 93 | 93 | confirmado |
| TRANSFERENCIA | 25 | 25 | confirmado |
| Ventas con más de una fila | 61 | 61 | confirmado |
| Líneas de venta duplicadas exactas | 4 | 4 | confirmado |
| Ventas sin movimiento relacionado | 7 | 7 | confirmado |
| IDs de movimiento sin venta | 8 | 8 | confirmado |
| Diferencias Inventario vs último saldo comparable | 157 | 157 | confirmado |

## Hallazgos críticos

### DQ-001 — Código de producto duplicado

- Hoja: Productos.
- Filas: 29 y 30.
- Código: `DGGR-X`.
- Las filas coinciden en datos de negocio y difieren en timestamp.
- Impacto: viola unicidad; búsquedas/autocompletado pueden devolver dos resultados.
- Disposición: `REQUIRES_HUMAN_APPROVAL`.

### DQ-002 — Producto + almacén duplicado

- Hoja: Inventario.
- Código: `CCWH-L`.
- Casa Dylan: filas 249 y 359.
- Casa Luden: filas 250 y 358.
- Los duplicados difieren en cantidad, costo, precio y fecha.
- El código operacional usa la primera coincidencia, por lo que puede ignorar la segunda.
- Disposición: preservar ambas filas y no consolidar sin aprobación.

### DQ-003 — Inventario y Movimientos no reconcilian

Después de agregar los duplicados de Inventario por producto + almacén:

- 357 claves de Inventario;
- 357 claves directas de Movimientos;
- 359 claves en la unión;
- 157 claves presentes en ambos tienen valores distintos;
- 2 claves aparecen en Movimientos pero no en Inventario: código `CCWL-L`, Casa Dylan y Casa Luden;
- 2 claves aparecen en Inventario pero no en Movimientos: `YJWH-L` y `YJWH-XL` en Casa Luden.

El runbook cuenta solo las 157 diferencias de valor. Las cuatro ausencias de contraparte son adicionales.

El código explica parte del problema: `calcularStock` ignora ubicación y genera `Stock Resultante` global. Si se intenta interpretar H como saldo por almacén, 396 de 687 transiciones consecutivas no cumplen la aritmética esperada.

La función que alimenta la pestaña Inventario reconstruye directamente desde Movimientos y produce:

| Fuente Movimientos | Stock derivado |
|---|---:|
| Casa Dylan | 128 |
| Casa Jean | 102 |
| Casa Luden | 129 |
| **Total** | **359** |

Esto difiere del saldo operacional de Inventario: 135, 92, 139 y total 366.

Disposición: Inventario es la fuente del saldo inicial; Movimientos se conserva como historial.

### DQ-004 — Ventas duplicadas

Cuatro pares son duplicados exactos:

| Grupo | Filas |
|---|---|
| 1 | 124–125 |
| 2 | 176 y 179 |
| 3 | 214–215 |
| 4 | 255 y 257 |

El script manual `eliminarVentasDuplicadas` usa una huella que ignora ID, por lo que podría eliminar también ventas legítimas con el mismo contenido.

Disposición: no eliminar; decisión humana por grupo.

### DQ-005 — Ventas y movimientos huérfanos

Ventas sin movimiento asociado:

- filas de Ventas 30, 31, 38, 41, 48, 56 y 75.

IDs presentes en observaciones de movimiento pero ausentes de Ventas:

- filas de Movimientos 126, 189, 190, 201, 216, 251, 277 y 278.

No se encontró movimiento VENTA sin ID parseable. Todos usan el patrón esperado.

Disposición: preservar y reportar; no sintetizar contraparte.

### DQ-006 — Esquema evolutivo de Ventas

- 82 líneas sin timestamp;
- 117 sin canal;
- 126 sin precio unitario;
- 401 sin estado;
- el encabezado Q es `Columna 1`, mientras el código espera `Estado de Pago`;
- solo las filas 402, 404 y 405 tienen `Completado` explícito;
- 159 líneas no tienen hora de finalización, pero el estado vacío se interpreta como completado.

Disposición: importar por cohortes y preservar valor/encabezado original.

### DQ-007 — Ingresos automáticos en Finanzas

Finanzas contiene tres ingresos `Ventas de Sistema`, todos vinculados a ventas existentes.

- Dos importes coinciden con la venta de una línea.
- Un importe de una venta de dos líneas coincide con la suma de ambas líneas.
- El código vigente pretende eliminarlos durante una lectura y reconstruirlos dinámicamente.

Disposición: conservar las filas originales como legacy; evitar doble contabilización.

### DQ-008 — Consulta con eliminación

`obtenerHistorialFinanzas` puede borrar filas de Finanzas cuando se consulta el historial. Una propiedad global evita repetir la limpieza, pero su estado no está en el Excel ni en el JSON.

Disposición: no reproducir como comportamiento de consulta. `REQUIRES_HUMAN_APPROVAL` sobre tratamiento final.

### DQ-009 — Cierre cancela ventas pendientes

`guardarCierreDiario` intenta cancelar todas las ventas en tránsito de la fecha antes de guardar. No verifica el resultado de cada cancelación.

Disposición: comportamiento confirmado, pero no debe trasladarse sin aprobación.

## Hallazgos altos

| ID | Hallazgo | Evidencia | Impacto |
|---|---|---|---|
| DQ-010 | Ajustes negativos incompatibles con validación actual | 68 AJUSTE negativos; `registrarMovimiento` exige cantidad > 0 | Historial válido según auditoría aparece inválido según Configuración |
| DQ-011 | No hay ID de movimiento | 1,069 filas; timestamps repetidos | Idempotencia y referencias débiles |
| DQ-012 | Precio divergente | 76 filas de Inventario difieren de Productos | Valoración/venta no tienen una única fuente histórica |
| DQ-013 | Costos variables | 19 códigos con varios costos en Inventario | Utilidad y margen ambiguos |
| DQ-014 | Precio variable por ubicación/fila | 9 códigos con varios precios en Inventario | Snapshot de precio requerido |
| DQ-015 | Costo cero | Inventario fila 119; Entrada filas 53, 62, 64 y 66 | Utilidad inflada o costo desconocido |
| DQ-016 | Fechas faltantes | Inventario filas 153 y 154 | Orden histórico incompleto |
| DQ-017 | Unidad fuera del catálogo | 93 productos usan `Unidad`; catálogo contiene `Unidades` | Foreign key no resoluble sin mapeo |
| DQ-018 | Variantes de personas | Entregadores contienen mayúsculas y errores ortográficos | Catálogo/atribución de ventas ambiguos |
| DQ-019 | Variantes de canal | `Facebook` y `Facebook Marketplace`; 117 vacíos | Analítica fragmentada |
| DQ-020 | Pagos históricos sin etiqueta | Solo 32 de 404 líneas incluyen `[Pago: ...]` | Cierre clasifica el resto como Digital |

## Perfil numérico

### Cantidades

- Inventario: 0 a 19; 144 filas en cero; sin negativos ni decimales.
- Entrada: 1 a 31; sin no positivos ni decimales.
- Movimientos: -13 a 27; negativos únicamente en AJUSTE.
- Artículos de Venta: 449 tokens; todas las cantidades positivas enteras.

Aunque el snapshot usa cantidades enteras, la UI vigente permite pasos de 0.01. La migración debe admitir decimales.

### Importes

- Productos.Precio: 60 a 740.
- Entrada.costo: 0 a 290.
- Entrada.precio: 60 a 550.
- Inventario.costo: 0 a 468.91.
- Inventario.precio: 60 a 740.
- Ventas.Monto Cobrado: 60 a 3,620.
- Ventas.Envío Cobrado: 0 a 190.
- Ventas.Total: 60 a 3,620.
- Finanzas.Monto: 350 a 7,450.

No hay valores negativos en dinero. Las 404 líneas de Venta cumplen exactamente:

```text
Monto Cobrado + Envío Cobrado = Total
```

## Integridad referencial

| Relación | Resultado |
|---|---|
| Inventario → Productos | Todos los códigos existen |
| Movimientos → Productos | Todos los códigos existen |
| Entrada → Productos | Todos los códigos existen |
| Items de Venta → Productos | 449/449 tokens válidos y existentes |
| Productos.Grupo → Grupos | Todos existen |
| Productos.Unidad → Unidades | `Unidad` no existe como valor |
| Venta → Movimiento | 7 IDs sin movimiento |
| Movimiento VENTA → Venta | 8 IDs sin venta |
| Finanzas automático → Venta | 3/3 referencias existen |

## Fórmulas y estructura

- Solo se encontró una fórmula: Inventario D2, concatenación de nombre + código.
- No se encontraron errores de fórmula.
- Productos y Entrada tienen formato residual hasta la fila 998.
- Inventario tiene formato residual hasta aproximadamente la fila 999 y columnas vacías I:K.
- La estructura lógica usa únicamente los rangos documentados.

## Reconciliación de cierres

Los cuatro valores `Datos JSON` son JSON válido. Para cada cierre:

- suma de `ventasSistema` del JSON = Total Ventas Sistema;
- suma de `efectivoReal` = Total Efectivo Real;
- suma de `digitalReal` = Total Digital Real;
- efectivo + digital − ventas = 0;
- Estado = `Cuadrado`.

No se puede validar la lógica de gastos porque los cuatro cierres registran gasto cero.

## Condiciones para declarar una importación exitosa

Una importación futura no podrá declararse reconciliada mientras:

- una fila se omita sin reporte;
- un duplicado sea consolidado sin mapeo aprobado;
- los 7/8 huérfanos no aparezcan en el reporte;
- las 157 diferencias y cuatro claves sin contraparte no estén explicadas;
- los ingresos automáticos se contabilicen dos veces;
- se pierdan las cohortes de esquema de Ventas;
- se descarte el JSON original de CierresDiarios;
- falten `legacy_row_number`, `legacy_id`, `import_batch_id` y `raw_data`.

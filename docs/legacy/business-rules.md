# Reglas de negocio observadas

## Productos y catálogos

| Regla | Evidencia | Estado |
|---|---|---|
| El código se normaliza a mayúsculas y sin espacios exteriores al crear/buscar. | `registrarProducto`, `insertarProductoConUbicacion` | `CONFIRMED` |
| Un código nuevo se crea automáticamente al registrar su primera entrada. | `insertarProductoConUbicacion` | `CONFIRMED` |
| El código debería ser único. | Validación de `registrarProducto`; datos contienen una excepción | `CONFIRMED` como intención, violada en datos |
| Nombre mínimo de dos caracteres al crear producto. | `registrarProducto` | `CONFIRMED` |
| Unidad por defecto `Unidades`, grupo `General`. | Servicios de Productos/Inventario | `CONFIRMED` |
| La importación usa unidad `Unidad`, grupo `General` y stock mínimo 5. | `importarInventarioMasivo` | `CONFIRMED`, contradictoria |
| El sistema no confirma edición ni desactivación de productos. | Ausencia de UI/RPC | `CONFIRMED` |

## Inventario y movimientos

| Regla | Evidencia | Estado |
|---|---|---|
| El saldo operacional actual está en Inventario por producto + ubicación. | Lecturas/escrituras de ventas, entradas y transferencias | `CONFIRMED` |
| La búsqueda usa la primera fila producto + ubicación. | `verificarStockEnUbicacion`, `descontarDeInventario`, `sumarAInventario` | `CONFIRMED` |
| No se permite que una operación normal produzca stock negativo. | Validaciones de descuento y venta | `CONFIRMED` |
| Las cantidades aceptan decimales en formularios actuales. | `parseFloat`, pasos `0.01` | `CONFIRMED` |
| Todo ingreso, venta, ajuste o transferencia pretende crear movimiento. | Orquestadores correspondientes | `CONFIRMED` como intención |
| El ledger calcula saldo global por producto, no por ubicación. | `calcularStock` | `CONFIRMED` |
| `Stock Resultante` no es saldo fiable por almacén. | Código + 157 diferencias de valores | `CONFIRMED` |
| Un `AJUSTE` legacy puede contener diferencia negativa. | 68 movimientos negativos y script Auditoría | `CONFIRMED` |
| La validación vigente rechaza cantidad negativa aunque `AJUSTE` legacy la usa. | `registrarMovimiento` vs datos | `AMBIGUOUS` |
| Inventario debe prevalecer como saldo inicial de migración. | `AGENTS.md` y runbook | `CONFIRMED` para la migración |

## Entradas

| Regla | Evidencia | Estado |
|---|---|---|
| Cantidad y precio deben ser mayores que cero. | Frontend y servidor | `CONFIRMED` |
| Costo puede ser cero. | `parseFloat(...) || 0` y datos | `CONFIRMED` técnicamente; significado `AMBIGUOUS` |
| Entrada acumula cantidad en una única fila histórica por código. | Busca primera coincidencia en `Entrada de Productos` | `CONFIRMED` |
| Entrada actualiza precio y costo con el valor más reciente. | `insertarProductoConUbicacion` | `CONFIRMED` |
| Entrada suma stock en el almacén y registra INGRESO. | Servicio | `CONFIRMED` |
| Las cuatro escrituras deberían representar una sola operación. | Intención del flujo | `INFERRED`; implementación no atómica |

## Transferencias

| Regla | Evidencia | Estado |
|---|---|---|
| Origen y destino deben ser distintos. | Frontend y servidor | `CONFIRMED` |
| Cantidad debe ser positiva y no superar saldo de origen. | Servicio | `CONFIRMED` |
| Se descuenta origen y se suma destino. | Servicio | `CONFIRMED` |
| Se guarda un único movimiento `TRANSFERENCIA` con ubicación `origen → destino`. | Servicio y 25 movimientos | `CONFIRMED` |
| Si falla la suma en destino, se intenta devolver al origen. | Rollback manual | `CONFIRMED` |
| La transferencia debe ser atómica. | `AGENTS.md` | `CONFIRMED` para el nuevo sistema; no cumplida por legacy |

## Ventas

| Regla | Evidencia | Estado |
|---|---|---|
| Una venta requiere al menos un artículo y vendedor. | Servidor | `CONFIRMED` |
| La UI exige además canal, método/estado de pago y lugar de entrega. | `Global_JS` | `CONFIRMED` |
| Cada artículo lleva su almacén de origen. | Carrito y servidor | `CONFIRMED` |
| Una venta puede usar varios almacenes. | Modelo `items[]` y datos | `CONFIRMED` |
| Se valida stock por almacén antes de escribir. | `registrarVentaDetallada` | `CONFIRMED` |
| La implementación actual guarda una fila por artículo. | Código y últimas filas | `CONFIRMED` |
| Las versiones antiguas pueden guardar varios artículos en una sola celda. | Datos y encabezado inicial de 14 columnas | `CONFIRMED` |
| El envío se divide por número de líneas y se redondea a centavos. | Servidor | `CONFIRMED` |
| El total de la venta nueva es la suma de los totales de línea. | Cierre e historial en tránsito | `CONFIRMED` |
| El backend confía en precio unitario y subtotal calculados en navegador. | Objeto recibido | `CONFIRMED`, riesgo |
| Una venta en tránsito descuenta inventario al registrarse. | Mismo flujo para ambos estados | `CONFIRMED` |
| Confirmar una venta en tránsito no vuelve a descontar. | Solo cambia Q | `CONFIRMED` |
| Cancelar restaura una línea y luego la marca cancelada. | Servicio | `CONFIRMED` |
| Cancelar la misma línea ya cancelada no la restaura de nuevo. | Condición `En Tránsito` | `CONFIRMED` en caso normal |
| Fallo entre restaurar y marcar puede permitir doble restauración. | Orden de operaciones | `CONFIRMED` como riesgo |
| Estados observados/codificados: vacío legacy, `Completado`, `En Tránsito`, `Cancelado`. | Código y datos | `CONFIRMED` |
| Estado vacío se interpreta como completado en varias consultas. | Fallbacks de servicios | `CONFIRMED` |

## Finanzas

| Regla | Evidencia | Estado |
|---|---|---|
| Movimiento manual: tipo Ingreso/Gasto, categoría, monto > 0, responsable y fecha. | Frontend/servidor | `CONFIRMED` |
| Categorías están hard-coded en frontend. | `actualizarCategoriasFinanzas` | `CONFIRMED` |
| Las ventas completadas se incorporan dinámicamente como ingresos. | `obtenerHistorialFinanzas` | `CONFIRMED` |
| Tránsito y canceladas no se consideran ingreso. | Servicio | `CONFIRMED` |
| Las filas automáticas antiguas de Finanzas se eliminan en una lectura única. | `obtenerHistorialFinanzas` | `CONFIRMED` |
| La migración no debe duplicar ingresos automáticos y ventas. | `AGENTS.md` | `CONFIRMED` |
| Las filas automáticas originales deben preservarse como evidencia/raw data. | Reglas de migración | `CONFIRMED` |

## Cierres diarios

| Regla | Evidencia | Estado |
|---|---|---|
| Solo puede existir un cierre por fecha. | Validación de `guardarCierreDiario` | `CONFIRMED` |
| Las líneas de una venta se agrupan por ID. | Resumen | `CONFIRMED` |
| Método Efectivo se reconoce por `[Pago: Efectivo]`; el resto se trata Digital. | Resumen | `CONFIRMED` |
| Tránsito y canceladas se excluyen. | Resumen | `CONFIRMED` |
| Guardar cierre cancela tránsito de la fecha. | `guardarCierreDiario` | `CONFIRMED`, `REQUIRES_HUMAN_APPROVAL` para preservar |
| Diferencia = efectivo real + digital real − ventas del sistema. | Servicio | `CONFIRMED` |
| Gastos no participan en la fórmula de diferencia. | Servicio | `CONFIRMED`, intención `AMBIGUOUS` |
| Diferencia absoluta < 0.5 se considera `Cuadrado`. | Servicio | `CONFIRMED`, `REQUIRES_HUMAN_APPROVAL` |
| Detalle por vendedor se serializa como JSON en una celda. | Código y cuatro filas | `CONFIRMED` |

## Importación y auditoría

| Regla | Evidencia | Estado |
|---|---|---|
| El importador consume ocho posiciones: nombre, variante, cantidad Luden, cantidad Dylan, cantidad Jean, código, costo y precio. | `importarInventarioMasivo` | `CONFIRMED` |
| El comentario del servidor nombra `;` como delimitador, pero `parsearCSV` vigente separa por `,`. No existe un contrato consistente para `;`. | Comentario de `Service_Importacion` vs implementación de `parsearCSV` | `AMBIGUOUS`; discrepancia preservada en `AT-IMP-07` |
| Solo Casa Luden, Casa Dylan y Casa Jean reciben cantidades; su orden de columnas es Luden, Dylan, Jean. | `ALMACENES` del importador | `CONFIRMED` |
| Un código inexistente crea producto con unidad `Unidad`, grupo `General` y stock mínimo 5; valores de cantidad/costo no numéricos se convierten en 0. | `importarInventarioMasivo` | `CONFIRMED`; semántica de catálogo sigue `AMBIGUOUS` |
| Precio no numérico o ≤ 0 y nombre ausente hacen que la fila se salte; errores de procesamiento por fila se acumulan y no revierten otras filas. | Validaciones y `catch` por fila | `CONFIRMED`; resultado parcial posible |
| Repetir importación vuelve a sumar cantidades y movimientos. | Código | `CONFIRMED`; no idempotente |
| Auditoría sustituye Inventario por conteo externo y crea `AJUSTE` por diferencia. | Auditoría | `CONFIRMED` |
| Auditoría solo reconoce Casa Dylan, Casa Luden y Casa Jean. | Código | `CONFIRMED` |
| No existe aprobación, preview ni reversión automática. | Ausencia en flujo | `CONFIRMED` |

## Reportes y analytics

| Regla | Evidencia | Estado |
|---|---|---|
| Reportes filtran por fecha, tipo, ubicación, producto y vendedor. | UI/servidor | `CONFIRMED` |
| ID de venta se extrae de la observación del movimiento. | `obtenerInfoVentaPorObservacion` | `CONFIRMED` |
| Existen dos implementaciones de dashboard analítico. | Dos RPC y bloques UI | `CONFIRMED` |
| KPIs históricos dependen de esquemas de Venta diferentes. | Helpers y datos | `CONFIRMED` |
| La utilidad depende de costos de Inventario, que pueden ser cero o variar por almacén. | Código/datos | `CONFIRMED`; exactitud `AMBIGUOUS` |

## Decisiones no autorizadas en FASE 0

No se decide en esta auditoría:

- moneda;
- normalización de nombres de personas, unidades, canales o almacenes;
- tratamiento de duplicados;
- reconstrucción de ventas faltantes;
- significado definitivo de `Stock Resultante`;
- conservación o eliminación de cancelación automática al cierre;
- fórmula contable del cierre;
- tolerancia monetaria;
- costo a usar cuando difiere por almacén;
- equivalencia entre `Unidad` y `Unidades`.

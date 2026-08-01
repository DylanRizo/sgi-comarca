# Flujos de usuario y procesos legacy

Los diagramas describen el orden real observado. Los nodos de “estado parcial” indican que no existe transacción.

## 1. Arquitectura actual

```mermaid
flowchart LR
    B["Navegador anónimo"] --> APP["Apps Script Web App"]
    APP --> UI["Página única<br/>9 pestañas + 3 modales"]
    UI --> RPC["google.script.run"]
    RPC --> SV["69 funciones servidor únicas"]
    SV --> SS["Spreadsheet principal"]
    SV --> EXT["Spreadsheet externo de auditoría"]
    SS --> SH["9 hojas operacionales"]
```

## 2. Entrada de productos

```mermaid
flowchart TD
    A["Usuario completa entrada"] --> V{"Campos válidos<br/>cantidad y precio > 0"}
    V -->|No| E["Mostrar error"]
    V -->|Sí| P{"Código existe en Productos"}
    P -->|No| NP["Agregar producto"]
    P -->|Sí| EN["Continuar"]
    NP --> EN
    EN --> H["Actualizar o crear fila en Entrada"]
    H --> I["Sumar o crear producto-almacén en Inventario"]
    I --> M["Agregar movimiento INGRESO"]
    M --> OK["Éxito"]
    NP -. "fallo posterior" .-> PART["Estado parcial posible"]
    H -. "fallo posterior" .-> PART
    I -. "fallo de movimiento" .-> PART
```

## 3. Ajuste de inventario

```mermaid
flowchart TD
    A["Elegir producto, tipo, cantidad,<br/>almacén, fecha y motivo"] --> C["Confirmación del navegador"]
    C --> M["Registrar movimiento primero"]
    M --> X{"Movimiento exitoso"}
    X -->|No| E["Abortar"]
    X -->|Sí, positivo| S["sumarAInventario"]
    X -->|Sí, negativo| D["descontarDeInventario"]
    S --> OK["Devuelve éxito del movimiento"]
    D --> OK
    S -. "resultado ignorado" .-> P["Movimiento puede existir sin saldo actualizado"]
    D -. "resultado ignorado" .-> P
```

## 4. Transferencia

```mermaid
flowchart TD
    A["Producto, cantidad, origen y destino"] --> V{"Origen ≠ destino<br/>cantidad > 0<br/>stock suficiente"}
    V -->|No| E["Error"]
    V -->|Sí| D["Descontar Inventario origen"]
    D --> S["Sumar Inventario destino"]
    S --> X{"Suma exitosa"}
    X -->|No| R["Intentar rollback:<br/>sumar de nuevo al origen"]
    X -->|Sí| M["Agregar un movimiento TRANSFERENCIA<br/>ubicación: origen → destino"]
    M --> W{"Movimiento exitoso"}
    W -->|Sí| OK["Éxito"]
    W -->|No| P["Transferencia física queda hecha<br/>sin movimiento"]
    R --> F["Devolver error sin verificar rollback"]
```

## 5. Venta completada

```mermaid
flowchart TD
    A["Armar carrito con item + almacén"] --> V{"Validar todos los saldos"}
    V -->|Falla uno| E["No escribir"]
    V -->|Todos válidos| L["Crear ID y filas de Ventas<br/>una por item"]
    L --> I1["Descontar item 1 de Inventario"]
    I1 --> M1["Registrar movimiento VENTA item 1"]
    M1 --> IN["Repetir para cada item"]
    IN --> OK["Responder total de venta"]
    I1 -. "falla" .-> P["Venta ya escrita;<br/>items previos pueden estar descontados"]
    M1 -. "falla" .-> W["Solo advertencia;<br/>continúa"]
```

## 6. Venta en tránsito

```mermaid
flowchart TD
    A["Seleccionar estado En Tránsito"] --> S["Ejecutar el mismo flujo de venta"]
    S --> D["Descontar Inventario inmediatamente"]
    D --> M["Registrar movimientos VENTA"]
    M --> Q["Guardar Q = En Tránsito"]
    Q --> X["Excluir de Finanzas y cierre"]
    Q --> P["Mostrar en panel pendiente"]
```

## 7. Confirmación de pago

```mermaid
flowchart TD
    A["Confirmar ID de venta"] --> B["Buscar todas las líneas"]
    B --> C{"Estado exacto En Tránsito"}
    C -->|Sí| D["Cambiar Q a Completado"]
    C -->|No| E["No encontrada o ya completada"]
    D --> F["Venta pasa a Finanzas/cierre"]
    D --> G["No se descuenta stock otra vez"]
```

## 8. Cancelación

```mermaid
flowchart TD
    A["Cancelar ID pendiente"] --> L["Recorrer líneas En Tránsito"]
    L --> P["Parsear CODIGO:CANTIDAD y almacén"]
    P --> M["Registrar INGRESO de devolución"]
    M --> I["Sumar a Inventario"]
    I --> Q["Marcar línea Cancelado"]
    Q --> N{"Quedan líneas"}
    N -->|Sí| L
    N -->|No| OK["Éxito"]
    M -. "falla no validada" .-> R["Puede continuar"]
    I -. "falla antes de Q" .-> D["Reintento puede duplicar devolución"]
```

## 9. Finanzas

```mermaid
flowchart TD
    A["Abrir Finanzas"] --> H["Leer Finanzas"]
    H --> C{"Cleanup global pendiente"}
    C -->|Sí| D["Eliminar filas Ventas de Sistema"]
    C -->|No| V["Continuar"]
    D --> V
    V --> S["Leer líneas completadas de Ventas"]
    S --> U["Unir movimientos manuales + ventas"]
    U --> K["Calcular ingresos, gastos y utilidad"]
    R["Registrar ingreso/gasto manual"] --> F["Append en Finanzas"]
    F --> H
```

## 10. Cierre diario

```mermaid
flowchart TD
    A["Seleccionar fecha"] --> R["Agrupar ventas completadas por ID"]
    R --> P["Inferir pago desde observaciones"]
    P --> G["Sumar gastos manuales"]
    G --> UI["Usuario captura efectivo/digital real"]
    UI --> C{"Ya existe cierre"}
    C -->|Sí| E["Rechazar"]
    C -->|No| T["Buscar ventas En Tránsito del día"]
    T --> X["Cancelar cada ID<br/>resultado no verificado"]
    X --> D["Diferencia = efectivo + digital - ventas"]
    D --> S["Serializar desglose por vendedor a JSON"]
    S --> W["Append en CierresDiarios"]
```

## 11. Auditoría física

```mermaid
flowchart TD
    A["Ejecutar función manual"] --> E["Abrir spreadsheet externo hard-coded"]
    E --> M["Construir mapa por código y tres almacenes"]
    M --> I["Recorrer Inventario principal"]
    I --> C{"Conteo externo numérico y distinto"}
    C -->|No| N["Sin cambio"]
    C -->|Sí| S["Sustituir cantidad por conteo"]
    S --> J["Preparar movimiento AJUSTE<br/>diferencia con signo"]
    J --> B["Escribir Inventario completo en batch"]
    B --> MV["Agregar movimientos en batch"]
```

## 12. Reportes

```mermaid
flowchart TD
    A["Elegir fechas y filtros"] --> H["obtenerHistorial"]
    H --> M["Filtrar Movimientos"]
    M --> P["Enriquecer con Productos"]
    P --> V["Resolver venta desde observación"]
    V --> T["Renderizar tabla y resumen"]
    T --> C{"Acción"}
    C -->|CSV| E["Enviar datos otra vez al servidor<br/>exportarReporteConFiltros"]
    C -->|Imprimir| I["Construir ventana HTML<br/>imprimir desde navegador"]
```

## 13. Impresión de cierre diario

```mermaid
flowchart TD
    A["Usuario carga un cierre"] --> B["Resumen y detalle por vendedor renderizados"]
    B --> C{"¿Existe tabla de detalle?"}
    C -->|No| D["Mostrar alerta: no hay datos para imprimir"]
    C -->|Sí| E["imprimirReporteCierre lee fecha, KPIs, observaciones y celdas visibles"]
    E --> F["Construir ventana HTML imprimible"]
    F --> G["Abrir diálogo de impresión del navegador"]
    G --> H["No escribe CierresDiarios ni otras hojas"]
```

La impresión toma datos del DOM ya renderizado; no vuelve a consultar el servidor y no es una operación de cierre. El contenido depende de que la vista incluya fecha, encargado, totales, diferencia, estado, observaciones y detalle por vendedor cuando exista.

## Puntos de control que debe conservar la migración

- Una venta en tránsito ya reservó/descontó inventario.
- Confirmar no descuenta nuevamente.
- Cancelar repone exactamente las líneas originalmente descontadas.
- Venta y cierre agrupan líneas por ID.
- El almacén pertenece al artículo, no solo al encabezado.
- El envío se cobra una sola vez por venta aunque se distribuya entre líneas.
- Inventario y Movimientos son fuentes con semánticas distintas.
- Las ventas antiguas no tienen todos los campos de las nuevas.
- El cierre conserva un desglose por vendedor.
- Los reportes vinculan movimientos de venta mediante IDs embebidos en observaciones.

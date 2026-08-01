# Mapa frontend–backend legacy

## Resumen

Se localizaron 38 invocaciones `google.script.run` en `Global_JS`, dirigidas a 29 funciones de servidor distintas. Todas las funciones invocadas existen en el JSON.

Las líneas citadas corresponden al contenido interno del componente `Global_JS` dentro del JSON.

## Mapa completo de RPC

| Línea | Pantalla/acción frontend | Función frontend | Función servidor | Lecturas | Escrituras directas o transitivas |
|---:|---|---|---|---|---|
| 161 | Dashboard: cargar KPIs | `loadDashboard` | `obtenerResumen` | Productos, Movimientos | — |
| 208 | Dashboard: tránsito | `cargarVentasEnTransito` | `obtenerVentasEnTransito` | Ventas | — |
| 225 | Confirmar pago | `confirmarPagoVentaUI` | `confirmarPagoVenta` | Ventas | Ventas Q |
| 242 | Cancelar tránsito | `cancelarVentaEnTransitoUI` | `cancelarVentaEnTransito` | Ventas | Ventas, Inventario, Movimientos |
| 279 | Alertas | `showStockAlerts` | `obtenerStock` | Productos, Movimientos | — |
| 320 | Entrada: listas | `loadListas` | `obtenerListas` | Unidades, Grupos | Puede crear ambas hojas |
| 338 | Entrada: almacenes | `loadUbicaciones` | `obtenerUbicaciones` | Inventario | — |
| 349 | Autocompletado general | `buscarProductoAutocompletado` | `buscarProductoPorCodigo` | Productos | — |
| 387 | Autocompletado entrada | `buscarProductoEntrada` | `buscarProductoPorCodigo` | Productos | — |
| 556 | Registrar entrada | `registrarEntrada` | `insertarProductoConUbicacion` | Productos, Entrada, Inventario | Productos, Entrada, Inventario, Movimientos |
| 587 | Autocompletado ajuste | `buscarProductoAjuste` | `buscarProductoPorCodigo` | Productos | — |
| 689 | Registrar ajuste | `registrarAjusteInventario` | `procesarAjusteInventario` | Productos, Movimientos, Inventario | Movimientos, Inventario |
| 727 | Búsqueda en caché | `buscarProducto` | `obtenerStockPorUbicacion` | Productos, Movimientos, Inventario | — |
| 888 | Detalle de ubicaciones | `verDetalleUbicaciones` | `buscarEnInventarioPorUbicacion` | Inventario | — |
| 920 | Tabla Inventario | `mostrarStock` | `obtenerStockPorUbicacion` | Productos, Movimientos, Inventario | — |
| 1,115 | Alertas de tabla | `mostrarAlertas` | `obtenerStock` | Productos, Movimientos | — |
| 1,144 | Reporte/historial | `mostrarHistorial` | `obtenerHistorial` | Movimientos, Productos, Ventas | — |
| 1,243 | Validar integridad | `validarIntegridad` | `validarIntegridad` | Productos, Movimientos, Unidades, Grupos | — |
| 1,261 | Inicializar sistema | `inicializarSistema` | `inicializarHojas` | Todas las hojas base | Puede crear, vaciar o reencabezar hojas |
| 1,275 | Exportar stock | `exportarStock` | `exportarStockCSV` | Productos, Movimientos, Inventario | — |
| 1,435 | Exportar reporte | `exportarReporte` | `exportarReporteConFiltros` | Usa datos recibidos | Archivo de exportación temporal |
| 1,440 | Preconsulta exportación | `exportarReporte` | `obtenerHistorial` | Movimientos, Productos, Ventas | — |
| 1,545 | Modal venta: almacenes | `cargarUbicacionesEnCarrito` | `obtenerUbicaciones` | Inventario | — |
| 1,563 | Modal venta: producto | `buscarProductoCarrito` | `buscarProductoPorCodigo` | Productos | — |
| 1,886 | Registrar venta | `registrarVentaDetallada` | `registrarVentaDetallada` | Ventas, Inventario, Productos, Movimientos | Ventas, Inventario, Movimientos |
| 1,996 | Modal transferencia: almacenes | `cargarUbicacionesTransferencia` | `obtenerUbicaciones` | Inventario | — |
| 2,029 | Modal transferencia: producto | `buscarProductoTransferencia` | `buscarProductoPorCodigo` | Productos | — |
| 2,145 | Registrar transferencia | `registrarTransferencia` | `procesarTransferenciaEntreUbicaciones` | Productos, Inventario | Inventario, Movimientos |
| 2,258 | Dashboard analítico vigente | `loadAnalyticsDashboard` | `obtenerDatosDashboardBackend` | Ventas, Inventario, Productos, Finanzas, Movimientos | — |
| 2,733 | Filtros de reporte | `cargarFiltrosReporte` | `obtenerFiltrosReporte` | Inventario, Productos, Ventas | — |
| 2,820 | Contrato analítico legacy no enlazado | `cargarDashboardAnalitico` | `obtenerDatosAnaliticos` | Ventas, Inventario, Productos | — |
| 2,987 | Importación CSV | `procesarImportacionCSV` | `importarInventarioMasivo` | Productos, Inventario, Movimientos | Productos, Inventario, Movimientos |
| 3,219 | Movimiento financiero | `registrarMovimientoFinancieroFront` | `registrarMovimientoFinanciero` | Finanzas | Finanzas |
| 3,246 | Feed de movimientos | `loadMovimientosRecientes` | `obtenerMovimientosRecientes` | Movimientos, Productos | — |
| 3,360 | Historial financiero | `loadFinanzasResumen` | `obtenerHistorialFinanzas` | Finanzas, Ventas | Puede borrar filas de Finanzas |
| 3,553 | Resumen de cierre | `cargarCierreDiario` | `obtenerResumenCierreDiario` | Ventas, Finanzas, CierresDiarios | — |
| 3,733 | Guardar cierre | `confirmarCierreDiario` | `guardarCierreDiario` | Ventas, CierresDiarios | Ventas, Inventario, Movimientos, CierresDiarios |
| 3,895 | Historial de cierres | `cargarHistorialCierres` | `obtenerHistorialCierres` | CierresDiarios | — |

## Mapa por pantalla

### Dashboard General

```text
loadDashboard
  └─ obtenerResumen
       ├─ Productos
       └─ Movimientos

cargarVentasEnTransito
  └─ obtenerVentasEnTransito
       └─ Ventas
```

Desde el panel de tránsito:

- confirmar pago cambia la columna Q;
- cancelar devuelve cada artículo al almacén original, registra un INGRESO y cambia la columna Q.

### Entrada de Productos

```text
registrarEntrada
  └─ insertarProductoConUbicacion
       ├─ registrarProducto ──> Productos
       ├─ actualiza Entrada de Productos
       ├─ actualiza Inventario
       └─ registrarMovimiento ──> Movimientos
```

El orden no es atómico. Un fallo tardío puede dejar las primeras hojas modificadas.

### Movimientos

La pantalla ofrece acciones diferentes:

- transferencia: `procesarTransferenciaEntreUbicaciones`;
- venta: abre el modal de venta;
- ajuste: `procesarAjusteInventario`;
- feed: `obtenerMovimientosRecientes`.

### Inventario y Buscar Producto

Conviven dos modelos de saldo:

- `obtenerStock` deriva saldos desde Movimientos;
- `obtenerStockPorUbicacion` presenta desglose por almacén;
- `buscarEnInventarioPorUbicacion` lee directamente Inventario.

Esto permite que dos pantallas presenten números distintos.

### Reportes

`obtenerHistorial` entrega movimientos enriquecidos con datos de producto y, cuando la observación contiene un ID, información de venta. La exportación ejecuta primero esa consulta y después pasa el resultado de vuelta al servidor.

### Configuración

`validarIntegridad` no revisa Inventario, Finanzas, Ventas ni Cierres. Además, considera inválidos los ajustes legacy con cantidad negativa.

`inicializarHojas` está expuesta en la UI anónima y puede limpiar una hoja cuando el encabezado no coincide.

### Finanzas

`obtenerHistorialFinanzas` mezcla:

- filas manuales de Finanzas;
- una fila por línea de venta completada;
- exclusión de estados `En Tránsito` y `Cancelado`.

En su primera ejecución según una propiedad global, elimina de Finanzas las filas categorizadas como `Ventas de Sistema`.

### Cierre diario

`obtenerResumenCierreDiario` agrupa Ventas por ID. `guardarCierreDiario` vuelve a recorrer Ventas, cancela las pendientes y después agrega la fila de cierre.

## Contratos implícitos de campos

### Venta frontend → backend

```text
vendedor
entregador
canalVenta
estadoVenta
items[]:
  codigo
  nombre
  cantidad
  precioUnit
  subtotal
  almacen
envioCobrado
total
lugarEntrega
horaSalida
horaFinalizacion
observaciones  // contiene [Pago: Efectivo|Digital]
fecha
```

El backend recalcula el total final solo a partir de subtotales recibidos y envío; no consulta el precio oficial.

### Transferencia frontend → backend

```text
codigo
cantidad
ubicacionOrigen
ubicacionDestino
fecha
observaciones
```

### Movimiento financiero frontend → backend

```text
fecha
tipo          // Ingreso | Gasto
categoria
monto
responsable
observaciones
```

## Riesgos del contrato RPC

- No hay autenticación ni autorización por función.
- Los objetos recibidos se confían parcialmente; varias sumas y precios vienen del navegador.
- No existen claves de idempotencia.
- La prevención de doble envío es temporal y solo frontend.
- Las respuestas mezclan strings y objetos `{success, message}`.
- Algunas consultas ocultan errores devolviendo arreglos vacíos.
- Los nombres de funciones globales forman la API sin versionado.

## Cobertura frontend fuera de RPC

La ausencia de una RPC no equivale a ausencia de funcionalidad. El inventario exhaustivo de [funciones frontend](file-inventory.md#inventario-exhaustivo-de-funciones-frontend) clasifica 138 nombres únicos de `Global_JS`; esta tabla enlaza las acciones visibles sin una llamada nueva al servidor con el flujo o prueba que las cubre.

| Pantalla/acción visible | Funciones frontend | Backend relacionado | Cobertura funcional y prueba |
|---|---|---|---|
| Navegación de nueve pestañas y sidebar móvil | `showTab`, `toggleSidebar`, `closeSidebar`, `initializeApp`, `checkMobileDevice`, `setVh`, `fitToContent`, `syncBodyHeight` | — | Navegación, carga de pestaña y responsive; `AT-NAV-01`, `AT-NAV-02` |
| Apertura/cierre de modales | `abrirModalVenta`, `cerrarModalVenta`, `abrirModalTransferencia`, `cerrarModalTransferencia`, `abrirModalFinanzas`, `cerrarModalFinanzas` | Las cargas posteriores usan las RPC ya mapeadas | Modales y estado visible; `AT-UI-01` |
| Autocompletado y selección | `buscarProductoEntrada`, `buscarProductoAjuste`, `buscarProductoCarrito`, `buscarProductoTransferencia`, `mostrarAutocompletadoEntrada`, `mostrarAutocompletadoAjuste`, `mostrarAutocompleteCarrito`, `mostrarAutocompleteTransferencia`, `seleccionarProductoEntrada`, `seleccionarProductoAjuste`, `seleccionarProductoCarrito`, `seleccionarProductoTransferencia` | `buscarProductoPorCodigo` | Entrada, ajuste, venta y transferencia; `AT-UI-02`, `AT-ENT-03` |
| Filtros, búsqueda y paginación de tablas | `buscarProducto`, `buscarEnTiempoReal`, `filtrarTablaInventario`, `_irPagInv`, `mostrarAlertas`, `cargarFiltrosReporte`, `manejarCambioTipoReporte`, `limpiarFiltrosReporte`, `changeMovimientosPage`, `changeFinanzasPage` | Consulta inicial respectiva; filtros/páginas posteriores usan caché o datos cargados | Inventario, Buscar, Reportes, Movimientos y Finanzas; `AT-UI-02` |
| Carrito y mensajes de operación | `agregarAlCarrito`, `eliminarDelCarrito`, `actualizarTotalVenta`, `renderizarCarrito`, `showMessage`, `mostrarMensajeSafe`, `restaurarBoton`, `setupDoubleSubmitPrevention` | `registrarVentaDetallada` al confirmar | Modal Venta y estados de carga/error; `AT-SAL-01`, `AT-UI-03` |
| Navegación interna y filtros de analytics | `showDashPanel`, `setVendMode`, `selectVend`, `setTiempoMode`, `filterDDInventario`; los constructores y renderizadores concretos están enumerados en `file-inventory.md` | `obtenerDatosDashboardBackend` solo para carga inicial | Dashboard Analítico; `AT-ANA-04` |
| Exportación e impresión de reportes | `exportarStock`, `exportarReporte`, `imprimirReporteGeneral` | `exportarStockCSV`, `obtenerHistorial`, `exportarReporteConFiltros`; impresión solo DOM | Inventario y Reportes; `AT-INV-03`, `AT-REP-03`, `AT-REP-04` |
| Impresión de cierre | `imprimirReporteCierre` | —; construye una ventana desde el resumen ya mostrado | Cierre diario; `AT-CLS-10` |
| Estados de carga, confirmaciones y recarga | `loadDashboard`, `mostrarStock`, `loadMovimientosRecientes`, `loadFinanzasResumen`, `cargarCierreDiario`, `confirmarCierreDiario`, `procesarImportacionCSV` y helpers de mensaje/render | Las RPC ya listadas en el mapa completo | Acciones visibles, confirmaciones y mensajes; `AT-UI-03` |

## Reconciliación de llamadas y declaraciones

- **38** invocaciones `google.script.run` apuntan a **29** nombres de servidor; las 29 funciones existen y están clasificadas en `file-inventory.md`.
- `Global_JS` contiene **141** declaraciones y **138** nombres únicos: 57 `ACTIVE_USER_WORKFLOW`, 12 `UI_ONLY`, 61 `ACTIVE_SUPPORT_FUNCTION` y 8 `DEAD_OR_UNREFERENCED`; no hay `UNKNOWN`.
- Tres declaraciones son redundantes (`setVh`, `restaurarBoton`, `handleTipoChange`), sin alterar el total de 138 nombres únicos. Los contratos no enlazados se documentan como tales, no se eliminan ni se convierten en funcionalidad nueva.

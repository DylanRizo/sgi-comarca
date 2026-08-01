# Inventario de archivos y funciones legacy

## Controles de integridad

| Fuente | Tamaño | SHA-256 durante la auditoría |
|---|---:|---|
| `sgi-comarca-appsscript.json` | 590,607 bytes | `DC54A4D7A72C9F1966205E9FB5D806C7C5DF19C2B79E696767E0A7E8B50004FC` |
| `datos-inventario.xlsx` | 168,826 bytes | `D0BB929D9498DB888295D2C556A51E1A90F3D5834E9C4D544D9B1BB65D46E550` |

Los hashes se verificaron de nuevo después de la inspección.

## Componentes del proyecto Apps Script

| # | Componente | Tipo | Líneas | Caracteres | Responsabilidad |
|---:|---|---|---:|---:|---|
| 1 | `appsscript` | JSON | 10 | 216 | Manifiesto, zona horaria y despliegue web anónimo |
| 2 | `Auditoria` | server | 99 | 4,206 | Ajuste desde spreadsheet externo |
| 3 | `check_mig` | server | 12 | 315 | Diagnóstico manual de Finanzas |
| 4 | `Comp_ModalFinanzas` | HTML | 76 | 3,802 | Formulario de ingreso/gasto |
| 5 | `Comp_ModalTransferencia` | HTML | 86 | 3,631 | Formulario de transferencia |
| 6 | `Comp_ModalVenta` | HTML | 182 | 7,974 | Carrito y formulario de venta |
| 7 | `Comp_Sidebar` | HTML | 25 | 1,638 | Navegación de nueve pestañas |
| 8 | `config` | server | 36 | 1,084 | IDs, nombres de hojas, tipos y campos |
| 9 | `Global_CSS` | HTML/CSS | 1,007 | 34,729 | Estilos globales |
| 10 | `Global_JS` | HTML/JS | 3,897 | 164,438 | Lógica frontend; 141 declaraciones `function` detectadas |
| 11 | `index` | HTML | 38 | 832 | Composición de la página e includes |
| 12 | `main` | server | 27 | 1,029 | `doGet` e `include` |
| 13 | `Service_Analisis` | server | 1,528 | 52,465 | Reportes, KPIs y dashboards |
| 14 | `Service_Finanzas` | server | 440 | 16,190 | Finanzas y cierres |
| 15 | `Service_Importacion` | server | 267 | 11,057 | Importación CSV multi-almacén |
| 16 | `Service_Inventario` | server | 1,147 | 43,645 | Entradas, inventario, movimientos, ajustes y transferencias |
| 17 | `Service_Productos` | server | 276 | 8,492 | Catálogo, búsquedas y listas |
| 18 | `Service_Ventas` | server | 616 | 22,903 | Ventas, tránsito, confirmación y cancelación |
| 19 | `System_Admin` | server | 448 | 16,701 | Inicialización, validación y reparaciones |
| 20 | `test_reportes` | server | 16 | 376 | Prueba manual de historial |
| 21 | `Utils` | server | 448 | 16,701 | Copia exacta de `System_Admin` |
| 22 | `views_of_the_system` | HTML | 1,528 | 52,524 | Pestañas, tablas, paneles y dashboard analítico |

## Clasificación exhaustiva de funciones de servidor

Clasificaciones:

- `RPC`: invocada directamente desde `Global_JS`;
- `INTERNAL`: auxiliar alcanzable desde una RPC;
- `ENTRY`: punto de entrada web;
- `MANUAL`: función administrativa no enlazada a la UI;
- `UNLINKED`: no se encontró ruta activa desde la UI;
- `TEST`: diagnóstico o prueba manual;
- `DUPLICATE`: copia exacta de otra definición.

### Entrada, auditoría y diagnóstico

| Componente | Función | Clasificación | Hojas o recurso |
|---|---|---|---|
| `main` | `doGet` | `ENTRY` | HTML |
| `main` | `include` | `INTERNAL` | archivos HTML |
| `Auditoria` | `ajustarInventarioAuditoriaDesdeOtroArchivo` | `MANUAL` | Inventario, Movimientos, spreadsheet externo |
| `check_mig` | `inspectMigrated` | `TEST` | Finanzas |
| `test_reportes` | `testObtenerHistorial` | `TEST` | llama a `obtenerHistorial` |

### `Service_Analisis`

| Función | Clasificación | Responsabilidad |
|---|---|---|
| `obtenerHistorial` | `RPC` | Filtra y enriquece Movimientos |
| `obtenerResumen` | `RPC` | KPIs generales |
| `obtenerDatosAnaliticos` | `RPC` | Ensambla dashboard analítico antiguo |
| `calcularKPIsDashboard` | `INTERNAL` | KPIs de ventas, utilidad y stock |
| `calcularVentasMensuales` | `INTERNAL` | Serie mensual |
| `calcularTopProductos` | `INTERNAL` | Ranking de productos |
| `construirNombreConVariante` | `INTERNAL` | Nombre descriptivo |
| `acortarNombre` | `INTERNAL` | Etiqueta corta |
| `parsearItems` | `INTERNAL` | Interpreta `CODIGO:CANTIDAD` |
| `calcularStockPorUbicacion` | `INTERNAL` | Agregación por almacén |
| `calcularAlertasStock` | `INTERNAL` | Stock bajo/sin stock |
| `calcularMejoresVendedores` | `INTERNAL` | Ranking de vendedores |
| `calcularTopLugares` | `INTERNAL` | Ranking de entregas |
| `calcularVentasPorCanal` | `INTERNAL` | Agrupación por canal |
| `generarRecomendaciones` | `INTERNAL` | Mensajes heurísticos |
| `exportarStockCSV` | `RPC` | CSV de inventario |
| `exportarReporteConFiltros` | `RPC` | Exportación filtrada |
| `calcularResumenMovimientos` | `INTERNAL` | Totales del reporte |
| `obtenerCostoProducto` | `INTERNAL` | Costo desde Inventario |
| `obtenerNombreProducto` | `UNLINKED` | Nombre desde una matriz |
| `testRotacionInventario` | `TEST` | Prueba manual de rotación |
| `obtenerDatosDashboardBackend` | `RPC` | Dashboard analítico vigente |
| `_mesCorto` | `INTERNAL` | Etiqueta de mes |
| `_dashboardVacio` | `INTERNAL` | Contrato vacío |
| `obtenerFiltrosReporte` | `RPC` | Productos, ubicaciones y vendedores |

### `Service_Finanzas`

| Función | Clasificación | Responsabilidad |
|---|---|---|
| `registrarMovimientoFinanciero` | `RPC` | Agrega ingreso/gasto manual |
| `obtenerHistorialFinanzas` | `RPC` con efecto lateral | Combina Finanzas + Ventas y elimina filas automáticas una vez |
| `toYYYYMMDD` | `INTERNAL` | Normaliza fechas de presentación |
| `obtenerResumenCierreDiario` | `RPC` | Ventas/gastos por fecha y vendedor |
| `guardarCierreDiario` | `RPC` | Cancela tránsito y agrega cierre |
| `obtenerHistorialCierres` | `RPC` | Lista cierres |

### `Service_Importacion`

| Función | Clasificación | Responsabilidad |
|---|---|---|
| `importarInventarioMasivo` | `RPC` | Importación CSV; única mutación con `LockService` |

### `Service_Inventario`

| Función | Clasificación | Responsabilidad |
|---|---|---|
| `insertarProductoConUbicacion` | `RPC` | Alta/entrada en cuatro hojas |
| `registrarMovimiento` | `INTERNAL` | Agrega movimiento y calcula saldo global |
| `buscarEnInventarioPorUbicacion` | `RPC` | Detalle de producto por ubicación |
| `obtenerStock` | `RPC` | Resumen legacy desde Productos + Movimientos |
| `calcularStock` | `INTERNAL` | Ledger global por producto |
| `calcularStockDesdeInventario` | `UNLINKED` | Total desde Inventario |
| `verificarStockEnUbicacion` | `INTERNAL` | Lee primera coincidencia producto–ubicación |
| `descontarDeInventario` | `INTERNAL` | Resta en primera coincidencia |
| `obtenerUbicaciones` | `RPC` | Lista ubicaciones existentes |
| `procesarTransferenciaEntreUbicaciones` | `RPC` | Orquesta descuento, suma y movimiento |
| `sumarAInventario` | `INTERNAL` | Suma o crea fila de Inventario |
| `obtenerStockPorUbicacion` | `RPC` | Tabla de stock por almacén |
| `obtenerMovimientosRecientes` | `RPC` | Feed paginado |
| `procesarAjusteInventario` | `RPC` | Orquesta movimiento y ajuste físico |

### `Service_Productos`

| Función | Clasificación | Responsabilidad |
|---|---|---|
| `registrarProducto` | `INTERNAL` | Alta de catálogo |
| `buscarProductoPorCodigo` | `RPC` | Autocompletado de varias pantallas |
| `buscarProducto` | `UNLINKED` | Búsqueda backend antigua |
| `autocompletarProductoPorCodigo` | `UNLINKED` | Datos históricos de Entrada |
| `obtenerProductosParaFiltro` | `INTERNAL` | Opciones de reporte |
| `obtenerListas` | `RPC` | Unidades y grupos; crea hojas si faltan |

### `Service_Ventas`

| Función | Clasificación | Responsabilidad |
|---|---|---|
| `registrarVentaDetallada` | `RPC` | Venta por líneas y descuento de stock |
| `obtenerVentasEnTransito` | `RPC` | Agrupa líneas pendientes |
| `confirmarPagoVenta` | `RPC` | Cambia `En Tránsito` a `Completado` |
| `cancelarVentaEnTransito` | `RPC` | Restaura stock y marca `Cancelado` |
| `obtenerReporteVentas` | `UNLINKED` | Reporte de ventas antiguo |
| `calcularKPIsVentas` | `UNLINKED` | Auxiliar del reporte no enlazado |
| `obtenerInfoVentaPorObservacion` | `INTERNAL` | Resuelve ID de venta desde movimiento |
| `obtenerVendedores` | `INTERNAL` | Opciones de reporte |

### `System_Admin` y `Utils`

| Función | `System_Admin` | `Utils` | Clasificación |
|---|---|---|---|
| `inicializarHojas` | líneas 1–191 | copia exacta | `RPC` / `DUPLICATE` |
| `validarIntegridad` | líneas 192–291 | copia exacta | `RPC` / `DUPLICATE` |
| `eliminarVentasDuplicadas` | líneas 292–377 | copia exacta | `MANUAL` destructiva / `DUPLICATE` |
| `recuperarFechasPerdidas` | líneas 378–448 | copia exacta | `MANUAL` / `DUPLICATE` |

## Cobertura y código no enlazado

- 29 nombres únicos se invocan directamente desde la UI.
- 57 nombres quedan alcanzables incluyendo auxiliares y entrada web.
- 12 nombres no tienen ruta activa observada: auditoría manual, diagnósticos, reparaciones, pruebas y funciones reemplazadas.
- `System_Admin` y `Utils` son idénticos byte por byte.
- En `Global_JS`, existe una segunda definición global de `setVh` y una función `handleTipoChange` anidada dentro de la transferencia que no se usa.
- Tras una transferencia, el frontend intenta llamar `loadMovimientos()` si la pestaña activa es Movimientos; no se encontró definición de esa función.

## Funciones con escritura real

Se detectaron 17 funciones con operaciones directas `appendRow`, `setValue(s)`, `deleteRow`, `clear*`, `insertSheet` o `insertColumnAfter`. Solo `importarInventarioMasivo` adquiere un bloqueo.

Especial atención:

- `obtenerHistorialFinanzas` parece una consulta, pero puede ejecutar `deleteRow`;
- `inicializarHojas` puede ejecutar `clear`;
- `eliminarVentasDuplicadas` vacía y reescribe Ventas;
- las funciones orquestadoras de ajuste y transferencia escriben indirectamente mediante auxiliares.

## Inventario del Excel

| Hoja | Rango con datos | Filas de datos | Columnas lógicas |
|---|---|---:|---:|
| Productos | `A1:G146` | 145 | 7 |
| Finanzas | `A1:G7` | 6 | 7 |
| CierresDiarios | `A1:L5` | 4 | 12 |
| Movimientos | `A1:I1070` | 1,069 | 9 |
| Entrada de Productos | `A14:G66` | 52 | 7 |
| Inventario | `A1:H360` | 359 | 8 |
| Ventas | `A1:Q405` | 404 | 17 |
| Unidades | `A1:A15` | 14 | 1 |
| Grupos | `A1:A12` | 11 | 1 |

## Inventario exhaustivo de funciones frontend

### Método y alcance

- Se buscaron declaraciones con el patrón `function nombre(...)` en los componentes HTML del JSON. Solo `Global_JS` contiene declaraciones frontend: **141 declaraciones**, **138 nombres únicos** y **3 declaraciones redundantes**.
- `Comp_ModalFinanzas`, `Comp_ModalTransferencia`, `Comp_ModalVenta`, `Comp_Sidebar`, `index` y `views_of_the_system` contienen marcado, atributos de evento o includes, pero no declaraciones `function` adicionales.
- `ACTIVE_USER_WORKFLOW` identifica una acción visible, una carga solicitada por la vista o una mutación iniciada por usuario. `UI_ONLY` cambia solo la interfaz. `ACTIVE_SUPPORT_FUNCTION` renderiza, formatea, valida o coordina un flujo activo. `DEAD_OR_UNREFERENCED` no tiene invocador estático observado. La evidencia es la declaración y las referencias estáticas en los componentes del JSON; no se ejecutó el web app.
- La columna **Cobertura funcional** indica la fila o grupo que lo representa en `feature-matrix.md`; una función de soporte puede estar agrupada bajo la acción visible que apoya. Ninguna función queda sin clasificar.

### Reconciliación de cobertura

| Medida | Total | Criterio |
|---|---:|---|
| Declaraciones frontend | 141 | Todas en `Global_JS` |
| Nombres frontend únicos | 138 | Base de clasificación |
| Nombres únicos clasificados | 138 | 57 flujo de usuario + 12 solo UI + 61 soporte + 8 sin referencia |
| `ACTIVE_USER_WORKFLOW` | 57 | Acción/carga visible o mutación iniciada por usuario |
| `UI_ONLY` | 12 | Cambio de UI sin RPC propio |
| `ACTIVE_SUPPORT_FUNCTION` | 61 | Soporte de un flujo activo |
| `DEAD_OR_UNREFERENCED` | 8 | Sin invocador estático observado |
| `UNKNOWN` | 0 | Ninguna tras el análisis estático |
| Declaraciones redundantes | 3 | Una declaración adicional por cada nombre duplicado |

### Funciones `ACTIVE_USER_WORKFLOW` (57 nombres)

| Módulo/pantalla | Declaraciones y referencia de origen | Evento o acción que las activa | Backend relacionado | Cobertura funcional |
|---|---|---|---|---|
| Aplicación y Dashboard | `loadDashboard` (L127), `cargarVentasEnTransito` (L167), `confirmarPagoVentaUI` (L211), `cancelarVentaEnTransitoUI` (L228), `showStockAlerts` (L246) | Apertura/recarga de Dashboard, panel pendiente, confirmar/cancelar, filtro de alertas | `obtenerResumen`, `obtenerVentasEnTransito`, `confirmarPagoVenta`, `cancelarVentaEnTransito`, `obtenerStock` | Dashboard, tránsito, confirmación, cancelación y alertas |
| Entrada de Productos | `loadListas` (L310), `loadUbicaciones` (L323), `buscarProductoEntrada` (L379), `registrarEntrada` (L419) | Abrir entrada, autocompletar y enviar formulario | `obtenerListas`, `obtenerUbicaciones`, `buscarProductoPorCodigo`, `insertarProductoConUbicacion` | Entrada, catálogos y autocompletado |
| Ajustes | `buscarProductoAjuste` (L579), `registrarAjusteInventario` (L630) | Buscar producto y confirmar ajuste | `buscarProductoPorCodigo`, `procesarAjusteInventario` | Ajuste positivo y negativo |
| Buscar, Inventario y Reportes | `buscarProducto` (L706), `buscarEnTiempoReal` (L743), `verDetalleUbicaciones` (L838), `mostrarStock` (L896), `filtrarTablaInventario` (L958), `_irPagInv` (L1075), `mostrarAlertas` (L1099), `mostrarHistorial` (L1118), `exportarStock` (L1264), `imprimirReporteGeneral` (L1278), `exportarReporte` (L1399) | Buscar, detalle, cargar/filtrar/paginar tabla, alertas, historial, exportar e imprimir | `obtenerStockPorUbicacion`, `buscarEnInventarioPorUbicacion`, `obtenerStock`, `obtenerHistorial`, `exportarStockCSV`, `exportarReporteConFiltros` | Inventario, Buscar Producto y Reportes; filtros, paginación, exportación e impresión |
| Configuración | `validarIntegridad` (L1227), `inicializarSistema` (L1246) | Validar o inicializar desde la pantalla | `validarIntegridad`, `inicializarHojas` | Configuración |
| Modal Venta | `abrirModalVenta` (L1488), `cerrarModalVenta` (L1511), `buscarProductoCarrito` (L1550), `agregarAlCarrito` (L1611), `eliminarDelCarrito` (L1664), `registrarVentaDetallada` (L1712) | Abrir/cerrar, autocompletar, gestionar carrito y registrar | `obtenerUbicaciones`, `buscarProductoPorCodigo`, `registrarVentaDetallada` | Modal Venta, carrito, venta completada/tránsito y multi-almacén |
| Modal Transferencia | `abrirModalTransferencia` (L1937), `cerrarModalTransferencia` (L1955), `validarUbicaciones` (L1999), `buscarProductoTransferencia` (L2016), `registrarTransferencia` (L2066) | Abrir/cerrar, validar origen/destino, autocompletar y enviar | `obtenerUbicaciones`, `buscarProductoPorCodigo`, `procesarTransferenciaEntreUbicaciones` | Transferencias |
| Dashboard Analítico | `loadAnalyticsDashboard` (L2247), `showDashPanel` (L2302), `setVendMode` (L2473), `selectVend` (L2517), `setTiempoMode` (L2601), `filterDDInventario` (L2669) | Cargar dashboard, navegar paneles y aplicar filtros/modos | `obtenerDatosDashboardBackend` para la carga; filtros posteriores usan datos ya cargados | Dashboard analítico, navegación interna y filtros |
| Reportes | `cargarFiltrosReporte` (L2699), `manejarCambioTipoReporte` (L2736) | Cargar filtros y cambiar tipo de reporte | `obtenerFiltrosReporte` o datos ya cargados | Reportes, filtros y estados de carga |
| Importación CSV legacy | `procesarImportacionCSV` (L2935) | Seleccionar CSV y procesarlo | `importarInventarioMasivo` | Importación CSV legacy |
| Modal Finanzas | `abrirModalFinanzas` (L3117), `cerrarModalFinanzas` (L3134), `actualizarCategoriasFinanzas` (L3140), `registrarMovimientoFinancieroFront` (L3164) | Abrir/cerrar modal, cambiar tipo y registrar movimiento | `registrarMovimientoFinanciero` | Finanzas: ingreso/gasto |
| Movimientos y Finanzas | `loadMovimientosRecientes` (L3232), `changeMovimientosPage` (L3249), `loadFinanzasResumen` (L3340), `changeFinanzasPage` (L3363) | Recargar/paginar feed e historial financiero | `obtenerMovimientosRecientes`, `obtenerHistorialFinanzas` | Feed, historial, recargas y paginación |
| Cierre diario | `cargarCierreDiario` (L3530), `calcularDiferenciasCierre` (L3643), `confirmarCierreDiario` (L3704), `imprimirReporteCierre` (L3736), `cargarHistorialCierres` (L3835) | Cargar resumen, capturar diferencias, guardar, imprimir y consultar historial | `obtenerResumenCierreDiario`, `guardarCierreDiario`, `obtenerHistorialCierres`; la impresión es solo DOM | Cierre diario e impresión de cierre |

### Funciones `UI_ONLY` (12 nombres)

| Módulo/pantalla | Declaraciones y referencia de origen | Acción visible | Backend relacionado | Cobertura funcional |
|---|---|---|---|---|
| Navegación responsiva | `showTab` (L49), `toggleSidebar` (L105), `closeSidebar` (L110) | Cambiar pestaña y abrir/cerrar sidebar | — | Navegación y estados de carga de pestaña |
| Entrada, ajuste y búsqueda | `ocultarAutocompletadoEntrada` (L415), `toggleAjusteForm` (L560), `actualizarLabelAjuste` (L618), `limpiarFormEntrada` (L1443), `limpiarBusqueda` (L1458), `limpiarTodosFormularios` (L1463) | Ocultar sugerencias, mostrar formulario, actualizar etiqueta y limpiar UI | — | Entrada, Ajustes, Buscar y Configuración |
| Modal Venta y reportes | `actualizarTotalVenta` (L1699), `limpiarFiltrosReporte` (L2749), `limpiarImportacion` (L3109) | Recalcular total visible o limpiar filtros/formulario | — | Modal Venta, Reportes e Importación |

### Funciones `ACTIVE_SUPPORT_FUNCTION` (63 nombres)

| Módulo/pantalla | Declaraciones y referencia de origen | Rol/evidencia | Backend relacionado cuando existe | Cobertura funcional |
|---|---|---|---|---|
| Arranque y adaptación | `initializeApp` (L6), `checkMobileDevice` (L17), `setVh` (L30), `setDefaultDates` (L34), `fitToContent` (L2170), `syncBodyHeight` (L2171) | Inicialización, detección móvil, altura y fechas; `fitToContent` se ejecuta como IIFE | — | Navegación, carga y UX transversal |
| Dashboard y entrada | `renderAlertasConPaginacion` (L282), `mostrarAutocompletado` (L353), `seleccionarProducto` (L370), `mostrarAutocompletadoEntrada` (L391), `seleccionarProductoEntrada` (L408), `restaurarBoton` (L442), `mostrarMensajeSafe` (L452) | Renderiza resultados, rellena formulario, restaura botón y muestra mensajes de las acciones activas | Resultado de las RPC de Dashboard/Entrada | Dashboard y Entrada |
| Ajustes y búsqueda | `mostrarAutocompletadoAjuste` (L591), `seleccionarProductoAjuste` (L607), `ocultarAutocompletadoAjuste` (L612), `invalidarCacheGlobal` (L701), `_filtrarYMostrarResultados` (L731), `displaySearchResults_v2` (L773) | Sugerencias, caché y renderizado de la búsqueda activa | `buscarProductoPorCodigo`, `obtenerStockPorUbicacion` indirectos | Ajustes y Buscar Producto |
| Tabla e historial | `_actualizarKPIs` (L923), `_renderInventario` (L964), `buildPaginacionInv` (L1057), `buildPaginacion` (L1081), `displayStockTable` (L1095), `displayHistorialTable` (L1146), `showMessage` (L1475) | Construye KPIs, tabla, paginación, historial y mensajes | Resultados de inventario/reportes | Inventario, Reportes y estados de error |
| Modal Venta | `cargarUbicacionesEnCarrito` (L1522), `mostrarAutocompleteCarrito` (L1566), `seleccionarProductoCarrito` (L1591), `ocultarAutocompleteCarrito` (L1602), `renderizarCarrito` (L1670), `restaurarBoton` (L1737) | Carga almacenes, gestiona sugerencias/carrito y restaura submit; esta segunda declaración está en alcance local de venta | `obtenerUbicaciones`, `buscarProductoPorCodigo` indirectos | Modal Venta |
| Modal Transferencia | `cargarUbicacionesTransferencia` (L1960), `mostrarAutocompleteTransferencia` (L2032), `seleccionarProductoTransferencia` (L2054), `ocultarAutocompleteTransferencia` (L2059) | Carga ubicaciones y gestiona sugerencias de transferencia | `obtenerUbicaciones`, `buscarProductoPorCodigo` indirectos | Transferencias |
| Dashboard Analítico | `_initMesesMap` (L2215), `_initColors` (L2223), `ddFmt` (L2233), `ddFmtDate` (L2234), `ddMakeChart` (L2239), `cargarDatosEnDashboard` (L2261), `buildResumen` (L2311), `buildCanal` (L2384), `buildVendedores` (L2422), `renderVendMes` (L2455), `buildProductos` (L2481), `buildPxV` (L2509), `renderPxV` (L2523), `buildTiempo` (L2551), `renderTiempo` (L2571), `buildTopDias` (L2609), `buildFinanzas` (L2634), `buildInventarioReal` (L2664), `renderDDInvTable` (L2679) | Formatea, prepara gráficos, construye paneles y renderiza datos del dashboard vigente | `obtenerDatosDashboardBackend` indirecto | Dashboard Analítico |
| Reportes e importación | `getTipoTextoFiltro` (L2760), `setupDoubleSubmitPrevention` (L2771), `parsearCSV` (L3006), `mostrarResultadoImportacion` (L3044) | Traduce filtros, limita doble envío, parsea y muestra resultado de importación | `importarInventarioMasivo` indirecto | Reportes e Importación CSV legacy |
| Feed, finanzas y cierre | `renderMovimientosFeed` (L3258), `renderFinanzasHistorial` (L3373), `renderizarResumenCierre` (L3556) | Renderiza los resultados recibidos para feed, Finanzas y cierre | `obtenerMovimientosRecientes`, `obtenerHistorialFinanzas`, `obtenerResumenCierreDiario` indirectos | Movimientos, Finanzas y Cierre diario |

### Funciones `DEAD_OR_UNREFERENCED` (6 nombres)

| Declaración y referencia de origen | Categoría/módulo | Evidencia | Cobertura funcional |
|---|---|---|---|
| `buscarProductoAutocompletado` (L341) | Entrada/autocompletado antiguo | Solo se encontró su declaración; la UI usa `buscarProductoEntrada` | Sin flujo activo; conservar como legacy no enlazado |
| `ocultarAutocompletado` (L375) | Autocompletado general antiguo | Solo se encontró su declaración | Sin flujo activo; conservar como legacy no enlazado |
| `handleTipoChange` (L692, L2090) | Compatibilidad/transferencia | Dos declaraciones, ninguna invocación estática; la primera no hace nada y la segunda queda anidada | Sin flujo activo; ver duplicados |
| `displaySearchResults` (L759) | Búsqueda antigua | Solo se encontró su declaración; el flujo activo llama `displaySearchResults_v2` | Sin flujo activo; reemplazada en la UI visible |
| `limpiarFormMovimiento` (L1451) | Limpieza de movimientos | Solo se encontró su declaración | Sin flujo activo observado |
| `cargarDashboardAnalitico` (L2807), `renderizarDashboardAnalitico` (L2823), `renderizarGraficoCanales` (L2849) | Dashboard analítico alterno | El cargador tiene RPC `obtenerDatosAnaliticos` y llama a los dos renderizadores, pero no se encontró invocador estático del cargador; el dashboard vigente usa `loadAnalyticsDashboard` | Contrato antiguo no enlazado; no debe eliminarse sin decisión |

### Declaraciones `DUPLICATE`

| Nombre | Declaraciones | Clasificación efectiva | Evidencia y tratamiento documental |
|---|---|---|---|
| `setVh` | L30 y L2156 | `ACTIVE_SUPPORT_FUNCTION` | Ambas versiones establecen `--vh`; la segunda vuelve a declarar un nombre global. Se contabilizan 2 declaraciones y 1 nombre único. |
| `restaurarBoton` | L442 y L1737 | `ACTIVE_SUPPORT_FUNCTION` | Son funciones anidadas en flujos diferentes (Entrada y Venta), ambas usadas localmente. Comparten nombre, no API global. |
| `handleTipoChange` | L692 y L2090 | `DEAD_OR_UNREFERENCED` | La primera es vacía y la segunda queda dentro de transferencia; no se encontró llamada a ninguna. |

No se detectaron funciones frontend `UNKNOWN`. La primera clasificación de cada nombre único es la usada en el total de cobertura; esta tabla explica por qué existen 3 declaraciones adicionales.

El rango usado físico de Productos, Entrada e Inventario se extiende hasta aproximadamente la fila 998/999 por formato residual. No se cuenta como dato.

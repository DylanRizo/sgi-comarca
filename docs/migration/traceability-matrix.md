# Matriz de trazabilidad legacy → SGI nuevo

## Criterio

Esta matriz cubre las 46 filas funcionales de `docs/legacy/feature-matrix.md` (47 líneas tabulares contando el encabezado). `COVERED` significa destino explícito; `REFERENCE` conserva una función legacy no enlazada o insegura sin reproducirla como mutación; `DECISION` tiene destino técnico pero comportamiento final pendiente. No existe ninguna fila sin destino.

| ID | Módulo legacy | Pantalla actual | Acción del usuario | Función frontend | Función backend | Hoja actual | Módulo futuro | Entidad PostgreSQL | Endpoint futuro | Pantalla futura | Regla transaccional | Permiso | Prueba | Fase | Cobertura |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---:|---|
| TR-001 | dashboard | Dashboard General | Abrir/actualizar KPIs | `loadDashboard` | `obtenerResumen` | Productos, Movimientos | analytics | proyecciones products/movements | `GET /analytics/dashboard` | Inicio | Solo lectura; errores visibles | lectura operacional | AT-DASH-01 | 9 | COVERED |
| TR-002 | sales | Dashboard General | Ver ventas en tránsito | `cargarVentasEnTransito` | `obtenerVentasEnTransito` | Ventas | sales | sales, sale_items | `GET /sales?status=IN_TRANSIT` | Ventas pendientes | Solo lectura y agrupación por venta | lectura ventas | AT-TRN-01 | 7 | COVERED |
| TR-003 | sales | Dashboard General | Confirmar pago | `confirmarPagoVentaUI` | `confirmarPagoVenta` | Ventas | sales | sales, sale_status_events, audit_logs | `POST /sales/{id}/confirm` | Detalle/pendientes | Bloquea venta; no stock; idempotente | `sales.confirm_in_transit` | AT-TRN-02,04 | 7 | COVERED |
| TR-004 | sales | Dashboard General | Cancelar venta pendiente | `cancelarVentaEnTransitoUI` | `cancelarVentaEnTransito` | Ventas, Inventario, Movimientos | sales | sales, items, balances, movements, events, logs | `POST /sales/{id}/cancel` | Detalle/pendientes | Reposición completa original una vez | `sales.cancel` (Dylan) | AT-TRN-03,05,06 | 7 | COVERED |
| TR-005 | inventory | Dashboard General | Ver alertas | `showStockAlerts` | `obtenerStock` | Productos, Movimientos | inventory | products, inventory_balances | `GET /inventory-balances?alert=` | Inicio/Inventario | Solo saldo operacional | lectura inventario | AT-DASH-02 | 6 | COVERED |
| TR-006 | products | Entrada de Productos | Cargar unidades/grupos | `loadListas` | `obtenerListas` | Unidades, Grupos | units, product-groups | units, product_groups | `GET /units`, `GET /product-groups` | Entrada/Catálogos | Lectura; creación separada autorizada | lectura catálogos | AT-ENT-01 | 6 | COVERED |
| TR-007 | warehouses | Entrada de Productos | Cargar almacenes | `loadUbicaciones` | `obtenerUbicaciones` | Inventario | warehouses | warehouses | `GET /warehouses` | Entrada | Catálogo, no hard-code | lectura inventario | AT-ENT-02 | 6 | COVERED |
| TR-008 | products | Entrada de Productos | Autocompletar producto | `buscarProductoEntrada` | `buscarProductoPorCodigo` | Productos | products | products | `GET /products/search?q=` | Entrada | Solo lectura paginada/limitada | lectura productos | AT-ENT-03 | 6 | COVERED |
| TR-009 | stock-receipts | Entrada de Productos | Registrar entrada | `registrarEntrada` | `insertarProductoConUbicacion` | Productos, Entrada, Inventario, Movimientos | stock-receipts | receipts, items, balances, movements, logs | `POST /stock-receipts` | Entrada | Una transacción + idempotencia | Permiso explícito pendiente de FASE 6; ADMIN no implica grant | AT-ENT-04–07 | 6 | COVERED |
| TR-010 | imports | Entrada de Productos | Importar CSV legacy | `procesarImportacionCSV`, `parsearCSV` | `importarInventarioMasivo` | Productos, Inventario, Movimientos | imports | import_batches/errors/staging | `POST /imports/legacy-csv/dry-run` | Herramientas legacy | Solo dry-run; nunca migración real | Permiso explícito pendiente; ADMIN no implica grant | AT-IMP-07 | 4 | REFERENCE |
| TR-011 | transfers | Movimientos/Modal | Registrar transferencia | `registrarTransferencia` | `procesarTransferenciaEntreUbicaciones` | Productos, Inventario, Movimientos | transfers | transfers, items, balances, movements, logs | `POST /transfers` | Transferencias | Origen/destino y dos movimientos atómicos | `transfers.create`, sin grants en FASE 3A | AT-TRA-01–06 | 6 | DECISION |
| TR-012 | inventory | Movimientos | Ajuste positivo | `registrarAjusteInventario` | `procesarAjusteInventario` | Productos, Movimientos, Inventario | inventory | adjustments, balances, movements, logs | `POST /inventory-adjustments` | Ajustes | Anterior/nueva + movimiento en transacción | `inventory.adjust` | AT-ADJ-01,04 | 6 | COVERED |
| TR-013 | inventory | Movimientos | Ajuste negativo | `registrarAjusteInventario` | `procesarAjusteInventario` | Productos, Movimientos, Inventario | inventory | adjustments, balances, movements, logs | `POST /inventory-adjustments` | Ajustes | Rechaza saldo negativo; atómico | `inventory.adjust` | AT-ADJ-02–04 | 6 | COVERED |
| TR-014 | stock-movements | Movimientos | Actualizar feed | `loadMovimientosRecientes` | `obtenerMovimientosRecientes` | Movimientos, Productos | stock-movements | stock_movements, products | `GET /stock-movements` | Movimientos | Solo lectura server-side | lectura inventario | AT-MOV-01,02 | 6 | COVERED |
| TR-015 | inventory | Inventario | Consultar tabla/KPIs | `mostrarStock` | `obtenerStockPorUbicacion` | Inventario, Productos, Movimientos | inventory | inventory_balances, products, warehouses | `GET /inventory-balances` | Inventario | Fuente única operacional | lectura inventario | AT-INV-01,04,05 | 6 | COVERED |
| TR-016 | inventory | Inventario | Filtrar tabla | `filtrarTablaInventario` | — | Caché cliente | inventory | inventory_balances | `GET /inventory-balances?...` | Inventario | Filtros/paginación servidor | lectura inventario | AT-INV-02 | 6 | COVERED |
| TR-017 | inventory | Inventario | Exportar CSV | `exportarStock` | `exportarStockCSV` | Inventario, Productos, Movimientos | reports | proyección inventory | `GET /reports/inventory/export` | Inventario | Snapshot de lectura; sin escritura | lectura inventario | AT-INV-03 | 9 | COVERED |
| TR-018 | products | Buscar Producto | Buscar | `buscarProducto` | `obtenerStockPorUbicacion` | Inventario, Productos, Movimientos | products, inventory | products, balances | `GET /products/search` | Productos | Solo lectura | lectura productos | AT-SRC-01 | 6 | COVERED |
| TR-019 | products | Buscar Producto | Ver detalle | `verDetalleUbicaciones` | `buscarEnInventarioPorUbicacion` | Inventario | products, inventory | products, balances, legacy staging refs | `GET /products/{id}/inventory` | Detalle producto | Muestra anomalías hasta resolver | lectura productos | AT-SRC-02 | 6 | COVERED |
| TR-020 | reports | Reportes | Cargar filtros | `cargarFiltrosReporte` | `obtenerFiltrosReporte` | Inventario, Productos, Ventas | reports | proyecciones/catálogos | `GET /reports/filters` | Reportes | Solo lectura | lectura reporte | AT-REP-01 | 9 | COVERED |
| TR-021 | reports | Reportes | Generar historial | `mostrarHistorial` | `obtenerHistorial` | Movimientos, Productos, Ventas | reports | movements, products, sales | `GET /reports/movements` | Reportes | Solo lectura consistente | lectura reporte | AT-REP-02 | 9 | COVERED |
| TR-022 | reports | Reportes | Exportar CSV | `exportarReporte` | `obtenerHistorial`, `exportarReporteConFiltros` | Movimientos, Productos, Ventas | reports | proyección de reporte | `GET /reports/movements/export` | Reportes | Mismos filtros/datos de tabla | lectura reporte | AT-REP-03 | 9 | COVERED |
| TR-023 | reports | Reportes | Imprimir | `imprimirReporteGeneral` | — | DOM | reports | proyección de reporte | `GET /reports/{type}` | Vista imprimible | Sin mutación; render seguro | lectura reporte | AT-REP-04 | 9 | COVERED |
| TR-024 | settings | Configuración | Validar integridad | `validarIntegridad` | `validarIntegridad` | Productos, Movimientos, Unidades, Grupos | imports/reports | evidencia privada en 3C; import_batches/issues solo desde 4 | CLI `profile:legacy` en 3C; endpoint futuro no implementado | Reconciliación | Perfil reproducible read-only de 9 hojas; cero DB en 3C | Permiso explícito pendiente para cualquier operación futura; ADMIN no implica grant | AT-CFG-01 | 3C `COMPLETE`; 4 `NEXT` | COVERED |
| TR-025 | settings | Configuración | Inicializar hojas | `inicializarSistema` | `inicializarHojas` | Hojas base | settings/deployment | migrations, settings | sin endpoint destructivo; health/setup controlado | Administración | Migraciones reproducibles; nunca clear | Permiso explícito pendiente; ADMIN no implica grant | AT-CFG-02 | 2–5 histórica | REFERENCE |
| TR-026 | settings | Configuración | Limpiar formularios | `limpiarTodosFormularios` | — | DOM | ui | — | — | Formularios | Solo estado local | cualquier usuario de pantalla | AT-CFG-03 | 10 | COVERED |
| TR-027 | sales | Modal Venta | Agregar artículo al carrito | `agregarAlCarrito` | — | Caché cliente | sales/ui | — hasta submit | `GET /products/search`, `/inventory-balances` | Carrito | Previsualización; backend recalcula | `sales.create` | AT-SAL-01 | 7 | COVERED |
| TR-028 | sales | Modal Venta | Registrar venta completada | `registrarVentaDetallada` | `registrarVentaDetallada` | Productos, Inventario, Ventas, Movimientos | sales | sales, items, balances, movements, logs | `POST /sales` | Nueva venta | Una transacción, Decimal, idempotencia | `sales.create` | AT-SAL-02,05–10 | 7 | COVERED |
| TR-029 | sales | Modal Venta | Registrar venta en tránsito | `registrarVentaDetallada` | `registrarVentaDetallada` | Productos, Inventario, Ventas, Movimientos | sales | sales, items, balances, movements, logs | `POST /sales` | Nueva venta | Descuenta al crear; no ingreso aún | `sales.create` | AT-SAL-03 | 7 | COVERED |
| TR-030 | sales | Modal Venta | Venta multi-almacén | `agregarAlCarrito`, `registrarVentaDetallada` | `registrarVentaDetallada` | Inventario, Ventas, Movimientos | sales | sale_items, balances, movements | `POST /sales` | Carrito | Almacén por item; locks ordenados | `sales.create` | AT-SAL-04 | 7 | COVERED |
| TR-031 | finances | Modal Finanzas | Registrar ingreso/gasto | `registrarMovimientoFinancieroFront` | `registrarMovimientoFinanciero` | Finanzas | finances | financial_transactions, logs | `POST /financial-transactions` | Finanzas | Manual, Decimal, idempotente | `finances.manual.create` | AT-FIN-01,06 | 8 | COVERED |
| TR-032 | finances | Finanzas | Ver historial/KPIs | `loadFinanzasResumen` | `obtenerHistorialFinanzas` | Finanzas, Ventas | finances | financial_transactions + sales projection | `GET /financial-summary`, `/financial-transactions` | Finanzas | Consulta sin efectos; no doble conteo | `finances.read` | AT-FIN-02–05 | 8 | COVERED |
| TR-033 | daily-closings | Finanzas | Generar resumen | `cargarCierreDiario` | `obtenerResumenCierreDiario` | Ventas, Finanzas, Cierres | daily-closings | sales/finance projections | `GET /daily-closings/preview?date=` | Cierre | Snapshot por fecha Managua; fórmula versionada | `closings.read` | AT-CLS-01,05–09 | 8 | DECISION |
| TR-034 | daily-closings | Finanzas | Guardar cierre | `confirmarCierreDiario` | `guardarCierreDiario` | Ventas, Cierres; indirectamente stock legacy | daily-closings | closings, details, logs | `POST /daily-closings` | Cierre | No cancela tránsito; único/atómico | `closings.create` | AT-CLS-02,03,06,07 | 8 | DECISION |
| TR-035 | daily-closings | Finanzas | Ver historial | `cargarHistorialCierres` | `obtenerHistorialCierres` | CierresDiarios | daily-closings | closings, details | `GET /daily-closings` | Historial cierres | Solo lectura | `closings.read` | AT-CLS-03,04 | 8 | COVERED |
| TR-036 | analytics | Dashboard Analítico | Ver KPIs/paneles | `loadAnalyticsDashboard` | `obtenerDatosDashboardBackend` | Ventas, Inventario, Productos, Finanzas, Movimientos | analytics | proyecciones verificadas | `GET /analytics/dashboard` | Analytics | Solo lectura; SQL canónico | financiero según dato | AT-ANA-01,03 | 9 | DECISION |
| TR-037 | analytics | Código no enlazado | Variante analítica antigua | `cargarDashboardAnalitico` | `obtenerDatosAnaliticos` | Ventas, Inventario, Productos | analytics | definiciones KPI comparativas | `GET /analytics/reconciliation` interno | Reconciliación KPI | Comparar; retirar solo tras decisión | Permiso explícito pendiente; ADMIN no implica grant | AT-ANA-02 | 9 | REFERENCE |
| TR-038 | inventory-audits | Ejecución manual | Aplicar auditoría externa | — | `ajustarInventarioAuditoriaDesdeOtroArchivo` | Archivo externo, Inventario, Movimientos | inventory-audits | audits, items, adjustments, balances, movements | `POST /inventory-audits/{id}/approve` | Auditoría | Preview/aprobación/ajuste atómico | Permiso explícito y aprobación adicional pendientes | AT-AUD-01,02 | 9 | DECISION |
| TR-039 | admin | Ejecución manual | Eliminar duplicados | — | `eliminarVentasDuplicadas` | Ventas | imports | resolution_records, staging | `POST /imports/{id}/resolutions` | Reconciliación | Marca/resuelve; nunca dedupe automática | Permiso explícito pendiente; ADMIN no implica grant | AT-ADM-01 | 4 | REFERENCE |
| TR-040 | admin | Ejecución manual | Recuperar fechas | — | `recuperarFechasPerdidas` | Ventas | imports | staging, resolution_records | `POST /imports/{id}/resolutions` | Reconciliación | Derivado separado; raw intacto | Permiso explícito pendiente; ADMIN no implica grant | AT-ADM-02 | 4 | DECISION |
| TR-041 | navigation | Todas | Cambiar pestaña/sidebar | `showTab`, `toggleSidebar`, `closeSidebar` | — | DOM | web/ui | — | rutas web | Navegación responsive | Sin mutación | sesión + permiso de ruta | AT-NAV-01,02 | 10 | COVERED |
| TR-042 | ui | Tres modales | Abrir/cerrar modal | funciones `abrir/cerrarModal*` | RPC relacionadas | DOM/consultas | web/ui | — | endpoints del flujo | Diálogos accesibles | Sin mutación hasta confirmar | permiso del flujo | AT-UI-01 | 10 | COVERED |
| TR-043 | ui | Entrada/Ajustes/Venta/Transferencia/Inventario | Autocompletar, filtrar, buscar, paginar | búsquedas/selectores/paginadores listados en FASE 0 | búsqueda/stock o datos cargados | Productos, Inventario, Movimientos | web + módulos de consulta | proyecciones paginadas | `/products/search`, `/inventory-balances`, listados | Tablas/formularios | Server-side; no caché autoritativa | lectura de cada módulo | AT-UI-02 | 6–10 | COVERED |
| TR-044 | analytics | Dashboard Analítico | Navegar/filtrar paneles | `showDashPanel`, `setVendMode`, `selectVend`, `setTiempoMode`, `filterDDInventario` | carga analítica inicial | Datos analíticos | analytics/web | proyecciones KPI | `GET /analytics/...` | Analytics | Solo lectura; filtros consistentes | financiero según panel | AT-ANA-04 | 9–10 | COVERED |
| TR-045 | ui | Flujos RPC | Carga, éxito/error, confirmación y limpieza | helpers de mensajes, botones, recargas y limpieza | RPC de cada flujo | DOM + hojas de RPC | web/ui | idempotency_records en mutaciones | todos los endpoints | transversal | UI evita doble envío; backend garantiza | permiso del flujo | AT-UI-03 | 5–10 | COVERED |
| TR-046 | daily-closings | Cierre diario | Imprimir cierre | `imprimirReporteCierre` | — | DOM de cierre | daily-closings/reports | closings, details | `GET /daily-closings/{id}` | Vista imprimible | Solo lectura; sin mutar cierre | `closings.read` | AT-CLS-10 | 8–10 | COVERED |

## Cobertura de funciones auxiliares frontend

Las funciones auxiliares no se convierten en endpoints independientes cuando apoyan la misma acción. Su relación queda explícita:

| Grupo de FASE 0 | Destino | Filas de trazabilidad |
|---|---|---|
| Arranque, viewport, fechas y responsive (`initializeApp`, `checkMobileDevice`, `setVh`, `setDefaultDates`, `fitToContent`, `syncBodyHeight`) | shell/layout Next.js y utilidades de fecha | TR-041, TR-045 |
| Render de dashboard/alertas | componentes dashboard + TanStack Query | TR-001, TR-005 |
| Autocompletados y selectores de Entrada/Ajuste/Venta/Transferencia | componentes de producto reutilizables | TR-008, TR-012, TR-013, TR-027, TR-043 |
| Caché, búsquedas, tablas y paginación (`invalidarCacheGlobal`, renderizadores y builders) | TanStack Query + tablas/paginación servidor | TR-014–019, TR-043 |
| Carrito y total (`renderizarCarrito`, `actualizarTotalVenta`, helpers) | estado local del formulario; cálculo definitivo backend | TR-027–030 |
| Constructores/renderizadores del dashboard vigente | componentes Recharts/tabla sobre contratos analytics | TR-036, TR-044 |
| Filtros, importación CSV y resultados | reportes e imports dry-run | TR-020–024, TR-010 |
| Feed, Finanzas y cierre renderizadores | vistas de módulos respectivos | TR-014, TR-032–035, TR-046 |
| Mensajes, restauración de botón y prevención de submit | manejo transversal de estados UI | TR-045 |

## Código no enlazado y duplicado

| Función/contrato | Disposición explícita |
|---|---|
| `buscarProductoAutocompletado`, `ocultarAutocompletado`, `displaySearchResults`, `limpiarFormMovimiento`, `handleTipoChange` | No se replica como función separada; comportamiento activo equivalente queda en TR-008/TR-012/TR-043 |
| `cargarDashboardAnalitico`, `renderizarDashboardAnalitico`, `renderizarGraficoCanales`, `obtenerDatosAnaliticos` | Referencia de reconciliación KPI en TR-037; retiro solo tras DEC-028 |
| `obtenerNombreProducto`, `buscarProducto`, `autocompletarProductoPorCodigo`, `obtenerReporteVentas`, `calcularKPIsVentas` servidor | Absorbidas por endpoints de products/reports/analytics; conservar baseline en pruebas |
| Auditoría, diagnósticos, tests y reparaciones manuales | Imports/reconciliación/auditoría con disposición en TR-024, TR-038–040; no exposición operacional insegura |
| Duplicados `System_Admin`/`Utils` y declaraciones frontend repetidas | Una única implementación modular; no funcionalidad adicional |

## Cobertura de hojas y pruebas

| Control | Resultado FASE 1 |
|---|---|
| Hojas legacy | 9/9 con entidad o disposición en `legacy-to-postgresql-map.md` |
| Funcionalidades | 46/46 con destino; 0 sin mapear |
| Funciones frontend únicas | 138/138 cubiertas por fila o agrupación auxiliar |
| RPC legacy | Todas con endpoint/disposición; contratos falsamente destructivos no se reproducen |
| Pruebas de aceptación | 99/99 asignadas por módulo/fase; los IDs agrupados conservan sus casos individuales |
| Importadores | CSV legacy y XLSX futuro separados |

La validación automatizada de FASE 1 debe comprobar ausencia de celdas vacías en destino, endpoint/disposición, prueba, fase y cobertura.

## Ledger explícito de las 99 pruebas de aceptación

Este ledger permite comparar por igualdad de conjuntos con `docs/legacy/acceptance-test-matrix.md`; los rangos abreviados de la matriz principal no sustituyen estos IDs explícitos.

| Grupo | IDs cubiertos | Destino/fase |
|---|---|---|
| Ajustes | AT-ADJ-01, AT-ADJ-02, AT-ADJ-03, AT-ADJ-04 | inventory, FASE 6 |
| Administración legacy | AT-ADM-01, AT-ADM-02 | imports/resolutions, FASE 4 |
| Analytics | AT-ANA-01, AT-ANA-02, AT-ANA-03, AT-ANA-04 | analytics, FASE 9 |
| Auditoría | AT-AUD-01, AT-AUD-02 | inventory-audits, FASE 9 |
| Configuración | AT-CFG-01, AT-CFG-02, AT-CFG-03 | imports/settings/UI, FASE 2–10 |
| Cierres | AT-CLS-01, AT-CLS-02, AT-CLS-03, AT-CLS-04, AT-CLS-05, AT-CLS-06, AT-CLS-07, AT-CLS-08, AT-CLS-09, AT-CLS-10 | daily-closings, FASE 8–10 |
| Dashboard | AT-DASH-01, AT-DASH-02 | analytics/inventory, FASE 6 y 9 |
| Entradas | AT-ENT-01, AT-ENT-02, AT-ENT-03, AT-ENT-04, AT-ENT-05, AT-ENT-06, AT-ENT-07 | catalogs/stock-receipts, FASE 6 |
| Finanzas | AT-FIN-01, AT-FIN-02, AT-FIN-03, AT-FIN-04, AT-FIN-05, AT-FIN-06 | finances, FASE 8 |
| Importación | AT-IMP-01, AT-IMP-02, AT-IMP-03, AT-IMP-04, AT-IMP-05, AT-IMP-06, AT-IMP-07 | imports, FASE 3–4 |
| Inventario | AT-INV-01, AT-INV-02, AT-INV-03, AT-INV-04, AT-INV-05 | inventory/reports, FASE 6 y 9 |
| Movimientos | AT-MOV-01, AT-MOV-02, AT-MOV-03 | stock-movements/imports, FASE 4 y 6 |
| Navegación | AT-NAV-01, AT-NAV-02 | web/UI, FASE 10 |
| Productos | AT-PRO-01, AT-PRO-02 | products, FASE 6 |
| Reportes | AT-REP-01, AT-REP-02, AT-REP-03, AT-REP-04 | reports, FASE 9 |
| Ventas | AT-SAL-01, AT-SAL-02, AT-SAL-03, AT-SAL-04, AT-SAL-05, AT-SAL-06, AT-SAL-07, AT-SAL-08, AT-SAL-09, AT-SAL-10, AT-SAL-11, AT-SAL-12 | sales/imports, FASE 4 y 7 |
| Seguridad | AT-SEC-01, AT-SEC-02, AT-SEC-03, AT-SEC-04, AT-SEC-05, AT-SEC-06 | auth/roles/frontend auth cubiertos en FASE 3B; hardening y módulos operacionales continúan en FASE 11 y sus fases propias |
| Búsqueda | AT-SRC-01, AT-SRC-02 | products/inventory, FASE 6 |
| Transferencias | AT-TRA-01, AT-TRA-02, AT-TRA-03, AT-TRA-04, AT-TRA-05, AT-TRA-06 | transfers, FASE 6 |
| Tránsito | AT-TRN-01, AT-TRN-02, AT-TRN-03, AT-TRN-04, AT-TRN-05, AT-TRN-06, AT-TRN-07 | sales/daily-closings, FASE 7–8 |
| UI transversal | AT-UI-01, AT-UI-02, AT-UI-03 | web/UI, FASE 6–10 |

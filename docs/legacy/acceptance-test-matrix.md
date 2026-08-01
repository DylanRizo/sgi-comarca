# Matriz de pruebas de aceptación derivadas del legacy

## Propósito

Estas pruebas forman el contrato de comportamiento previo a la reescritura. No implican reproducir vulnerabilidades o falta de atomicidad; cuando el legacy es inseguro, el resultado funcional se conserva con garantías más fuertes.

Estados:

- `BASELINE`: reproducible con evidencia actual;
- `DECISION`: resultado final depende de `open-decisions.md`;
- `TARGET`: exigencia de `AGENTS.md` que mejora el legacy.

## Dashboard y navegación

| ID | Escenario | Precondición/acción | Resultado esperado | Estado |
|---|---|---|---|---|
| AT-DASH-01 | Cargar Dashboard General | Abrir la aplicación | Muestra productos, movimientos, sin stock, stock bajo y valor, o error visible | `BASELINE` |
| AT-DASH-02 | Filtrar alertas | Seleccionar todas/sin stock/stock bajo | Solo aparecen productos del filtro y se conserva paginación | `BASELINE` |
| AT-NAV-01 | Nueve pestañas | Activar cada enlace del sidebar | Solo la pestaña elegida queda activa; carga su contenido | `BASELINE` |
| AT-NAV-02 | Móvil | Abrir/cerrar sidebar y rotar pantalla | Navegación usable sin perder estado crítico | `BASELINE` |
| AT-UI-01 | Abrir/cerrar modales | Abrir y cerrar Venta, Transferencia y Finanzas por control visible; cerrar Transferencia también por Escape/clic exterior cuando aplique | Modal y foco/estado visible cambian sin mutar hojas; las cargas posteriores se ejecutan solo al flujo que corresponda | `BASELINE` |
| AT-UI-02 | Autocompletado, filtros y paginación | Buscar por prefijo, seleccionar sugerencia, filtrar tabla/reporte y cambiar página de Inventario, Movimientos o Finanzas | Resultado visible coincide con la carga/caché disponible; no altera datos; se muestra el riesgo de caché legacy cuando aplique | `BASELINE` |
| AT-UI-03 | Carga, confirmación y mensajes | Ejecutar una carga y una mutación válida/inválida; observar botón, confirmación, éxito/error, recarga y limpieza | La UI muestra estado comprensible y no añade una escritura distinta de la operación solicitada; la prevención legacy sigue siendo solo cliente | `BASELINE` |

## Entrada y productos

| ID | Escenario | Precondición/acción | Resultado esperado | Estado |
|---|---|---|---|---|
| AT-ENT-01 | Listas | Abrir Entrada | Unidades y grupos se cargan desde catálogos | `BASELINE` |
| AT-ENT-02 | Almacenes | Abrir Entrada | Se muestran las tres ubicaciones observadas sin hard-code UI | `BASELINE` |
| AT-ENT-03 | Autocompletar | Escribir prefijo de código | Máximo 10 coincidencias con nombre/unidad/grupo/precio | `BASELINE` |
| AT-ENT-04 | Entrada de producto existente | Cantidad válida en almacén existente | Entrada e Inventario aumentan; se crea exactamente un INGRESO | `TARGET` |
| AT-ENT-05 | Producto nuevo | Código no existente | Se crea catálogo y saldo sin duplicar código | `TARGET` |
| AT-ENT-06 | Validación | Cantidad ≤ 0, precio ≤ 0 o campo obligatorio vacío | No se modifica ninguna entidad | `TARGET` |
| AT-ENT-07 | Reintento | Enviar dos veces la misma solicitud/idempotency key | Un solo documento, saldo y movimiento | `TARGET` |
| AT-PRO-01 | Código duplicado | Intentar crear código existente | Rechazo tipado; datos sin cambios | `TARGET` |
| AT-PRO-02 | Desactivación con historial | Desactivar producto vendido/movido | No se borra físicamente; deja de estar disponible para nuevas operaciones | `TARGET` |

## Ajustes y movimientos

| ID | Escenario | Precondición/acción | Resultado esperado | Estado |
|---|---|---|---|---|
| AT-ADJ-01 | Ajuste positivo | Cantidad decimal válida y motivo | Saldo aumenta y se crea un movimiento positivo atómico | `TARGET` |
| AT-ADJ-02 | Ajuste negativo | Stock suficiente en almacén | Saldo disminuye y se crea movimiento atómico | `TARGET` |
| AT-ADJ-03 | Ajuste negativo insuficiente | Cantidad > saldo del almacén | Rechazo; no hay movimiento ni cambio de saldo | `TARGET` |
| AT-ADJ-04 | Doble envío | Repetir misma clave | Ajuste ocurre una vez | `TARGET` |
| AT-MOV-01 | Feed reciente | Abrir/avanzar página | Orden descendente, producto enriquecido y paginación estable | `BASELINE` |
| AT-MOV-02 | Inmutabilidad | Intentar editar/borrar movimiento | Operación no disponible o rechazada | `TARGET` |
| AT-MOV-03 | Movimiento legacy negativo | Importar AJUSTE con diferencia negativa | Se preserva signo y raw_data sin rechazo silencioso | `TARGET` |

## Transferencias

| ID | Escenario | Precondición/acción | Resultado esperado | Estado |
|---|---|---|---|---|
| AT-TRA-01 | Transferencia válida | Saldo suficiente; origen ≠ destino | Origen baja, destino sube y se crean movimientos/documento atómicos | `TARGET` |
| AT-TRA-02 | Mismo almacén | Origen = destino | Rechazo sin cambios | `BASELINE` |
| AT-TRA-03 | Stock insuficiente | Cantidad > saldo origen | Rechazo sin cambios | `TARGET` |
| AT-TRA-04 | Fallo durante destino | Simular error tras descontar origen | Rollback completo; ningún movimiento/documento parcial | `TARGET` |
| AT-TRA-05 | Concurrencia | Dos transferencias consumen el mismo saldo | Solo operaciones con saldo disponible se confirman; nunca negativo | `TARGET` |
| AT-TRA-06 | Idempotencia | Repetir clave de transferencia | Una sola transferencia | `TARGET` |

## Inventario y búsqueda

| ID | Escenario | Precondición/acción | Resultado esperado | Estado |
|---|---|---|---|---|
| AT-INV-01 | Tabla legacy por almacén | Abrir Inventario | Documenta el cálculo desde Movimientos: total 359 y desglose Dylan 128, Jean 102, Luden 129 | `BASELINE` |
| AT-INV-02 | Buscar tabla | Buscar código/nombre | Filtrado correcto sin alterar datos | `BASELINE` |
| AT-INV-03 | Exportar | Solicitar CSV | Archivo con producto, ubicación y saldo visibles | `BASELINE` |
| AT-INV-04 | Unicidad | Intentar dos saldos producto–almacén | Constraint impide duplicado | `TARGET` |
| AT-INV-05 | Reconciliación | Comparar importación con Excel | La hoja Inventario conserva total 366 y 135/92/139; las 157 diferencias y 4 claves sin contraparte aparecen en reporte | `TARGET` |
| AT-SRC-01 | Búsqueda general | Código, nombre o grupo | Resultados con total, mínimo y precio | `BASELINE` |
| AT-SRC-02 | Detalle de ubicación | Seleccionar producto | Muestra todas las filas legacy, incluidos candidatos duplicados | `TARGET` |

## Ventas

| ID | Escenario | Precondición/acción | Resultado esperado | Estado |
|---|---|---|---|---|
| AT-SAL-01 | Carrito | Agregar producto, cantidad, precio y almacén | Subtotal y total se actualizan; se puede eliminar línea | `BASELINE` |
| AT-SAL-02 | Venta simple completada | Un item y stock suficiente | Venta, línea, descuento y movimiento se confirman juntos | `TARGET` |
| AT-SAL-03 | Venta en tránsito | Estado pendiente | Inventario se descuenta una vez; venta no aparece en Finanzas/cierre | `TARGET` |
| AT-SAL-04 | Multi-almacén | Items de dos almacenes | Cada línea descuenta su almacén; un encabezado de venta | `TARGET` |
| AT-SAL-05 | Multi-item | Varios items | Una línea normalizada por item; total = subtotales + envío una vez | `TARGET` |
| AT-SAL-06 | Stock insuficiente | Un item no tiene saldo | Ninguna parte de la venta se crea | `TARGET` |
| AT-SAL-07 | Precio manipulado | Cliente altera subtotal/precio | Backend aplica regla de precio aprobada y guarda snapshot | `DECISION` |
| AT-SAL-08 | Concurrencia | Dos ventas compiten por saldo | Solo se confirma saldo disponible; nunca negativo | `TARGET` |
| AT-SAL-09 | Doble submit | Misma clave dos veces | Una sola venta y un solo descuento | `TARGET` |
| AT-SAL-10 | Envío con 3 líneas | Envío no divisible exactamente | Suma de prorrateos = envío total sin centavo perdido | `TARGET` |
| AT-SAL-11 | Cohorte antigua | Una celda contiene varios `CODIGO:CANTIDAD` | Importador crea items individuales y conserva texto raw | `TARGET` |
| AT-SAL-12 | Duplicado candidato | Importar uno de los cuatro pares | Se marca; no se elimina ni contabiliza según decisión pendiente | `DECISION` |

## Ventas en tránsito, confirmación y cancelación

| ID | Escenario | Precondición/acción | Resultado esperado | Estado |
|---|---|---|---|---|
| AT-TRN-01 | Listar pendientes | Existen líneas `En Tránsito` | Una venta agrupada por ID con items y total sumado | `BASELINE` |
| AT-TRN-02 | Confirmar | Venta pendiente | Estado completado; stock no vuelve a cambiar | `TARGET` |
| AT-TRN-03 | Cancelar | Venta pendiente multi-item/multi-almacén | Cada saldo se restaura exactamente una vez | `TARGET` |
| AT-TRN-04 | Confirmar dos veces | Repetir confirmación | Segunda operación no cambia nada | `TARGET` |
| AT-TRN-05 | Cancelar dos veces | Repetir cancelación | Segunda operación no repone stock | `TARGET` |
| AT-TRN-06 | Fallo en reposición | Simular error en una línea | Rollback total; estado y saldos permanecen previos | `TARGET` |
| AT-TRN-07 | Cierre con pendiente | Guardar cierre del mismo día | Comportamiento según DEC-019, sin cancelación silenciosa | `DECISION` |

## Finanzas

| ID | Escenario | Precondición/acción | Resultado esperado | Estado |
|---|---|---|---|---|
| AT-FIN-01 | Ingreso/gasto manual | Campos válidos | Se crea movimiento con Decimal exacto y actor | `TARGET` |
| AT-FIN-02 | Historial combinado | Abrir Finanzas | Ventas completadas + movimientos manuales, sin mutar fuentes | `TARGET` |
| AT-FIN-03 | Tránsito/cancelada | Consultar historial | No se cuentan como ingreso | `BASELINE` |
| AT-FIN-04 | Ingresos automáticos legacy | Importar tres filas conocidas | Se conservan como raw y no duplican ventas | `DECISION` |
| AT-FIN-05 | Permisos | Rol sin FINANCE | API y UI deniegan información financiera | `TARGET` |
| AT-FIN-06 | Decimales | Registrar monto con centavos | Se conserva exactamente; nunca float binario | `TARGET` |

## Cierres diarios

| ID | Escenario | Precondición/acción | Resultado esperado | Estado |
|---|---|---|---|---|
| AT-CLS-01 | Resumen | Fecha con ventas multi-línea | Agrupa por ID y vendedor; suma cada línea una vez | `BASELINE` |
| AT-CLS-02 | Guardar cierre | No existe cierre previo | Guarda encabezado y detalles por vendedor atómicamente | `TARGET` |
| AT-CLS-03 | Cierre duplicado | Misma fecha dos veces | Rechazo por constraint | `TARGET` |
| AT-CLS-04 | JSON legacy | Importar cuatro cierres | Detalles suman exactamente columnas totales y se conserva JSON raw | `TARGET` |
| AT-CLS-05 | Método desconocido | Venta sin etiqueta de pago | Se conserva `UNKNOWN`; no se fuerza Digital sin decisión | `DECISION` |
| AT-CLS-06 | Diferencia/tolerancia | Valores alrededor de 0.5 | Resultado sigue fórmula/tolerancia aprobadas | `DECISION` |
| AT-CLS-07 | Gastos | Fecha con gastos | Efecto en cierre sigue fórmula aprobada y está probado | `DECISION` |
| AT-CLS-08 | Reapertura | ADMIN solicita reapertura | Solo según decisión; registra auditoría completa | `TARGET` |
| AT-CLS-09 | Zona horaria | Venta cercana a medianoche Managua | Pertenece al día local correcto | `TARGET` |
| AT-CLS-10 | Imprimir cierre | Seleccionar un cierre existente y ejecutar `imprimirReporteCierre`; repetir sin tabla/datos | Abre vista imprimible legible con fecha, encargado, ventas del sistema, efectivo real, digital real, diferencia, estado, observaciones y detalle por vendedor cuando exista; elimina controles interactivos innecesarios. Sin datos muestra aviso. No altera el cierre ni sus datos. | `BASELINE` |

## Reportes y analytics

| ID | Escenario | Precondición/acción | Resultado esperado | Estado |
|---|---|---|---|---|
| AT-REP-01 | Filtros | Cargar opciones | Productos, almacenes y vendedores sin duplicados accidentales | `BASELINE` |
| AT-REP-02 | Historial | Aplicar rango/tipo/ubicación/producto/vendedor | Solo movimientos compatibles; vínculo de venta cuando exista | `BASELINE` |
| AT-REP-03 | CSV | Exportar resultado | Mismas filas/valores que tabla filtrada | `BASELINE` |
| AT-REP-04 | Impresión | Imprimir reporte visible | Encabezados, filtros y totales legibles | `BASELINE` |
| AT-ANA-01 | Dashboard vigente | Cargar | KPIs, canales, vendedores, productos, tiempo, finanzas e inventario | `BASELINE` |
| AT-ANA-02 | Reconciliar contratos analíticos | Comparar dashboard vigente con la variante legacy no enlazada | Diferencias documentadas; una definición aprobada por KPI y una decisión explícita sobre conservar o retirar el contrato no enlazado | `DECISION` |
| AT-ANA-03 | Utilidad con costo cero | Producto sin costo confiable | Margen se marca desconocido, no como utilidad plena | `DECISION` |
| AT-ANA-04 | Navegación y filtros internos | Cambiar panel, vendedor, modo temporal y filtro de inventario después de cargar analytics | Paneles y tablas se actualizan solo con los datos ya cargados; no escriben stock ni finanzas y conservan la discrepancia entre dashboards como riesgo documentado | `BASELINE` |

## Importación, auditoría y administración

| ID | Escenario | Precondición/acción | Resultado esperado | Estado |
|---|---|---|---|---|
| AT-IMP-01 | Dry-run XLSX futuro | Ejecutar el futuro importador con Excel real | DB sin cambios; reporte reproduce controles del runbook | `TARGET` |
| AT-IMP-02 | Commit transaccional | Lote válido | Entidades y relaciones completas o rollback del lote | `TARGET` |
| AT-IMP-03 | Segunda ejecución | Repetir mismo batch/archivo | Cero duplicados y cero incrementos adicionales | `TARGET` |
| AT-IMP-04 | Fila inválida | Datos incompletos | Fila en reporte con número/raw; no se descarta silenciosamente | `TARGET` |
| AT-IMP-05 | Error crítico | Simular fallo | Rollback y reporte crítico | `TARGET` |
| AT-IMP-06 | Mapeo manual | Aplicar corrección aprobada | Solo archivo de mapeo versionado cambia interpretación | `TARGET` |
| AT-IMP-07 | Importación CSV legacy | Seleccionar CSV y verificar el arreglo de ocho posiciones: nombre, variante, cantidad Luden, cantidad Dylan, cantidad Jean, código, costo y precio. Probar `;`, `,`, fila incompleta, código nuevo, valores no numéricos y una segunda ejecución. | El comentario del servidor declara `;`, pero `parsearCSV` vigente separa `,`: un archivo `;` no produce el arreglo esperado y debe documentarse como incompatibilidad, no corregirse. Un código inexistente crea producto; cantidad/costo no numéricos se convierten en 0; precio no numérico/≤0 y nombre ausente se saltan; errores por fila pueden dejar resultado parcial. Repetir una carga válida vuelve a sumar stock y movimientos. La herramienta está hard-coded a Casa Luden, Casa Dylan y Casa Jean; `DEC-026` prohíbe usarla durante la migración de producción. | `BASELINE` |
| AT-AUD-01 | Auditoría | Conteo distinto por almacén | Sesión, detalles y ajustes atómicos vinculados; aprobación previa | `TARGET` |
| AT-AUD-02 | Auditoría incompleta | Código/almacén sin conteo | Se preserva saldo y se reporta pendiente | `TARGET` |
| AT-CFG-01 | Validación completa | Ejecutar perfilador | Revisa nueve hojas y todos los controles conocidos | `TARGET` |
| AT-CFG-02 | Inicialización | Usuario no ADMIN o sistema con datos | Operación denegada/no destructiva | `TARGET` |
| AT-CFG-03 | Limpiar formularios | Activar acción UI | Solo limpia estado de formulario | `BASELINE` |
| AT-ADM-01 | Deduplicación | Ejecutar análisis | Solo marca candidatos; nunca elimina sin mapeo | `TARGET` |
| AT-ADM-02 | Recuperar fechas | Fecha ausente e ID válido | Valor derivado se guarda separado y marcado, raw intacto | `DECISION` |

## Seguridad y permisos transversales

| ID | Escenario | Resultado esperado | Estado |
|---|---|---|---|
| AT-SEC-01 | Ruta anónima de producción | Rechazo o redirección a login | `TARGET` |
| AT-SEC-02 | Rol READ_ONLY intenta mutar | API responde denegado; ninguna escritura | `TARGET` |
| AT-SEC-03 | Rol sin FINANCE consulta finanzas | Denegado en backend | `TARGET` |
| AT-SEC-04 | Texto con HTML/script en observaciones | Se muestra como texto, no se ejecuta | `TARGET` |
| AT-SEC-05 | Doble solicitud concurrente | Idempotencia/constraints impiden duplicado | `TARGET` |
| AT-SEC-06 | Mutación importante | `audit_logs` contiene actor, fecha, entidad y cambios | `TARGET` |

## Controles mínimos para la puerta de calidad 0

- Cada una de las nueve pestañas aparece al menos en una prueba.
- Los tres modales aparecen en pruebas.
- Entrada, ajuste, transferencia, venta, tránsito, confirmación, cancelación, finanzas, cierre, auditoría, reportes e importación tienen cobertura.
- Las nueve hojas tienen controles de estructura/importación.
- Las anomalías conocidas tienen prueba de reporte, no de corrección automática.

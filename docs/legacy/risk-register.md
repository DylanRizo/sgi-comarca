# Registro de riesgos de la migración

## Escala

- Severidad: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`.
- Probabilidad: `HIGH`, `MEDIUM`, `LOW`.
- Estado: todos permanecen `OPEN` durante FASE 0.

## Riesgos

| ID | Riesgo | Severidad | Prob. | Evidencia | Consecuencia | Control exigido |
|---|---|---|---|---|---|---|
| R-001 | Acceso anónimo a toda la aplicación | `CRITICAL` | `HIGH` | Manifiesto `ANYONE_ANONYMOUS` | Lectura y mutación no autorizada | Autenticación y autorización backend antes de producción |
| R-002 | Venta no atómica | `CRITICAL` | `HIGH` | Ventas se escribe antes de descontar todos los items | Venta parcial, stock incorrecto | Una transacción DB para encabezado, líneas, saldos y movimientos |
| R-003 | Transferencia no atómica | `CRITICAL` | `MEDIUM` | Rollback manual sin verificación | Pérdida/duplicación entre almacenes | Transacción con bloqueo de ambos saldos |
| R-004 | Ajuste no atómico | `HIGH` | `HIGH` | Movimiento antes de saldo; resultado de saldo ignorado | Ledger y saldo divergen | Transacción y error de dominio |
| R-005 | Entrada no atómica | `HIGH` | `MEDIUM` | Cuatro hojas secuenciales | Catálogo, entrada, saldo o movimiento incompletos | Documento + items + balance + movimiento en transacción |
| R-006 | Saldo de ledger sin almacén | `CRITICAL` | `HIGH` | `calcularStock` ignora ubicación | Reportes y validaciones incorrectos | Inventario por producto–almacén; ledger con almacén obligatorio |
| R-007 | Producto–almacén duplicado | `CRITICAL` | `HIGH` | Dos duplicados `CCWH-L`; código usa primera fila | Operación sobre saldo equivocado | Decisión de datos + constraint único |
| R-008 | Código de producto duplicado | `HIGH` | `HIGH` | Dos filas `DGGR-X` | Búsqueda/foreign key ambiguos | Mapeo aprobado + unique constraint |
| R-009 | Doble envío y ausencia de idempotencia | `CRITICAL` | `MEDIUM` | Botón se reactiva por timeout; IDs por segundo | Ventas/cancelaciones duplicadas | Idempotency key y constraint |
| R-010 | Cancelación parcial o doble reposición | `CRITICAL` | `MEDIUM` | Restaurar antes de marcar; sin transacción | Stock inflado | Estado y reposición en una transacción idempotente |
| R-011 | Importación no idempotente | `CRITICAL` | `HIGH` | Cada repetición suma saldo y movimientos | Duplicación masiva | Dry-run, batch, checksum, claves legacy y rollback |
| R-012 | Filas inválidas omitidas en importación | `HIGH` | `HIGH` | `continue` con log para datos incompletos | Pérdida silenciosa | Reporte por fila; fail-on-critical |
| R-013 | Consulta financiera destructiva | `CRITICAL` | `MEDIUM` | `obtenerHistorialFinanzas` ejecuta `deleteRow` | Pérdida de evidencia financiera | Consultas sin efectos; preservación raw |
| R-014 | Doble contabilización de ventas | `CRITICAL` | `HIGH` | Ventas dinámicas + 3 ingresos automáticos | Ingresos/utilidad inflados | Regla de reconciliación aprobada |
| R-015 | Cierre cancela pendientes automáticamente | `HIGH` | `MEDIUM` | `guardarCierreDiario` llama cancelación | Pérdida de venta legítima | Decisión humana; acción explícita y auditada |
| R-016 | Cierre ignora fallos de cancelación | `CRITICAL` | `MEDIUM` | Resultado no comprobado | Cierre guardado con stock/estado incoherente | Transacción o stop condition |
| R-017 | Fórmula de cierre ambigua | `HIGH` | `HIGH` | Gastos no entran en diferencia; tolerancia 0.5 | Cuadre contable incorrecto | Definición financiera aprobada y pruebas |
| R-018 | Método de pago inferido desde texto | `HIGH` | `HIGH` | Solo 32/404 líneas etiquetadas | Ventas antiguas clasificadas Digital | Preservar desconocido; mapeo aprobado |
| R-019 | Esquema de Ventas cambiante | `CRITICAL` | `HIGH` | 14, 16 y 17 columnas; Q mal nombrada | Pérdida de líneas/estados | Importador por cohortes y raw_data |
| R-020 | Ventas/movimientos huérfanos | `HIGH` | `HIGH` | 7 IDs sin movimiento; 8 sin venta | Reconciliación incompleta | Reportar, preservar, no sintetizar |
| R-021 | Duplicados de venta | `HIGH` | `HIGH` | 4 pares exactos | Totales y stock potencialmente duplicados | Aprobación por grupo |
| R-022 | XSS almacenado | `CRITICAL` | `MEDIUM` | 123 `innerHTML`; sin escape | Ejecución de contenido guardado en hojas | Render seguro, validación y CSP |
| R-023 | Clickjacking/embebido libre | `HIGH` | `MEDIUM` | `XFrameOptionsMode.ALLOWALL` | Operaciones inducidas | Política de frames restrictiva |
| R-024 | Funciones administrativas destructivas expuestas | `CRITICAL` | `MEDIUM` | Inicialización accesible en UI anónima | Limpieza/reencabezado de hojas | Solo ADMIN, confirmación fuerte y auditoría |
| R-025 | Sin autorización financiera | `CRITICAL` | `HIGH` | Todos ven Finanzas | Exposición de datos sensibles | Roles y filtros backend |
| R-026 | Sin auditoría general | `HIGH` | `HIGH` | Solo email en Movimientos; no audit log | Sin trazabilidad de mutaciones | `audit_logs` inmutable |
| R-027 | Precio/subtotal confiado al navegador | `HIGH` | `MEDIUM` | Venta recibe precio y subtotal cliente | Manipulación de cobro | Recalcular en backend con snapshots |
| R-028 | Identificadores por segundo | `HIGH` | `MEDIUM` | IDs `yyyyMMdd-HHmmss` | Colisiones concurrentes | UUID + número humano separado |
| R-029 | Datos sensibles en consola | `HIGH` | `MEDIUM` | Frontend registra objeto de venta | Fuga de entrega/observaciones | Logging mínimo y redactado |
| R-030 | IDs y URLs hard-coded | `HIGH` | `HIGH` | Config y Auditoría | Fuga/configuración rígida | Variables seguras y catálogos |
| R-031 | Almacenes hard-coded | `HIGH` | `HIGH` | Auditoría e importación | Nuevos almacenes ignorados | Entidad warehouses y configuración |
| R-032 | Categorías/canales/personas hard-coded | `MEDIUM` | `HIGH` | Frontend y datos | Variantes y permisos imposibles | Catálogos administrables |
| R-033 | Zona horaria y fechas mixtas | `HIGH` | `HIGH` | Date, strings y display values | Día incorrecto en migración/cierre | Origen Managua, almacenamiento UTC |
| R-034 | Errores ocultos como arreglos vacíos | `HIGH` | `HIGH` | Varios `catch` retornan `[]` | Falso “sin datos” | Errores API tipados y observabilidad |
| R-035 | Dos dashboards con cálculos distintos | `MEDIUM` | `HIGH` | Dos RPC/implementaciones | KPIs contradictorios | Definiciones únicas y consultas validadas |
| R-036 | Costo no confiable | `HIGH` | `HIGH` | costos cero y 19 códigos variables | Margen/utilidad incorrectos | Snapshot y regla de costo aprobada |
| R-037 | Caché cliente obsoleta | `MEDIUM` | `MEDIUM` | TTL cinco minutos | Venta/consulta con stock viejo | Estado remoto invalidado por mutación |
| R-038 | Duplicación de código | `MEDIUM` | `HIGH` | `System_Admin` = `Utils`; archivo JS gigante | Correcciones inconsistentes | Modularización enfocada |
| R-039 | Validación de integridad incompleta | `HIGH` | `HIGH` | No revisa 5 hojas; clampa negativos | Falsa confianza | Perfilador reproducible completo |
| R-040 | Fuentes documentales faltantes | `MEDIUM` | `HIGH` | No existen brief/arquitectura previos | Contexto de negocio incompleto | Crear/recuperar antes de decisiones de FASE 1 |
| R-041 | Contrato de delimitador CSV contradictorio | `HIGH` | `HIGH` | Comentario del servidor indica `;`; `parsearCSV` separa por `,` | Archivo aparentemente válido puede no producir ocho columnas, omitir datos o fallar sin una incompatibilidad visible para el usuario | No usar el importador legacy en migración/producción; perfilador e importador nuevo deben declarar y validar formato, columnas y errores por fila |

## Riesgos de pérdida funcional al reescribir directamente

1. Descontar inmediatamente ventas en tránsito.
2. No volver a descontar al confirmar.
3. Restaurar por línea y almacén al cancelar.
4. Prorratear envío entre líneas, pero sumar una sola vez.
5. Agrupar líneas por ID en cierres.
6. Inferir método de pago legacy desde observaciones.
7. Combinar ventas con Finanzas sin duplicarlas.
8. Conservar Entrada como acumulado separado de Inventario.
9. Preservar la auditoría externa y sus ajustes firmados.
10. Mantener los dos tipos de dashboard hasta decidir cuál es canónico.
11. Exportación CSV e impresión.
12. Filtros por producto, ubicación, vendedor, tipo y fechas.
13. Impresión del cierre diario con detalle por vendedor y sin mutar los datos.

## Puertas recomendadas

- Ninguna decisión de datos críticos se automatiza sin entrada aprobada en `open-decisions.md`.
- Ningún importador definitivo se ejecuta mientras R-007, R-008, R-014, R-019, R-020 y R-021 estén sin estrategia aprobada.
- Ninguna producción se habilita mientras R-001, R-002, R-003, R-009, R-010, R-022, R-024 y R-025 sigan abiertos.

# Decisiones humanas pendientes

Todas las decisiones salvo las reglas base de DEC-020 y DEC-021 están en estado `REQUIRES_HUMAN_APPROVAL`. La columna “comportamiento seguro para ensayo” preserva datos y evita correcciones automáticas; no es la decisión final. Las dos reglas base excepcionales ya están aprobadas por las restricciones obligatorias de `AGENTS.md`; sus detalles operativos siguen abiertos.

| ID | Decisión requerida | Evidencia/alternativas | Comportamiento seguro para ensayo | Estado |
|---|---|---|---|---|
| DEC-001 | Moneda canónica y símbolo | UI mezcla `$` y `C$`; datos no declaran moneda | Guardar valores sin conversión y moneda `UNKNOWN`/configurable | `REQUIRES_HUMAN_APPROVAL` |
| DEC-002 | Usuarios reales y vinculación de nombres | Vendedores, entregadores, responsables y emails legacy | Preservar texto original; no crear cuentas automáticamente | `REQUIRES_HUMAN_APPROVAL` |
| DEC-003 | Matriz exacta de permisos | Roles base en `AGENTS.md`, sin equivalente legacy | Denegar por defecto; Finanzas solo ADMIN/FINANCE hasta aprobación | `REQUIRES_HUMAN_APPROVAL` |
| DEC-004 | Duplicado `DGGR-X` | Productos filas 29–30 | Importar ambas como raw; bloquear resolución de código único | `REQUIRES_HUMAN_APPROVAL` |
| DEC-005 | Duplicados `CCWH-L` | Dos filas por Casa Dylan y dos por Casa Luden con valores distintos | Preservar cuatro filas en staging de importación; no sumar ni elegir “última” | `REQUIRES_HUMAN_APPROVAL` |
| DEC-006 | Cuatro líneas de venta duplicadas | Pares en filas 124–125, 176/179, 214–215, 255/257 | Importar con marca `duplicate_candidate`; excluir de totales aprobados | `REQUIRES_HUMAN_APPROVAL` |
| DEC-007 | Siete ventas sin movimiento | Ventas filas 30, 31, 38, 41, 48, 56, 75 | Conservar venta; no crear movimiento sintético | `REQUIRES_HUMAN_APPROVAL` |
| DEC-008 | Ocho IDs de movimiento sin venta | Movimientos filas 126, 189, 190, 201, 216, 251, 277, 278 | Conservar movimiento; no crear venta sintética | `REQUIRES_HUMAN_APPROVAL` |
| DEC-009 | 157 diferencias y 4 claves sin contraparte | Inventario vs último saldo comparable | Usar Inventario como saldo inicial y reportar cada diferencia | `REQUIRES_HUMAN_APPROVAL` |
| DEC-010 | Significado de `Stock Resultante` | El código calcula global; la columna incluye ubicación | Tratarlo como dato histórico informativo, no como saldo por almacén | `REQUIRES_HUMAN_APPROVAL` |
| DEC-011 | `Unidad` vs `Unidades` | 93 productos usan singular fuera del catálogo | Preservar singular; proponer mapeo explícito separado | `REQUIRES_HUMAN_APPROVAL` |
| DEC-012 | Normalización de personas | Variantes ortográficas y mayúsculas | Preservar original y generar candidatos, sin fusionar | `REQUIRES_HUMAN_APPROVAL` |
| DEC-013 | Normalización de canales | `Facebook`, `Facebook Marketplace`, 117 vacíos | Preservar; nulos permanecen desconocidos | `REQUIRES_HUMAN_APPROVAL` |
| DEC-014 | Fuente de precio vigente | Productos vs 76 filas de Inventario diferentes | Productos como precio actual solo si se aprueba; conservar snapshots de ambos | `REQUIRES_HUMAN_APPROVAL` |
| DEC-015 | Regla de costo y costos cero | 19 códigos con costos variables; cinco filas cero entre Entrada/Inventario | Conservar costo por fila; margen `UNKNOWN` cuando costo no sea confiable | `REQUIRES_HUMAN_APPROVAL` |
| DEC-016 | Estado de 401 líneas de venta | Q vacía; código las trata como Completado | Importar estado legacy nulo y una clasificación inferida separada | `REQUIRES_HUMAN_APPROVAL` |
| DEC-017 | Hora final vacía | 159 líneas; no equivale de forma segura a tránsito | Preservar nulo; no derivar estado | `REQUIRES_HUMAN_APPROVAL` |
| DEC-018 | Método de pago histórico | Solo 32 líneas etiquetadas; código clasifica resto Digital | Importar `UNKNOWN`; conservar inferencia legacy aparte | `REQUIRES_HUMAN_APPROVAL` |
| DEC-019 | Venta en tránsito al cierre | Legacy la cancela automáticamente | En ensayo, no cancelar sin acción explícita; reportar pendientes | `REQUIRES_HUMAN_APPROVAL` |
| DEC-020 | Confirmación de tránsito: regla base | Legacy cambia estado sin nuevo descuento; `AGENTS.md` exige que confirmar no vuelva a descontar | Aplicar la regla obligatoria; detalles operativos abajo | `APPROVED_BY_PROJECT_CONSTRAINT` |
| DEC-021 | Cancelación: regla base | Legacy repone por almacén pero no es atómica; `AGENTS.md` exige reposición exacta una vez e idempotencia | Aplicar la regla obligatoria; detalles operativos abajo | `APPROVED_BY_PROJECT_CONSTRAINT` |
| DEC-022 | Ingresos automáticos en Finanzas | Tres filas legacy; código vigente las elimina y deriva ventas | Conservar como raw y excluir del agregado financiero para evitar doble conteo | `REQUIRES_HUMAN_APPROVAL` |
| DEC-023 | Fórmula de diferencia de cierre | No resta gastos; tolerancia 0.5 | Reproducir cálculo en reporte comparativo, no como regla final | `REQUIRES_HUMAN_APPROVAL` |
| DEC-024 | Tolerancia `Cuadrado` | `abs(diferencia) < 0.5` | Mantener como parámetro legacy visible | `REQUIRES_HUMAN_APPROVAL` |
| DEC-025 | Reapertura de cierre | No existe en legacy; objetivo propone ADMIN | No permitir reapertura hasta definir proceso/auditoría | `REQUIRES_HUMAN_APPROVAL` |
| DEC-026 | Importación CSV legacy | No idempotente, hard-coded a tres almacenes y contrato de delimitador contradictorio (`;` documentado, `,` implementado) | No ejecutarla sobre datos reales; sustituir por importador trazable con formato declarado | `REQUIRES_HUMAN_APPROVAL` |

## DEC-020 — confirmación de venta en tránsito

### Regla ya aprobada

**`APPROVED_BY_PROJECT_CONSTRAINT`**: confirmar una venta en tránsito cambia su estado y no vuelve a descontar inventario. La evidencia legacy es `confirmarPagoVenta`, que actualiza la columna de estado sin tocar Inventario; la regla futura además es un invariante explícito de `AGENTS.md`.

### Detalles que siguen abiertos

Los siguientes detalles permanecen `REQUIRES_HUMAN_APPROVAL` y no se infieren del legacy:

- qué usuario o rol puede confirmar;
- si se exige evidencia de pago;
- si se registra fecha/hora de confirmación;
- tratamiento de confirmaciones históricas ambiguas;
- comportamiento y mensaje ante una venta ya confirmada;
- texto, evidencia y auditoría mostrados al usuario.

## DEC-021 — cancelación de venta en tránsito

### Regla ya aprobada

**`APPROVED_BY_PROJECT_CONSTRAINT`**: cancelar una venta repone cada artículo al almacén original exactamente una vez y debe ser idempotente. La evidencia legacy es `cancelarVentaEnTransito`, que intenta registrar un ingreso, sumar al inventario original y después marcar la línea; la implementación no es atómica, pero la regla futura está exigida por `AGENTS.md`.

### Detalles que siguen abiertos

Los siguientes detalles permanecen `REQUIRES_HUMAN_APPROVAL` y no se infieren del legacy:

- permisos para cancelar;
- motivos obligatorios;
- tratamiento de cancelaciones históricas;
- cancelación parcial, si llegara a permitirse;
- tratamiento financiero;
- ventana de tiempo;
- evidencia y auditoría.
| DEC-027 | Auditoría externa | URLs/almacenes hard-coded; ajuste directo | Preservar como evidencia; no ejecutar durante ensayo sin copia y aprobación | `REQUIRES_HUMAN_APPROVAL` |
| DEC-028 | Dashboard canónico | Dos implementaciones con cálculos diferentes | Conservar ambos resultados en comparación hasta reconciliar KPIs | `REQUIRES_HUMAN_APPROVAL` |
| DEC-029 | Regla de deduplicación de venta | Script ignora ID al formar huella | No ejecutar script; resolver cada candidato | `REQUIRES_HUMAN_APPROVAL` |
| DEC-030 | Fechas recuperadas desde ID | Script puede estimar hora de salida | Conservar original; derivado solo como campo marcado | `REQUIRES_HUMAN_APPROVAL` |
| DEC-031 | Tratamiento de datos privados en documentación/reportes | IDs, direcciones y observaciones reales | Reportes privados fuera de Git; docs versionadas solo con conteos/filas | `REQUIRES_HUMAN_APPROVAL` |
| DEC-032 | Fuentes documentales faltantes | No existe project brief ni arquitectura previa | Detener decisiones de FASE 1 que dependan de contexto no recuperado | `REQUIRES_HUMAN_APPROVAL` |

## Aprobaciones prioritarias antes del esquema/importador

Orden recomendado:

1. DEC-001 a DEC-003: configuración y acceso.
2. DEC-004 a DEC-010: identidad y saldos.
3. DEC-016 a DEC-019 y DEC-022 a DEC-024: ventas, finanzas y cierre.
4. DEC-011 a DEC-015: catálogos, precio y costo.
5. DEC-026 a DEC-030: herramientas legacy.

## Formato de resolución

Cada decisión aprobada debe registrarse en `docs/decisions/` con:

- identificador de esta lista;
- decisión;
- aprobadores y fecha;
- datos afectados;
- mapeo exacto;
- comportamiento en dry-run;
- rollback;
- pruebas de aceptación relacionadas.

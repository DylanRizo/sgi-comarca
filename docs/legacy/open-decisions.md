# Decisiones humanas pendientes

## Actualización FASE 4A — 2026-08-09

FASE 4A no resuelve decisiones de negocio. El dry-run preserva 2,064/2,064
filas y mantiene trazabilidad de los 24 hallazgos `blocksPhase4`.

- DEC-011 permanece abierta: ninguna `Unit` se crea por normalización textual;
  las 14 filas del catálogo quedan `UNIT_MAPPING_UNRESOLVED` salvo equivalencia
  expresamente aprobada.
- DGGR-X, CCWH-L, agrupación y cuatro pares duplicados de ventas permanecen
  `REQUIRES_HUMAN_APPROVAL`.
- DEC-004–009, DEC-015 y los aspectos pendientes de DEC-025 conservan su estado
  documentado.
- Finanzas, CierresDiarios, Movimientos, Grupos, cancelaciones y tránsito se
  preservan raw-only en este bloque.
- La importación persistente no está autorizada.

Este inventario conserva la evidencia y las alternativas identificadas en FASE 0. Los estados de DEC-015, DEC-025, DEC-031 y DEC-032 se sincronizaron posteriormente con decisiones aprobadas por el propietario; no se alteró la evidencia histórica. La columna “comportamiento seguro para ensayo” preserva datos y evita correcciones automáticas cuando una parte continúa abierta.

| ID | Decisión requerida | Evidencia/alternativas | Comportamiento seguro para ensayo | Estado |
|---|---|---|---|---|
| DEC-001 | Moneda canónica y símbolo | UI mezcla `$` y `C$`; datos no declaran moneda | Guardar valores sin conversión y moneda `UNKNOWN`/configurable | `REQUIRES_HUMAN_APPROVAL` |
| DEC-002 | Usuarios reales y vinculación de nombres | Vendedores, entregadores, responsables y emails legacy | Cuatro cuentas explícitas aprobadas; preservar otros textos sin crear cuentas automáticamente | `RESOLVED_IN_PHASE_3B` |
| DEC-003 | Matriz exacta de permisos | Roles base en `AGENTS.md`, sin equivalente legacy | La matriz inicial se cerró en ADR-007; `transfers.create` permanece sin grants | `PARTIALLY_RESOLVED` |
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
| DEC-015 | Regla de costo y costos cero | 19 códigos con costos variables; cinco filas cero entre Entrada/Inventario | Inventario define costo operativo inicial; conservar snapshots. Costos cero, variaciones, inconsistencias y margen no confiable requieren aprobación antes de import commit/analytics | `PARTIALLY_RESOLVED` |
| DEC-016 | Estado de 401 líneas de venta | Q vacía; código las trata como Completado | Importar estado legacy nulo y una clasificación inferida separada | `REQUIRES_HUMAN_APPROVAL` |
| DEC-017 | Hora final vacía | 159 líneas; no equivale de forma segura a tránsito | Preservar nulo; no derivar estado | `REQUIRES_HUMAN_APPROVAL` |
| DEC-018 | Método de pago histórico | Solo 32 líneas etiquetadas; código clasifica resto Digital | Importar `UNKNOWN`; conservar inferencia legacy aparte | `REQUIRES_HUMAN_APPROVAL` |
| DEC-019 | Venta en tránsito al cierre | Legacy la cancela automáticamente | En ensayo, no cancelar sin acción explícita; reportar pendientes | `REQUIRES_HUMAN_APPROVAL` |
| DEC-020 | Confirmación de tránsito: regla base | Legacy cambia estado sin nuevo descuento; `AGENTS.md` exige que confirmar no vuelva a descontar | Aplicar la regla obligatoria; detalles operativos abajo | `APPROVED_BY_PROJECT_CONSTRAINT` |
| DEC-021 | Cancelación: regla base | Legacy repone por almacén pero no es atómica; `AGENTS.md` exige reposición exacta una vez e idempotencia | Aplicar la regla obligatoria; detalles operativos abajo | `APPROVED_BY_PROJECT_CONSTRAINT` |
| DEC-022 | Ingresos automáticos en Finanzas | Tres filas legacy; código vigente las elimina y deriva ventas | Conservar como raw y excluir del agregado financiero para evitar doble conteo | `REQUIRES_HUMAN_APPROVAL` |
| DEC-023 | Fórmula de diferencia de cierre | No resta gastos; tolerancia 0.5 | Reproducir cálculo en reporte comparativo, no como regla final | `REQUIRES_HUMAN_APPROVAL` |
| DEC-024 | Tolerancia `Cuadrado` | `abs(diferencia) < 0.5` | Mantener como parámetro legacy visible | `REQUIRES_HUMAN_APPROVAL` |
| DEC-025 | Reapertura de cierre | No existe en legacy; objetivo propone ADMIN | Dylan/Samantha pueden reabrir con motivo, actor, timestamp, historial y audit log; plazo, cierres posteriores y nueva aprobación siguen abiertos | `PARTIALLY_RESOLVED` |
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
| DEC-031 | Tratamiento de datos privados en documentación/reportes | IDs, direcciones y observaciones reales | Fuentes, datos, respaldos, exports y reportes reales fuera de Git; documentación versionada sanitizada | `RESOLVED` |
| DEC-032 | Fuentes documentales faltantes | No existía project brief ni arquitectura previa durante FASE 0 | `docs/project-brief.md` consolida fuentes y decisiones aprobadas; mejoras futuras no bloquean FASE 1 | `RESOLVED` |

## Actualización aprobada posterior a FASE 0

### DEC-003 — bootstrap de permisos de FASE 3A

`APPROVED_BY_OWNER`:

- FINANCE se asigna a Dylan y Samantha;
- INVENTORY_MANAGER se asigna a Dylan, Samantha, Jean y Luden;
- SALES queda sin usuarios;
- ADMIN, PARTNER y READ_ONLY quedan sin usuarios ni privilegios implícitos;
- sales.cancel se asigna directamente solo a Dylan;
- transfers.create existe sin grants;
- no se crea roles.manage_financial_access.

La asignación futura de SALES, ADMIN, PARTNER o transfers.create continúa
requiriendo aprobación explícita.

### DEC-002/003 — actualización aprobada en FASE 3B

La sección anterior conserva la fotografía histórica de FASE 3A. En FASE 3B
el propietario aprobó posteriormente:

- las únicas cuentas iniciales son Dylan, Samantha, Jean y Luden;
- Dylan recibe `ADMIN`, `FINANCE`, `INVENTORY_MANAGER`, `SALES` y
  `sales.cancel` directo;
- Samantha recibe `FINANCE`, `INVENTORY_MANAGER` y `SALES`;
- Jean y Luden reciben `INVENTORY_MANAGER` y `SALES`;
- `ADMIN` recibe exactamente cuatro permisos administrativos explícitos;
- `SALES` recibe exactamente `sales.create` y
  `sales.confirm_in_transit`;
- `PARTNER` y `READ_ONLY` siguen sin usuarios y `transfers.create` sigue sin
  grants.

DEC-002 queda resuelta para las identidades iniciales. DEC-003 queda resuelta
para la matriz inicial de FASE 3B, pero continúa parcialmente abierta para
capacidades de módulos futuros, especialmente transferencias. Consulte
[ADR-007](../decisions/ADR-007-phase-3b-authentication-authorization.md) y el
[informe de cierre](../reviews/phase-3b-completion-report.md).

### DEC-015 — costo operativo inicial

`APPROVED_BY_OWNER`:

- Inventario es la fuente del costo operativo inicial;
- se conserva el snapshot histórico;
- otras fuentes divergentes no se sobrescriben silenciosamente.

`REQUIRES_HUMAN_APPROVAL_BEFORE_IMPORT_COMMIT_OR_ANALYTICS`:

- costos cero;
- costos distintos para el mismo producto entre almacenes;
- costos históricos inconsistentes;
- definición de margen cuando el costo no sea confiable.

### DEC-025 — reapertura de cierres

`APPROVED_BY_OWNER`:

- Dylan y Samantha pueden crear y reabrir cierres;
- reapertura exige motivo, actor, fecha/hora, conservación del cierre anterior y su historial, `audit_log` y ausencia de borrado físico;
- usuarios no autorizados no pueden reabrir.

Permanece `REQUIRES_HUMAN_APPROVAL`:

- límite temporal;
- reapertura cuando existen cierres posteriores;
- nueva aprobación después de modificar el cierre.

### DEC-031 — privacidad

`APPROVED_BY_OWNER` y `RESOLVED`: datos/fuentes internos no sanitizados, respaldos, exports y reportes reales permanecen fuera de Git. Los documentos versionados contienen solo reglas, conteos, referencias de fila, conclusiones sanitizadas, decisiones y arquitectura.

### DEC-032 — fuentes documentales

`RESOLVED`: `docs/project-brief.md` es la fuente autosuficiente de contexto aprobado para FASE 1. Una mejora documental futura no reabre este bloqueo.

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

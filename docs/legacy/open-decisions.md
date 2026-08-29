# Decisiones humanas pendientes

## Actualización FASE 8 — 2026-08-29

El propietario resolvió DEC-019, DEC-022, DEC-023 y DEC-024 para finanzas y
cierres diarios. La evidencia legacy se conserva sin reescribir.

- **DEC-022.** Finanzas deriva los ingresos de ventas al leer y no los
  persiste; un asiento persistido es siempre manual. La no duplicación queda
  garantizada por construcción. A diferencia del legacy, ninguna lectura borra
  filas: las automáticas originales se preservan como evidencia raw.
- **DEC-023.** Se conserva la fórmula legacy
  `diferencia = efectivo real + digital real − ventas del sistema`. Los gastos
  no participan y se presentan por separado.
- **DEC-024.** Se conserva el umbral `abs(diferencia) < 0.5`, pero
  configurable en vez de incrustado, y cada cierre registra la tolerancia
  aplicada.
- **DEC-019.** El cierre reporta las ventas en tránsito de la fecha sin
  tocarlas. Nunca cancela ni repone inventario como efecto secundario;
  cancelar sigue siendo una acción humana explícita con `sales.cancel`.

Decisión formal: [ADR-010](../decisions/ADR-010-finances-closings-rules.md).

El propietario también cerró DEC-025 el 2026-08-29: plazo de reapertura
configurable en días tras la fecha de negocio, los cierres posteriores no
bloquean, y un cierre reabierto queda reabierto sin volver a cerrarse.

## Actualización FASE 7B — 2026-08-27

El propietario resolvió DEC-014 para ventas operacionales. La pregunta
histórica se conserva: inicialmente se comparaban el precio global de Productos
y 76 observaciones diferentes de Inventario, sin una fuente aprobada. La
decisión vigente no elige ninguno de esos textos directamente ni promedia
almacenes.

`InventoryBalance` es la fuente operacional autoritativa de precio y costo para
la pareja producto+almacén de cada línea. Su unicidad materializa un solo valor
vigente: `currentUnitPrice` y `currentUnitCost`. Los valores se originaron en el
último snapshot válido ya resuelto durante Waves 1–2, conforme a DEC-005 y
DEC-015. `ProductWarehouseValuation` conserva evidencia histórica append-only,
admite múltiples observaciones y no se consulta ni se escribe al crear una
venta.

Reglas aprobadas:

- sin `InventoryBalance`, la venta se rechaza con error tipado y HTTP 422;
- el costo siempre viene de `currentUnitCost`; `NULL` se rechaza, cero se
  conserva como cero y el cliente nunca envía costo;
- `currentUnitPrice` es la referencia; el cliente puede omitir `unitPrice` o
  enviar un valor no negativo; si lo omite y la referencia es `NULL`, la venta
  se rechaza con HTTP 422;
- un precio enviado diferente de la referencia es un override explícito y
  auditado; el servidor recalcula línea, subtotal y total;
- `priceReviewRequired` o `costReviewRequired` no bloquean la venta: el evento
  de auditoría registra producto, almacén y flags de revisión.

El legacy respalda el modelo híbrido de precio: Productos prellenaba un valor
editable y aceptaba cero, mientras el backend confiaba indebidamente en precio
y subtotal del navegador. La hoja Ventas conserva precio unitario, pero no
contiene costo. Los snapshots operacionales inmutables y el cálculo canónico de
servidor son garantías nuevas de FASE 7A/7B; en particular,
`unitCostSnapshot` no representa una columna legacy de Ventas.

Decisión formal: [ADR-009](../decisions/ADR-009-sales-pricing-cost.md).

## Actualización FASE 6A — 2026-08-20

El propietario aprobó `transfers.create → INVENTORY_MANAGER`. El permiso no
proviene de `ADMIN`, no se concede a otros roles y un `UserPermission DENY`
directo continúa prevaleciendo. DEC-003 queda resuelta para transferencias.

## Actualización FASE 4B Waves 1–2 — 2026-08-09

El propietario aprobó y el dry-run temporal aplicó las siguientes decisiones:

- DEC-004: DGGR-X fila 29 canónica; fila 30 raw-only, sin merge ni código
  artificial.
- DEC-005: CCWH-L usa el snapshot más reciente para `InventoryBalance`; las
  observaciones de valoración válidas se conservan sin sumar cantidades.
- DEC-009: Inventario es la fuente autoritativa del saldo inicial; cada
  diferencia se reporta y Movimientos permanece raw-only.
- DEC-011: catálogo explícito de 14 Units y alias `Unidad → Unidades`.
- DEC-015 para Waves 1–2: costo y precio por warehouse; costo cero preservado
  con revisión, sin promedio ni sustitución.
- Warehouse: mappings exactos para Casa Dylan, Casa Luden y Casa Jean.
- Inventario filas 153 y 154: balance permitido, raw preservado y valoración
  omitida con `VALUATION_OBSERVED_AT_MISSING`; nunca se inventa una fecha.

Ventas difiere a FASE 7 la agrupación, cuatro pares duplicados, siete ventas sin
Movimiento, 28 referencias de producto y mappings de usuarios. Movimientos
operacionales y ocho IDs sin venta se difieren a FASE 6; DEC-025 a FASE 8. La
importación persistente continúa sin autorización.

## Fotografía histórica FASE 4A — 2026-08-09

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
| DEC-003 | Matriz exacta de permisos | Roles base en `AGENTS.md`, sin equivalente legacy | FASE 6A concede `transfers.create` exclusivamente a `INVENTORY_MANAGER`; sin bypass ADMIN | `RESOLVED_IN_PHASE_6A` |
| DEC-004 | Duplicado `DGGR-X` | Productos filas 29–30 | Fila 29 canónica; fila 30 raw-only; sin merge ni código artificial | `RESOLVED_IN_PHASE_4B` |
| DEC-005 | Duplicados `CCWH-L` | Dos filas por Casa Dylan y dos por Casa Luden con valores distintos | Balance usa snapshot más reciente; observaciones válidas se preservan; nunca sumar | `RESOLVED_IN_PHASE_4B` |
| DEC-006 | Cuatro líneas de venta duplicadas | Pares en filas 124–125, 176/179, 214–215, 255/257 | Importar con marca `duplicate_candidate`; excluir de totales aprobados | `REQUIRES_HUMAN_APPROVAL` |
| DEC-007 | Siete ventas sin movimiento | Ventas filas 30, 31, 38, 41, 48, 56, 75 | Conservar venta; no crear movimiento sintético | `REQUIRES_HUMAN_APPROVAL` |
| DEC-008 | Ocho IDs de movimiento sin venta | Movimientos filas 126, 189, 190, 201, 216, 251, 277, 278 | Conservar raw; no crear venta ni movimiento operacional en Waves 1–2 | `DEFER_TO_PHASE_6` |
| DEC-009 | 157 diferencias y 4 claves sin contraparte | Inventario vs último saldo comparable | Inventario manda; reportar cada diferencia; no sintetizar balance desde Movimientos | `RESOLVED_IN_PHASE_4B` |
| DEC-010 | Significado de `Stock Resultante` | El código calcula global; la columna incluye ubicación | Tratarlo como dato histórico informativo, no como saldo por almacén | `REQUIRES_HUMAN_APPROVAL` |
| DEC-011 | `Unidad` vs `Unidades` | 93 productos usan singular fuera del catálogo | Catálogo explícito de 14 Units; alias versionado `Unidad → Unidades` | `RESOLVED_IN_PHASE_4B` |
| DEC-012 | Normalización de personas | Variantes ortográficas y mayúsculas | Preservar original y generar candidatos, sin fusionar | `REQUIRES_HUMAN_APPROVAL` |
| DEC-013 | Normalización de canales | `Facebook`, `Facebook Marketplace`, 117 vacíos | Preservar; nulos permanecen desconocidos | `REQUIRES_HUMAN_APPROVAL` |
| DEC-014 | Fuente de precio vigente | Contexto histórico: Productos vs 76 filas de Inventario diferentes. Decisión posterior: `InventoryBalance` único por producto+almacén contiene los valores vigentes ya resueltos. | Leer `currentUnitPrice`/`currentUnitCost`; permitir override de precio auditado; nunca consultar `ProductWarehouseValuation` ni aceptar costo/subtotales del cliente. | `RESOLVED_FOR_PHASE_7B` |
| DEC-015 | Regla de costo y costos cero | 19 códigos con costos variables; cinco filas cero entre Entrada/Inventario | Waves 1–2 conservan costo/precio por warehouse y cero con issue; margen/analytics posteriores siguen separados | `APPROVED_FOR_WAVES_1_2` |
| DEC-016 | Estado de 401 líneas de venta | Q vacía; código las trata como Completado | Importar estado legacy nulo y una clasificación inferida separada | `REQUIRES_HUMAN_APPROVAL` |
| DEC-017 | Hora final vacía | 159 líneas; no equivale de forma segura a tránsito | Preservar nulo; no derivar estado | `REQUIRES_HUMAN_APPROVAL` |
| DEC-018 | Método de pago histórico | Solo 32 líneas etiquetadas; código clasifica resto Digital | Importar `UNKNOWN`; conservar inferencia legacy aparte | `REQUIRES_HUMAN_APPROVAL` |
| DEC-019 | Venta en tránsito al cierre | Legacy la cancela automáticamente | El cierre reporta las ventas en tránsito de la fecha y no las toca; nunca cancela ni repone inventario como efecto secundario | `RESOLVED_FOR_PHASE_8` |
| DEC-020 | Confirmación de tránsito: regla base | Legacy cambia estado sin nuevo descuento; `AGENTS.md` exige que confirmar no vuelva a descontar | Aplicar la regla obligatoria; detalles operativos abajo | `APPROVED_BY_PROJECT_CONSTRAINT` |
| DEC-021 | Cancelación: regla base | Legacy repone por almacén pero no es atómica; `AGENTS.md` exige reposición exacta una vez e idempotencia | Aplicar la regla obligatoria; detalles operativos abajo | `APPROVED_BY_PROJECT_CONSTRAINT` |
| DEC-022 | Ingresos automáticos en Finanzas | Tres filas legacy; código vigente las elimina y deriva ventas | Finanzas deriva los ingresos de ventas al leer y no los persiste; ninguna lectura borra filas; las automáticas legacy se conservan como raw y se excluyen del agregado | `RESOLVED_FOR_PHASE_8` |
| DEC-023 | Fórmula de diferencia de cierre | No resta gastos; tolerancia 0.5 | Se conserva `efectivo real + digital real − ventas del sistema`; los gastos no participan y se muestran aparte | `RESOLVED_FOR_PHASE_8` |
| DEC-024 | Tolerancia `Cuadrado` | `abs(diferencia) < 0.5` | Se conserva el umbral pero configurable, no incrustado; cada cierre registra la tolerancia aplicada | `RESOLVED_FOR_PHASE_8` |
| DEC-025 | Reapertura de cierre | No existe en legacy; objetivo propone ADMIN | Reabrir con motivo, actor, timestamp, historial y audit log; plazo configurable en días, cierres posteriores no bloquean, y un cierre reabierto no vuelve a cerrarse | `RESOLVED_FOR_PHASE_8` |
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

`APPROVED_FOR_PHASE_4B_WAVES_1_2`:

- costo y precio se conservan por warehouse, sin promedio ni valor global;
- un costo cero permanece cero y genera revisión;
- Entrada de Productos permanece raw-only y no sustituye el valor inicial.

`REQUIRES_HUMAN_APPROVAL_BEFORE_ANALYTICS`:

- definición de margen cuando el costo no sea confiable;
- uso analítico de inconsistencias históricas más allá de la preservación y
  reconciliación aprobadas.

`APPROVED_FOR_PHASE_7B_OPERATIONAL_SALES`:

- la venta lee precio/costo vigentes de la fila única de `InventoryBalance` por
  producto+almacén;
- costo `NULL` se rechaza, costo cero se usa sin sustitución;
- un valor marcado para revisión sigue siendo utilizable y deja evidencia
  saneada en auditoría;
- FASE 7B no consulta ni escribe `ProductWarehouseValuation`; su protección
  append-only continúa siendo requisito previo únicamente para un futuro
  escritor operacional de valoraciones.

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

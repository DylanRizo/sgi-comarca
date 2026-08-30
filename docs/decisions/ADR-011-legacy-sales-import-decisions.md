# ADR-011 — Decisiones de importación legacy de Ventas

- Estado: `ACCEPTED`
- Fecha: 2026-08-30
- Alcance: DEC-012, DEC-013, DEC-016, DEC-017 y la futura importación legacy de
  Ventas (Waves 3+)
- Aprobador: Dylan Rizo, propietario del proyecto

## Contexto

FASE 7 y FASE 8 están cerradas de punta a punta y su esquema está desplegado en
staging. Ninguna de esas fases reconstruye datos históricos ambiguos: cubren
ventas y finanzas **nuevas**. La hoja legacy `Ventas` conserva cuatro
ambigüedades que ninguna implementación posterior puede resolver por inferencia,
y que bloqueaban planificar la importación legacy.

La evidencia proviene de `docs/legacy/sheet-data-dictionary.md` (perfil de la
hoja `Ventas`, 404 filas, 8 de noviembre de 2025 a 29 de julio de 2026) y de
`docs/legacy/data-quality-report.md` (DQ-006, DQ-018, DQ-019).

El patrón común a las cuatro decisiones es el mismo: **un dato ausente o
inconsistente nunca se convierte en un estado operacional inferido.** El texto
original se preserva, la inferencia vive fuera del registro operacional, y
ninguna fila se descarta en silencio.

Ninguna de estas cuatro decisiones cambia el esquema ni requiere migración.

## Decisión

### DEC-012 — normalización de personas

**Datos afectados.** Hoja `Ventas`, columna E `Vendedor` (404 no vacías, 0
vacías, 4 valores únicos) y columna F `Entregador` (401 no vacías, 3 vacías, 7
valores únicos). DQ-018 registra mayúsculas y errores ortográficos en
`Entregador`.

**Mapeo exacto.**

1. `Vendedor` mapea por **texto exacto** a los cuatro usuarios ya aprobados en
   DEC-002, a través de `Sale.sellerUserId`. Los 4 valores únicos forman un
   catálogo cerrado sin ambigüedad, así que no requiere normalización. Un valor
   que no corresponda exactamente a un usuario aprobado no crea cuenta: la fila
   se reporta y `sellerUserId` queda nulo.
2. `Entregador` se preserva **tal cual** en `Sale.delivererText`, sin
   normalizar, sin fusionar y sin recortar variantes.
3. El importador emite los 7 valores únicos agrupados por similitud como
   **candidatos de normalización**, marcados `PENDING_MAPPING`. Ninguna
   agrupación se aplica automáticamente.
4. Aprobar los candidatos normaliza texto para reportes. **No existe hoy ninguna
   clave foránea de entregador a `User`** en el esquema; esta decisión no crea
   una. `sellerUserId` es la única FK de persona en `Sale`.
5. La fila legacy completa permanece íntegra en `LegacyRecord.rawData` (JSONB).

**Comportamiento en dry-run.** Reportar los 7 valores únicos de `Entregador` con
su conteo de filas y la agrupación candidata propuesta, marcados
`PENDING_MAPPING`. Cero filas descartadas, cero fusiones aplicadas.

### DEC-013 — normalización de canales

**Datos afectados.** Hoja `Ventas`, columna O `Canal Venta`: 287 no vacías, 117
vacías, 5 valores únicos. DQ-019 registra `Facebook` y `Facebook Marketplace`
como variantes separadas.

**Mapeo exacto.**

1. El texto original de cada valor se preserva en `Sale.salesChannelText`.
2. El propietario confirma que `Facebook` y `Facebook Marketplace` son el mismo
   canal de negocio. El valor **canónico es `Facebook Marketplace`**, y el alias
   versionado es `Facebook → Facebook Marketplace`. La dirección importa: la
   variante corta se resuelve hacia la larga, no al revés.
3. El alias es explícito y versionado, siguiendo el mismo patrón que
   `Unidad → Unidades` de DEC-011. No es una coincidencia difusa ni una
   normalización por similitud.
4. Las 117 filas vacías se importan como canal `UNKNOWN` **explícito**. No
   reciben un canal por defecto, ni `Facebook Marketplace` ni ningún otro.
5. Los tres valores únicos restantes se preservan tal cual, sin alias, salvo
   decisión posterior aprobada.

**Comportamiento en dry-run.** Listar los 5 valores únicos con su conteo y el
alias aplicado. Las 117 vacías se reportan aparte como `UNKNOWN` y nunca se
suman al total de un canal con nombre.

### DEC-016 — estado de las 404 líneas de venta

**Datos afectados.** Hoja `Ventas`, columna Q. Su encabezado real es
`Columna 1`, mientras el código legacy espera `Estado de Pago` (DQ-006). Solo 3
de 404 filas tienen `Completado` explícito; 401 están vacías.

**Ambigüedad determinante.** `Sale` tiene **dos** campos de estado, `status` y
`paymentStatus`. La evidencia no permite decidir si `Completado` significa
entrega cumplida o pago recibido: el encabezado real nunca fue `Estado de Pago`,
y `Completado` tampoco es un estado de pago. Las 3 filas explícitas son tan
ambiguas como las 401 vacías, solo que por una razón distinta.

**Mapeo exacto.**

1. Las **404 filas** —las 401 vacías y también las 3 con `Completado`— se
   importan con `Sale.status = LEGACY_UNKNOWN` y
   `Sale.paymentStatus = UNKNOWN`. El enum `SaleStatus` ya contiene
   `LEGACY_UNKNOWN` desde FASE 7A y `paymentStatus` ya tiene `UNKNOWN` por
   defecto: no hay cambio de esquema.
2. La clasificación que el código legacy asumiría —vacío equivale a
   `Completado`— **no se persiste en ninguna parte**. Aparece únicamente en el
   reporte de dry-run, claramente etiquetada como inferida.
3. La inferencia es recalculable en cualquier momento desde
   `LegacyRecord.rawData`, que conserva la fila cruda íntegra. No se pierde
   información al no persistirla.
4. Ninguna venta legacy queda marcada `COMPLETED` ni `PAID` por esta
   importación.

**Comportamiento en dry-run.** Reportar el conteo 3 explícitas / 401 nulas y la
clasificación inferida como columna informativa separada, nunca colapsada en el
estado operacional.

### DEC-017 — hora de finalización vacía

**Datos afectados.** Hoja `Ventas`, columna D `Hora Finalización`: 245 no
vacías, 159 vacías. El diccionario de datos ya advierte que un valor vacío **no
equivale necesariamente a tránsito**.

**Mapeo exacto.**

1. Las 159 filas conservan `Sale.completedAt = NULL`. El campo ya es nullable:
   no hay cambio de esquema.
2. `Sale.status` permanece `LEGACY_UNKNOWN`, coherente con DEC-016. **Nunca se
   deriva `IN_TRANSIT` a partir de la ausencia de hora final**, por tentadora
   que sea la hipótesis.
3. El importador reporta cuánto se solapan estas 159 filas con las 401 de
   DEC-016. Es un dato **observado** en el dry-run, no una relación asumida de
   antemano.

**Comportamiento en dry-run.** Reportar las 159 filas con hora final nula sin
asignarles estado. Cero inferencias de tránsito.

## Consecuencias

Positivas:

- ninguna de las cuatro decisiones cambia el esquema ni exige migración, lo cual
  importa porque el esquema de FASE 7A/8A acaba de desplegarse a staging;
- ningún estado operacional histórico se fabrica: 404 ventas legacy entran como
  `LEGACY_UNKNOWN` y se distinguen sin ambigüedad de las operacionales;
- la evidencia cruda sobrevive completa en `LegacyRecord.rawData` y en las
  columnas de texto específicas de `Sale`;
- el alias de canal es explícito, versionado y auditable, no una heurística.

Costos:

- las ventas legacy no serán comparables con las operacionales en reportes de
  estado hasta que exista una decisión posterior que resuelva su estado real;
- los reportes por canal mostrarán un `UNKNOWN` de 117 filas que no puede
  atribuirse;
- normalizar entregadores queda pendiente de una aprobación adicional sobre los
  7 candidatos;
- la inferencia de DEC-016 debe recalcularse cada vez que se quiera consultar,
  al no estar persistida.

## Alternativas rechazadas

- **Tratar las 401 filas vacías como `COMPLETED`**, como hace implícitamente el
  código legacy: fabricaría historial de ventas sobre un volumen alto sin
  evidencia que lo respalde.
- **Persistir la clasificación inferida en una columna nueva de `Sale`**: exige
  una migración posterior a FASE 8A y su propio gate de despliegue, y crea una
  columna que convive con `status` y puede leerse como verdad operacional. La
  inferencia ya es recalculable desde `rawData`.
- **Derivar `IN_TRANSIT` de una hora final vacía**: hipótesis intuitiva pero no
  verificable con los datos disponibles.
- **Mapear las 3 filas `Completado` a `paymentStatus = PAID`** siguiendo la
  intención del código legacy: el encabezado real nunca fue `Estado de Pago`.
- **Mapear esas 3 filas a `status = COMPLETED`** siguiendo el valor literal:
  contradice cómo el código legacy interpretaba la columna.
- **Fusionar automáticamente variantes de entregador por similitud**: fusionar
  mal a dos personas distintas contamina la atribución histórica de forma
  difícil de revertir.
- **Asignar un canal por defecto a las 117 filas vacías**: inventa analítica de
  canal que nunca se capturó.

## Rollback

Ninguna de las cuatro decisiones escribe nada hasta que exista un importador
legacy de Ventas aprobado y su propio gate. Revertir consiste en no aplicar el
mapeo: el texto crudo y `LegacyRecord.rawData` quedan intactos en todos los
casos. El alias de canal de DEC-013 puede retirarse sin pérdida de datos, porque
`Sale.salesChannelText` conserva el valor original de cada fila.

Sustituir cualquiera de estas reglas exige otra decisión aprobada. Un cambio
posterior no reescribe filas ya importadas: aplica a importaciones nuevas y
requiere su propio gate.

## Aceptación verificable

- ninguna venta legacy con la columna Q vacía queda `COMPLETED` ni `PAID`;
- ninguna venta legacy queda `IN_TRANSIT` únicamente por tener `completedAt`
  nulo;
- las 404 filas importadas presentan `status = LEGACY_UNKNOWN` y
  `paymentStatus = UNKNOWN`;
- una importación repetida produce el mismo conjunto de 7 candidatos de
  entregador y no crea ninguna entidad de persona sin mapeo aprobado;
- el reporte de ventas por canal segrega `UNKNOWN` de todo canal con nombre;
- una importación repetida no reclasifica ni duplica canales en silencio;
- el dry-run reporta el solapamiento observado entre las 159 filas de DEC-017 y
  las 401 de DEC-016;
- el campo inferido de DEC-016 no aparece en ninguna tabla ni en ningún reporte
  financiero mezclado con el estado real.

## Decisiones adyacentes que siguen abiertas

Cerrar estas cuatro **no** desbloquea por completo la importación legacy de
Ventas:

- **DEC-018** (método de pago histórico) sigue `REQUIRES_HUMAN_APPROVAL`. Solo
  32 de 404 líneas llevan etiqueta `[Pago: ...]`. El
  `paymentStatus = UNKNOWN` que fija DEC-016 es coherente con su disposición
  registrada, pero no la resuelve.
- **DEC-006** (cuatro líneas de venta duplicadas) y **DEC-007** (siete ventas
  sin movimiento) siguen abiertas.
- **DEC-026** (importación CSV legacy) sigue abierta.
- El importador legacy de Ventas **no existe todavía**: `legacySellerText`,
  `delivererText` y `salesChannelText` no están referenciados en ningún archivo
  `.ts` del repositorio.

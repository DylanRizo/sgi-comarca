# Next Gate — primer conteo físico real en staging

El 2026-08-30 el propietario seleccionó **FASE 9** como siguiente fase y
aprobó su estructura por bloques y su separación de lectura financiera. La
planificación está en
[phase-9-audits-reports-plan.md](../reviews/phase-9-audits-reports-plan.md).
Seleccionar la fase no autoriza implementar: el esquema, el cambio de RBAC y
el despliegue a staging siguen siendo gates separados.

El 2026-08-30 se completaron y verificaron directamente los bloques **9A —
esquema de auditoría física** y **9B.1 — aplicación y API**, en la rama
`migration/09-reports` (todavía sin fusionar a `main`). 9A: commits `2671d5d`
(fundación) y `b55aef9` (fix de la matriz de autorización break-glass, del
importador legacy y de una referencia de columna en la migración). 9B.1: el
módulo `inventory-counts`, sin migración nueva ni cambio de RBAC. Evidencia
completa en
[CURRENT_STATE.md § "Current inventory-count application"](CURRENT_STATE.md).
Sin UI; nada se aplicó a staging.


FASE 8 está cerrada de punta a punta en el repositorio versionado: 8A el
esquema, 8B la aplicación y API, 8C la interfaz. Todo fue verificado
directamente el 2026-08-29 contra PostgreSQL local.

El 2026-08-30 el propietario autorizó y se ejecutó el despliegue de FASE 7A
y 8A a staging (esquema y RBAC únicamente). Evidencia completa en
[CURRENT_STATE.md § "FASE 7A/8A schema deployed to staging"](CURRENT_STATE.md).
Ninguna venta, asiento o cierre real fue creado en staging; ese despliegue
no autorizó ninguno de esos, y cada uno sigue siendo un gate separado.

Con esto, FASE 7 y FASE 8 están ambas cerradas de punta a punta en el
repositorio versionado, y su esquema/RBAC ya están desplegados en staging.
Ningún módulo de negocio queda pendiente de implementación local salvo lo
que dependa de decisiones humanas todavía abiertas o de importación legacy.

Evidencia: [CURRENT_STATE.md](CURRENT_STATE.md),
[reporte de FASE 8B](../reviews/phase-8b-completion-report.md),
[reporte de FASE 8C](../reviews/phase-8c-completion-report.md),
[ADR-010](../decisions/ADR-010-finances-closings-rules.md).

## Estado actual

- **`PHASE_7A_SCHEMA_COMPLETE`**, **`PHASE_7B_COMPLETE`**,
  **`PHASE_7C_COMPLETE`**
- **`PHASE_8A_SCHEMA_COMPLETE`**, **`PHASE_8B_COMPLETE`**,
  **`PHASE_8C_COMPLETE`**
- **`PHASE_8_COMPLETE`**
- **`STAGING_PHASE_7A_8A_SCHEMA_APPLIED`** (2026-08-30; ver CURRENT_STATE.md)
- **`FIRST_STAGING_SALE_NOT_AUTHORIZED`**
- **`FIRST_STAGING_FINANCIAL_ENTRY_NOT_AUTHORIZED`**
- **`FIRST_STAGING_CLOSING_NOT_AUTHORIZED`**
- **`WAVES_3_PLUS_NOT_STARTED`**
- **`PHASE_9_PLANNING_COMPLETE`**, **`PHASE_9A_SCHEMA_COMPLETE`**,
  **`PHASE_9B_1_COMPLETE`**, **`PHASE_9B_2_COMPLETE`**,
  **`PHASE_9B_3_COMPLETE`**, **`PHASE_9C_COMPLETE`**, **`PHASE_9_COMPLETE`**
  (on `migration/09-reports`, unmerged)
- **`STAGING_PHASE_9_SCHEMA_RBAC_APPLIED`** (2026-09-01; ver CURRENT_STATE.md)
- **`FIRST_STAGING_INVENTORY_COUNT_NOT_AUTHORIZED`**
- **`NEXT_GATE = FIRST_STAGING_INVENTORY_COUNT`**

Cerrar FASE 8 no autorizó ninguna acción operacional, y desplegar su esquema
a staging tampoco autorizó ninguna. Seleccionar FASE 9 tampoco autoriza
implementarla. Cerrar 9A, 9B.1 y 9B.2 no autoriza desplegarlos ni usarlos
contra staging: ese sigue siendo un gate propio y separado.

## Bloques cerrados

### FASE 9A — esquema de auditoría física (completo, sin fusionar a `main`)

`InventoryCountSession`, `InventoryCountSessionWarehouse` e
`InventoryCountLine`, con el vínculo inmutable al ajuste generado al aprobar,
y los cuatro permisos nuevos (`inventory.audit.create`,
`inventory.audit.approve`, `reports.read`, `analytics.read`) en el manifest
como grants directos únicamente al administrador — ningún rol los recibe
todavía. La convención de nombres que evita la colisión con el
`InventoryAuditService` existente quedó resuelta a favor de
`InventoryCountSession`/`InventoryCountLine`.

### FASE 9B.1 — auditoría física, aplicación y API (completo, sin fusionar)

El módulo `inventory-counts`: crear sesión con alcance de bodegas, capturar
conteos, enviar a aprobación, aprobar generando los ajustes atómicos por la
ruta de FASE 5C, y cancelar. Sin migración nueva y sin cambio de RBAC.
Verificado directamente el 2026-08-30; detalle y reglas críticas en
[CURRENT_STATE.md § "Current inventory-count application"](CURRENT_STATE.md).

Tres decisiones se tomaron explícitamente al implementarlo, y ninguna cierra
lo que sigue abierto:

- el mismo actor puede crear y aprobar (sin segregación de funciones todavía);
- enviar/aprobar/cancelar son idempotentes por efecto, no por clave, porque el
  esquema de 9A solo tiene columnas de idempotencia para la creación;
- aprobar exige `inventory.adjust` además de `inventory.audit.approve`, porque
  delega en la ruta de ajuste que revalida ese permiso.

**Sigue abierto:** los grants por rol de los cuatro permisos nuevos (§2,
"Todavía abierto", del plan). Mientras no se decidan, el conteo físico solo es
utilizable por quien tenga los grants directos. Esa decisión no bloquea 9B.2.

### FASE 9B.2 — reportes (completo, sin fusionar)

Cuatro reportes —inventario, movimientos, ventas y finanzas— con paginación en
servidor, filtros y exportación CSV. Lectura pura. Sin migración y sin cambio
de RBAC: los índices existentes ya respaldan cada filtro.

Dos reglas quedaron enforced en el controlador, no libradas al lector: reportar
es una capacidad y no un permiso de acceso, así que cada ruta exige además el
permiso de lectura de su dominio; y las columnas de dinero exigen además
`finances.read`, emitiéndose como null cuando falta para que el CSV conserve
una sola forma. Un test comprueba que ningún reporte emite `unitCostSnapshot`,
hashes, lugar de entrega ni texto legacy.

### FASE 9B.3 — analytics (completo, sin fusionar)

KPIs de inventario y de ventas, con margen y utilidad. Sin migración y sin
cambio de RBAC. El margen cumple DEC-015: un costo ausente o cero —que los
datos usan como bandera de revisión— excluye su línea de ambos lados de la
resta, y cada respuesta declara su `marginCoverage`. Un periodo sin ningún
costo confiable reporta margen nulo, no cero.

### FASE 9C — interfaz (completo, sin fusionar)

Flujo de conteo físico, reportes con filtros y exportación CSV, y vista de
analytics. La portada dejó de ser una pantalla de diagnóstico de sesión y ahora
encabeza con el estado del inventario. `globals.css` pasó a ser un sistema de
tokens con modo oscuro y transiciones que respetan `prefers-reduced-motion`;
como está escrito contra las clases que las páginas ya usaban, re-estiliza
todas las pantallas anteriores sin renombrar nada. 32/32 E2E siguen pasando.

Con esto **FASE 9 queda cerrada de punta a punta** en el repositorio versionado.

## Gate seleccionado

### Primer conteo físico real en staging

FASE 9 está fusionada a `main` y su esquema y RBAC están desplegados en
staging desde el 2026-09-01. Lo que queda es operacional, no de
implementación: ejecutar exactamente **un** conteo físico controlado, igual
que se hizo con la primera transferencia en FASE 6.

Ese gate requiere autorización explícita propia y **no está autorizado por el
despliegue de esquema**. Aprobar un conteo escribe stock por la ruta de ajuste
de FASE 5C, así que es una mutación operacional real sobre los 357 saldos que
staging tiene hoy.

Antes de ejecutarlo hay que revalidar el target read-only; el estado descrito
en `CURRENT_STATE.md` no es verdad live indefinida.

## Pendiente sin bloquear nada

- **Push a `origin/main`.** La fusión se hizo solo en local; `main` está
  adelante del remoto. Es una decisión aparte.
- **Segregación de funciones en el conteo.** Hoy el mismo actor puede crear y
  aprobar. Con la aprobación como grant directo único, en la práctica solo el
  administrador aprueba, así que el hueco es teórico; endurecerlo sigue siendo
  una decisión abierta.

## Otros gates candidatos, no seleccionados

### A. Importación legacy de `Ventas` y `Finanzas` (Waves 3+)

El 2026-08-30 el propietario resolvió cuatro de las decisiones que bloqueaban
este gate mediante
[ADR-011](../decisions/ADR-011-legacy-sales-import-decisions.md): DEC-012
(normalización de personas), DEC-013 (canales), DEC-016 (estado de las 404
líneas de venta) y DEC-017 (hora final vacía). Ninguna de las cuatro cambia el
esquema ni requiere migración.

Sigue bloqueado por decisiones humanas todavía abiertas en
[open-decisions.md](../legacy/open-decisions.md): DEC-018 (método de pago
histórico), DEC-006 (cuatro líneas de venta duplicadas), DEC-007 (siete ventas
sin movimiento) y DEC-026 (importación CSV legacy). Ninguna regla puede
inferirse desde la implementación operacional de FASE 7 u 8.

Además, el importador legacy de `Ventas` no existe todavía: `legacySellerText`,
`delivererText` y `salesChannelText` no están referenciados en ningún `.ts` del
repositorio. Resolver las decisiones restantes habilita planificarlo; no lo
implementa ni autoriza escritura alguna.

### B. Deuda técnica menor

No es una fase; son mejoras acotadas que pueden agruparse:

- el arnés E2E ahora numera sus archivos (01-04) para fijar el orden de
  ejecución; cualquier especificación nueva debe respetar esa numeración o
  revisar la nota en `playwright.config.ts`;
- divergencia entre el plan de FASE 7B §13, que preveía `productId` y
  `warehouseId` en los `details` de los 422, y el filtro global, que siempre
  devuelve `details` vacío para toda la API;
- ~~el arranque en frío del API puede exceder el timeout de salud de 60 s del
  runner E2E; subir ese timeout es una decisión separada;~~ **Resuelto el
  2026-09-01:** `apps/web/e2e/run-e2e.mjs` pasa el deadline de 60 s a 180 s y lo
  hace configurable con `SGI_E2E_READY_TIMEOUT_MS`; el mensaje de timeout ahora
  reporta los segundos esperados. Subirlo no enmascara caídas: el bucle sigue
  abortando en cuanto el proceso hijo muere, así que solo un cuelgue silencioso
  agota el deadline. Verificado el 2026-09-01: 32/32 E2E en verde (3.4 min);
- ~~`sales-concurrency.integration.spec.ts` falla de forma intermitente bajo
  carga paralela de la suite (`SALE_CONCURRENCY_CONFLICT`) y pasa 9/9 en
  aislamiento.~~ **Resuelto el 2026-09-01:** `vitest.integration.config.ts`
  ahora fija `fileParallelism: false`. La suite de integración corre contra una
  sola instancia de PostgreSQL, así que el paralelismo de archivos inanía al
  host y agotaba el presupuesto de reintentos del bloqueo optimista; serializar
  los archivos deja como única concurrencia la que cada test ejerce a propósito.
  Verificado el 2026-09-01: 29 archivos / 305 tests en verde (~485 s). Solo
  cambia infraestructura de test; no toca código de producción, esquema ni RBAC.

## Estado operacional que permanece inalterado

- Las 1,069 filas legacy de `Movimientos` siguen sin importar.
- Las 25 filas clasificadas históricamente como transferencias siguen sin
  importar.
- Las ventas legacy continúan diferidas y sin materializar.
- `WAVES_3_PLUS_NOT_STARTED` continúa vigente.
- Los movimientos históricos del ledger nunca se editan ni eliminan a mano.
- Staging tiene ahora el esquema y RBAC de FASE 7A/8A aplicados
  (2026-08-30), verificado directamente ese día; `sales`, `sale_items`,
  `sale_cancellations`, `in_transit_confirmations`, `financial_entries`,
  `financial_categories`, `daily_closings` y `daily_closing_reopenings`
  siguen todas vacías ahí. Antes de cualquier gate operacional futuro sobre
  staging debe revalidarse el target read-only; el estado aquí descrito no
  es verdad live indefinida.

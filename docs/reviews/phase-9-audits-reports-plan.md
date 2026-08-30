# FASE 9 — Plan de auditoría física, reportes y analytics

Estado: `PHASE_9_PLANNING_COMPLETE`.

Este documento completa la planificación inicial. No autoriza implementación,
migración, cambio de esquema, bootstrap, UI ni escritura en staging.

## 1. Estado verificado

Verificado contra el código, no contra documentación previa:

- **no existe ningún modelo Prisma de auditoría física** en
  `packages/database/prisma/schema.prisma`. El único modelo con "Audit" es
  `AuditLog` (`schema.prisma:336`), que es la bitácora de mutaciones;
- **`apps/api/src/inventory/inventory-audit.service.ts` ya existe pero no es
  auditoría física**: escribe filas de `AuditLog` para ajustes y
  transferencias. El nombre colisiona con el dominio nuevo y obliga a fijar una
  convención antes de escribir código (ver §6);
- **no existe ningún permiso de auditoría, reportes ni analytics**. El manifest
  tiene 16 permisos (`manifest.ts:36-93`) y ninguno cubre FASE 9;
- FASE 7 y FASE 8 están cerradas de punta a punta, y su esquema/RBAC están
  desplegados en staging desde el 2026-08-30;
- la ruta de ajuste atómico de FASE 5C existe y está probada en
  `apps/api/src/inventory/inventory-adjustment.service.ts`.

Consecuencia de alcance: igual que FASE 8, **FASE 9 requiere una migración y un
cambio de RBAC**. `AGENTS.md` prohíbe introducir cualquiera de los dos en
silencio, así que el esquema es su propio bloque con su propio gate, y el
despliegue a staging es otro gate distinto.

## 2. Decisiones de negocio resueltas

El propietario las resolvió el 2026-08-30, al seleccionar FASE 9 como gate.

- **Estructura por bloques.** 9A esquema → 9B.1 auditoría → 9B.2 reportes →
  9B.3 analytics → 9C interfaz. Cada bloque se verifica y cierra por separado,
  siguiendo el patrón de FASE 7 y 8.
- **Separación de lectura financiera.** Los permisos nuevos son
  `inventory.audit.create`, `inventory.audit.approve`, `reports.read` y
  `analytics.read`. Los KPIs con dinero —ingresos, gastos, utilidad y margen—
  exigen **además** `finances.read`, de modo que sólo `FINANCE` los ve. Esto
  cumple la prohibición de `AGENTS.md` de mostrar información financiera a
  roles no autorizados sin inventar un rol nuevo.

### Todavía abierto

- **Los grants por rol de los cuatro permisos nuevos.** Está decidido que el
  dinero queda tras `finances.read`; no está decidido qué rol recibe
  `inventory.audit.create`, `inventory.audit.approve`, `reports.read` y
  `analytics.read`. Requiere decisión explícita antes de tocar el manifest.
- **Si crear y aprobar una auditoría pueden ser el mismo actor.** Separar los
  dos permisos permite exigir segregación de funciones, pero no la impone por
  sí solo.
- **DEC-027** sigue `REQUIRES_HUMAN_APPROVAL`. Se refiere a no ejecutar el
  script legacy de auditoría externa; no bloquea implementar el reemplazo.
- **DEC-015** mantiene margen y analytics separados: el margen sólo aplica
  donde el costo sea confiable, y existen costos cero con flag de revisión.

## 3. Reglas ya firmes

Provienen de `AGENTS.md`, del runbook de migración y de las fases cerradas:

- todo cambio de stock crea un movimiento inmutable, y no puede existir stock
  negativo. La auditoría **no** abre una segunda ruta de escritura de stock:
  reutiliza la ruta de ajuste atómico de FASE 5C;
- los movimientos históricos no se editan ni eliminan;
- no hard-codear `CASA_DYLAN`, `CASA_LUDEN` ni `CASA_JEAN`. Los almacenes se
  leen del catálogo, a diferencia del legacy;
- la auditoría legacy sustituía cantidades desde un spreadsheet externo y
  escribía ajustes en batch sin aprobación previa
  (`user-workflows.md:158-171`). Ese comportamiento **no se reproduce**: la
  aprobación precede a cualquier ajuste;
- un conteo faltante preserva el saldo y se reporta como pendiente; no se
  asume cero (`acceptance-test-matrix.md` AT-AUD-02);
- toda mutación importante registra actor, fecha, entidad y cambios en
  `audit_logs`;
- las cantidades admiten decimales y el dinero es `NUMERIC`/`Decimal`;
- paginación del lado del servidor e índices para consultas frecuentes;
- ocultar un control es presentación, no autorización: el backend decide.

## 4. Secuencia propuesta

**9A — Esquema de auditoría física.** Sesión de auditoría (fecha, almacenes
alcanzados, estado, actor creador, actor aprobador), líneas de conteo
(producto, almacén, cantidad esperada, cantidad contada, diferencia), y el
vínculo inmutable a los ajustes generados al aprobar. Constraints, guardas de
ciclo de vida e inmutabilidad al estilo de FASE 7A/8A. Migración nueva.
Permisos nuevos en el manifest. Sin API ni UI.

**9B.1 — Auditoría física, aplicación y API.** Crear sesión, capturar conteos,
calcular diferencias, aprobar y generar los ajustes atómicos delegando en la
ruta de FASE 5C. Idempotencia por actor, como en transferencias y ventas.

**9B.2 — Reportes.** Inventario, movimientos, ventas, productos, almacenes,
vendedores, canales, fechas, finanzas y cierres. Paginación en servidor,
filtros y exportación CSV. Lectura pura: ninguna ruta muta datos.

**9B.3 — Analytics.** KPIs de stock y valor de inventario, alertas, ventas por
día/semana/mes, ventas por canal, vendedores, productos más vendidos. Los KPIs
con dinero quedan tras `finances.read`. El margen declara explícitamente su
cobertura y no promedia en silencio los costos no confiables.

**9C — Interfaz.** Flujo de conteo, vistas de reportes con filtros y
exportación, y dashboard. Mismas reglas que 7C y 8C.

Cada bloque cierra con su propia verificación: unitarias, integración contra
PostgreSQL real, y Playwright para los flujos críticos que le correspondan.

## 5. Condiciones de parada

Detenerse y consultar antes de continuar si:

- la auditoría necesitara escribir stock por una ruta distinta a la de FASE 5C;
- un KPI financiero resultara accesible sin `finances.read`;
- el margen exigiera promediar o sustituir un costo marcado para revisión;
- un reporte expusiera `unitCostSnapshot`, hashes, lugar de entrega o texto
  libre legacy, que las lecturas de ventas de FASE 7B nunca emiten;
- el esquema nuevo obligara a modificar tablas de FASE 7A u 8A ya desplegadas
  en staging;
- una consulta de reportes o analytics degradara el rendimiento sin un índice
  que la respalde.

## 6. Colisión de nombres a resolver antes de 9A

`InventoryAuditService` ya existe y significa "bitácora de auditoría". El
módulo de negocio de `AGENTS.md` se llama `inventory-audits` y significa
"conteo físico". Usar el mismo nombre para ambos haría el código ambiguo justo
en el dominio donde la precisión importa más.

Propuesta: conservar `AuditLog` e `InventoryAuditService` como están, y nombrar
el dominio nuevo con términos de conteo físico —por ejemplo
`InventoryCountSession` e `InventoryCountLine`, en un módulo `inventory-counts`
que materializa el módulo de negocio `inventory-audits`. Requiere confirmación
del propietario antes de escribir el esquema.

## 7. Estado al cerrar esta planificación

- **`PHASE_9_PLANNING_COMPLETE`**
- **`PHASE_9A_NOT_STARTED`**
- **`NEXT_GATE = PHASE_9A_SCHEMA`**

Planificar no autoriza implementar. El esquema, el cambio de RBAC y cualquier
despliegue a staging son gates separados, cada uno con su propia autorización
explícita.

# FASE 8C — Reporte de cierre de la UI de finanzas y cierres

Estado: `PHASE_8C_COMPLETE`.

Este documento cierra FASE 8C y, con ella, la fase 8 completa: 8A esquema, 8B
aplicación y API, 8C interfaz. No autoriza staging, importación legacy ni
ninguna venta o cierre real.

## 1. Alcance implementado

UI en español sobre la API de FASE 8B, siguiendo las mismas reglas que FASE
7C:

- listado combinado de finanzas (asientos manuales + ingreso de ventas
  derivado, nunca mostrado como editable ni asiento persistido), con filtros
  por tipo, origen, categoría y fecha, y totales del período;
- diálogo de asiento manual, con categoría y tipo validados, `Idempotency-Key`
  y prevención de doble envío;
- listado de cierres con filtros; detalle con cifras congeladas e historial
  de reaperturas;
- diálogo de creación de cierre; el servidor resuelve ventas del sistema,
  diferencia y cuadre — el cliente nunca los calcula ni los envía;
- acción de reapertura, con motivo obligatorio, visible solo si el cierre
  sigue `CLOSED` y el actor tiene `closings.reopen`.

Ocultar un enlace o botón es presentación; el backend autoriza cada solicitud.
`finances.read`/`closings.read` no exponen nada que la API no exponga
primero.

Sin endpoint de directorio de usuarios, el campo de responsable del asiento
manual se precarga con el propio actor y queda editable — decisión deliberada
documentada en el commit, no un vacío sin explicar.

## 2. Hallazgos corregidos durante la construcción

- **Mensaje de error 403 incorrecto entre módulos.** `read-error.ts`
  (compartido por inventario, ventas y ahora finanzas) mencionaba
  literalmente "el permiso inventory.read" en cualquier 403, incluidos los de
  ventas y finanzas. Corregido a un mensaje genérico.
- **Colisión de texto en el detalle de cierre.** La etiqueta del campo de
  fecha de cierre decía "Cerrado", igual que el badge de estado "Cerrado",
  ambiguo para lectores de pantalla y para pruebas. Renombrada a "Fecha de
  cierre".
- **Fragilidad de orden en el arnés E2E, ahora resuelta de raíz.**
  `02-inventory.e2e.ts` asume un conteo global exacto de productos, válido
  solo si ningún producto vendido (inmutable por FASE 7A/8A) existe todavía
  en la base compartida. Agregar `04-finances.e2e.ts` rompió el orden
  alfabético accidental que lo protegía. Se numeraron los cuatro archivos
  (01–04) y se documentó la razón en `playwright.config.ts`, en vez de seguir
  dependiendo del azar del orden alfabético.
- **`seedInventoryReadFixtures` asumía que `reset()` siempre podía borrar
  `E2E-UNIT`.** Ahora un producto vendido puede legítimamente mantener viva
  esa unidad entre pruebas; el fixture pasa a `upsert`, igual que ya hacían
  las fixtures de ventas.

## 3. Verificación ejecutada

Directamente en esta sesión, contra el destino verificado positivamente:
`sgi-comarca-postgres-1`, `postgres:18.4-alpine`, saludable, `localhost:5433`,
`sgi_comarca_dev` / `sgi_dev`.

- `pnpm lint`: 8/8 tareas;
- `pnpm typecheck`: 7/7 tareas;
- `pnpm test`: 58 archivos / 203 pruebas;
- `pnpm build`: 7/7 tareas;
- `pnpm format:check`: limpio;
- `pnpm test:e2e`: **32/32 Chromium** (24 de regresión previa + 8 nuevas de
  finanzas/cierres), bases temporales limpiadas (`pg_terminate_backend` en 0
  filas, `DROP DATABASE`), `next-env.d.ts` restaurado a su versión
  versionada.

Revisión de seguridad manual sobre la UI nueva: sin `console.*` ni valores de
idempotencia renderizados en el DOM; permisos exactos por control; ningún
dato financiero mostrado antes de que la API lo entregue.

## 4. Estado

- `PHASE_7A_SCHEMA_COMPLETE`, `PHASE_7B_COMPLETE`, `PHASE_7C_COMPLETE`;
- `PHASE_8A_SCHEMA_COMPLETE`, `PHASE_8B_COMPLETE`, `PHASE_8C_COMPLETE`;
- `PHASE_8_COMPLETE`;
- `STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`;
- `FIRST_STAGING_SALE_NOT_AUTHORIZED`;
- `WAVES_3_PLUS_NOT_STARTED`.

Cerrar FASE 8 cierra la implementación versionada de finanzas y cierres
diarios de punta a punta: esquema, API y UI. No autoriza despliegue a
staging, importación legacy ni ninguna escritura operacional real. El
siguiente gate queda a elección del propietario.

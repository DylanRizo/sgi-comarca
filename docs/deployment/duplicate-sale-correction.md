# Anulación de duplicados pagados

## Archivos y comprobaciones

- `packages/database/prisma/schema.prisma` y migración
  `20261019040000_duplicate_sale_correction`: enlaces, unicidad y coherencia.
- `apps/api/src/sales/void-duplicate-sale.service.ts`: comando atómico;
  `restore-sale-inventory.ts`: reposición compartida con la cancelación anterior.
- `sales.controller.ts`, DTO, select y mapper: API privada y lectura del pago.
- `apps/web/components/sales/void-duplicate-sale-panel.tsx` y
  `sale-detail-view.tsx`: revisión, confirmación, reintentos y trazabilidad.
- `apps/api/src/finances/daily-closing.service.ts` y `closing-preview.service.ts`:
  exclusión mutua por fecha y lectura del medio de pago reasignado.
- Pruebas: integración del comando, inventario exacto de triggers, mapper,
  presentación y los recorridos Chromium de Ventas/Finanzas.

Los comandos de validación son `pnpm lint -- --concurrency=1`,
`pnpm typecheck -- --concurrency=1`, `pnpm test -- --maxWorkers=1`,
`pnpm test:integration -- --maxWorkers=1`, `pnpm build -- --concurrency=1`,
`pnpm db:validate` y
`pnpm --filter @sgi/web test:e2e --project=chromium 03-sales.e2e.ts 04-finances.e2e.ts`.
Las pruebas usan bases temporales locales, nunca staging.

## Uso

Sólo el administrador activo con permiso efectivo `sales.cancel` puede usar
**Anular venta duplicada** en una venta completada y pagada. Debe proporcionar
el número completo de la venta correcta, revisarla, escribir un motivo y
confirmar que todo el stock equivocado sigue en sus bodegas originales.

La venta correcta tiene que estar completada, sin pagar, con la misma fecha,
moneda y total. No admite correcciones previas ni un día con cierre, incluso
reabierto. Si se devolvió dinero, no existe una venta correcta o sólo parte del
inventario regresó, detenerse: este flujo no corresponde.

Se conservan líneas, movimientos originales y el pago original. La anulada
deja de sumar ingresos/analytics por su estado `CANCELLED`; la correcta conserva
su descuento y resuelve el mismo pago mediante el documento de corrección. No
hay otro ingreso, gasto, recibo de pago ni devolución de dinero.

Si se pierde la respuesta, reintentar **la misma corrección**. No cambiar número
ni motivo mientras el resultado sea incierto. Se puede actualizar el detalle
para verificar ambos documentos; nunca aplicar otro ajuste manual.

## Gate de staging

1. Obtener aprobación explícita de publicación/despliegue y de la migración
   `20261019040000_duplicate_sale_correction`. No hay bootstrap/RBAC nuevo.
2. Revalidar proyecto, rama, base, rol, conexión directa y migraciones en sólo
   lectura. Comprobar estado, importes, pagos, líneas y saldos de ambas ventas.
3. Crear y verificar el checkpoint operacional antes de cualquier escritura.
   Si Neon impide crear una rama por su límite, detener ese procedimiento. Sólo
   con autorización explícita puede sustituirse por un backup privado fuera de
   Git: conexión directa con TLS verificado y origen de sólo lectura, formato
   custom, checksum, `pg_restore --list` y restauración completa en una base
   temporal local aislada. Comparar las huellas de tablas protegidas, eliminar
   únicamente la base temporal creada y conservar el respaldo privado. No borrar
   ramas existentes ni reutilizar un respaldo antiguo sin aprobación. Repetir
   este checkpoint antes de la corrección concreta, ya con el esquema nuevo.
4. Aplicar sólo la migración aprobada; no corregir datos durante el arranque.
5. Desplegar primero API y después web en el commit aprobado; comprobar health,
   readiness, privacidad y compatibilidad de las consultas anteriores.
6. Revalidar el par concreto y su autorización antes del comando privado desde
   una sesión autenticada. No usar SQL manual para editar/borrar el historial.
7. Verificar una cancelación, un movimiento positivo por línea original, el
   pago original intacto, dos eventos de auditoría correlacionados y los saldos.
   Los datos ajenos al par y los cierres deben conservarse.
8. Mantener evidencia real fuera de Git y limpiar el destino del proceso.

Después de la primera corrección la API anterior no interpreta la reasignación
de pago; no volver a ella a ciegas. Ante un fallo detener escrituras y usar un
forward fix o la recuperación aprobada. No restaurar el checkpoint sobre
actividad posterior sin una autorización de incidente.

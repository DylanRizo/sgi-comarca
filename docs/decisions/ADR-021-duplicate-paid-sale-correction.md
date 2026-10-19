# ADR-021 — Anulación de una venta duplicada con reasignación del cobro

- Estado: `ACCEPTED_FOR_IMPLEMENTATION`.
- Fecha: 2026-10-18.
- Aprobación: el propietario solicitó anular un registro con producto equivocado
  cuya venta correcta ya estaba registrada y aprobó expresamente conservar y
  reasignar el cobro existente. Los identificadores reales quedan fuera de Git.

## Alcance

Esta excepción acotada amplía ADR-018 y DEC-021; no introduce borrado físico,
reembolsos, cancelación parcial ni edición de líneas o documentos históricos.
La cancelación anterior de ventas en tránsito pendientes permanece igual.

1. Una venta operacional `COMPLETED + PAID` puede anularse por duplicado sólo
   contra otra venta operacional `COMPLETED + PENDING`, distinta, con igual
   total, moneda y fecha de negocio. Ambas deben carecer de otras correcciones.
2. Requiere usuario activo con `sales.cancel` efectivo y el rol `ADMIN` vigente.
   Se reutiliza el permiso reservado; no se añade ni concede ningún permiso.
3. El administrador proporciona motivo y confirma que todo el inventario del
   registro equivocado sigue en, o ha regresado a, sus bodegas originales.
4. Un documento inmutable `SaleCancellation` vincula venta original, venta
   correcta y `SalePayment` original. La operación devuelve todas las líneas
   originales exactamente una vez mediante `SALE_CANCELLATION`, cambia la
   original a `CANCELLED` y marca la correcta `PAID` en una sola transacción.
5. No se edita, copia ni elimina el pago. La lectura de la venta correcta
   resuelve ese mismo documento, fecha, importe, método y registrador mediante
   el vínculo; ambas pantallas explican la reasignación. El pago de la anulada
   es evidencia histórica, no otro ingreso ni una devolución de dinero.
6. No se descuentan otra vez los artículos correctos ni se alteran sus precios,
   cantidades, vendedor, fecha, método logístico o movimientos originales.
   Los ingresos y analytics siguen contando sólo ventas `COMPLETED`.
7. Se rechaza cualquier día con un cierre existente, incluso reabierto. El
   comando y la creación de cierres comparten un lock por fecha antes de leer
   cifras. No se recalculan snapshots cerrados.
8. Un pago sólo puede reasignarse una vez y una venta sólo puede recibir una
   reasignación. No hay cadenas ni ciclos de correcciones en esta versión.
9. La idempotencia es persistente, por actor y hash de intención; repetir con
   igual intención no duplica saldo, documentos, pagos ni auditoría.

## Gates

La aprobación autoriza implementación y pruebas locales. Migración, publicación,
despliegue y la corrección concreta en staging conservan gates explícitos y un
checkpoint verificado antes de escribir. No hay backfill automático.

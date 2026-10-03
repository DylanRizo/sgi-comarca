# ADR-018 — Registro operacional de pagos de ventas

- Estado: `ACCEPTED`
- Fecha: 2026-09-26
- Alcance: ventas operacionales completadas y RBAC de pagos
- Aprobador: propietario del proyecto

## Contexto

Entrega y pago son estados independientes. Las ventas operacionales nacen con
`paymentStatus = PENDING`, y confirmar una entrega sólo cambia el estado de
cumplimiento. Aunque la base admitía la transición `PENDING → PAID`, no existía
un comando, documento, permiso ni interfaz que pudiera realizarla. Por ello una
venta completada permanecía visualmente pendiente para siempre.

## Decisión

1. Sólo una venta `OPERATIONAL`, `COMPLETED` y `PENDING` admite registrar pago.
2. V1 admite únicamente pago total. Pagos parciales, devoluciones y reembolsos
   quedan fuera de alcance.
3. Cada pago crea exactamente un documento `SalePayment` inmutable con el total
   y moneda de la venta, método requerido, instante UTC generado por servidor y
   usuario responsable.
4. El documento se inserta antes de cambiar `paymentStatus` a `PAID`; un trigger
   impide la transición sin evidencia o con importe/moneda distintos.
5. El comando es transaccional, actor-scoped e idempotente. No modifica saldos,
   movimientos de inventario, líneas, totales ni estado de entrega.
6. `sales.record_payment` se concede al rol `SALES`; un `DENY` directo continúa
   prevaleciendo. Backend y UI verifican el permiso de manera independiente.
7. Las ventas canceladas conservan su valor histórico `PENDING`, pero la UI
   muestra “No aplica” porque ya no existe un cobro elegible.
8. Esta decisión no cambia DEC-022: Finanzas continúa derivando ingresos según
   ventas completadas. Cambiar a reconocimiento por cobro requiere una decisión
   contable separada y no reescribe cierres históricos.

## Consecuencias

- Se conserva evidencia de quién registró el cobro, cuándo y por qué método.
- Una respuesta perdida se puede reintentar sin duplicar pagos ni auditoría.
- No existe edición ni reversión del pago en V1. Un error operativo requiere un
  flujo futuro de corrección/reembolso, no una edición manual del historial.
- La migración, bootstrap RBAC y despliegue de staging mantienen sus gates
  operacionales separados.

## Aceptación verificable

- PostgreSQL rechaza pago en tránsito, importe distinto, actualización directa
  de estado sin documento y cualquier edición o borrado del documento.
- API rechaza falta de permiso, estado inválido, método vacío y reutilización de
  idempotencia con otra intención.
- Repetir el mismo comando crea un solo documento y un solo evento de auditoría.
- Playwright confirma el recorrido completo y que inventario no cambia.

# ADR-022 — Pago híbrido con un recibo y partidas inmutables

- Estado: `ACCEPTED_FOR_IMPLEMENTATION`
- Fecha: 2026-10-19
- Aprobador: propietario, mediante la solicitud de revisar, corregir, implementar y desplegar PR #10.
- Alcance: liquidación total de una venta operacional completada en una sola operación.

## Contexto y revisión de la propuesta

Un cliente puede liquidar una venta combinando efectivo y medios digitales.
PR #10 proponía quitar el recibo único por venta, pero sólo incluía contratos,
DTO y documentación. El CI fallaba porque el controlador enviaba un método
opcional al servicio que todavía exigía un string. Tampoco existían persistencia,
comando de cobro dividido, interfaz ni pruebas del nuevo recorrido.

Eliminar la unicidad de `sale_payments.sale_id` habría invalidado ADR-021,
que reasigna exactamente un recibo existente sin copiar ni alterar el pago.
Exponer el primer importe parcial como `payment.amount` también habría roto
la semántica del detalle existente. Se corrige la solución técnica conservando
las reglas de pago total y el historial de ADR-018/ADR-021.

## Decisión

1. Mantener la relación única `Sale -> SalePayment`, su importe total, moneda,
   actor, fecha, hashes e inmutabilidad. Para un pago híbrido se añaden de una a
   diez `SalePaymentPart` inmutables, con posición, método e importe.
   El formulario comienza con dos líneas. No se registran abonos en momentos
   diferentes, saldo a crédito, pagos pendientes parciales ni reembolsos.
2. El comando privado existente acepta exactamente una modalidad:
   `{ paymentMethodText }` o `{ splitPayments: [{ methodText, amount }] }`.
   Rechaza ambos campos, ninguno, nulos, listas vacías o mayores de diez.
   Cada importe dividido es positivo, usa hasta dos decimales y respeta los
   límites monetarios del servidor. El método se recorta y se limita a 160
   caracteres. La suma debe igualar exactamente el total, en centavos enteros,
   nunca aritmética binaria de punto flotante.
3. Una sola transacción autoriza `sales.record_payment`, bloquea la venta,
   crea el recibo y sus partidas, marca `PAID` y registra la auditoría.
   No modifica inventario ni crea asientos financieros. La identidad/idempotencia
   del recibo sigue siendo la unidad de cobro, no cada medio.
4. La migración aditiva `20261019160000_sale_payment_parts` no elimina la
   unicidad ni reemplaza los controles de ADR-021. Añade la tabla, restricciones,
   dos funciones y cuatro triggers. Las partidas sólo se insertan mientras la
   venta de origen está completada y pendiente; no pueden agregarse después
   de cobrar. Son inmutables y una comprobación diferida exige, al commit, el
   estado pagado y la suma exacta si hay partidas. Un recibo nuevo tampoco
   puede quedar confirmado sin liquidar la venta.
5. Se mantienen los hashes canónicos de solicitudes antiguas de pago único.
   El hash híbrido cubre la venta y todas las líneas normalizadas, incluyendo
   sus importes. Un reintento con la misma clave y el mismo contenido devuelve
   el recibo existente; una intención distinta con esa clave se rechaza.
   Las solicitudes concurrentes nunca crean otro recibo o juego de partidas.
   La auditoría conserva `sales.payment_recorded` y añade el desglose cuando
   corresponde; no registra claves, cookies ni hashes.
6. `SaleView.payment` sigue representando el recibo **total**. El campo aditivo
   `payments` expone sus partidas con el actor, moneda y fecha heredados del
   recibo; los recibos anteriores y pagos únicos devuelven una sola línea.
   Los pagos antiguos no se reescriben ni se les inventa un desglose.
7. La reasignación de ADR-021 continúa enlazando el mismo recibo y, por ello,
   todas sus partidas. El registro equivocado deja de contar por su estado
   cancelado; el correcto muestra el pago híbrido intacto. No se copian recibos,
   partidas, ingresos ni movimientos de la venta correcta.
8. El preview de cierres usa primero el recibo efectivamente registrado o
   reasignado y distribuye sus partidas por medio. Efectivo/cash es efectivo;
   digital, tarjeta, transferencia y sus variantes explícitas documentadas en
   el clasificador son digitales. Un método desconocido o texto combinado
   sin importes va a `unspecified`; no se adivina un reparto.
   Si no hay recibo (venta pendiente o legacy), se conserva el fallback al
   texto original y total. Cada venta cuenta una vez por vendedor.
   No cambia el reconocimiento de ingresos: sólo ventas completadas, con
   canceladas y tránsito excluidos. No cambia la fórmula ni los snapshots
   históricos de cierres; no se recalculan asientos o cierres persistidos.
9. La interfaz ofrece Pago único o Pago híbrido/mixto; muestra total, asignado
   y restante. Sólo permite confirmar el híbrido con importes válidos y
   restante cero. El detalle muestra el desglose y el total del único recibo.
   Ante respuesta perdida o inválida conserva clave, importes e intención,
   bloquea su edición y ofrece reintentar exactamente la misma solicitud.
   Renueva CSRF al reintentar; un rechazo posterior no borra la incertidumbre
   del primer envío.
10. La autorización existente no cambia. No se añade permiso, rol, ruta pública,
    dependencia ni tarea automática de backfill.

## Validación y errores

- Errores estructurales o modalidad ambigua: HTTP 400.
- `SALE_PAYMENT_AMOUNT_INVALID`: HTTP 400 para importes inválidos, no positivos,
  fuera de límites o con demasiados decimales.
- `SALE_SPLIT_PAYMENT_SUM_MISMATCH`: HTTP 400 cuando la suma no cubre el total.
- Se conservan los errores de autorización, estado e idempotencia anteriores.
- El pago único de una venta de total cero sigue siendo compatible; una partida
  híbrida de importe cero nunca es válida.

## Aceptación y despliegue

Probar centavos exactos, autorización/CSRF, forma exclusiva, límites, rollback
completo, concurrencia, reintentos, inmutabilidad, lectura de pagos anteriores,
cierres por vendedor y reasignación de un recibo híbrido mediante ADR-021.
Revisar móvil en claro/oscuro y respuestas perdidas sin crear ventas reales.

Aplicar la migración únicamente con gate explícito, destino directo verificado
y un checkpoint privado recuperable; no usar un backup antiguo como autorización.
Desplegar API antes de web y comprobar la privacidad de las rutas existentes.
Conservar evidencia operativa fuera de Git. Después de registrar el primer
recibo con partidas, no volver a una API antigua que ignora su desglose.

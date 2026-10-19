# ADR-022 — Registro de pagos divididos (Split Payments) y pagos mixtos en ventas operacionales

- Estado: `PROPOSED_FOR_IMPLEMENTATION`
- Fecha: 2026-10-19
- Alcance: ventas operacionales completadas, registro de pagos múltiples, cierre de caja diario
- Aprobador: propietario del proyecto

## Contexto

En la operación comercial cotidiana de La Comarca (tanto en mostrador físico como en entregas con repartidor), los clientes frecuentemente solicitan liquidar una misma venta combinando dos métodos de pago (ejemplo: C$ 400.00 en efectivo y C$ 600.00 mediante tarjeta o transferencia bancaria en una orden de C$ 1,000.00).

La arquitectura actual, establecida en ADR-018, fijó una premisa deliberadamente restrictiva para V1:
> *"Cada pago crea exactamente un documento `SalePayment` inmutable con el total y moneda de la venta... Pagos parciales, devoluciones y reembolsos quedan fuera de alcance."*

Esta restricción se encuentra blindada en múltiples capas:
1. **Base de Datos:** La tabla `sale_payments` cuenta con la restricción `CONSTRAINT "sale_payments_sale_id_key" UNIQUE ("sale_id")`, prohibiendo más de un registro de pago por venta.
2. **Trigger PostgreSQL:** `guard_sale_payment_insert()` aborta cualquier inserción cuyo `NEW.amount` sea distinto a `sale_total`.
3. **Cierre Diario:** `closing-preview.service.ts` clasifica el total íntegro de la venta (`sale.total`) en `cash` o `digital` basándose en el texto único `paymentMethodText`. Si un cajero intenta escribir "Efectivo / Tarjeta", el monto completo cae en `unspecified` o se asigna a un solo rubro, descuadrando el arqueo físico de la gaveta de efectivo (`realCash`) al final de la jornada.

## Decisión

1. **Relación 1 a N (`Sale` → `SalePayment[]`):**
   Se relaja la restricción `UNIQUE ("sale_id")` en la tabla `sale_payments` a un índice estándar `sale_payments_sale_idx`. Una venta puede tener uno o múltiples registros de pago inmutables.

2. **Validación atómica de suma de pagos:**
   Se admite registrar pagos divididos mediante el comando de cobro. El payload puede enviar un pago único tradicional (`paymentMethodText`) o una lista de desgloses (`splitPayments: [{ methodText, amount }]`).
   - Cada línea de pago debe tener `amount > 0` con un máximo de 2 decimales.
   - La suma exacta de los montos debe ser igual al `total` de la venta (`sum(amounts) === sale.total`).
   - La operación se ejecuta en una sola transacción atómica bajo bloqueo exclusivo de la venta (`FOR UPDATE`). Al completarse, la venta transiciona a `paymentStatus = 'PAID'`.

3. **Trigger de Coherencia en PostgreSQL:**
   Se actualiza `guard_sale_payment_insert()` para verificar que:
   - La venta esté en estado `OPERATIONAL`, `COMPLETED` y `PENDING`.
   - La suma acumulada de los pagos existentes más `NEW.amount` no exceda `sale.total`.
   - La moneda de cada pago coincida con `sale.currency_code`.

4. **Arqueo Exacto en Cierre Diario (`DailyClosing`):**
   `closing-preview.service.ts` y `daily-closing.service.ts` se actualizan para calcular las contribuciones por cajero/vendedor iterando sobre **cada documento individual `SalePayment`** en lugar de sobre la venta global:
   - Cada pago con método normalizado `efectivo` / `cash` suma a `entry.cash`.
   - Cada pago con método normalizado `digital` / `tarjeta` / `transferencia` suma a `entry.digital`.
   - Si una venta de C$ 1,000.00 se pagó C$ 400.00 en efectivo y C$ 600.00 en tarjeta, el cierre diario exige en caja exactamente C$ 400.00 en efectivo físico y C$ 600.00 en saldo digital, logrando un arqueo de caja exacto al centavo.

5. **Retrocompatibilidad Total:**
   - Las ventas históricas con un solo pago continúan leyendo su pago sin alteraciones.
   - En `@sgi/contracts`, `SaleView` mantiene `payment: SalePaymentView | null` (apuntando al primer pago o pago representativo) y añade `payments: SalePaymentView[]` para vistas que deseen mostrar el desglose completo.
   - Si una venta futura o histórica no tiene desglose en `SalePayment`, el cálculo de cierre diario mantiene su fallback a `sale.paymentMethodText`.

6. **Interfaz de Usuario (Web POS):**
   En el panel de cobro (`sale-lifecycle-actions.tsx`):
   - Se ofrece un selector: **Pago único** (Efectivo o Digital) o **Pago dividido / mixto**.
   - En modo dividido, la interfaz muestra dos o más filas de captura (por defecto: Efectivo y Tarjeta/Digital), calculando en tiempo real:
     - `Total venta`: C$ X,XXX.XX
     - `Total asignado`: C$ X,XXX.XX
     - `Diferencia / Restante`: C$ X,XXX.XX
   - El botón "Confirmar pago" permanece deshabilitado hasta que la diferencia sea exactamente C$ 0.00.

7. **Errores de Dominio Tipados:**
   Se incorporan a `SalesPublicErrorCode`:
   - `SALE_SPLIT_PAYMENT_SUM_MISMATCH`: Error HTTP 400 si la suma de pagos no coincide con el total.
   - `SALE_PAYMENT_AMOUNT_INVALID`: Error HTTP 400 si algún monto es menor o igual a cero o presenta más de 2 decimales.

8. **Idempotencia y Auditoría:**
   - La clave de idempotencia cubre el hash canónico del arreglo completo de pagos.
   - Se registra un evento de auditoría `SALE_PAID` que documenta el total cobrado y el número de líneas de pago emitidas.

## Consecuencias

### Positivas
- Se elimina la fricción operativa en el punto de venta cuando los clientes dividen su cuenta.
- El arqueo físico de caja (`realCash` vs `systemSales`) en el cierre diario cuadra al centavo con el efectivo real recibido en gaveta.
- Se mantiene la inmutabilidad de cada recibo de pago y la integridad contable del ledger.

### Negativas / Restricciones
- La migración de base de datos debe eliminar el índice único `sale_payments_sale_id_key` y reemplazar el trigger `guard_sale_payment_insert()`.
- Requiere ejecutar la migración en el entorno de staging (Neon) bajo la ventana de mantenimiento y checkpoint aprobado.

## Aceptación Verificable

- **PostgreSQL:** Permite insertar múltiples pagos asociados al mismo `sale_id` siempre que la suma no exceda el total; rechaza inserciones excedentes con código `23514`.
- **API:** `POST /api/v1/sales/:id/payment` acepta `{ splitPayments: [...] }` y rechaza montos con suma errónea (`SALE_SPLIT_PAYMENT_SUM_MISMATCH`).
- **Cierre Diario:** Un día con una venta de C$ 1,000 (C$ 400 efectivo + C$ 600 tarjeta) refleja en `closing-preview` exactamente C$ 400 en `cashAmount` y C$ 600 en `digitalAmount`.
- **Frontend:** La interfaz valida visualmente en tiempo real que el restante sea 0.00 antes de permitir el envío.

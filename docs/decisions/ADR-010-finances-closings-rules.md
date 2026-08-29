# ADR-010 — Reglas de finanzas y cierres diarios

- Estado: `ACCEPTED`
- Fecha: 2026-08-29
- Alcance: DEC-019, DEC-022, DEC-023, DEC-024, DEC-025 y FASE 8
- Aprobador: propietario del proyecto

## Contexto

FASE 7 dejó las ventas operacionales completas: encabezado, líneas, ledger
inmutable y auditoría. Finanzas y cierres diarios no existen todavía en el
esquema, pero sus cinco permisos ya están en el manifest versionado.

El legacy resolvía estas reglas de formas que no se pueden adoptar sin
decidir. Incorporaba las ventas completadas como ingresos dinámicos y además
borraba filas automáticas antiguas durante una lectura. Calculaba la
diferencia del cierre sin restar gastos, con una tolerancia fija de 0.5
incrustada en el código. Y al guardar un cierre cancelaba automáticamente las
ventas en tránsito de esa fecha.

## Decisión

### DEC-022 — ingresos de ventas en Finanzas

Finanzas **deriva** los ingresos de ventas al leer y **no los persiste**. Un
asiento financiero persistido es siempre un movimiento manual.

La no duplicación queda garantizada por construcción, no por una regla que
haya que vigilar: no existe fila que duplicar. Una venta cancelada deja de
contar automáticamente porque el cálculo parte del estado vigente de la venta.
Sólo las ventas completadas cuentan como ingreso; tránsito y canceladas nunca.

A diferencia del legacy, **ninguna lectura borra filas**. Las filas
automáticas legacy se preservan como evidencia raw y se excluyen del agregado.

### DEC-023 — fórmula de diferencia del cierre

Se conserva la fórmula legacy:

`diferencia = efectivo real + digital real − ventas del sistema`

Los gastos **no** participan. Se muestran por separado y no afectan el cuadre,
de modo que un cierre nuevo y uno histórico son comparables.

### DEC-024 — tolerancia `Cuadrado`

Se conserva el comportamiento legacy, `abs(diferencia) < 0.5`, pero el valor
es **configurable** y no una constante incrustada. El cierre registra la
tolerancia aplicada, para que un cuadre pasado siga siendo interpretable si la
configuración cambia después.

### DEC-019 — ventas en tránsito al cerrar el día

El cierre **reporta** las ventas en tránsito de la fecha y **no las toca**. Se
guarda igual, listándolas como pendientes.

Un cierre nunca cancela una venta ni repone inventario como efecto secundario.
Cancelar sigue siendo una acción humana explícita, con `sales.cancel`, su
motivo y su idempotencia, según FASE 7B.

### DEC-025 — reapertura de cierres

Completa la parte que quedaba abierta, sin alterar lo ya aprobado (motivo,
actor, fecha/hora, historial conservado, `audit_log`, sin borrado físico):

1. **Plazo configurable.** Un cierre puede reabrirse mientras no pase la
   ventana configurada en días después de su fecha de negocio. El valor vive en
   configuración, igual que la tolerancia, y por defecto son 30 días. Fuera de
   plazo se rechaza con un código propio, no confundible con "ya reabierto".
2. **Cierres posteriores no bloquean.** Reabrir uno anterior es válido aunque
   existan cierres de fechas posteriores, porque cada cierre conserva sus
   cifras congeladas y reabrir no recalcula ninguno.
3. **Un cierre reabierto queda reabierto.** No existe volver a cerrar. Un
   cierre reabierto es evidencia de que ese día se revisó, y la base sólo
   admite la transición `CLOSED → REOPENED`.

## Consecuencias

Positivas:

- imposible duplicar ingresos de ventas: no hay nada que duplicar;
- cancelar una venta corrige el agregado financiero sin trabajo adicional;
- ningún cierre produce movimientos de inventario;
- los cierres históricos y nuevos usan la misma fórmula;
- la tolerancia aplicada queda registrada en cada cierre.

Costos:

- el agregado financiero se calcula en cada lectura y necesita índices
  adecuados sobre ventas por fecha y estado;
- la diferencia del cierre no representa la caja real cuando hubo gastos en
  efectivo, exactamente como en el legacy;
- corregir un cierre reabierto exige una decisión futura: hoy no hay forma de
  registrar cifras corregidas para esa fecha;
- un cierre puede guardarse con ventas en tránsito pendientes, así que la UI
  debe hacerlas visibles.

## Alternativas rechazadas

- Materializar los ingresos de ventas como asientos: exige sincronizar ante
  cancelaciones y reintroduce el riesgo de doble conteo que `AGENTS.md`
  prohíbe.
- Borrar filas automáticas durante una lectura, como el legacy: una lectura no
  muta datos, y destruiría evidencia.
- Restar gastos de la diferencia: cambia el significado de la cifra y rompe la
  comparación con el histórico.
- Tolerancia fija en código: obliga a modificar código para ajustarla.
- Tolerancia cero: marcaría como descuadrados cierres que hoy pasan por
  redondeos de centavos.
- Cancelar automáticamente el tránsito al cerrar, como el legacy: un cierre
  dispararía cancelaciones con reposición de inventario sin acción explícita.
- Bloquear el cierre con ventas en tránsito: traba la operación diaria por una
  venta colgada.

## Rollback y cambio futuro

Estas reglas pueden sustituirse sólo con otra decisión aprobada. Un cambio
posterior no reescribe cierres ya guardados ni asientos históricos: aplica a
los nuevos y requiere su propio gate. La tolerancia registrada en cada cierre
preserva la interpretación del cuadre anterior.

## Aceptación verificable

- unitarias de la fórmula de diferencia, la tolerancia y su registro;
- prueba de que un ingreso de venta nunca se persiste como asiento;
- prueba de que cancelar una venta cambia el agregado sin tocar asientos;
- prueba de que guardar un cierre no crea ningún movimiento de inventario ni
  modifica ninguna venta;
- prueba de que una venta en tránsito aparece reportada y sin alterar;
- integración PostgreSQL con un único cierre por fecha.

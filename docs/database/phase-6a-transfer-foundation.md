# FASE 6A — fundamento persistente de transferencias

## Alcance

FASE 6A prepara la persistencia y autorización necesarias para transferencias
atómicas. No implementa endpoints, UI ni una transferencia real. Los 1,069
movimientos legacy —incluidos los 25 clasificados como transferencia— continúan
sin importar.

## Autorización

El permiso existente `transfers.create` se concede exclusivamente a
`INVENTORY_MANAGER`. No hay bypass por `ADMIN`, los demás roles no lo reciben y
un `UserPermission` DENY directo conserva precedencia. El bootstrap permanece
idempotente: 15 permisos, 14 grants de rol, 11 asignaciones de rol y un grant
directo inicial.

## Persistencia

- `inventory_transfers` conserva almacenes origen/destino distintos, actor,
  motivo, fecha de ocurrencia, hash SHA-256 de la clave de idempotencia y request
  hash.
- `inventory_transfer_items` conserva producto y cantidad decimal positiva; un
  producto aparece como máximo una vez por transferencia.
- `inventory_movements.transfer_item_id` enlaza ambos lados del ledger sin
  modificar la semántica de `ADJUSTMENT`.
- Las FKs usan `RESTRICT`; documentos, ítems y movimientos son append-only.

Cada ítem admite como máximo un `TRANSFER_OUT` negativo y un `TRANSFER_IN`
positivo. Al commit, triggers de constraint diferidos exigen un par completo y
comprueban producto, almacén, magnitud y actor. También impiden confirmar una
transferencia sin ítems. Estas garantías complementan, no sustituyen, la futura
transacción de aplicación.

## Idempotencia futura

La unicidad `(actor_user_id, idempotency_key_hash)` permite un claim atómico en
FASE 6B sin guardar la clave original. `request_hash` se calculará sobre el DTO
validado y canónico con `fromWarehouseId`, `productId`, cantidad decimal
canónica, `reason` y `toWarehouseId`; excluye actor, clave y timestamps. Misma
clave/mismo payload devolverá la transferencia existente; payload distinto
producirá `IDEMPOTENCY_KEY_REUSED`. El endpoint todavía no existe.

## Decisiones de ejecución para FASE 6B

- Un destino sin balance podrá crearlo inicialmente en cero dentro de la misma
  transacción, con locks deterministas.
- Una transferencia no crea, copia ni modifica
  `ProductWarehouseValuation`.
- La implementación deberá cubrir salida concurrente, ajuste + transferencia,
  transferencias cruzadas y carrera de creación del balance destino.

## Migración

La migración versionada
`20260820170000_phase_6a_transfer_foundation` añade únicamente estas tablas,
columna, FKs, checks, índices y triggers. Datos existentes no se reescriben; el
movimiento `ADJUSTMENT` anterior conserva `transfer_item_id = NULL`.

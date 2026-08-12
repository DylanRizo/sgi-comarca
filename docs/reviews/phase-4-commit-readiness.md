# FASE 4C.1 — Persistent Commit Engine + Guardrails

## Estado

- Implementación: **READY FOR REVIEW**.
- FASE 4: **IN_PROGRESS**.
- **PERSISTENT IMPORT NOT AUTHORIZED**.

Este informe demuestra el mecanismo exclusivamente mediante datos sintéticos y
PostgreSQL temporal marcado. No registra una primera importación real.

## Alcance exacto del motor

| Grupo | Conteo simulado |
|---|---:|
| LegacySource | 1 |
| ImportBatch | 1 |
| LegacyRecord | 2,064 |
| ReconciliationIssue | 189 |
| AuditLog | incremento 1 |
| Unit | 14 |
| Product | 144 |
| InventoryBalance | 357 |
| ProductWarehouseValuation | 357 |

InventoryMovement, Sale, SaleItem, SaleCancellation e InTransitConfirmation
permanecieron en cero.

## Controles implementados

- `approvedPlanKey` independiente de `executionMode`.
- Cinco artefactos dry-run verificados por SHA-256.
- Fingerprint positivo sin secretos y revalidado bajo lock.
- `EMPTY_TARGET` estricto y tres warehouses bootstrap exactos/activos.
- Operador UUID existente, ACTIVE y con asignación ADMIN activa.
- Backup custom-format, SHA, `pg_restore --list`, restore evidence estructurada
  y checksum de esa evidencia.
- TTY real y frase exacta no suministrable por argumento/env/pipe.
- Locks en orden global → source → plan, seguidos de locks de tablas.
- Revalidación TOCTOU de fuente, perfil, mapping, plan, artefactos, backup,
  fingerprint, target, warehouses y operador.
- Una transacción Serializable y create-only.
- AuditLog sanitizado dentro de la misma transacción.

## Rollback probado

La simulación inyecta fallos en Unit 10, Product 80, Balance 200, Valuation 300,
ReconciliationIssue, AuditLog y finalización del ImportBatch. En todos los casos
quedan cero filas technical/business del intento y cero audit adicional.

También se prueban target no vacío, source/batch previos, warehouse faltante,
operador inexistente/PENDING/DISABLED/no ADMIN, conflicto concurrente y cambio
del source antes del commit final.

## Limitaciones deliberadas

- No se añadió un permiso de importación; la CLI excepcional exige ADMIN activo.
- No existe rollback destructivo ni comando `delete-import`.
- El host que ejecute el commit deberá disponer de `pg_restore` compatible.
- Backup, restore rehearsal, operador y ventana reales siguen pendientes de una
  autorización operativa posterior.

## Declaración

FASE 4C.1 = IMPLEMENTED / READY FOR REVIEW

PERSISTENT IMPORT NOT AUTHORIZED

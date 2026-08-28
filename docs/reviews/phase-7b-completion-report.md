# FASE 7B — Reporte de implementación de la capa de ventas

Estado: `PHASE_7B_COMPLETE`.

Este documento registra lo implementado por los bloques 7B.1 a 7B.4 y la
verificación PostgreSQL, concurrencia, E2E y estática completada el 2026-08-28.
El propietario revisó el diff y la evidencia y declaró la fase cerrada el
2026-08-28.

Cerrar FASE 7B cierra únicamente la implementación versionada. No autoriza UI de
ventas, importación legacy, migración o bootstrap a staging, ni ninguna venta
real. Cada una de esas acciones requiere su propio gate explícito.

## 1. Bloques implementados

| Bloque | Commit | Contenido |
| --- | --- | --- |
| 7B.1 | `4e52f09` | Contratos, DTO mínimo, dinero en enteros escalados, reparto de envío, canonicalización, errores tipados. |
| 7B.2 | `c3c7cee` | `GET /api/v1/sales` y `GET /api/v1/sales/:id` con `sales.read`. |
| 7B.3 | `9cdd454` | `POST /api/v1/sales` transaccional con `sales.create`. |
| 7B.4 | `9059af2` | Confirmación en tránsito y cancelación total. |

Documentación previa: [plan](phase-7b-sales-application-plan.md) y
[ADR-009](../decisions/ADR-009-sales-pricing-cost.md), commiteados en `4da66db`;
autorización del gate 7B.1 en `b784ef4`.

## 2. Superficie HTTP resultante

| Método y ruta | Permiso | Idempotencia |
| --- | --- | --- |
| `GET /api/v1/sales` | `sales.read` | No |
| `GET /api/v1/sales/:id` | `sales.read` | No |
| `POST /api/v1/sales` | `sales.create` | `Idempotency-Key` obligatoria |
| `POST /api/v1/sales/:id/confirm-in-transit` | `sales.confirm_in_transit` | Obligatoria |
| `POST /api/v1/sales/:id/cancel` | `sales.cancel` | Obligatoria |

Todas son privadas. No se añadió ninguna ruta pública ni permiso nuevo; los
cuatro permisos ya existían en el manifest versionado desde FASE 7A.

## 3. Garantías implementadas

- `origin = OPERATIONAL`, `paymentStatus = PENDING`, moneda y creador los fija
  el servidor; `saleNumber` se omite del INSERT para que PostgreSQL lo genere.
- Precio y costo se leen de la fila única y bloqueada de `InventoryBalance`
  (ADR-009). `NULL` de costo rechaza; cero es válido y se conserva. El override
  de precio se persiste y se audita con referencia y valor aplicado.
- `ProductWarehouseValuation` no se consulta ni se escribe.
- Todo el dinero se recalcula en el servidor con enteros escalados; el residuo
  del envío se reparte por ordinal validado y suma exactamente.
- Locks en el orden global `(product_id, warehouse_id)` definido por
  `transaction-design.md`; creación y cancelación usan el mismo orden.
- Idempotencia por actor con advisory lock; sólo se persisten el hash de la
  clave y el hash canónico del request.
- Una línea, un movimiento `SALE` coherente; una cancelación, un
  `SALE_CANCELLATION` coherente por línea.
- Confirmación no toca inventario ni pago; inserta el documento antes del
  UPDATE porque `guard_sale_write()` lo exige.
- `unitCostSnapshot` nunca se selecciona ni se emite en respuestas de lectura.

## 4. Verificación ejecutada

El destino se verificó positivamente antes de probar: Docker Engine 29.6.2,
contenedor Compose `sgi-comarca-postgres-1`, imagen `postgres:18.4-alpine`,
estado saludable y publicación local `5433 -> 5432`. Todas las suites usaron
bases efímeras; staging nunca fue target.

Resultados finales reales:

- `pnpm test:integration`: 21 archivos / 195 pruebas, todas pasan en 277.41 s;
- suite focalizada de concurrencia: 1 archivo / 9 pruebas, todas pasan en
  34.73 s;
- `pnpm test:e2e`: 17/17 pruebas Chromium en 2.5 min; creó
  `sgi_e2e_7152_403e13c6`, aplicó exactamente las cinco migraciones, terminó
  procesos, obtuvo 0 filas de `pg_terminate_backend` y ejecutó `DROP DATABASE`;
- `pnpm lint`: 8/8 tareas;
- `pnpm typecheck`: 7/7 tareas;
- `pnpm test`: 51 archivos / 162 pruebas;
- `pnpm build`: 7/7 tareas;
- `pnpm format:check`: todos los archivos cumplen Prettier;
- `pnpm db:validate`: esquema Prisma válido.

La matriz nueva cubre dos ventas con stock para una, venta + ajuste, venta +
transferencia, ventas multi-par con orden de entrada inverso, venta +
cancelación de otra venta sobre los mismos pares, confirmación + cancelación de
la misma venta, doble confirmación, doble cancelación y misma clave de creación
concurrente. Los nueve casos pasaron sin deadlock, stock negativo ni doble
efecto.

OpenAPI se generó sólo en memoria: 30 paths totales y los paths de ventas
`/api/v1/sales`, `/api/v1/sales/{id}`, `/cancel` y
`/confirm-in-transit`. Swagger permanece sin montar. La revisión de seguridad
confirmó rutas privadas, permisos exactos, validación con whitelist, costo e
idempotencia ausentes de la superficie read y ningún hallazgo crítico o alto.

## 5. Incidencias encontradas y resueltas

La primera corrida real de integración produjo 20 archivos / 186 pruebas, con
183 verdes y tres fallos en creación de ventas. PostgreSQL persistía el dinero
correctamente, pero `Prisma.Decimal.toString()` eliminaba ceros finales y el
mapper devolvía `"20"`, `"23.5"` y `"5"` en vez de la escala monetaria
canónica.

Se corrigió `sale-read.mapper.ts` para convertir todos los importes persistidos
a centavos y volver a `Decimal(18,2)` canónico. Una prueba unitaria reproduce
la escala eliminada por Prisma y la expectativa de integración de precio se
alineó con ADR-009. La suite focalizada de creación pasó después 13/13 y la
integración completa final pasó 195/195.

La corrida E2E volvió a cambiar temporalmente `apps/web/next-env.d.ts` de tipos
build a tipos dev. Se restauró exactamente el contenido versionado antes de la
línea base; no se modificó configuración de Next ni `.gitignore`.

## 6. Cierre

Los bloqueos técnicos quedaron resueltos y el trabajo se commiteó de forma
auditable y separada:

| Commit | Contenido |
| --- | --- |
| `fc42958` | `fix(sales)`: escala monetaria canónica en la superficie read. |
| `470cb5d` | `test(sales)`: matriz de concurrencia §14 e integración reforzada. |
| `c592404` | `docs`: evidencia del candidato. |
| `d982477` | `test(sales)`: escala real de cantidad y documentación de la asimetría. |

Salvedad de evidencia registrada de forma deliberada: `d982477` es posterior a
la corrida de verificación. Sólo corrigió un fixture unitario engañoso y añadió
comentarios de contrato/mapper; no altera comportamiento en ejecución y dejó la
línea base unitaria en 51 archivos / 163 pruebas con lint, typecheck y build en
verde. Las suites de integración y E2E no se volvieron a ejecutar después de él
por falta de Docker en esa sesión. Volver a correr `pnpm test:integration` en la
próxima oportunidad cierra ese hueco menor.

Sobre la escala decimal: el dinero se emite siempre con dos decimales; la
cantidad se emite tal como persiste, porque el plan §6 la acota a un máximo de
cuatro decimales y no a exactamente cuatro. Los clientes deben interpretar
decimales por valor y nunca por igualdad de cadena.

## 7. Estado

- `PHASE_7A_SCHEMA_COMPLETE`;
- `PHASE_7B_COMPLETE`;
- `STAGING_PHASE_7A_MIGRATION_NOT_AUTHORIZED`;
- `FIRST_STAGING_SALE_NOT_AUTHORIZED`;
- `WAVES_3_PLUS_NOT_STARTED`.

Ninguna venta real fue creada, confirmada ni cancelada. Staging no fue tocado
ni revalidado durante FASE 7B.

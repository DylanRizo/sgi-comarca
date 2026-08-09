# ADR-008 — Límites del importador legacy y dry-run

- Estado: **ACCEPTED_FOR_PHASE_4A**
- Fecha: 2026-08-09
- Alcance: FASE 4A

## Contexto

FASE 3C produjo evidencia determinista y privada del workbook identificado por
`legacy-inventory-xlsx`. La fuente contiene anomalías y decisiones de negocio
abiertas que impiden convertir todas las hojas directamente en entidades
operacionales.

## Decisión

Se crea `@sgi/legacy-importer` como paquete separado de
`@sgi/legacy-profiler`. FASE 4A adopta estas reglas:

- raw-first: toda fila fuente se preserva antes de cualquier mapping;
- dry-run-first: la CLI solo acepta `--dry-run`;
- PostgreSQL debe ser temporal y demostrarlo mediante un fingerprint positivo;
- la base persistente no es un target autorizado;
- el manifest, los checksums y el SHA de la fuente son obligatorios;
- la ausencia de mapping significa `UNRESOLVED`;
- los mappings y transformaciones aprobadas son versionados;
- no se deduplica, fusiona, redondea ni infiere una entidad automáticamente;
- la identidad de batch y fila es determinista;
- un advisory lock impide ejecuciones concurrentes del mismo batch;
- `COMMITTED` con `mode=DRY_RUN` significa solamente que la simulación terminó
  dentro de una base descartable;
- cualquier importación persistente requiere una aprobación humana separada.

`LegacySource`, `ImportBatch`, `LegacyRecord` y `ReconciliationIssue` son el
alcance universal de FASE 4A. Ninguna entidad de negocio, incluida `Unit`, se
habilita globalmente mientras sus decisiones permanezcan abiertas.

## Transformaciones

- `APPLY`: decimal y fecha inequívocos, fecha-hora Managua a UTC, fecha civil
  sin desplazamiento y vacío a null únicamente cuando el destino sea nullable.
- `OBSERVE_ONLY`: trim, NFC, case folding, normalización de código y número
  almacenado como texto.
- `FORBIDDEN`: dedupe/merge automático, recalcular fórmulas, inferir ventas,
  movimientos, cancelaciones o tránsito, convertir moneda, coaccionar fechas
  ambiguas, redondear silenciosamente o modificar el XLSX.

## Consecuencias

- Las 2,064 filas se pueden ensayar sin perder evidencia.
- Los 24 hallazgos que bloquean FASE 4 conservan su `findingId` y `ruleCode`.
- Los reportes quedan bajo `reports/private/importing/` y no se versionan.
- Finanzas, cierres, grupos, movimientos, cancelaciones y tránsito permanecen
  raw-only en este bloque.
- El primer `--commit` real no forma parte de FASE 4A.

## Alternativas rechazadas

- Escribir primero y reconciliar después.
- Reutilizar el profiler para mutar PostgreSQL.
- Crear mappings de Unit por normalización textual.
- Eliminar duplicados por coincidencia exacta.
- Usar la base persistente como dry-run.

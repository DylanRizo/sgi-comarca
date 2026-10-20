# Desplegar pagos híbridos (ADR-022)

## Alcance

La migración aditiva `20261019160000_sale_payment_parts` añade una tabla, dos
funciones y cuatro triggers. Conserva el recibo único y los controles de
ADR-021. No modifica datos existentes ni aplica bootstrap, permisos o backfill.
No crear ventas o cobros reales como prueba del despliegue.

## Gates

1. Revisar PR #10, corregir los hallazgos y exigir lint, tipos, unitarias,
   integración PostgreSQL, build y Chromium de Ventas/Finanzas. Probar también
   el recibo híbrido reasignado, concurrencia, sumas y respuestas perdidas.
2. Obtener aprobación explícita de la migración y su checkpoint. Revalidar
   proyecto/rama/base/rol, conexión directa TLS, migraciones y estado de datos
   en sólo lectura. No migrar por pooler.
3. Crear un checkpoint recuperable antes de escribir. Si Neon no permite otra
   rama, no borrar ninguna: usar sólo la alternativa aprobada de backup privado
   verificado mediante restauración completa en una base local temporal aislada,
   comparación de huellas, `pg_restore --list` y checksum. Guardarlo fuera de Git.
4. Confirmar que sólo la migración aprobada está pendiente. Aplicarla y verificar
   catorce migraciones finalizadas, ninguna inconclusa, 51 triggers y la tabla
   nueva vacía; todas las filas anteriores deben conservar sus huellas.
5. Desplegar API por commit exacto antes de web. Verificar health/readiness,
   privacidad de la ruta de cobro y compatibilidad de consultas anteriores.
6. Publicar web en el mismo commit. Inspeccionar el formulario sin guardar:
   modo único/híbrido, restante, validaciones y controles por permisos.
   Conservar evidencia privada; no reutilizar sesiones entre entornos.
7. Limpiar el destino del proceso. Documentar SHAs, migración, verificaciones y
   evidencia sanitizada. No incluir ventas, importes, secretos ni backups en Git.

## Recuperación

Una API vieja ignora las partidas de los recibos híbridos. Después del primer
registro híbrido no volver a ella a ciegas. Ante un fallo, detener escrituras y
aprobar un forward fix o una recuperación de incidente. No restaurar encima de
actividad posterior sin autorización ni editar el ledger manualmente.

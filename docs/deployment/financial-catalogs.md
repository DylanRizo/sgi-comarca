# Preparar las categorías financieras

Las categorías de Finanzas son independientes de las categorías de productos.
El esquema y `db:bootstrap` no insertan vocabulario financiero; una base vacía
no puede registrar asientos hasta preparar este catálogo explícitamente.

El comando usa las 9 opciones de `actualizarCategoriasFinanzas` del legacy:
3 ingresos (capital inicial/apertura, préstamo recibido, otros ingresos) y
6 gastos (logística/aduana, marketing, empaques, pago de deuda/préstamo,
operativos y retiro de socio). Conserva los nombres originales; no importa
asientos ni asigna categorías a datos históricos.

## Procedimiento del operador

1. Obtener autorización explícita para preparar el catálogo del entorno.
2. Verificar proyecto, rama, base, rol y conexión directa. En staging, crear
   y comprobar un checkpoint de Neon antes de escribir.
3. Configurar `DATABASE_URL` solo para el proceso, sin imprimirla ni guardarla.
4. Ejecutar el ensayo (no escribe):

   ```powershell
   pnpm --filter @sgi/api finances:prepare-catalogs -- --confirm-database=<base-verificada> --actor=<usuario-financiero-activo>
   ```

5. Revisar `planned`, `unchanged` e `inactive`. Para una base vacía se esperan
   9 códigos planificados. No continuar si hay un error o conflicto.
6. Conservar la misma configuración y añadir `--commit` al comando aprobado.
7. Comprobar de solo lectura las categorías y un evento
   `finances.category_prepared` por categoría añadida. Repetir el ensayo debe
   devolver `planned: []`. Verificar que asientos, ventas e inventario no
   cambiaron. No crear un gasto real de prueba sin su propia autorización.
8. Limpiar `DATABASE_URL` del proceso y el portapapeles si se usó.

La operación es atómica, serializada con un advisory lock e idempotente. Solo
añade categorías faltantes y su auditoría con el actor indicado, que debe
estar activo y tener `finances.manual.create` sin un DENY efectivo. No cambia
permisos ni reactiva categorías retiradas. Un código incompatible o un nombre
equivalente bajo otro código detiene todo el lote para revisión humana.
No se ejecuta en arranque, consultas, migraciones ni despliegues automáticos.

Preparar las categorías desbloquea también el formulario ya desplegado, porque
su API ya consulta esta tabla. No requiere migraciones ni `db:bootstrap`.
Las mejoras visuales y la elección por nombre sí requieren publicar el código:
desplegar primero la API con `/finances/responsibles`, verificarla y después
la web, para no presentar un formulario nuevo contra una API anterior.

## Interfaz

El formulario distingue catálogo vacío de fallo de carga, permite reintentar
sin perder fecha/monto/descripción y bloquea el envío durante la operación.
`GET /finances/responsibles`, protegido por `finances.read`, proyecta únicamente
ID y nombre de usuarios activos/activados; no expone roles, credenciales ni
contacto. El responsable predeterminado sigue siendo el usuario autenticado;
el servidor conserva su validación de responsable activo.

## Archivos del cambio

- Preparación y comando: `apps/api/src/finances/prepare-financial-catalogs.ts`,
  `prepare-financial-catalogs.cli.ts` y el script de `apps/api/package.json`.
- Lecturas protegidas: `apps/api/src/finances/finance-read.service.ts` y
  `finances.controller.ts`; contratos en `packages/contracts/src/finances.ts`
  y su exportación en `index.ts`.
- Formulario y cliente: `apps/web/components/finances/create-entry-dialog.tsx`,
  `apps/web/lib/http/finances-api.ts` y estilos acotados en `apps/web/app/globals.css`.
- Regresión: `apps/api/test/financial-catalogs.integration.spec.ts`,
  `apps/web/e2e/04-finances.e2e.ts` y su helper `support/authentication-database.ts`.
- Documentación: este procedimiento, `docs/architecture/api-conventions.md`
  y `docs/handoff/CURRENT_STATE.md`.

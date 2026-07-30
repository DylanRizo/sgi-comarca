# AGENTS.md — SGI La Comarca

## Misión del proyecto

Migrar SGI La Comarca desde Google Apps Script + Google Sheets hacia una aplicación web de producción con TypeScript, Next.js, NestJS y PostgreSQL, preservando todas las funciones existentes y mejorando seguridad, consistencia, mantenibilidad, experiencia de usuario y capacidad de crecimiento.

La aplicación se construirá como un monolito modular dentro de un monorepo. No introducir microservicios, colas, Kubernetes, Redis o infraestructura adicional sin una necesidad demostrada y documentada.

## Fuentes de verdad

Antes de cambiar código, leer:

- `docs/project-brief.md`
- `docs/legacy/`
- `docs/architecture/`
- `docs/migration/`
- `legacy/private/sgi-comarca-appsscript.json`
- `legacy/private/datos-inventario.xlsx`

Los archivos de `legacy/private/` contienen datos privados y no deben modificarse, eliminarse ni publicarse.

No asumir reglas del negocio. Toda regla debe estar respaldada por:

1. código legacy;
2. datos del Excel;
3. una decisión aprobada y registrada en `docs/decisions/`.

Cuando exista una ambigüedad:

1. documentarla;
2. preservar los datos originales;
3. elegir el comportamiento más seguro para el ensayo;
4. marcarla como `REQUIRES_HUMAN_APPROVAL`;
5. no ocultarla ni inventar información.

## Arquitectura aprobada

- Monorepo: pnpm workspaces + Turborepo.
- Frontend: Next.js + TypeScript estricto.
- Backend: NestJS REST API + OpenAPI.
- Base de datos: PostgreSQL.
- ORM: Prisma.
- UI: Tailwind CSS + shadcn/ui + Lucide.
- Estado remoto: TanStack Query.
- Formularios: React Hook Form + Zod.
- Tablas: TanStack Table.
- Gráficos: Recharts.
- Pruebas: unitarias, integración PostgreSQL y Playwright.
- Desarrollo local: Docker Compose.
- Producción: Railway.
- CI: GitHub Actions.

No fijar versiones antiguas por memoria. Seleccionar versiones estables compatibles, guardar lockfile y documentar las versiones utilizadas.

## Organización esperada

```text
apps/
  web/
  api/
packages/
  database/
  contracts/
  ui/
  config/
docs/
  legacy/
  architecture/
  database/
  migration/
  decisions/
  deployment/
legacy/
  private/
scripts/
```

## Módulos de negocio

- auth
- users
- roles
- products
- units
- product-groups
- warehouses
- inventory
- stock-movements
- stock-receipts
- transfers
- sales
- finances
- daily-closings
- inventory-audits
- reports
- analytics
- imports
- settings
- audit-logs

Los controladores deben ser delgados. Las reglas del negocio deben vivir en servicios de aplicación/dominio. El acceso a datos no debe estar incrustado en controladores o componentes de UI.

## Invariantes obligatorios

- Todo cambio de stock crea un movimiento inmutable.
- No puede existir stock negativo.
- La combinación producto + almacén es única.
- Una entrada actualiza stock y movimiento en una sola transacción.
- Una transferencia registra salida y entrada de forma atómica.
- Una venta crea encabezado, artículos, movimientos y descuento de stock en una sola transacción.
- Una venta puede contener productos provenientes de diferentes almacenes.
- Confirmar una venta en tránsito no vuelve a descontar inventario.
- Cancelar una venta restaura inventario exactamente una vez.
- Las operaciones de creación/cancelación deben ser idempotentes.
- El dinero se almacena como PostgreSQL `NUMERIC` y Prisma `Decimal`, nunca `float`.
- Las cantidades admiten decimales.
- Los timestamps se guardan en UTC y se muestran en `America/Managua`.
- Los movimientos históricos no se editan ni eliminan.
- Los productos con historial no se eliminan físicamente; se desactivan.
- Almacenes, categorías, vendedores, canales y responsables no se escriben directamente en componentes.
- Toda mutación importante registra actor, fecha, entidad y cambios en `audit_logs`.
- Los datos legacy conservan `legacy_id`, `legacy_row_number`, `import_batch_id` y, cuando sea útil, `raw_data`.
- La hoja Inventario es la fuente del saldo inicial cuando difiere de Movimientos.
- Movimientos se conserva como historial heredado, no como única fuente para reconstruir el saldo inicial.
- Los ingresos automáticos de ventas no deben duplicarse en Finanzas.

## Seguridad

- Ninguna ruta de producción puede ser anónima.
- Usar sesiones opacas revocables con cookies `HttpOnly`, `Secure` y `SameSite`.
- No guardar tokens en `localStorage`.
- Hash de contraseñas con Argon2.
- Autorizar en backend, no solo ocultar botones.
- Validar todas las entradas.
- Limitar intentos de inicio de sesión.
- Proteger operaciones sensibles contra doble envío.
- No registrar contraseñas, secretos, cookies ni cadenas de conexión.
- No incluir credenciales, IDs privados o datos empresariales en commits públicos.
- El repositorio debe permanecer privado.
- `legacy/private/`, `.env*`, reportes con datos reales y respaldos deben estar en `.gitignore`.

Roles iniciales:

- `ADMIN`
- `PARTNER`
- `INVENTORY_MANAGER`
- `SALES`
- `FINANCE`
- `READ_ONLY`

## Frontend

- Interfaz en español.
- Identificadores de código en inglés.
- Responsive y mobile-first.
- Accesibilidad por teclado y contraste suficiente.
- Estados de carga, vacío, error y éxito en todas las vistas.
- Confirmación para acciones destructivas.
- Formularios con prevención de doble envío.
- Tablas con búsqueda, filtros, paginación y presentación móvil.
- No copiar literalmente el HTML legacy; preservar flujos y mejorar UX.
- No usar emojis como sistema principal de iconografía.
- Moneda y zona horaria deben ser configurables; no convertir valores legacy durante la migración.
- No mostrar información financiera a roles no autorizados.

## Calidad de código

- TypeScript `strict`.
- Evitar `any`.
- Evitar archivos gigantes y lógica duplicada.
- Funciones pequeñas y nombres descriptivos.
- ESLint + Prettier.
- Errores de dominio tipados.
- Respuestas API consistentes.
- Paginación del lado del servidor.
- Índices para consultas frecuentes.
- No agregar dependencias sin justificar su propósito.
- No mezclar refactorizaciones no relacionadas con la tarea activa.

## Pruebas mínimas por módulo

- Unitarias para reglas de negocio.
- Integración contra PostgreSQL real en contenedor.
- API para validación, permisos e idempotencia.
- Playwright para flujos críticos.
- Pruebas de concurrencia para stock y venta.
- Pruebas de importación repetida sin duplicación.

Flujos críticos:

1. crear/editar/desactivar producto;
2. registrar entrada;
3. ajuste positivo y negativo;
4. transferencia;
5. venta con varios artículos;
6. venta desde varios almacenes;
7. venta en tránsito;
8. confirmación de pago;
9. cancelación y reposición;
10. ingreso/gasto manual;
11. cierre diario;
12. auditoría física;
13. importación legacy;
14. reconciliación;
15. permisos por rol.

## Migración de datos

- Nunca modificar el Excel original.
- El importador debe soportar `--dry-run` y `--commit`.
- Debe ser idempotente.
- Debe ejecutarse por lotes y dentro de transacciones.
- Las filas inválidas se reportan; no se descartan silenciosamente.
- Un error crítico revierte el lote.
- Cada ejecución produce reportes JSON y Markdown.
- Toda corrección manual debe quedar en un archivo de mapeo versionado, no escondida dentro del código.
- No ejecutar el importador automáticamente durante una migración de esquema.
- No declarar éxito mientras existan diferencias no explicadas.

## Comandos de calidad

Antes de finalizar una tarea, ejecutar los comandos disponibles equivalentes a:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

Cuando la tarea afecta un flujo crítico, ejecutar además la prueba Playwright correspondiente.

## Forma de trabajar

Antes de editar:

1. leer `AGENTS.md`;
2. inspeccionar estado de Git;
3. resumir el objetivo;
4. proponer un plan;
5. indicar archivos previstos;
6. señalar riesgos.

Durante la implementación:

- hacer cambios enfocados;
- ejecutar pruebas pronto;
- no avanzar a otro módulo;
- actualizar documentación;
- no hacer commits salvo solicitud explícita.

Al terminar, informar:

1. cambios realizados;
2. archivos modificados;
3. comandos ejecutados;
4. resultados;
5. riesgos o ambigüedades;
6. decisiones que requieren aprobación;
7. siguiente paso recomendado.

## Definición de terminado

Una tarea solo está terminada cuando:

- cumple los criterios de aceptación;
- las migraciones son reproducibles;
- lint, tipos, pruebas y build pasan;
- la documentación está actualizada;
- no se alteraron archivos legacy;
- no se introdujeron secretos;
- el diff no contiene cambios no relacionados;
- se produjo evidencia verificable;
- la revisión de Codex no presenta hallazgos críticos o altos sin resolver.

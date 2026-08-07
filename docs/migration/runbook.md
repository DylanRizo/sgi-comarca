# Runbook completo: migración de SGI La Comarca con Codex

## 1. Resultado que se busca

Migrar el sistema real de La Comarca desde Google Apps Script y Google Sheets hacia:

- Next.js para el frontend.
- NestJS para la API.
- PostgreSQL como base de datos.
- Prisma para esquema, migraciones y acceso a datos.
- TypeScript estricto en todo el proyecto.
- Railway para staging y producción.
- GitHub privado para control de versiones.
- Docker Compose para desarrollo y pruebas locales.

La arquitectura será un **monolito modular en un monorepo**. Es suficientemente sólida para el negocio actual, permite crecer y evita la complejidad prematura de microservicios.

No existe una migración que pueda garantizarse como “perfecta” sin validación humana. Este procedimiento busca que sea **trazable, reversible, probada y sin pérdida silenciosa de datos**.

---

## 2. Línea base confirmada de los archivos actuales

Codex debe volver a verificar estos números; se incluyen como controles de referencia:

### Código Apps Script

- 22 archivos/componentes.
- Frontend grande en `Global_JS` y `Global_CSS`.
- Módulos de productos, inventario, ventas, transferencias, finanzas, cierres, auditoría, reportes, importación y analytics.
- El web app legacy permite acceso anónimo.
- Existen IDs de hojas, ubicaciones y nombres escritos directamente en código.
- Hay estructuras duplicadas y archivos muy grandes.
- La definición inicial de Ventas usa menos columnas que las usadas por versiones posteriores.

### Excel

| Hoja | Filas de datos aproximadas |
|---|---:|
| Productos | 145 |
| Inventario | 359 |
| Movimientos | 1,069 |
| Ventas | 404 filas / 288 ventas únicas |
| Entrada de Productos | 52 |
| Finanzas | 6 |
| CierresDiarios | 4 |
| Unidades | 14 |
| Grupos | 11 |

Controles conocidos:

- 144 códigos de producto únicos.
- Código duplicado: `DGGR-X`.
- Duplicados producto-almacén para `CCWH-L` en Casa Dylan y Casa Luden.
- Stock actual total: 366 unidades.
- Casa Dylan: 135.
- Casa Jean: 92.
- Casa Luden: 139.
- Movimientos: 505 INGRESO, 446 VENTA, 93 AJUSTE y 25 TRANSFERENCIA.
- 61 ventas tienen más de una fila.
- 4 líneas de venta son duplicados exactos.
- 7 IDs de venta no tienen un movimiento de venta relacionado.
- 8 IDs encontrados en movimientos no aparecen en la hoja Ventas.
- 157 combinaciones producto-almacén no coinciden entre Inventario y el último `Stock Resultante` de Movimientos.
- La hoja `Entrada de Productos` comienza su tabla en la fila 14.
- Productos contiene la unidad `Unidad`, pero el catálogo usa `Unidades`.
- CierresDiarios guarda el detalle por vendedor dentro de JSON.
- Finanzas contiene ingresos automáticos vinculados a ventas.

Estos casos **no deben corregirse automáticamente**. Deben aparecer en el reporte de reconciliación.

---

## 3. Regla principal

Nunca le pidas a Codex “migra todo el sistema” en una sola tarea.

Usa una fase por vez:

1. plan;
2. inspección;
3. implementación enfocada;
4. pruebas;
5. `/review`;
6. revisión humana;
7. commit;
8. siguiente fase.

No avances cuando una puerta de calidad falle.

---

## 4. Preparación local en Windows

### 4.1 Instalar

- Git.
- Node.js LTS vigente.
- Docker Desktop.
- VS Code.
- Codex App para Windows o Codex CLI.
- Una cuenta de GitHub.
- Una cuenta de Railway.

Inicia sesión en Codex con tu cuenta de ChatGPT Plus.

### 4.2 Crear la carpeta

Ejemplo en PowerShell:

```powershell
mkdir C:\proyectos\sgi-comarca
cd C:\proyectos\sgi-comarca
git init
git branch -M main
mkdir legacy
mkdir legacy\private
mkdir docs
```

Renombra y copia:

```text
SGI Comarca (6).json
    -> legacy/private/sgi-comarca-appsscript.json

datos Inventario (6).xlsx
    -> legacy/private/datos-inventario.xlsx
```

### 4.3 Crear `.gitignore`

```gitignore
node_modules/
.next/
dist/
coverage/
playwright-report/
test-results/
.env
.env.*
!.env.example

legacy/private/
data/private/
backups/
reports/private/
*.dump
*.sql.gz
```

Los archivos reales quedarán disponibles para Codex local, pero no se subirán a GitHub.

### 4.4 Crear archivos iniciales

Copia en la raíz:

- `AGENTS.md` entregado junto con este runbook.
- Un `README.md` con el nombre del proyecto.
- Este documento dentro de `docs/migration/runbook.md`.

Luego:

```powershell
git add AGENTS.md README.md .gitignore docs
git commit -m "chore: initialize SGI migration workspace"
```

### 4.5 Crear repositorio privado

Crea en GitHub un repositorio privado llamado, por ejemplo:

```text
sgi-comarca
```

Conecta el remoto y sube únicamente los archivos no privados.

---

## 5. Cómo abrir cada sesión de Codex

Desde la raíz del repositorio:

```powershell
codex
```

Al comenzar:

```text
/status
/permissions
/model
```

Durante auditorías usa permisos de solo lectura. Durante implementación permite editar el workspace, pero revisa comandos sensibles.

Para una fase nueva:

```text
/clear
/goal Completar únicamente la fase N del runbook y mantener todas las pruebas aprobadas.
/plan
```

Antes de aceptar cambios:

```text
/review
```

Después revisa:

```powershell
git status
git diff --stat
git diff
```

No hagas commit si hay cambios que no pertenecen a la fase.

---

# FASE 0 — Auditoría funcional y de datos

## Objetivo

Comprender el sistema completo y crear un contrato de comportamiento. **No programar la nueva aplicación todavía.**

## Preparación

```powershell
git checkout -b migration/00-legacy-audit
```

Configura Codex en solo lectura y pega:

```text
/plan

Lee AGENTS.md y analiza completamente:

- legacy/private/sgi-comarca-appsscript.json
- legacy/private/datos-inventario.xlsx

Trabaja como arquitecto de software, analista de datos y responsable de una migración crítica.

OBJETIVO
Crear una especificación funcional y de datos verificable antes de escribir el sistema nuevo.

RESTRICCIONES
- No crear todavía Next.js, NestJS, Prisma o PostgreSQL.
- No modificar archivos dentro de legacy/private.
- No corregir datos.
- No asumir reglas sin evidencia.
- Distinguir comportamiento confirmado, inferido y ambiguo.
- Reconstruir flujos completos, no limitarse a listar funciones.
- Revisar todas las llamadas google.script.run y relacionarlas con su función de servidor.
- Identificar escrituras de varias hojas y riesgos de consistencia.
- Identificar valores hard-coded, acceso anónimo, duplicación y operaciones no atómicas.
- Verificar los números de control documentados en docs/migration/runbook.md.

CREA
- docs/legacy/system-overview.md
- docs/legacy/file-inventory.md
- docs/legacy/feature-matrix.md
- docs/legacy/business-rules.md
- docs/legacy/sheet-data-dictionary.md
- docs/legacy/frontend-backend-map.md
- docs/legacy/user-workflows.md
- docs/legacy/data-quality-report.md
- docs/legacy/risk-register.md
- docs/legacy/acceptance-test-matrix.md
- docs/legacy/open-decisions.md

LA MATRIZ FUNCIONAL DEBE INCLUIR
- módulo
- pantalla
- acción del usuario
- función frontend
- función de servidor
- hojas leídas
- hojas modificadas
- campos
- validaciones
- efectos en stock
- efectos financieros
- errores posibles
- prueba de aceptación
- estado: CONFIRMED, INFERRED o AMBIGUOUS

PERFIL DEL EXCEL
Informa por hoja:
- rango utilizado
- encabezados
- filas no vacías
- tipos observados
- nulos
- duplicados
- claves candidatas
- referencias rotas
- rangos de fechas
- importes y cantidades anómalos

DIAGRAMAS MERMAID
- arquitectura actual
- entrada de productos
- ajuste
- transferencia
- venta completada
- venta en tránsito
- confirmación
- cancelación
- finanzas
- cierre diario
- auditoría
- reportes

FINALIZACIÓN
No edites código. Termina mostrando:
1. riesgos críticos;
2. inconsistencias confirmadas;
3. funcionalidades que podrían perderse si se reescribe directamente;
4. decisiones humanas pendientes;
5. archivos creados.
```

## Puerta de calidad 0

No avanzar hasta verificar:

- Cada pantalla aparece en la matriz.
- Cada función de backend está clasificada.
- Las 9 hojas están documentadas.
- Ventas, inventario, finanzas y cierres tienen pruebas de aceptación.
- Las anomalías del Excel aparecen sin haber sido alteradas.
- Hay una lista clara de decisiones humanas.

Ejecuta:

```text
/review Revisa exclusivamente la auditoría legacy. Busca funciones, hojas, columnas, reglas o flujos omitidos. No modifiques archivos.
```

Corrige hallazgos, revisa el diff y haz commit:

```powershell
git add docs/legacy
git commit -m "docs: audit legacy SGI behavior and data"
git checkout main
git merge --no-ff migration/00-legacy-audit
```

---

# FASE 1 — Arquitectura y plan de migración

```powershell
git checkout -b migration/01-architecture
```

Prompt:

```text
/plan

Lee AGENTS.md y todos los documentos de docs/legacy.

OBJETIVO
Proponer la arquitectura final y el plan de migración sin construir todavía módulos de negocio.

DECISIÓN BASE
Usar un monolito modular en monorepo:
- apps/web: Next.js
- apps/api: NestJS REST
- packages/database: PostgreSQL + Prisma
- packages/contracts
- packages/ui
- packages/config
- pnpm workspaces + Turborepo
- Docker Compose
- GitHub Actions
- Railway para staging y production

ENTREGABLES
- docs/architecture/context.md
- docs/architecture/container-diagram.md
- docs/architecture/module-boundaries.md
- docs/architecture/security-model.md
- docs/architecture/deployment-topology.md
- docs/database/proposed-entities.md
- docs/migration/phased-roadmap.md
- docs/migration/traceability-matrix.md
- docs/decisions/ADR-001-modular-monolith.md
- docs/decisions/ADR-002-postgresql.md
- docs/decisions/ADR-003-rest-api.md
- docs/decisions/ADR-004-inventory-ledger.md

REQUISITOS
- Relacionar cada función legacy con un módulo nuevo.
- Relacionar cada hoja con entidades nuevas.
- Diseñar autenticación y roles.
- Diseñar transacciones de venta, transferencia, entrada, ajuste y cancelación.
- Definir idempotencia.
- Definir auditoría.
- Definir cómo conservar legacy_id, fila original y datos crudos.
- Definir estrategia de rollback.
- Definir staging y producción.
- No implementar código todavía.

FINALIZACIÓN
Muestra las decisiones que siguen requiriendo aprobación humana, especialmente moneda, nombres de usuarios, tratamiento de duplicados y reglas de ventas en tránsito.
```

Puerta:

```text
/review Revisa la arquitectura contra la matriz funcional legacy. Señala cualquier funcionalidad sin destino, transacción incompleta o riesgo de pérdida de datos.
```

---

# FASE 2 — Base técnica del monorepo

```powershell
git checkout -b migration/02-foundation
```

Prompt:

```text
/plan

Lee AGENTS.md, docs/legacy y docs/architecture.

OBJETIVO
Crear solamente la base técnica reproducible del monorepo. No implementar todavía reglas de negocio.

IMPLEMENTA
- pnpm workspace
- Turborepo
- apps/web con Next.js y TypeScript strict
- apps/api con NestJS y TypeScript strict
- packages/database con Prisma inicial sin entidades de negocio definitivas
- packages/contracts
- packages/ui
- packages/config
- ESLint
- Prettier
- Docker Compose con PostgreSQL
- .env.example
- health endpoint
- readiness endpoint
- logging estructurado básico
- GitHub Actions para install, lint, typecheck, test y build
- README con comandos exactos

RESTRICCIONES
- No importar datos.
- No implementar ventas o inventario.
- No agregar dependencias innecesarias.
- No fijar secretos.
- No modificar legacy/private.
- Usar versiones estables compatibles y guardar pnpm-lock.yaml.

CRITERIOS
- pnpm install funciona desde cero.
- Docker Compose levanta PostgreSQL.
- web y api arrancan.
- lint, typecheck, test y build pasan.
- health y readiness tienen pruebas.
```

Después:

```text
/review Revisa configuración, seguridad, Docker, scripts, dependencias, CI y reproducibilidad. No agregues módulos de negocio.
```

---

# FASE 3 histórica — Perfilador y esquema combinados (`SUPERSEDED`)

> Esta sección conserva el prompt original y no debe ejecutarse como una fase
> vigente. El esquema se completó en FASE 3A, autenticación en FASE 3B y el
> perfilador se trasladó a FASE 3C. Consulte el roadmap reconciliado y el
> [informe de cierre de 3B](../reviews/phase-3b-completion-report.md).

```powershell
git checkout -b migration/03-database-schema
```

Prompt:

```text
/plan

Lee AGENTS.md, docs/legacy, docs/architecture y el Excel original.

OBJETIVO
Crear un perfilador reproducible y diseñar el esquema PostgreSQL completo.

MODELO MÍNIMO
- users
- roles
- user_roles
- sessions
- warehouses
- units
- product_groups
- products
- inventory_balances
- stock_movements
- stock_receipts
- stock_receipt_items
- inventory_transfers
- inventory_transfer_items
- sales
- sale_items
- financial_categories
- financial_transactions
- daily_closings
- daily_closing_details
- inventory_audits
- inventory_audit_items
- import_batches
- import_errors
- audit_logs
- system_settings

REGLAS
- UUID como PK.
- Claves humanas separadas: code, sale_number, transfer_number, etc.
- NUMERIC para cantidades y dinero.
- Prisma Decimal.
- unique(product_id, warehouse_id).
- products.code único.
- timestamps UTC.
- soft delete donde aplique.
- legacy_id, legacy_row_number, import_batch_id y raw_data.
- índices para filtros y reportes.
- constraints y checks cuando PostgreSQL pueda garantizar la regla.
- almacén en cada sale_item.
- snapshots de precio y costo.
- movimientos inmutables.
- no hard-codear almacenes ni personas.

PERFILADOR
Crea un comando que analice el XLSX sin modificarlo y genere:
- reports/private/workbook-profile.json
- reports/private/workbook-profile.md

Debe verificar todos los controles conocidos del runbook y descubrir otros.

ENTREGABLES
- packages/database/prisma/schema.prisma
- migración inicial
- seed solo de catálogos de desarrollo
- docs/database/er-model.md con Mermaid
- docs/database/data-mapping.md
- docs/database/reconciliation-rules.md
- pruebas de constraints
- script de perfilado
- comandos documentados

NO HACER
- No importar datos todavía.
- No resolver duplicados automáticamente.
- No inventar usuarios o moneda.
- No ejecutar seed destructivo.
```

Puerta:

```text
/review Revisa normalización, constraints, índices, tipos monetarios, relaciones, borrado lógico, auditoría y capacidad para representar todas las filas legacy.
```

---

# FASE 3A — Modelo estructural (`COMPLETE`)

El modelo, migración y bootstrap estructural están cerrados en el commit
`a10b6f09d84a459b40e2aad3e79d5be5751d4e2e`. Su documentación histórica se
conserva en `docs/reviews/phase-3a-final-plan.md`.

# FASE 3B — Autenticación y sesiones (`COMPLETE`)

La autenticación, autorización, administración limitada y frontend auth están
cerrados. No vuelva a ejecutar la antigua FASE 5. Use como fuentes:

- `docs/reviews/phase-3b-completion-report.md`;
- `docs/decisions/ADR-007-phase-3b-authentication-authorization.md`;
- `docs/deployment/phase-3b-auth-operations.md`.

# FASE 3C — Perfilador reproducible (`NEXT`)

Objetivo: leer el XLSX privado sin modificarlo y generar perfiles/reconciliación
sanitizados. No importar datos, no ejecutar CLI administrativas y no modificar
la base persistente durante el perfilado. Esta fase requiere planificación y
aprobación separadas antes de iniciar.

Puerta: nueve hojas perfiladas, controles conocidos verificados, reportes
privados fuera de Git y cero escritura en el XLSX o base operacional.

---

# FASE 4 — Importador dry-run y reconciliación

```powershell
git checkout -b migration/04-importer
```

Prompt:

```text
/plan

OBJETIVO
Construir un importador idempotente para el Excel legacy. Primero debe funcionar en dry-run; no hacer importación definitiva.

COMANDOS
El importador debe admitir:
- --file
- --dry-run
- --commit
- --report-dir
- --batch-id
- --fail-on-critical

REGLAS
- Leer valores, no ejecutar fórmulas.
- No modificar el XLSX.
- Detectar encabezado de Entrada de Productos en fila 14.
- Normalizar fechas Excel hacia UTC usando America/Managua como zona de origen.
- Preservar texto original.
- No convertir moneda.
- Agrupar Ventas por ID Venta.
- Separar Items Vendidos por coma y código:cantidad.
- Crear sale_items individuales.
- Conservar almacén por línea.
- Convertir Datos JSON de CierresDiarios a daily_closing_details.
- Inventario es el saldo inicial cuando difiere del último movimiento.
- Movimientos se importa como ledger legacy.
- Reportar DGGR-X y duplicados CCWH-L.
- Reportar ventas duplicadas o sin movimiento.
- Reportar movimientos sin venta.
- Reportar las discrepancias de stock.
- No duplicar ingresos automáticos de ventas.
- Toda corrección aprobada debe venir de config/legacy-mappings.yml o equivalente versionado.
- La segunda ejecución debe producir cero duplicados.

REPORTES
- resumen por entidad
- filas aceptadas
- advertencias
- errores
- duplicados
- referencias faltantes
- reconciliación de stock
- reconciliación de ventas
- reconciliación financiera
- checksum del archivo
- duración
- resultado de rollback

PRUEBAS
- dry-run no cambia DB
- commit transaccional
- rollback crítico
- idempotencia
- parsing ventas multi-item
- ventas multi-almacén
- cierres JSON
- decimales
- fechas
- filas vacías
- encabezado desplazado
- mapeos manuales

No ejecutes --commit con los datos reales durante esta fase.
```

Puerta:

- Ejecutar dry-run.
- Comparar reporte con la línea base.
- Resolver solo decisiones aprobadas.
- Repetir dry-run hasta que no existan errores críticos desconocidos.

---

# ANTIGUA FASE 5 — Autenticación, usuarios y permisos

Estado: `ABSORBIDA_EN_FASE_3B`. La sección siguiente es historia del plan
original y no debe programarse o ejecutarse nuevamente. La UI administrativa
que proponía no forma parte de FASE 3B; solo existen la API administrativa
limitada y el frontend de autenticación descritos en el informe de cierre.

```powershell
git checkout -b migration/05-auth
```

Prompt:

```text
/plan

OBJETIVO
Implementar autenticación segura y autorización por rol.

IMPLEMENTA
- usuarios invitados por ADMIN
- activación inicial de contraseña
- Argon2
- sesiones opacas revocables
- cookie HttpOnly, Secure y SameSite
- logout
- expiración
- cierre de todas las sesiones
- roles ADMIN, PARTNER, INVENTORY_MANAGER, SALES, FINANCE y READ_ONLY
- guards NestJS
- matriz de permisos
- rate limit en login
- auditoría de login y mutaciones
- páginas de login, acceso denegado y gestión de usuarios

RESTRICCIONES
- No JWT en localStorage.
- No autorización únicamente visual.
- No acceso anónimo.
- No enviar hashes o tokens al frontend.
- No mostrar Finanzas a roles sin permiso.

PRUEBAS
- login correcto/incorrecto
- bloqueo por tasa
- expiración
- revocación
- cada rol permitido/denegado
- cookie de producción
- CSRF según arquitectura aprobada
```

---

# FASE 6 — Catálogos, almacenes e inventario

```powershell
git checkout -b migration/06-inventory
```

Prompt:

```text
/plan

OBJETIVO
Migrar Productos, Unidades, Grupos, Almacenes, Inventario, Entradas, Ajustes, Transferencias y Movimientos.

PRESERVAR
- búsqueda por código y nombre
- stock mínimo
- costo
- precio
- descripción
- unidades y grupos
- inventario por ubicación
- entrada de productos
- ajuste positivo/negativo
- transferencia
- historial
- alertas de stock
- filtros
- exportación CSV
- validación de integridad

TRANSACCIONES
- entrada: documento + items + balance + movimientos
- ajuste: balance + movimiento + motivo
- transferencia: documento + salida + entrada + balances
- usar bloqueo/actualización segura para concurrencia
- impedir stock negativo
- incluir idempotency key

UI
- listado responsive
- detalle por almacén
- formularios accesibles
- confirmaciones
- estados de carga/error
- paginación server-side

PRUEBAS
- concurrencia
- duplicado producto-almacén
- transferencia atómica
- rollback
- decimales
- permisos
- doble envío
```

---

# FASE 7 — Ventas completas y en tránsito

```powershell
git checkout -b migration/07-sales
```

Prompt:

```text
/plan

OBJETIVO
Implementar Ventas conservando la semántica legacy y eliminando inconsistencias transaccionales.

CAMPOS
- sale_number
- fecha
- vendedor
- entregador
- canal
- método de pago
- estado de pago/entrega
- lugar de entrega
- envío cobrado
- hora de salida
- hora finalización
- observaciones
- subtotal
- total
- items
- almacén por item
- precio unitario snapshot
- costo snapshot

ESTADOS MÍNIMOS
- COMPLETED
- IN_TRANSIT
- CANCELLED

REGLAS
- venta, items, descuento y movimientos en una transacción
- validar stock por almacén
- no stock negativo
- multi-item
- multi-almacén
- confirmar pago no descuenta nuevamente
- cancelar restaura exactamente una vez
- idempotencia para registrar, confirmar y cancelar
- no guardar items como texto
- conservar número legible
- envío se suma una vez por venta
- movimientos vinculados por foreign key/source_id
- registrar auditoría

UI
- carrito profesional
- búsqueda de producto
- stock disponible por almacén
- prevención de doble envío
- ventas en tránsito
- confirmación/cancelación
- historial y detalle

PRUEBAS E2E
- venta simple
- multi-item
- multi-almacén
- falta de stock
- concurrencia
- en tránsito
- confirmación
- cancelación
- doble cancelación
- doble submit
- cálculo exacto
```

---

# FASE 8 — Finanzas y cierres diarios

```powershell
git checkout -b migration/08-finance
```

Prompt:

```text
/plan

OBJETIVO
Implementar Finanzas y CierresDiarios sin duplicar ventas.

IMPLEMENTA
- ingresos manuales
- gastos manuales
- categorías
- responsables
- historial
- filtros
- resumen mensual
- ventas del sistema como fuente calculada o referencia, no duplicación manual
- cierre por fecha
- detalle por vendedor
- efectivo real
- digital real
- ventas sistema
- gastos sistema
- diferencia
- estado
- encargado
- observaciones
- reapertura exige `closings.reopen`, motivo y auditoría; ADMIN no implica grant

MIGRACIÓN
- transformar Datos JSON a detalles
- preservar JSON original en raw_data
- tratar ingresos automáticos de venta según reglas de reconciliación
- no perder decimales

PRUEBAS
- cierre único
- cálculo por vendedor
- reapertura autorizada
- ingresos/gastos
- no doble conteo
- permisos
- zona horaria
```

---

# FASE 9 — Auditoría, reportes y analytics

```powershell
git checkout -b migration/09-reports
```

Prompt:

```text
/plan

OBJETIVO
Implementar auditoría física, reportes operativos y dashboard analítico.

AUDITORÍA
- crear sesión
- fecha y almacenes
- captura de conteo físico
- esperado
- diferencia
- aprobación
- ajustes atómicos vinculados
- historial
- no hard-codear Casa Dylan, Casa Luden o Casa Jean

REPORTES
- inventario
- movimientos
- ventas
- productos
- almacenes
- vendedores
- canales
- fechas
- finanzas
- cierres
- exportación CSV
- impresión o PDF solo si está justificado

KPIS
- stock y valor de inventario
- alertas
- ventas por día/semana/mes
- ventas por canal
- vendedores
- productos más vendidos
- ingresos
- gastos
- utilidad
- margen cuando exista costo confiable

VALIDACIÓN
Comparar cada KPI contra consultas SQL y una muestra legacy documentada.
```

---

# FASE 10 — Frontend impecable y prueba visual

```powershell
git checkout -b migration/10-ui
```

Prompt:

```text
/plan

OBJETIVO
Unificar la experiencia visual completa sin cambiar reglas de negocio.

DISEÑO
- identidad sobria de La Comarca
- mobile-first
- sidebar adaptable
- encabezados consistentes
- shadcn/ui
- Lucide
- tipografía legible
- jerarquía clara
- formularios compactos
- tablas responsive
- badges
- skeletons
- estados vacíos
- errores accionables
- confirmaciones
- accesibilidad
- navegación por teclado
- contraste
- foco visible

NO HACER
- no copiar el diseño legacy literalmente
- no usar emojis como iconos principales
- no esconder columnas críticas sin alternativa móvil
- no usar datos simulados en producción
- no sacrificar funcionalidad por estética

PRUEBAS
- Playwright desktop, tablet y móvil
- overflow
- modales
- carrito
- formularios
- filtros
- permisos
- capturas visuales de rutas críticas
```

---

# FASE 11 — Seguridad, rendimiento y observabilidad

```powershell
git checkout -b migration/11-hardening
```

Prompt:

```text
/plan

OBJETIVO
Realizar hardening antes de staging.

REVISA
- OWASP aplicable
- validación
- autorización horizontal/vertical
- CSRF
- XSS
- SQL injection
- sesión
- cookies
- rate limiting
- secretos
- CORS
- headers
- logs
- datos sensibles
- dependencia vulnerable
- errores que filtran detalles
- exportaciones
- importador
- auditoría

RENDIMIENTO
- índices
- N+1
- paginación
- consultas analytics
- límites de exportación
- conexión PostgreSQL
- health/readiness
- graceful shutdown

OBSERVABILIDAD
- logs JSON
- request/correlation ID
- actor ID
- métricas mínimas
- errores
- tiempo de consultas
- guía de diagnóstico

Ejecuta pruebas de carga moderada sobre ventas e inventario y documenta resultados.
```

---

# FASE 12 — Deploy a staging en Railway

```powershell
git checkout -b migration/12-staging-deploy
```

Prompt:

```text
/plan

OBJETIVO
Preparar y documentar staging en Railway, sin tocar producción.

SERVICIOS
- sgi-web-staging
- sgi-api-staging
- PostgreSQL staging

IMPLEMENTA
- Dockerfile de web
- Dockerfile de api
- configuración monorepo
- variables
- CORS exacto
- dominios
- health checks
- pre-deploy para prisma migrate deploy
- migraciones y bootstrap manual verificados; invitación del primer ADMIN según
  el runbook de FASE 3B, nunca mediante contraseña o seed predeterminados
- logs
- GitHub deployment
- migraciones reproducibles
- rollback
- backup
- restore rehearsal

DOCUMENTA
- docs/deployment/railway-staging.md
- docs/deployment/environment-variables.md
- docs/deployment/rollback.md
- docs/deployment/backup-restore.md
- checklist post-deploy

RESTRICCIONES
- no datos reales inicialmente
- no seed destructivo
- no exponer PostgreSQL públicamente salvo necesidad temporal controlada
- no guardar secretos en Git
```

En Railway:

1. Crear PostgreSQL staging.
2. Crear servicios web y api desde el repo.
3. Referenciar `DATABASE_URL`.
4. Configurar el comando pre-deploy de migraciones.
5. Configurar dominios.
6. Ejecutar pruebas E2E contra staging.
7. Probar restauración de backup.

---

# FASE 13 — Ensayo completo de migración

```powershell
git checkout -b migration/13-rehearsal
```

Prompt:

```text
/plan

OBJETIVO
Ejecutar una migración de ensayo completa contra staging con una copia del Excel real.

PASOS
1. backup del XLSX
2. checksum
3. perfilado
4. dry-run
5. revisión de errores
6. aplicar mapeos aprobados
7. commit a staging
8. reconciliación
9. pruebas E2E
10. prueba con usuarios
11. informe
12. borrar/restaurar staging
13. repetir importación para comprobar idempotencia

RECONCILIAR
- productos
- unidades
- grupos
- almacenes
- stock por producto-almacén
- total stock
- movimientos por tipo
- ventas únicas
- items
- totales
- ventas en tránsito
- finanzas
- cierres
- detalle por vendedor
- referencias huérfanas
- duplicados
- errores no resueltos

CRITERIO
No aprobar producción si existe una diferencia no explicada o una prueba crítica fallida.

CREA
- reports/private/rehearsal-report.md
- reports/private/rehearsal-report.json
- docs/migration/cutover-plan.md
- docs/migration/rollback-plan.md
- docs/migration/user-acceptance-checklist.md
```

---

# FASE 14 — Corte de producción

No delegues el corte entero sin supervisión. Usa el siguiente prompt para que Codex prepare y ejecute únicamente pasos verificables:

```text
/plan

OBJETIVO
Ejecutar el cutover aprobado de SGI La Comarca hacia producción con posibilidad real de reversión.

ANTES
- confirmar aprobación humana del rehearsal
- backup/copia de Google Sheets
- backup de PostgreSQL producción
- verificar commit/tag aprobado
- verificar variables
- anunciar ventana
- poner legacy en modo solo lectura o congelar escrituras
- exportar Excel final
- calcular checksum

EJECUCIÓN
1. desplegar versión aprobada
2. ejecutar migraciones de esquema
3. ejecutar importador dry-run con archivo final
4. comparar con rehearsal
5. detener si cambian anomalías de forma inesperada
6. ejecutar importación commit
7. reconciliar todos los totales
8. ejecutar smoke tests
9. crear usuarios
10. prueba con cada socio
11. habilitar acceso
12. mantener legacy solo lectura

STOP CONDITIONS
Detente y revierte si:
- falla una migración
- hay pérdida de filas
- stock no cuadra
- ventas no cuadran
- cierre o finanzas no cuadran
- autenticación falla
- una operación crítica no es atómica
- el reporte contiene un error crítico no aprobado

DESPUÉS
- generar informe final
- registrar hora de corte
- registrar versión
- registrar backups
- registrar responsables
- monitorear errores
- no eliminar Sheets durante el periodo de estabilización
```

Crear un tag:

```powershell
git tag -a v1.0.0 -m "SGI La Comarca production migration"
git push origin v1.0.0
```

---

## 6. Prompt de control después de cada fase

Pega siempre:

```text
Antes de considerar terminada esta fase:

1. Lee AGENTS.md.
2. Muestra git status y el resumen del diff.
3. Confirma que no modificaste legacy/private.
4. Ejecuta lint, typecheck, pruebas relevantes y build.
5. Corrige fallos causados por esta fase.
6. Revisa migraciones y seguridad.
7. Actualiza documentación.
8. No hagas commit.
9. Presenta:
   - archivos modificados
   - pruebas ejecutadas
   - resultados
   - riesgos
   - decisiones humanas
   - siguiente paso
```

Después ejecuta:

```text
/review Revisa los cambios no confirmados de esta fase como si fueran un pull request de producción. Prioriza pérdida de datos, errores transaccionales, autorización, concurrencia, cálculos monetarios, migraciones y regresiones funcionales. No modifiques archivos.
```

---

## 7. Prompt para corregir hallazgos de review

```text
Corrige únicamente los hallazgos confirmados del review anterior.

REGLAS
- No amplíes el alcance.
- Añade una prueba de regresión por cada corrección.
- No ocultes el error con un catch genérico.
- No reduzcas validaciones para hacer pasar pruebas.
- No cambies reglas de negocio sin documentarlo.
- Ejecuta todas las pruebas afectadas.
- Al final muestra qué hallazgo resolvió cada cambio.
```

---

## 8. Qué debes revisar personalmente

Aunque Codex haga el código, tú y tus socios deben aprobar:

- nombres de usuarios y roles;
- moneda del sistema;
- tratamiento de `DGGR-X`;
- tratamiento de los duplicados `CCWH-L`;
- líneas de venta duplicadas;
- ventas sin movimiento;
- movimientos sin venta;
- diferencias entre Inventario y Movimientos;
- ventas en tránsito;
- si los ingresos automáticos legacy se conservan solo como referencia;
- resultados de cada cierre;
- permisos para ver Finanzas;
- apariencia y facilidad del carrito;
- totales en staging;
- plan de corte y rollback.

---

## 9. Reglas para no gastar el límite de Codex innecesariamente

- Una fase por chat.
- No pedir “mejora todo”.
- Usar documentos como contexto persistente.
- Usar `/plan` antes de implementaciones grandes.
- Usar el modelo de mayor razonamiento en arquitectura, esquema, importador, concurrencia y seguridad.
- Usar un modelo más ligero para cambios visuales pequeños o documentación.
- No ejecutar varios agentes paralelos sobre módulos dependientes.
- Pedir resúmenes breves, pero pruebas completas.
- Corregir una lista concreta de hallazgos.
- Hacer commit después de cada puerta aprobada.

---

## 10. Criterio final de éxito

La migración solo se considera exitosa cuando:

- todas las funciones legacy tienen equivalente o decisión explícita;
- ninguna fila se pierde silenciosamente;
- el stock por producto y almacén está reconciliado;
- las ventas e items están reconciliados;
- finanzas y cierres están reconciliados;
- las transacciones son atómicas;
- no hay acceso anónimo;
- permisos están probados;
- la UI funciona en móvil y escritorio;
- staging fue aprobado por los socios;
- backup y restauración fueron probados;
- rollback está documentado;
- producción pasa smoke tests;
- Google Sheets queda disponible en solo lectura durante estabilización.

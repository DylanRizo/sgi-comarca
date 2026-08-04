# SGI La Comarca

Base técnica del nuevo Sistema de Gestión Integral de La Comarca. FASE 3A añade
el modelo estructural inicial de 23 entidades, su migración reproducible y un
bootstrap técnico de identidades, permisos y almacenes. No implementa
autenticación operativa, importación legacy ni servicios de inventario, ventas,
transferencias, finanzas o cierres.

## Requisitos para Windows

- Windows 10/11 con WSL 2 operativo.
- Docker Desktop 4.84.0 o compatible, usando el backend WSL 2.
- Node.js 24 LTS. El repositorio fija `24.13.0` en `.nvmrc`.
- Corepack habilitado y pnpm `11.18.0`.
- Git.

Compruebe el entorno desde PowerShell:

```powershell
node --version
corepack --version
pnpm --version
docker info
docker compose version
git --version
```

## Instalación reproducible

Desde la raíz del repositorio:

```powershell
pnpm install --frozen-lockfile
```

El lockfile debe conservarse. No instale Next.js, NestJS, Prisma, TypeScript,
Turborepo o Tailwind globalmente.

## Variables de entorno

Copie el ejemplo local. El archivo `.env` está ignorado por Git:

```powershell
Copy-Item .env.example .env
```

Las credenciales incluidas son exclusivamente para PostgreSQL local. En otros
ambientes, defina valores independientes y secretos fuera del repositorio.

Variables principales:

- `DATABASE_URL`: conexión de PostgreSQL utilizada por API y Prisma.
- `API_PORT`: puerto de NestJS; valor local `3001`.
- `WEB_ORIGIN`: origen exacto permitido por CORS.
- `NEXT_PUBLIC_API_URL`: URL pública que consulta la web.
- `SWAGGER_ENABLED`: habilita `/api/docs` solo fuera de producción.
- `LOG_LEVEL`: nivel de logging JSON.

## PostgreSQL local

Inicie únicamente PostgreSQL:

```powershell
docker compose up -d postgres
docker compose ps
```

El servicio usa PostgreSQL 18.4 Alpine, publica el puerto local `5433`, conserva
el árbol persistente `/var/lib/postgresql` en el volumen
`sgi-comarca_postgres_data` y declara un healthcheck con `pg_isready`. La imagen
define `PGDATA=/var/lib/postgresql/18/docker`; montar el directorio padre evita
que el clúster quede asociado a un volumen anónimo.

La imagen se fija por la etiqueta `postgres:18.4-alpine`, sin digest, para que
desarrollo local y CI compartan una referencia clara y única. El digest
resuelto debe registrarse durante la verificación de cada actualización.

Deténgalo sin eliminar el volumen:

```powershell
docker compose stop postgres
```

Para detener y retirar el contenedor conservando los datos:

```powershell
docker compose down
```

No use `docker compose down --volumes` salvo que quiera eliminar explícitamente
la base local de desarrollo.

## Prisma

Genere el cliente después de instalar dependencias o modificar el esquema:

```powershell
pnpm db:generate
```

FASE 3A define exactamente 23 tablas de aplicación. Prisma añade su tabla
técnica `_prisma_migrations`, que no cuenta como entidad de aplicación.

Valide, genere y aplique las migraciones de forma explícita:

```powershell
pnpm db:validate
pnpm db:generate
pnpm db:migrate:deploy
```

El bootstrap no se ejecuta durante build ni automáticamente con las
migraciones. Ejecútelo manualmente y puede repetirlo para comprobar
idempotencia:

```powershell
pnpm db:bootstrap
pnpm db:bootstrap
```

Para desarrollo de una migración nueva permanece disponible:

```powershell
pnpm db:migrate
pnpm db:studio
```

No ejecute una migración sin revisar primero el esquema, el SQL manual y
disponer de una base local activa.

El bootstrap de FASE 3A crea únicamente Dylan, Samantha, Jean y Luden en estado
pendiente de activación, los roles/permisos aprobados y Casa Dylan, Casa Luden
y Casa Jean. No crea contraseñas ni sesiones y no registra datos privados en
logs.

## Desarrollo

Con PostgreSQL saludable:

```powershell
pnpm dev
```

- Web técnica: `http://localhost:3000`
- Estado de API en la web: `http://localhost:3000/api-status`
- Health: `http://localhost:3001/api/v1/health`
- Readiness PostgreSQL: `http://localhost:3001/api/v1/ready`
- Swagger, si está habilitado: `http://localhost:3001/api/docs`

## Validaciones

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

`pnpm test:integration` requiere PostgreSQL activo y accesible mediante
`DATABASE_URL`. CI levanta su propio servicio PostgreSQL y ejecuta los mismos
comandos con el lockfile congelado.

Para aplicar el formateador de manera intencional:

```powershell
pnpm format
```

## Solución de problemas

### `docker info` no muestra la sección Server

Confirme que Docker Desktop está iniciado con backend WSL 2. Si quedó en un
estado transitorio, cierre Docker Desktop normalmente, ejecute `wsl --shutdown`
y vuelva a abrirlo. No es necesario instalar Ubuntu o Debian para el backend
interno de Docker Desktop.

### El puerto 5433 está ocupado

Defina otro puerto antes de levantar Compose y ajuste `DATABASE_URL`:

```powershell
$env:POSTGRES_PORT = '5434'
docker compose up -d postgres
```

### Readiness responde con error

Revise primero:

```powershell
docker compose ps
docker compose logs postgres --tail 50
```

Compruebe que `DATABASE_URL` corresponde al puerto y credenciales configurados.
La API no imprime la cadena completa en logs.

### pnpm usa una versión incorrecta

```powershell
corepack prepare pnpm@11.18.0 --activate
pnpm --version
where.exe pnpm
```

El primer resultado debe ser `11.18.0` y el shim de Corepack bajo
`C:\Program Files\nodejs` debe tener prioridad.

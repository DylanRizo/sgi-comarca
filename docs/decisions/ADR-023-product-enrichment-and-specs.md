# ADR-023 — Especificaciones técnicas de producto, tabla de medidas, materiales y enlaces multimedia

- Estado: `ACCEPTED_FOR_IMPLEMENTATION`
- Fecha: 2026-10-20
- Alcance: Catálogo de productos (`Product`), ficha técnica, guía de medidas por SKU, materiales, enlaces multimedia y permisos de edición restringidos.
- Fuente: solicitud del propietario de revisar, corregir, implementar y desplegar PR #11.
- Aprobación del propietario: inicialmente Dylan y Luden pueden editar; Administración puede delegar o retirar ese permiso. También autorizó la migración con un backup privado verificado por restauración y la actualización explícita de staging a 28 permisos, con grant a ADMIN y Luden y auditoría.

## Contexto

En el flujo operativo y de atención comercial de La Comarca, los clientes consultan constantemente información técnica detallada antes de concretar una compra:
1. **Medidas y dimensiones del SKU:** Para confirmar si la talla o corte se ajusta a su contextura física (especialmente en prendas deportivas, fajas y artículos de vestuario).
2. **Composición de materiales:** Para conocer el tipo de tela, porcentaje de elasticidad, transpirabilidad, durabilidad y cuidados.
3. **Fotografías y multimedia:** Para compartir con el cliente fotos reales de alta definición, modelaje o catálogos alojados en Google Drive o la nube.

Hasta la fecha, el modelo de datos de `Product` únicamente contemplaba `code`, `name`, `description`, `unitId`, `groupId` y `minimumStock`. Toda la información de medidas o materiales debía incrustarse en el campo genérico `description` o consultarse por fuera del sistema en chats o carpetas dispersas, generando demoras en la respuesta al cliente.

La gestión de inventario básica (`products.manage`) está asignada a los roles operativos de almacén. La propuesta original comprobaba rol y nombre de usuario. El propietario pidió poder delegar ese acceso posteriormente: se sustituye esa excepción por una capacidad efectiva explícita, no por una lista de identidades en código.

## Decisión

1. **Ampliación del Modelo de Datos (`Product`):**
   Se agregan tres columnas opcionales a la tabla `products`:
   - `materials_description` (`TEXT`): Texto libre multilínea que detalla la composición de materiales y especificaciones textiles/físicas.
   - `measurement_chart` (`TEXT`): Texto libre multilínea con la tabla, rangos o guía de medidas aplicables al SKU (soporta viñetas, tablas de texto y dimensiones).
   - `photos_url` (`VARCHAR(1024)`): enlace HTTPS a una carpeta de Google Drive.
   - Materiales admite 4.000 caracteres y medidas, 8.000. Son textos planos escapados, no HTML. Quien registra las medidas indica sus unidades; no se convierten ni infieren.
   - Una política compartida usa el constructor URL de la plataforma y exige host exacto `drive.google.com`, sin credenciales ni puerto no estándar, con ruta `/drive/folders/:id` o `/drive/u/:account/folders/:id`. Rechaza dominios parecidos, esquemas ejecutables, archivos sueltos y controles dentro de la dirección. No basta comprobar un prefijo.
   - Omitir un campo en edición conserva lo guardado; `null` o texto vacío lo elimina explícitamente si el actor puede editarlo. En creación, la omisión produce `NULL`. No se copia la descripción antigua ni se inventa información para completar las columnas.

2. **Gobernanza y Autorización Estricta:**
   - **Lectura privada autenticada:** `inventory.read` permite ver los campos en la ficha de detalle; `sales.read` por sí solo no abre el catálogo.
   - **Escritura y modificación:** exige `products.manage` y `products.specifications.manage` efectivos. Inicialmente el nuevo permiso se concede explícitamente al rol ADMIN y directamente a Luden; Samantha y Jean no lo reciben. El servidor rechaza cambios técnicos sin esa capacidad con `STOCK_PERMISSION_DENIED`.
   - Administración puede conceder, retirar o denegar la capacidad mediante el panel existente y sus operaciones auditadas. No se asigna ADMIN ni se conceden privilegios financieros. Los nueve permisos administrativos reservados de ADR-020 no cambian: esta capacidad de catálogo es delegable, aunque ADMIN también la reciba.
   - Si un usuario no autorizado edita otros campos del producto (nombre, categoría, unidad, stock mínimo), los valores existentes de especificaciones técnicas se preservan intactos sin lanzar error.
   - La identidad debe estar activa y activada. Un `DENY` de cualquiera de las dos capacidades prevalece, incluso para ADMIN. La autorización se comprueba en el servidor para cada mutación, sin excepción por nombre o rol.

3. **Creación y Edición en Web POS (`apps/web`):**
   - Se habilitan los campos en el formulario de creación (`/products/new`) y edición (`/products/:id/edit`).
   - El panel consulta `GET /api/v1/products/specifications-access`, privado y protegido con `products.manage`, que devuelve `{ canEditSpecifications }` usando la misma política del servidor. No deduce ADMIN de `users.roles.manage` ni de un nombre escrito en la interfaz.
   - Sin acceso de edición, los campos permiten leer/copiar y se omiten de la solicitud al guardar. No se reenvían valores copiados para simular una edición autorizada. Los enlaces inválidos tampoco se activan en la revisión previa o el detalle.
   - En la vista de detalle (`/products/:id`), se renderiza una sección destacada **"Especificaciones del Producto & Multimedia"** con formateo preservado para medidas y botón de apertura segura (`target="_blank" rel="noopener noreferrer"`) para el enlace de fotos.

4. **Compatibilidad con Clientes Externos y Bot de Marketplace:**
   - La adición de columnas es aditiva y retrocompatible.
   - Los dos detalles internos de producto exponen los campos. La lista paginada conserva su resumen ligero y no transporta estos textos largos por fila.
   - No se amplía la proyección externa de Marketplace, la respuesta audible de Alexa ni ninguna ruta pública.

## Consecuencias

### Positivas
- Respuesta comercial inmediata: vendedores y cajeros acceden a medidas, materiales y fotos en un clic desde la ficha del producto.
- Flexibilidad total: al ser campos de texto libre multilínea, admiten cualquier línea de producto presente o futura (ropa, fajas, accesorios, suplementos).
- Integridad del catálogo: inicialmente Administración y Luden actualizan la información; otras personas pueden hacerlo solo si Administración les delega la capacidad.

### Consideraciones
- Requiere migración SQL aditiva en PostgreSQL (`ALTER TABLE products ADD COLUMN ...`).

## Aceptación Verificable

- **PostgreSQL:** La tabla `products` acepta valores nulos y textos en las tres nuevas columnas sin alterar datos históricos.
- **API:** comprobar grants iniciales, delegación y revocación auditadas, DENY para ambos editores iniciales y edición ordinaria sin sobrescribir campos protegidos. El nombre del usuario no determina la autorización.
- **Frontend Web:** La ficha de detalle muestra ordenadamente las especificaciones, preserva saltos de línea en medidas y abre el enlace de fotos. El formulario bloquea la edición a usuarios no autorizados.

## Enlace y acceso a Google Drive

Se guarda un enlace, no archivos adjuntos. El SGI no descarga, enumera, indexa ni incrusta fotos, no conecta una cuenta Google y no modifica permisos de carpetas. Abrir en otra pestaña usa `noopener noreferrer`. La existencia de la carpeta y el acceso de cada persona dependen de Drive: validar la sintaxis no confirma existencia o acceso.

## Consistencia, pruebas y despliegue

Se conservan CSRF, idempotencia, bloqueo del producto, `expectedUpdatedAt`, bloqueo de código/unidad con historial y auditoría de antes/después. Producto y primera entrada siguen siendo una transacción; editar especificaciones no escribe existencias ni snapshots de venta/entrada.

Probar clearing/omisión, DENY, límites, enlaces engañosos, concurrencia, respuesta perdida, auditoría, primera entrada y móvil claro/oscuro sin desbordamiento ni ejecución de HTML. No editar fichas reales para probar un despliegue.

La migración `20261020160000_product_enrichment_specs` añade tres columnas opcionales sin defaults ni backfill; no añade tabla, trigger, permiso o rol. Staging exige destino directo verificado y un backup privado fresco comprobado por restauración completa. Comparar los datos anteriores de Productos excluyendo las nuevas columnas, que deben quedar nulas. La actualización RBAC tiene aprobación separada: bootstrap actualiza catálogo y grants por rol, sin resembrar asignaciones personales en una base en uso (ADR-020). Conceder el permiso a Luden es una operación administrativa auditada independiente, conservando sus demás excepciones. Desplegar API antes de web. No cargar información real ni modificar stock para probar.

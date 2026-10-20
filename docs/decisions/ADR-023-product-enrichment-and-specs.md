# ADR-023 — Especificaciones técnicas de producto, tabla de medidas, materiales y enlaces multimedia

- Estado: `PROPOSED_FOR_IMPLEMENTATION`
- Fecha: 2026-10-20
- Alcance: Catálogo de productos (`Product`), ficha técnica, guía de medidas por SKU, materiales, enlaces multimedia y permisos de edición restringidos.
- Aprobador: propietario del proyecto

## Contexto

En el flujo operativo y de atención comercial de La Comarca, los clientes consultan constantemente información técnica detallada antes de concretar una compra:
1. **Medidas y dimensiones del SKU:** Para confirmar si la talla o corte se ajusta a su contextura física (especialmente en prendas deportivas, fajas y artículos de vestuario).
2. **Composición de materiales:** Para conocer el tipo de tela, porcentaje de elasticidad, transpirabilidad, durabilidad y cuidados.
3. **Fotografías y multimedia:** Para compartir con el cliente fotos reales de alta definición, modelaje o catálogos alojados en Google Drive o la nube.

Hasta la fecha, el modelo de datos de `Product` únicamente contemplaba `code`, `name`, `description`, `unitId`, `groupId` y `minimumStock`. Toda la información de medidas o materiales debía incrustarse en el campo genérico `description` o consultarse por fuera del sistema en chats o carpetas dispersas, generando demoras en la respuesta al cliente.

Asimismo, la gestión de inventario básica (`products.manage`) está asignada a los roles operativos de almacén, pero las especificaciones técnicas maestras, composición de catálogo y enlaces oficiales a fotos deben mantenerse estrictamente gobernadas para evitar alteraciones no coordinadas. El propietario ha determinado que la edición de estas especificaciones técnicas debe estar **restringida exclusivamente al rol Administrador (`ADMIN`) y al usuario catalogador `luden`**.

## Decisión

1. **Ampliación del Modelo de Datos (`Product`):**
   Se agregan tres columnas opcionales a la tabla `products`:
   - `materials_description` (`TEXT`): Texto libre multilínea que detalla la composición de materiales y especificaciones textiles/físicas.
   - `measurement_chart` (`TEXT`): Texto libre multilínea con la tabla, rangos o guía de medidas aplicables al SKU (soporta viñetas, tablas de texto y dimensiones).
   - `photos_url` (`VARCHAR(1024)`): URL web segura (`http://` o `https://`) que apunta a la carpeta de Google Drive, nube o catálogo fotográfico oficial.

2. **Gobernanza y Autorización Estricta:**
   - **Lectura Pública Interna:** Cualquier usuario con acceso a consultar productos o inventario (`inventory.read` / `sales.read`) puede ver estos campos en la ficha de detalle (`ProductDetailView`).
   - **Escritura y Modificación:** Solo un usuario con rol `ADMIN` (Dylan) o cuyo identificador de acceso sea `'luden'` puede suministrar o modificar `materialsDescription`, `measurementChart` o `photosUrl` tanto al crear (`createProduct`) como al editar (`editProduct`). Si otro usuario con `products.manage` intenta modificarlos, el servidor rechaza la transacción con `STOCK_PERMISSION_DENIED`.
   - Si un usuario no autorizado edita otros campos del producto (nombre, categoría, unidad, stock mínimo), los valores existentes de especificaciones técnicas se preservan intactos sin lanzar error.

3. **Creación y Edición en Web POS (`apps/web`):**
   - Se habilitan los campos en el formulario de creación (`/products/new`) y edición (`/products/:id/edit`).
   - El panel evalúa la sesión del usuario (`session.permissions.includes('users.roles.manage') || session.identifier === 'luden'`). Si el usuario no tiene privilegios de enriquecimiento técnico, los campos se presentan deshabilitados con una indicación clara.
   - En la vista de detalle (`/products/:id`), se renderiza una sección destacada **"Especificaciones del Producto & Multimedia"** con formateo preservado para medidas y botón de apertura segura (`target="_blank" rel="noopener noreferrer"`) para el enlace de fotos.

4. **Compatibilidad con Clientes Externos y Bot de Marketplace:**
   - La adición de columnas es aditiva y retrocompatible.
   - Los endpoints de consulta (`ProductReadService.get`, `ProductReadService.list`) exponen los campos en `ProductDetail`.

## Consecuencias

### Positivas
- Respuesta comercial inmediata: vendedores y cajeros acceden a medidas, materiales y fotos en un clic desde la ficha del producto.
- Flexibilidad total: al ser campos de texto libre multilínea, admiten cualquier línea de producto presente o futura (ropa, fajas, accesorios, suplementos).
- Integridad del catálogo: únicamente Administración y Luden pueden definir o actualizar el material oficial y enlaces multimedia.

### Consideraciones
- Requiere migración SQL aditiva en PostgreSQL (`ALTER TABLE products ADD COLUMN ...`).

## Aceptación Verificable

- **PostgreSQL:** La tabla `products` acepta valores nulos y textos en las tres nuevas columnas sin alterar datos históricos.
- **API (Creación y Edición):** `ADMIN` y `luden` pueden crear y actualizar los tres campos. Usuarios sin rol `ADMIN` ni login `luden` reciben `STOCK_PERMISSION_DENIED` al intentar suministrar o modificar dichos campos.
- **Frontend Web:** La ficha de detalle muestra ordenadamente las especificaciones, preserva saltos de línea en medidas y abre el enlace de fotos. El formulario bloquea la edición a usuarios no autorizados.

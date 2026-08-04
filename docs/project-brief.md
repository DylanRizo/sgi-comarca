# Project brief — SGI La Comarca

## 1. Resumen ejecutivo

SGI La Comarca migrará su sistema operativo desde Google Apps Script y Google Sheets a una aplicación web de producción basada en Next.js, NestJS y PostgreSQL. La migración debe preservar las funciones verificadas del sistema actual, eliminar el acceso anónimo, garantizar consistencia transaccional y permitir reconciliar cada fila legacy sin pérdida silenciosa.

La solución V1 será un monolito modular dentro de un monorepo, funcionará con conexión a internet en computadora y teléfono y tendrá como objetivo de hosting inicial un máximo de USD 15 mensuales. El sistema legacy permanecerá disponible en modo solo lectura durante un periodo de estabilización cuya duración aún requiere aprobación.

## 2. Contexto del negocio

La Comarca administra productos, existencias por almacén, entradas, ajustes, transferencias, ventas, finanzas, cierres diarios, auditorías, reportes y analítica. El sistema actual usa nueve hojas de cálculo como almacenamiento operacional y un web app de Apps Script como interfaz.

Los usuarios iniciales aprobados son Dylan, Samantha, Jean y Luden. Las cuentas se crearán explícitamente durante la configuración inicial; los nombres encontrados en datos legacy no crearán usuarios ni determinarán permisos automáticamente.

## 3. Problema actual

El sistema legacy presenta riesgos confirmados:

- acceso anónimo y ausencia de autorización backend;
- operaciones críticas no atómicas;
- posibilidad de stock parcial, negativo por concurrencia o reposición duplicada;
- saldos contradictorios entre Inventario y Movimientos;
- duplicados, referencias huérfanas y evolución del esquema de Ventas;
- consultas financieras con efectos laterales y riesgo de doble contabilización;
- catálogos, personas y almacenes escritos directamente en código;
- ausencia de auditoría general e idempotencia.

Las anomalías están detalladas en `docs/legacy/data-quality-report.md` y no deben corregirse automáticamente.

## 4. Objetivo del nuevo SGI

Construir una aplicación segura, consistente, mantenible y trazable que:

- preserve todos los flujos legacy con destino aprobado;
- use PostgreSQL como sistema operacional de registro;
- garantice transacciones atómicas e idempotentes;
- mantenga un balance único por producto y almacén y un ledger inmutable;
- aplique autenticación por sesiones y autorización backend;
- permita migrar, reconciliar y revertir datos de forma verificable;
- ofrezca una experiencia profesional, accesible y responsive.

## 5. Usuarios y partes interesadas

| Persona o grupo | Participación aprobada |
|---|---|
| Dylan | Usuario inicial; acceso financiero; puede crear/reabrir cierres y es la única persona autorizada inicialmente para cancelar ventas |
| Samantha | Usuario inicial; acceso financiero; puede crear/reabrir cierres |
| Jean | Usuario inicial; puede realizar ajustes; sin acceso financiero inicial |
| Luden | Usuario inicial; puede realizar ajustes; sin acceso financiero inicial |
| Propietario y socios | Aprueban resoluciones de datos, permisos, staging, corte y estabilización |
| Equipo de migración | Implementa, prueba, documenta y reconcilia sin decidir reglas no aprobadas |

Los nombres personales no sustituyen roles. La configuración inicial asignará
roles técnicos y permisos explícitos. FASE 3A no crea una capacidad para
administrar acceso financiero.

## 6. Alcance obligatorio de V1

- autenticación, usuarios, roles y sesiones;
- productos, unidades y grupos;
- almacenes e inventario por producto–almacén;
- movimientos inmutables, entradas, ajustes y transferencias;
- ventas multi-item y multi-almacén;
- ventas completadas y en tránsito, confirmación y cancelación aprobada;
- ingresos y gastos manuales;
- cierres diarios y reapertura autorizada;
- auditoría física y ajustes resultantes;
- reportes, exportaciones, impresión y analytics reconciliados;
- importador XLSX idempotente con dry-run, commit y reportes;
- conservación documentada del importador CSV legacy como proceso separado;
- configuración, audit logs, staging, producción, backup y rollback.

## 7. Fuera de alcance de V1

- funcionamiento offline;
- CRM completo;
- WhatsApp Business API;
- automatizaciones de marketing;
- Meta Ads;
- catálogo público;
- devoluciones, cambios y reembolsos;
- cancelaciones parciales;
- gestión documental completa;
- dominio personalizado mientras no se seleccione uno.

La arquitectura no debe impedir evaluar extensiones futuras, pero V1 no las implementará.

## 8. Procesos críticos

1. crear, editar y desactivar productos;
2. registrar entradas y actualizar saldo/movimiento juntos;
3. realizar ajustes positivos y negativos auditados;
4. transferir existencias de forma atómica;
5. registrar ventas multi-item y multi-almacén;
6. confirmar una venta en tránsito sin descontar de nuevo;
7. cancelar una venta elegible y reponer exactamente una vez;
8. registrar movimientos financieros manuales sin duplicar ventas;
9. crear y reabrir cierres autorizados;
10. ejecutar auditorías físicas con aprobación;
11. importar, reconciliar y repetir la migración sin duplicar datos.

## 9. Reglas de negocio aprobadas

- Todo cambio de stock crea un movimiento inmutable.
- El stock no puede quedar negativo.
- Solo existe un balance por producto y almacén.
- Las operaciones críticas se confirman o revierten completas.
- Las cantidades admiten decimales.
- Dinero usa PostgreSQL `NUMERIC` y Prisma `Decimal`.
- La moneda principal es NIO y el símbolo de presentación es C$.
- Los timestamps se guardan en UTC y se presentan en `America/Managua`.
- Los productos con historial se desactivan; no se borran físicamente.
- Toda mutación importante registra actor, fecha, entidad y cambios.
- Las anomalías se resuelven individualmente con aprobación y trazabilidad.

## 10. Productos, inventario y almacenes

La hoja Inventario es la fuente inicial aprobada para cantidad, precio y costo operativos. Cuando difiere de Productos o Movimientos, ambos valores legacy se conservan, la diferencia se reporta y no se sobrescribe silenciosamente.

El perfil de FASE 0 confirma que un mismo producto puede tener costos distintos entre almacenes en 19 códigos y precios distintos en 9 códigos. Por ello el modelo conservará evidencia por fila y snapshots históricos; la definición posterior de precio/costo global no eliminará la variación original.

Todos los usuarios iniciales pueden realizar ajustes. Cada ajuste requiere
motivo, responsable, timestamp, cantidad anterior, cantidad nueva, movimiento
inmutable y audit log. La capacidad técnica transfers.create existe, pero
permanece sin grants para usuarios o roles. Una asignación futura requiere
aprobación explícita.

## 11. Ventas

Una venta puede incluir múltiples artículos y almacenes. El almacén pertenece a cada artículo. El backend recalcula importes y guarda snapshots de precio/costo; no confía en subtotales del navegador.

Una venta en tránsito descuenta inventario al registrarse. Cualquier usuario con rol autorizado de vendedor puede confirmarla. Confirmar guarda actor y timestamp, es idempotente y no modifica stock de nuevo. Una venta cancelada no puede confirmarse y una ya completada no produce efectos adicionales.

Solo Dylan puede cancelar inicialmente. El motivo es obligatorio; no hay cancelación parcial; una venta pagada o completada no puede cancelarse. Solo una venta no pagada o en tránsito puede cancelarse. La operación repone cada artículo en su almacén original exactamente una vez y registra auditoría.

Devoluciones, cambios y reembolsos no se modelan como cancelaciones y están fuera de V1.

## 12. Finanzas y cierres

Solo Dylan y Samantha pueden ver importes financieros, registrar ingresos/gastos y crear o reabrir cierres. Jean y Luden no tendrán acceso financiero mientras Dylan no cambie explícitamente sus permisos.

Las ventas completadas son una fuente calculada de ingresos; las filas automáticas legacy se preservan como evidencia, pero no se vuelven a contabilizar. Los cierres conservan detalle por vendedor. La fórmula final, la tolerancia y el tratamiento de ventas pendientes siguen sujetos a decisiones abiertas documentadas.

## 13. Auditoría

El sistema registrará actor, instante, entidad, acción y cambios de mutaciones importantes. Los movimientos de stock y los audit logs históricos serán inmutables.

La auditoría física futura tendrá sesión, almacenes configurables, conteo, saldo esperado, diferencia, aprobación y ajustes atómicos vinculados. La función externa hard-coded legacy no se ejecutará automáticamente.

## 14. Reportes y analytics

V1 conservará filtros, búsqueda, paginación, exportación CSV e impresión de reportes/cierres. Los KPIs cubrirán inventario, movimientos, ventas, canales, vendedores, productos, finanzas y cierres.

Cada KPI deberá tener una definición única y verificarse contra consultas SQL. Cuando el costo no sea confiable, margen/utilidad se mostrará como desconocido en lugar de asumir utilidad plena. La decisión sobre el dashboard canónico sigue abierta.

## 15. Seguridad y permisos

- Ninguna ruta operacional de producción será anónima.
- Se usarán sesiones opacas revocables y cookies `HttpOnly`, `Secure` y `SameSite`.
- Las contraseñas se almacenarán con Argon2.
- La autorización se aplicará en NestJS y se denegará por defecto.
- Finanzas se limitará inicialmente a Dylan y Samantha mediante roles asignados.
- Cancelación se limitará a Dylan mediante un permiso técnico asignado.
- Login tendrá rate limiting y las mutaciones usarán protección CSRF e idempotencia.
- No se expondrán secretos, hashes, cookies ni datos privados en logs o commits.

## 16. Experiencia de usuario

La interfaz será en español, minimalista, profesional, funcional, mobile-first y accesible por teclado. Los colores tendrán propósito semántico para acciones, estados, advertencias, errores, éxito, módulos e información relevante. El color no será el único indicador de estado.

Todas las vistas incluirán estados de carga, vacío, error y éxito; las mutaciones evitarán doble envío y las acciones destructivas exigirán confirmación.

Los colores específicos y el logotipo permanecen abiertos.

## 17. Dispositivos y conectividad

V1 funcionará en computadora y teléfono y requiere conexión a internet. No se implementará modo offline. La separación entre UI, API y dominio debe permitir evaluar una capacidad offline futura sin comprometer las invariantes actuales.

## 18. Migración y reconciliación

- El XLSX original nunca se modifica.
- El importador nuevo soportará `--dry-run` y `--commit`, será idempotente y generará reportes JSON/Markdown.
- Cada dato migrado conservará `legacy_id`, `legacy_row_number`, `import_batch_id` y `raw_data` cuando corresponda.
- Los duplicados/anomalías se detectan, preservan y resuelven individualmente mediante un archivo versionado de mapeos.
- Inventario establece cantidad, precio y costo iniciales; Movimientos se conserva como historial.
- Ninguna fila se omite silenciosamente ni se sintetizan contrapartes sin aprobación.
- El importador CSV legacy y el importador XLSX nuevo se documentan como procesos diferentes.

## 19. Despliegue y presupuesto

Desarrollo usará Docker Compose. CI usará GitHub Actions. Staging y producción se desplegarán por separado en Railway con servicios web, API y PostgreSQL.

El presupuesto objetivo inicial es máximo USD 15 mensuales. FASE 12 deberá validar el costo real y documentar cualquier imposibilidad antes de contratar recursos adicionales. No existe dominio definido; se usarán dominios temporales de la plataforma mientras se decide.

La arquitectura incluirá mecanismos para backups programados, restauración probada, monitoreo básico y rollback. Política, RPO, RTO y caída máxima permanecen abiertos.

## 20. Criterios medibles de éxito

- cero rutas operativas anónimas en producción;
- los cuatro usuarios acceden según permisos explícitos;
- Finanzas solo es visible y consultable por Dylan y Samantha;
- ninguna fila se pierde sin explicación;
- stock por producto–almacén queda reconciliado;
- precio y costo inicial provienen de Inventario;
- ventas multi-item y multi-almacén pasan pruebas E2E;
- confirmar nunca descuenta dos veces;
- cancelar nunca repone dos veces y una venta pagada no se cancela;
- todo ajuste registra motivo, responsable, valores anterior/nuevo, movimiento y auditoría;
- solo Dylan y Samantha crean o reabren cierres inicialmente;
- rutas críticas funcionan en móvil y escritorio;
- staging se aprueba antes de producción;
- el costo queda dentro del objetivo o se documenta la excepción;
- Sheets permanece en solo lectura durante estabilización;
- backup y restauración se prueban antes del corte.

## 21. Riesgos

Los riesgos prioritarios son pérdida o duplicación de stock, doble contabilización, resoluciones incorrectas de datos, permisos financieros insuficientes, cancelaciones concurrentes, fechas mal convertidas, KPIs con costo no confiable y una política de recuperación aún no definida. El registro completo está en `docs/legacy/risk-register.md`.

## 22. Decisiones todavía abiertas

- resolución individual de duplicados y anomalías;
- permisos exactos de transferencias;
- asignación de rol SALES a los usuarios autorizados;
- normalización de unidades, personas y canales;
- resolución individual de costos cero, costos distintos entre almacenes, inconsistencias históricas de costo y definición de margen cuando el costo no sea confiable;
- estados y métodos de pago históricos ambiguos;
- fórmula/tolerancia final de cierre y tratamiento de pendientes;
- límite temporal de reapertura, reapertura con cierres posteriores y proceso de nueva aprobación después de modificar un cierre;
- dashboard/KPIs canónicos;
- dominio;
- política de backups, RPO, RTO y caída máxima;
- duración de estabilización y retención de Sheets;
- colores específicos y logotipo.

## 23. Aprobaciones

| Decisión | Clasificación resultante |
|---|---|
| DEC-001 | `APPROVED`: NIO, símbolo C$, zona `America/Managua` |
| DEC-002 | `PARTIALLY_APPROVED`: cuatro usuarios iniciales; sin cuentas derivadas de texto legacy |
| DEC-003 | `PARTIALLY_APPROVED`: Finanzas, cierres, ajustes y cancelación definidos; transferencias y asignación SALES pendientes |
| DEC-004–DEC-010 | `PARTIALLY_APPROVED`: procedimiento humano aprobado; resolución por registro pendiente |
| DEC-014 | `APPROVED`: Inventario determina precio operativo inicial; evidencia divergente se conserva |
| DEC-015 | `PARTIALLY_RESOLVED`: `APPROVED_BY_OWNER` que Inventario determina el costo operativo inicial, se conserva el snapshot histórico y no se sobrescriben otras fuentes; costos cero, diferencias entre almacenes, inconsistencias históricas y margen no confiable siguen `REQUIRES_HUMAN_APPROVAL_BEFORE_IMPORT_COMMIT_OR_ANALYTICS` |
| DEC-020 | `APPROVED`: vendedores autorizados confirman con actor/timestamp, sin nuevo descuento e idempotentemente |
| DEC-021 | `APPROVED`: solo Dylan cancela; motivo, elegibilidad, reposición total exacta e idempotencia |
| DEC-025 | `PARTIALLY_RESOLVED`: `APPROVED_BY_OWNER` que Dylan y Samantha crean/reabren cierres; reapertura exige motivo, actor, timestamp, conservación histórica, audit log, ausencia de borrado físico y autorización; límite temporal, cierres posteriores y nueva aprobación siguen abiertos |
| DEC-031 | `RESOLVED`: política de privacidad `APPROVED_BY_OWNER`; fuentes/datos/reportes privados quedan fuera de Git y los documentos versionados contienen solo información sanitizada |
| DEC-032 | `RESOLVED`: `docs/project-brief.md` consolida las fuentes de negocio y decisiones aprobadas; futuras mejoras documentales no bloquean FASE 1 |
| Resto | Permanece `REQUIRES_HUMAN_APPROVAL` según `docs/legacy/open-decisions.md` y la sección 22 |

Estas aprobaciones provienen de las respuestas aprobadas por el propietario suministradas para FASE 1. No modifican la evidencia histórica de FASE 0.

# FASE 10 — Unificación UI: planificación

- Rama: `migration/10-ui`
- Fecha de planificación: 2026-09-01
- Estado: `PHASE_10_PLANNING_COMPLETE`, `PHASE_10_NOT_STARTED`
- Autoridad de alcance:
  [ADR-012](../decisions/ADR-012-ui-stack-deviation.md)

Planificar no autoriza implementar. Cada bloque cierra por separado y ninguno
toca esquema, RBAC, reglas de negocio ni staging.

## 1. Estado verificado el 2026-09-01

Todo lo siguiente se comprobó leyendo el repositorio, no por supuesto.

- 21 páginas bajo `apps/web/app`, repartidas en `(private)`, `(public)` y raíz.
- `globals.css` tiene 1,503 líneas y aporta el sistema de tokens de FASE 9C
  (color, radio, sombra, movimiento, tipografía), modo oscuro por preferencia
  del sistema y transiciones que respetan `prefers-reduced-motion`.
- **Responsive mínimo**: de las 5 `@media` del archivo, dos son consultas de
  preferencia (`prefers-color-scheme`, `prefers-reduced-motion`). Solo tres son
  puntos de corte reales: `min-width: 40rem`, `min-width: 48rem` y
  `max-width: 47.99rem`.
- **Accesibilidad incipiente**: 6 reglas de `:focus`/`focus-visible` en total;
  atributos `aria-` presentes en solo 4 de las 21 páginas.
- **Sin iconografía**: cero elementos `<svg>` en toda la aplicación.
- **Tablas**: `<table>` aparece en tres pantallas — conteos de inventario,
  detalle de conteo y reportes.
- **Verificación actual**: un único proyecto Playwright, `chromium` de
  escritorio, con 32 pruebas en verde.

## 2. Alcance aprobado

El propietario aprobó el 2026-09-01 el alcance registrado en
[ADR-012](../decisions/ADR-012-ui-stack-deviation.md): FASE 10 cumple la puerta
de la fase y añade **solo Lucide**; conserva el sistema de tokens de 9C y no
migra a shadcn/ui. TanStack Query, TanStack Table, React Hook Form + Zod y
Recharts quedan sin adoptar y sin rechazar.

## 3. Restricción técnica que condiciona la puerta

`apps/web/playwright.config.ts` documenta, y el arnés confirma, que:

- los specs se numeran (`01-` … `04-`) porque el orden importa;
- corren con `fullyParallel: false` y `workers: 1` sobre **una sola** base
  efímera creada por `run-e2e.mjs`;
- el historial de ventas y movimientos es inmutable, porque los triggers de
  FASE 7A/8A prohíben borrarlo;
- `02-inventory.e2e.ts` afirma un **conteo global exacto de productos**, por lo
  que debe ejecutarse antes de que cualquier otra suite cree un producto.

Consecuencia directa: **no se pueden ejecutar los cuatro specs existentes en
tres viewports contra la misma base**. La segunda pasada encontraría los
productos creados por la primera y la aserción de conteo exacto fallaría. Esto
descarta la solución ingenua de añadir dos proyectos Playwright que reutilicen
las mismas pruebas.

La puerta multi-viewport debe construirse, por tanto, con un conjunto de
pruebas **nuevo y sin aserciones de estado global**, que verifique presentación
y accesibilidad en lugar de reglas de negocio. Las cuatro suites funcionales
existentes permanecen en escritorio y conservan su numeración.

## 4. Secuencia propuesta

### 10A — Base responsive e iconografía

- Incorporar `lucide-react` con versión exacta.
- Definir la escala de puntos de corte como tokens explícitos, en lugar de los
  tres valores sueltos actuales, y documentar cuál corresponde a móvil, tablet
  y escritorio.
- Navegación adaptable: el encabezado permanente actual debe resolverse en
  móvil sin ocultar destinos ni duplicar nombres accesibles. FASE 9C ya corrigió
  una regresión de dos enlaces con un mismo nombre accesible; no reintroducirla.
- Presentación móvil para las tres pantallas con `<table>`, sin esconder
  columnas críticas y sin perder la información en pantallas estrechas.
- Sin cambios de reglas de negocio ni de textos de dominio.

### 10B — Accesibilidad

- Foco visible y consistente en todo elemento interactivable; hoy hay seis
  reglas para 21 páginas.
- Recorrido completo por teclado en los flujos críticos, incluido el orden de
  tabulación y el escape de modales.
- Landmarks y encabezados jerárquicos coherentes; enlace de salto al contenido.
- Revisión de contraste contra los tokens, en claro y en oscuro.
- `aria-` solo donde el HTML nativo no baste; preferir el elemento correcto
  antes que el atributo.

### 10C — Verificación multi-viewport

- Añadir proyectos Playwright para tablet y móvil que ejecuten **únicamente**
  el conjunto nuevo de presentación/accesibilidad descrito en §3.
- Mantener `chromium` de escritorio ejecutando las cuatro suites funcionales
  con su numeración y su base compartida intactas.
- Cubrir desbordamiento horizontal, modales, formularios, filtros y tablas en
  cada viewport.
- Capturas de las rutas críticas como evidencia de la aceptación visual.

## 5. Condiciones de parada

Detener el bloque y reportar si:

- una aserción de conteo global vuelve a acoplarse al orden de ejecución;
- el arnés E2E requiere más de una base para el conjunto funcional existente;
- una pantalla pierde funcionalidad o una columna crítica para caber en móvil;
- aparece un emoji como iconografía;
- el trabajo visual exige un cambio de regla de negocio, de contrato o de
  permiso;
- una corrección de accesibilidad rompe un selector del que dependen las
  suites existentes; corregir la pantalla, nunca debilitar la prueba.

## 6. Puertas de aceptación

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` y
  `pnpm build` sin regresión respecto al cierre de 9C.
- Las 32 pruebas E2E existentes siguen en verde y sin renumerar.
- El conjunto nuevo pasa en escritorio, tablet y móvil.
- Los criterios verificables de ADR-012 § "Aceptación verificable" se cumplen.
- Sin hallazgos críticos o altos atribuibles a la fase.

## 7. Decisión abierta que no bloquea el inicio

`docs/migration/phased-roadmap.md` marca **colores y logotipo** como decisión
«abierta y posponible», con límite «antes de aceptación visual FASE 10». Los
bloques 10A–10C pueden ejecutarse sobre los tokens actuales sin ella, pero la
**aceptación visual final** de la fase la requiere. No inventar una identidad
de marca: si no hay decisión, se conserva la paleta sobria vigente y se reporta
el pendiente.

## 8. Estado al cerrar esta planificación

- `PHASE_10_PLANNING_COMPLETE`
- `PHASE_10_NOT_STARTED`
- Alcance fijado por ADR-012; ninguna librería añadida todavía.
- Sigue abierto e independiente el gate operacional
  `FIRST_STAGING_INVENTORY_COUNT`.

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

### 1.1 Correcciones a este inventario — 2026-09-01, durante la ejecución

Tres de los puntos anteriores resultaron equivocados al implementar. Se
conservan arriba como fotografía de lo que se creyó al planificar, y se
corrigen aquí:

- **Las tablas no son tres, son once**, y el conteo original omitió
  `apps/web/components`. Más importante: **ya tenían presentación móvil**. El
  bloque `max-width: 47.99rem` convierte `.data-table` en tarjetas usando
  `data-label` por celda, y las once la usan. La tabla de reportes parecía
  carecer de `data-label`, pero su única ocurrencia es un bucle sobre
  `definition.columns`. **No hubo trabajo pendiente aquí.**
- **«6 reglas de foco» era una métrica engañosa**: contaba ocurrencias, no
  cobertura. Existe una regla global `:focus-visible` con contorno de 2px y
  desplazamiento, que cubre todo elemento enfocable. La indicación de foco ya
  estaba resuelta.
- **El destino del skip link existe**: `<main id="main-content">` está presente
  en todas las pantallas. No estaba roto.

Además, un límite técnico que el §4 pedía y **CSS no permite**: los puntos de
corte no pueden tokenizarse con variables, porque `@media (min-width: var(--x))`
no es válido. Lo máximo honesto es normalizar y documentar los valores, no
«tokenizarlos». El bloque 10A se ejecutó sin ese punto.

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

## 9. Ejecución — 2026-09-01, rama `migration/10-ui`

### 10A — base responsive e iconografía (completo)

`lucide-react` fijado a versión exacta; los diez destinos llevan icono
decorativo (`aria-hidden`), de modo que ningún nombre accesible cambió y la
suite conservó sus selectores.

Las capturas de la app en ejecución revelaron un defecto que las pruebas no
podían ver: con diez destinos en una tira `overflow-x: auto`, **Analytics caía
fuera del viewport incluso a 1440px**, sin ninguna señal de que existiera; en
un teléfono de 390px cabían tres de diez. Playwright no lo detectaba porque
resuelve enlaces por rol y nombre y los desplaza al viewport, así que las 32
pruebas pasaban con el defecto presente. Los iconos lo habían agravado al
ensanchar cada enlace.

La navegación ahora **envuelve** en lugar de desplazarse, y bajo 48rem colapsa
tras un botón con `aria-expanded`/`aria-controls`. Cierra desde el clic del
contenedor, no desde un efecto que observe la ruta.

### 10B — accesibilidad (parcial)

Los cinco diálogos declaraban `aria-modal="true"` —que promete que el resto de
la página está inerte— **sin que nada lo hiciera cumplir**: el foco no entraba,
Tab salía a la página de atrás, Escape no hacía nada y al cerrar el foco quedaba
huérfano. La declaración era falsa, que es peor que no declararla.

Un único hook `useModalDialog` aporta el comportamiento en un sitio en vez de
cinco: foco inicial, envoltura de Tab y Shift+Tab, recuperación si escapa,
cierre con Escape y restauración al disparador. Escape está condicionado al
mismo estado que deshabilita el botón de cerrar, así que no puede abandonar un
envío en curso.

**Pendiente de 10B:** la revisión de contraste en claro y oscuro.

### 10C — verificación multi-viewport (completo)

`90-responsive.e2e.ts` es **sin siembra y sin conteos**, por lo que puede
correrse idéntico en los tres proyectos pese a compartir una sola base. Un
primer borrador de la suite de 10B sí sembró el fixture compartido y chocó con
la unicidad de códigos: es exactamente el riesgo de orden que documenta
`playwright.config.ts`, y quedó resuelto con un fixture propio sufijado.

Los proyectos `tablet` (768px) y `mobile` (390px) difieren de escritorio solo en
el ancho, con viewports explícitos en vez de presets de dispositivo.

### Evidencia

42/42 pruebas en los tres proyectos; lint 8/8; typecheck 7/7; build 7/7.
Revisión visual de las once pantallas en escritorio y de las principales en
teléfono, incluido el diálogo de ajuste.

### Pendientes para poder cerrar FASE 10

1. contraste en claro y oscuro (10B);
2. **colores y logotipo**, decisión del propietario con límite «antes de la
   aceptación visual» según el roadmap;
3. pulido: a 1440px la navegación envuelve dejando `Analytics` sola en la
   segunda fila. Es correcto y descubrible, pero desbalanceado.

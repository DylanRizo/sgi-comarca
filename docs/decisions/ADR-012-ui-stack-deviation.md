# ADR-012 — Pila de interfaz: desviación respecto a la arquitectura aprobada

- Estado: `APPROVED_BY_OWNER`
- Fecha: 2026-09-01
- Fase: entrada a FASE 10
- Sustituye parcialmente: la línea «UI: Tailwind CSS + shadcn/ui + Lucide» de
  `AGENTS.md` § "Arquitectura aprobada", únicamente en lo relativo a shadcn/ui

## Contexto

`AGENTS.md` § "Arquitectura aprobada" declara una pila de interfaz concreta.
Al planificar FASE 10 se verificó el estado real del repositorio contra esa
declaración, leyendo los `package.json` del monorepo. El resultado:

| Librería declarada en `AGENTS.md` | Estado verificado el 2026-09-01 |
| --- | --- |
| Tailwind CSS | Instalada (`tailwindcss` 4.3.3) |
| shadcn/ui | **Ausente** |
| Lucide | **Ausente** |
| TanStack Query | **Ausente** |
| React Hook Form + Zod | **Ausente** |
| TanStack Table | **Ausente** |
| Recharts | **Ausente** |

Evidencia adicional verificada el mismo día:

- `apps/web/app/globals.css` tiene 1,503 líneas y constituye un sistema de
  tokens propio (color, radio, sombra, movimiento, tipografía) con modo oscuro
  por preferencia del sistema y transiciones que respetan
  `prefers-reduced-motion`. Se construyó en FASE 9C.
- No existe un solo elemento `<svg>` en las 21 páginas de `apps/web/app`: el
  proyecto no tiene sistema de iconografía.
- Los gráficos de analytics son barras CSS (`chart-bars`, `chart-bar-fill`),
  no un motor de gráficos.
- `packages/ui` contiene un único componente (`technical-status.tsx`).
- `apps/web/playwright.config.ts` declara un solo proyecto, `chromium` de
  escritorio.

La desviación nunca se registró como decisión. No hay ADR, informe de cierre ni
entrada en `CURRENT_STATE.md` que la mencione. Se acumuló de hecho a lo largo de
FASE 3B a 9C, no por una elección deliberada y documentada.

Esto crea la contradicción entre fuentes autoritativas que `AGENTS.md` obliga a
detener y verificar antes de tocar código: la arquitectura aprobada y la
implementación versionada discrepan, y el prompt de FASE 10 en
`docs/migration/runbook.md` nombra explícitamente shadcn/ui y Lucide.

## Decisión

FASE 10 **no** migra la interfaz a shadcn/ui. Se conserva el sistema de tokens
de FASE 9C como base visual del proyecto, y se incorpora **únicamente Lucide**
como sistema de iconografía.

Fundamento:

1. El sistema de tokens de 9C está construido, verificado y en verde (32/32
   E2E). Reescribir 21 páginas sobre shadcn/ui es un cambio amplio cuyo riesgo
   no lo justifica ningún criterio de aceptación de FASE 10.
2. La puerta real de FASE 10 en `docs/migration/phased-roadmap.md` es
   «Playwright desktop/tablet/móvil y accesibilidad». Ninguna de esas
   exigencias requiere shadcn/ui; sí requieren trabajo responsive y de
   accesibilidad que la migración desplazaría.
3. Lucide es la excepción porque cubre un hueco real y no una preferencia
   estética: hoy no hay iconografía alguna, y `AGENTS.md` § "Frontend" prohíbe
   además usar emojis como sistema principal de iconos. Añadirlo es aditivo y
   no obliga a reescribir pantallas.
4. shadcn/ui no es una dependencia en tiempo de ejecución sino un generador que
   copia componentes al repositorio. Adoptarlo más tarde sigue siendo posible
   sin desandar el sistema de tokens, porque ambos se apoyan en Tailwind.

Las cuatro librerías restantes —TanStack Query, TanStack Table, React Hook Form
+ Zod y Recharts— **permanecen sin adoptar y sin rechazar**. Esta decisión no
las aprueba ni las descarta; quedan como decisión abierta, a resolver cuando una
necesidad concreta lo justifique y no por cumplimiento nominal de una lista.

## Consecuencias

- `AGENTS.md` § "Arquitectura aprobada" queda desactualizado respecto a la
  interfaz. Este ADR es la fuente vigente para la pila de UI hasta que se
  actualice aquel documento.
- El sistema de tokens de `globals.css` pasa a ser un artefacto de primera
  clase, no un accidente: cualquier pantalla nueva se escribe contra sus
  clases y tokens.
- Añadir Lucide introduce la primera dependencia de iconografía. Debe fijarse a
  una versión exacta y justificarse en el `package.json`, conforme a
  `AGENTS.md` § "Calidad de código".
- Las cuatro librerías no adoptadas siguen apareciendo en `AGENTS.md`; un
  agente futuro puede volver a plantear la contradicción. Se mitiga enlazando
  este ADR desde el handoff.
- No hay impacto en esquema, RBAC, reglas de negocio ni datos. La decisión es
  exclusivamente de capa de presentación.

## Alternativas rechazadas

- **Migrar a shadcn/ui en FASE 10.** Alinea el código con la letra de
  `AGENTS.md`, pero toca las 21 páginas y desplaza el trabajo que la puerta de
  la fase sí exige. El riesgo de regresión visual y de accesibilidad es alto y
  el beneficio, nominal.
- **No añadir ninguna librería.** Deja el proyecto sin iconografía, lo que
  choca con la exigencia de FASE 10 de jerarquía visual clara y empuja hacia
  los emojis que `AGENTS.md` prohíbe.
- **Adoptar la lista completa de `AGENTS.md`.** Introduce cuatro dependencias
  sin necesidad demostrada, contra la regla de no agregar dependencias sin
  justificar su propósito.

## Rollback y cambio futuro

Revertir es barato: Lucide es aditivo, de modo que retirarlo equivale a
eliminar la dependencia y sus importaciones, sin tocar el sistema de tokens.
Adoptar shadcn/ui más adelante no requiere deshacer nada de FASE 10, porque
convive con Tailwind y con los tokens ya definidos. Un cambio de esta decisión
exige un ADR nuevo que la sustituya explícitamente.

## Aceptación verificable

- `apps/web/package.json` declara `lucide-react` con versión exacta.
- No aparecen `shadcn`, `@tanstack/*`, `react-hook-form`, `zod` ni `recharts`
  en ningún `package.json` del monorepo como resultado de FASE 10.
- `globals.css` conserva su sistema de tokens y su modo oscuro.
- Ninguna pantalla usa emojis como iconografía.
- Las puertas de calidad de FASE 10 pasan sin regresión respecto al cierre de
  FASE 9C.

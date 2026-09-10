# Piloto local de Alexa — inventario y ventas en tránsito

> El POC sintético de este documento queda como evidencia reproducible. La
> arquitectura real de solo lectura fue aprobada e implementada localmente el
> 2026-09-09. Para desplegarla y vincular la cuenta use la
> [guía de conexión real](alexa-real-integration.md); staging sigue sujeto a un
> checkpoint operacional explícito.

Este POC en español de México valida tres conversaciones de solo lectura usando
eventos Alexa simulados y datos sintéticos: existencias por producto/bodega,
resumen general de ventas en tránsito y detalle operativo por número. No se conecta a SGI,
PostgreSQL, AWS, Alexa Developer Console, Render, Neon ni staging.

Para preparar una cuenta nueva, registrar un Echo Dot de 4.ª generación y
configurar la prueba de desarrollo paso a paso, consulte la
[guía de puesta en marcha en Echo Dot 4](echo-dot-4-poc-alexa-puesta-en-marcha.md).

## Probar localmente

Requisitos: las versiones de Node y pnpm declaradas por el repositorio y las
dependencias instaladas desde el lockfile.

```bash
pnpm install --frozen-lockfile
pnpm alexa:simulate
pnpm alexa:simulate:sales
pnpm alexa:simulate:sale
```

La primera salida esperada contiene:

```json
{
  "version": "1.0",
  "response": {
    "outputSpeech": {
      "type": "PlainText",
      "text": "Hay 12.5 unidades de Café molido demo en Casa Dylan."
    },
    "shouldEndSession": true
  }
}
```

La simulación del resumen responde con el total, identificadores, fechas,
cantidad de productos y bodegas de origen disponibles. La simulación de detalle
responde:

```text
Venta VTA-000000123, en tránsito, del 7 de septiembre de 2026.
Incluye: Café molido demo, cantidad 2, desde Casa Dylan;
Té de hierbabuena demo, cantidad 1.5, desde Casa Luden.
```

Los eventos editables están en `packages/alexa-adapter/examples/`. También se
puede pasar otro archivo:

```bash
pnpm --filter @sgi/alexa-adapter exec tsx src/simulate.ts C:/ruta/evento.json
```

Pruebas enfocadas:

```bash
pnpm exec vitest run --config vitest.config.ts packages/alexa-adapter/test
pnpm alexa:test:hosted
pnpm --filter @sgi/alexa-adapter lint
pnpm --filter @sgi/alexa-adapter typecheck
pnpm --filter @sgi/alexa-adapter build
```

El archivo único que se copia sobre el Hello World de Alexa-hosted está en
`packages/alexa-adapter/alexa-hosted/lambda/index.js`. Solo requiere el
`ask-sdk-core` que ya incluye la plantilla Node.js; no hay que agregar paquetes
para este demo.

## Comportamiento cubierto

- `ConsultarExistenciasIntent` recibe los slots `producto` y `bodega`.
- Un slot faltante se solicita con `Dialog.ElicitSlot`.
- Un nombre ambiguo muestra hasta tres candidatos y pide precisión.
- Un producto o bodega inexistente pide otro valor.
- Una coincidencia única devuelve la cantidad decimal y unidad del contrato.
- La ausencia del balance se distingue de una cantidad cero registrada.
- `ConsultarResumenVentasEnTransitoIntent` no recibe slots y devuelve el total
  de ventas en tránsito más un resumen operativo breve de cada una. También
  distingue explícitamente el resultado vacío.
- `ConsultarVentaEnTransitoIntent` recibe `numeroVenta`; acepta el número
  completo o sus dígitos y conserva `VTA-` más nueve posiciones como
  identificador audible.
- La venta en tránsito devuelve fecha de negocio, productos, cantidades y
  bodegas de origen disponibles. Una venta inexistente, no-en-tránsito,
  ambigua o sin número tiene una respuesta específica y segura.
- La proyección de voz no recibe precios, costos, totales, pago, contacto,
  dirección, cliente, vendedor, repartidor, observaciones ni texto libre.
- Fallos de la frontera de lectura producen un mensaje breve sin detalles
  internos.
- Help, cancelación, cierre de sesión e intents no soportados tienen respuestas
  seguras; no hay intents de mutación.

## Frontera con SGI

`InventoryLookupPort` reutiliza los contratos de lectura de SGI.
`SaleLookupPort` usa `VoiceSaleSummary`, una proyección deliberadamente menor
que `SaleView` para impedir que datos financieros o personales alcancen la capa
audible. Los gateways reales deberán delegar en los servicios autorizados
existentes; no deben consultar tablas por su cuenta ni recalcular inventario.
`DemoInventoryGateway` y `DemoSalesGateway` solo contienen datos sintéticos.

No existe hoy una autenticación aprobada para Alexa. En particular, este POC:

- no añade rutas públicas;
- no almacena ni envía cookies humanas;
- no crea tokens, cuentas, grants o secretos;
- no accede a ninguna base de datos;
- no registra entradas, ajustes, transferencias ni ventas.

La decisión que bloquea datos reales está registrada en
[ADR-016](../decisions/ADR-016-alexa-read-only-poc.md).

## Conexión con Alexa Developer Console

Para la Skill privada Alexa-hosted actual, copie todo
`packages/alexa-adapter/alexa-hosted/lambda/index.js` sobre el archivo
`lambda/index.js` de la pestaña `Code`, conserve el `ask-sdk-core` ya declarado
en el `lambda/package.json` de la plantilla, pulse `Save` y luego `Deploy`. No
se necesita ARN manual ni una cuenta AWS personal para esta ruta demo. La guía
del Echo contiene el procedimiento detallado.

## Conexión futura con datos reales

Después de aprobar e implementar la identidad máquina-a-máquina:

1. Crear una Custom Skill con locale español de México y cargar el modelo de
   ejemplo `packages/alexa-adapter/models/es-MX.json`.
2. Sustituir los valores demo de los tipos `SGI_PRODUCTO` y `SGI_BODEGA` por un
   catálogo controlado o por entidades dinámicas derivadas del read model. Los
   nombres del catálogo real no deben versionarse si son privados.
3. Implementar `InventoryLookupPort` y/o `SaleLookupPort` contra la frontera
   privada aprobada de SGI y verificar `inventory.read`/`sales.read` en backend.
   La conversión de `SaleView` a `VoiceSaleSummary` debe ocurrir antes de la
   capa Alexa y mantener la allowlist de campos.
4. Sustituir el artefacto demo autocontenido por una integración que respete la
   frontera aprobada; decidir Alexa-hosted frente a alojamiento AWS propio es
   un gate técnico separado.
5. Configurar el endpoint de la skill, validación de skill/application ID,
   límites, logs redactados y rotación/revocación de la credencial.
6. Repetir los casos del simulador en la consola de pruebas antes de solicitar
   cualquier despliegue o dato real.

El modelo de interacción es un punto de partida local, no un catálogo de
producción. El matching deliberadamente conservador puede pedir aclaraciones
con pronunciaciones o sinónimos que Alexa no resuelva; ampliar sinónimos debe
hacerse con evidencia y sin convertir una coincidencia ambigua en una respuesta
inventada.

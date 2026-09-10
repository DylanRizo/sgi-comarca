# Puesta en marcha del POC Alexa en un Echo Dot de 4.ª generación

Revisión de esta guía: 2026-09-09.

> **Actualización:** el POC sintético descrito aquí ya fue validado. La
> implementación de conexión real, todavía pendiente de un checkpoint de
> staging, está documentada en la
> [guía de conexión real](alexa-real-integration.md). Las secciones de cuenta,
> dispositivo, locale y modelo continúan vigentes; no vuelva a pegar el código
> demo cuando se apruebe el despliegue real.

Esta guía explica, para una persona sin experiencia técnica, cómo preparar una
cuenta Amazon nueva, registrar un Echo Dot de 4.ª generación, crear la Skill de
desarrollo `Inventario Comarca` en español de México y desplegar en su entorno
Alexa-hosted un `lambda/index.js` que usa exclusivamente datos sintéticos.

Seguir esta guía **no conecta ni autoriza datos reales de SGI**. El único código
desplegable aquí es la demostración privada, en memoria y de solo lectura que
el propietario decidió probar en la etapa `Development` de Alexa-hosted.

## Resultado esperado

Al terminar la prueba demo:

- la app Alexa y el Echo estarán registrados en la cuenta Amazon nueva;
- esa misma cuenta tendrá un registro gratuito de Amazon Developer;
- la Skill de desarrollo usará `Español (México)` / `es-MX`;
- Alexa invocará el endpoint Alexa-hosted que solo contiene datos demo;
- se podrán consultar existencias y ventas en tránsito sintéticas;
- no habrá conexión con SGI, PostgreSQL, Render, Neon ni staging.

## 1. Entender las tres cuentas

Aunque los nombres se parecen, intervienen tres contextos distintos.

| Cuenta o registro | Para qué sirve en esta prueba | Recomendación |
| --- | --- | --- |
| Cuenta Amazon de consumo/Alexa | Iniciar sesión en la app Alexa, registrar el Echo y ser propietario de la Skill de desarrollo que usa el dispositivo. | Crear la cuenta nueva y conservar sus datos de recuperación. |
| Registro Amazon Developer | Habilita Alexa Skills Kit y la consola donde se crea la Skill. Es gratuito y puede añadirse a una cuenta Amazon existente. | Iniciar el registro Developer con **las mismas credenciales Amazon** usadas en la app Alexa y en el Echo. |
| Cuenta AWS | Solo sería necesaria si más adelante se cambia a alojamiento propio. Tiene consola, recursos, seguridad y facturación separados. | No hace falta crearla ni usarla para el POC Alexa-hosted actual. |

Amazon confirma que el registro Developer es gratuito y puede vincularse a una
cuenta Amazon existente. También indica que el Echo y la app deben iniciar
sesión con las mismas credenciales que la cuenta Developer para probar una
Skill no publicada. Si en el futuro se elige alojamiento propio, AWS seguirá
siendo una cuenta separada. Véanse
[Crear una cuenta Amazon Developer][amazon-developer-account] y
[Pasos para construir una Custom Skill][alexa-build-steps].

No anote contraseñas, códigos OTP, ARN, Skill ID ni otros identificadores reales
en este repositorio. El flujo Alexa-hosted actual no pide copiar ninguno de
esos identificadores.

## 2. Preparar lo necesario

Tenga a mano:

- el Echo Dot de 4.ª generación y su adaptador de corriente;
- un teléfono Android o iPhone compatible;
- nombre y contraseña de una red Wi-Fi estable;
- acceso al correo o teléfono de la cuenta Amazon nueva;
- una copia local del repositorio en esta rama;
- el archivo demo
  `packages/alexa-adapter/alexa-hosted/lambda/index.js`.

No se necesita una cuenta AWS personal, un ZIP, un ARN ni paquetes adicionales
para copiar este artefacto en la Skill Alexa-hosted actual.

## 3. Instalar la app Alexa e iniciar sesión

1. En el teléfono, abra su tienda oficial de aplicaciones.
2. Busque `Amazon Alexa`, compruebe que el editor sea Amazon y pulse instalar o
   actualizar. Amazon enlaza las tiendas compatibles desde su página
   [Descargar la app Alexa][alexa-app-download].
3. Abra la app.
4. Inicie sesión con la **cuenta Amazon nueva**. No use la cuenta anterior del
   Echo ni una cuenta diferente a la que se registrará como Developer.
5. Complete la verificación que Amazon solicite dentro de la app.

Si la app ya estaba abierta con otra cuenta, cierre esa sesión y vuelva a
entrar con la cuenta nueva antes de agregar el dispositivo. La documentación de
pruebas de Alexa exige que la app use la misma cuenta en la que está registrado
el dispositivo; consulte [Probar y depurar una Custom Skill][alexa-test-debug].

## 4. Comprobar si el Echo pertenece a otra cuenta

Haga esta comprobación **antes** de intentar registrarlo.

### Si el Echo aparece en la app de la cuenta anterior

1. Abra la app Alexa con la cuenta anterior autorizada.
2. Abra `Devices` / `Dispositivos` y seleccione el Echo correspondiente. La
   ubicación exacta puede adaptarse al idioma y a la versión de la app.
3. Abra la configuración del dispositivo.
4. Busque el campo `Registered To` / `Registrado a`. Ese campo identifica la
   cuenta propietaria.
5. Si muestra la cuenta anterior, seleccione `Deregister` / `Anular registro` y
   confirme.

Amazon documenta la comprobación de `Registered To`, el desregistro desde la
app y la alternativa web en `Account & Lists > Your Content and Devices >
Devices` en [Configurar dispositivos de prueba Alexa][alexa-device-account].

### Si no tiene acceso a la cuenta anterior

Pida al propietario anterior que desregistre el Echo desde su app Alexa o desde
`Your Content and Devices`. No intente adivinar credenciales y no suponga que un
restablecimiento físico elimina el registro de la cuenta en los sistemas de
Amazon. Si el propietario no puede hacerlo, contacte al soporte oficial de
Amazon antes de continuar.

### Qué se pierde o debe revisarse

Amazon advierte que desregistrar borra la configuración del dispositivo. Al
registrarlo de nuevo, hay que completar otra vez la configuración guiada y
revisar Wi-Fi, idioma, nombre del dispositivo y cualquier asociación con grupos
o equipos de hogar digital. Si el Echo tenía rutinas, recordatorios o grupos,
anótelos antes y compruebe después cuáles siguen disponibles; no dé por hecho
que se conservarán.

## 5. Registrar el Echo Dot 4 en la cuenta nueva

1. Con la app Alexa iniciada en la cuenta nueva, conecte el Echo a la corriente.
2. Abra `Dispositivos`.
3. Pulse el símbolo `+` y luego `Agregar dispositivo`.
4. Seleccione `Amazon Echo`.
5. Seleccione la familia `Echo, Echo Dot, Echo Pop y más`.
6. Siga las instrucciones de la app para elegir el dispositivo y conectarlo a
   Wi-Fi.
7. Al terminar, abra nuevamente el dispositivo en la app y compruebe que
   `Registrado a` corresponda a la cuenta nueva.

La ruta general vigente está en [Configurar un Echo][amazon-echo-setup]. Si un
nombre de botón cambia, siga la instrucción equivalente que muestre la app
oficial; no use menús de tutoriales de terceros.

## 6. Modo configuración y restablecimiento: solo si hace falta

> **Advertencia:** no restablezca el Echo por rutina. Desregistre primero la
> cuenta anterior mediante el procedimiento oficial. Un restablecimiento de
> fábrica borra información personal, configuración del dispositivo y
> conexiones de hogar digital.

Si la app detecta el Echo y permite configurarlo, omita esta sección.

Si el dispositivo no responde, Amazon recomienda intentar primero un reinicio:

1. Desconecte el adaptador de corriente del Echo o de la toma.
2. Espere 10 segundos.
3. Vuelva a conectarlo.

Si necesita llevar un Echo Dot de 4.ª generación al modo configuración
manteniendo las conexiones de hogar digital:

1. Mantenga presionado el botón `Action` / `Acción` durante 20 segundos.
2. Espere a que el aro luminoso se apague y vuelva a encenderse.
3. El dispositivo entrará en modo configuración; retome la sección anterior.

Solo si el soporte o la situación requieren un restablecimiento completo:

1. Confirme que acepta perder la información personal, la configuración del
   dispositivo y las conexiones de hogar digital.
2. Mantenga presionados a la vez `Bajar volumen` y `Micrófono apagado` durante
   20 segundos.
3. Espere a que el aro se apague y vuelva a encenderse.
4. Configure el Echo desde cero en la app Alexa.

Estos tiempos y botones son los publicados por Amazon para Echo Dot de 2.ª a
5.ª generación; consulte [Restablecer un Echo Dot][amazon-echo-reset] antes de
actuar, por si la documentación fue actualizada.

## 7. Configurar Español (México)

1. En la app Alexa, abra `Más > Configuración > Configuración del dispositivo`.
2. Seleccione el Echo Dot.
3. Pulse el engrane de la esquina superior derecha.
4. En `General`, seleccione `Idioma`.
5. Elija `Español (México)`.
6. Espere a que el cambio se aplique antes de probar la Skill.

Esta es la ruta publicada en [Cambiar el idioma del Echo][amazon-echo-language].
Amazon advierte que algunas funciones pueden variar según el idioma.

Para evitar diagnósticos confusos, mantenga alineados:

- Echo Dot: `Español (México)`;
- modelo de interacción de la Skill: `Spanish (MX)` / `es-MX`;
- idioma seleccionado en el simulador de la consola: `Spanish (MX)`;
- app Alexa y Echo: la misma cuenta Amazon registrada como Developer.

## 8. Registrar la cuenta Amazon como Developer

1. Abra [Amazon Developer][amazon-developer-console] en un navegador.
2. Inicie sesión con **las mismas credenciales Amazon** de la app Alexa.
3. Si es la primera vez, complete el registro Developer gratuito, incluida la
   verificación de correo y la información de desarrollador solicitada.
4. Lea y acepte el acuerdo correspondiente.
5. Guarde el nombre de desarrollador con cuidado: Amazon indica que, si se
   publica una Skill en el futuro, ese nombre se muestra en la tienda y no se
   cambia directamente después del envío.

No hace falta publicar ni enviar la Skill a certificación para esta prueba.

## 9. Crear la Custom Skill `Inventario Comarca`

Los rótulos pueden cambiar ligeramente con la consola, pero las selecciones
conceptuales deben ser estas:

1. Abra la [consola Alexa Developer][amazon-developer-console].
2. Entre a `Skills` y seleccione `Create Skill` / `Crear Skill`.
3. Use `Inventario Comarca` como nombre.
4. Seleccione `Spanish (MX)` / `Español (México)` como idioma principal.
5. Seleccione el modelo `Custom`.
6. Para el POC actual, seleccione `Alexa-hosted (Node.js)` como alojamiento.
7. Seleccione `Start from Scratch` y cree la Skill. El modelo y el código demo
   del repositorio reemplazarán el contenido inicial de Hello World.

La secuencia oficial y las opciones vigentes están en
[Crear y administrar Skills][alexa-create-skill].

## 10. Cargar y construir el modelo `es-MX`

1. En la pestaña `Build`, confirme que está editando `Spanish (MX)`.
2. Abra `Custom > JSON Editor`.
3. En el equipo, abra el archivo
   `packages/alexa-adapter/models/es-MX.json`.
4. Copie **todo** el contenido del archivo.
5. Reemplace el contenido del editor JSON de Alexa; no mezcle ambos modelos.
6. Seleccione `Save Model` / `Guardar modelo`.
7. Seleccione `Build Skill` / `Construir Skill`.
8. Espere el mensaje de construcción completa y corrija cualquier error antes
   de continuar.
9. Confirme que el nombre de invocación sea `inventario comarca` y que existan
   los tres intents propios:
   `ConsultarExistenciasIntent`,
   `ConsultarResumenVentasEnTransitoIntent` y
   `ConsultarVentaEnTransitoIntent`.

Amazon puede agregar automáticamente `AMAZON.NavigateHomeIntent`. Es esperado:
el modelo versionado y el `index.js` del POC ya lo incluyen y lo tratan como una
salida segura, igual que detener o cancelar.

Guardar no construye automáticamente el modelo. Amazon explica el editor JSON,
`Save Model` y `Build Skill` en
[Crear el modelo de interacción][alexa-interaction-model].

## 11. Pegar y desplegar el código en Alexa-hosted

El POC ya incluye un archivo único preparado para reemplazar el Hello World de
la plantilla:

`packages/alexa-adapter/alexa-hosted/lambda/index.js`

Ese archivo:

- exporta un `handler` Lambda compatible con Alexa-hosted;
- usa únicamente `ask-sdk-core`, que ya está declarado en la plantilla Node.js;
- contiene solo datos demo ficticios y operaciones de lectura en memoria;
- no usa HTTP, Prisma, cookies, secretos, precios, pagos ni datos personales;
- coincide con los tres intents y los slots `producto`, `bodega` y
  `numeroVenta` del modelo `es-MX`.

### Reemplazar el Hello World

1. En Alexa Developer Console, abra la pestaña `Code` de `Inventario Comarca`.
2. En el árbol de archivos, seleccione `lambda/index.js`.
3. Seleccione todo el código Hello World existente y elimínelo.
4. En este repositorio, abra
   `packages/alexa-adapter/alexa-hosted/lambda/index.js`.
5. Copie **todo** el archivo y péguelo en el editor de `lambda/index.js`. No
   mezcle ambos códigos.
6. Abra el `lambda/package.json` de la plantilla y confirme que conserva
   `ask-sdk-core` en `dependencies`. El artefacto no necesita ningún otro
   paquete y no requiere modificar ese `package.json`.
7. Pulse `Save` / `Guardar`.
8. Pulse `Deploy` / `Desplegar` y espere el mensaje de finalización correcta.
9. Si el despliegue falla, no agregue dependencias al azar: revise que el
   archivo se haya copiado completo y que `ask-sdk-core` siga declarado.

Amazon documenta que, en la etapa de desarrollo de una Skill Alexa-hosted, el
editor `Code` permite editar, guardar y desplegar el código. El despliegue
instala automáticamente las dependencias declaradas en `lambda/package.json`.
Consulte [Crear y administrar Skills Alexa-hosted][alexa-hosted-manage].

### Verificación local del mismo archivo

Antes o después de copiarlo, un responsable técnico puede ejecutar:

```bash
pnpm alexa:test:hosted
pnpm --filter @sgi/alexa-adapter lint
```

La prueba carga el `index.js` real, sustituye `ask-sdk-core` únicamente dentro
del arnés local y llama al `handler` con eventos Alexa sintéticos. No usa red ni
credenciales.

### No configurar un ARN manual en esta Skill

Como esta Skill fue creada con `Alexa-hosted (Node.js)`, Alexa administra su
endpoint de desarrollo. Para este POC no cree una Lambda en una cuenta AWS
personal, no agregue un trigger y no pegue un ARN manual.

La ruta de Lambda y ARN descrita abajo es solo una alternativa futura si el
propietario decide convertir la Skill a `Provision your own`; no forma parte de
esta prueba.

### Las cuentas Amazon y AWS no son la misma cosa

No hace falta abrir una cuenta AWS personal para el flujo Alexa-hosted actual.
Si en el futuro se aprueba alojamiento propio, la cuenta se crea mediante el
proceso oficial de [alta de una cuenta AWS][aws-account-signup]. Aunque se
reutilice un correo, su consola, permisos, recursos y costos permanecen
separados de la cuenta Amazon/Alexa y del registro Developer.

Siga las [prácticas de seguridad de AWS][aws-security-best-practices]: active
MFA y no trabaje habitualmente con el usuario raíz. Revise la región y los
costos antes de crear recursos.

Para un alojamiento propio futuro, un responsable técnico tendría que aprobar
y configurar por separado el runtime, el ZIP, la región, el ARN, el trigger
`Alexa Skills Kit`, la verificación por Skill ID, los límites de costo y los
logs redactados. El procedimiento oficial está en
[Alojar una Custom Skill en Lambda][alexa-lambda-hosting]. Esa alternativa no
autoriza conectar datos reales de SGI.

## 12. Habilitar la prueba de desarrollo

1. En Alexa Developer, abra la pestaña `Test`.
2. En el selector que inicialmente indica que la prueba está desactivada o
   `Off`, elija `Development`.
3. Elija `Spanish (MX)` en el simulador.
4. Pruebe primero escribiendo `abre inventario comarca`.
5. Si responde, pruebe las frases de la sección siguiente en el simulador.

Amazon documenta el selector `Off > Development` y el simulador en
[Probar Skills en la consola][alexa-console-testing].

## 13. Encontrar y activar la Skill en la app

La app debe seguir iniciada con la misma cuenta Amazon usada en Developer y el
Echo debe estar registrado en esa misma cuenta.

Para la app Alexa estándar:

1. Abra el menú de tres líneas.
2. Entre a `Skills & Games` / `Skills y juegos`.
3. Abra `Your Skills` / `Tus Skills`.
4. Desplace los tipos hasta `Dev`.
5. Abra `Inventario Comarca`.
6. Seleccione `Enable to Use` / `Activar para usar` si aparece.

Si la app muestra Alexa+, la ruta oficial vigente comienza en el menú de tres
líneas, `More > Alexa+ Store > Browse Alexa Skills and Games`, y luego continúa
en `Your Skills > Dev`. Consulte
[Probar una Skill de desarrollo en app y Echo][alexa-device-testing].

Si `Inventario Comarca` no aparece, no publique la Skill para resolverlo. Revise
cuenta, locale, construcción y modo `Development` con la tabla de problemas.

## 14. Frases de prueba en el Echo

Hable cerca del Echo y use primero el nombre de invocación completo.

### Existencias demo

> Alexa, pregunta a inventario comarca cuánto hay de café molido demo en Casa
> Dylan.

Respuesta esperada: 12.5 unidades demo en Casa Dylan.

### Resumen demo de ventas en tránsito

> Alexa, pregunta a inventario comarca cuántas ventas hay en tránsito.

Respuesta esperada: un resumen de dos ventas sintéticas, con identificadores,
fechas, cantidad de productos y bodegas.

### Detalle demo por número

> Alexa, pregunta a inventario comarca qué contiene la venta 123.

Respuesta esperada: `VTA-000000123`, estado en tránsito, fecha, productos,
cantidades y bodegas demo. No debe pronunciar precios, pagos, clientes,
contactos ni direcciones.

También puede decir `Alexa, abre inventario comarca` y contestar a la pregunta
posterior. Si Alexa confunde el nombre, repita la forma larga `pregunta a
inventario comarca...` y revise el historial de voz en la app.

## 15. Demo y datos reales son fases distintas

### Prueba con datos demo

La prueba descrita aquí puede usar AWS únicamente para ejecutar una copia del
adaptador con datos sintéticos en memoria. No requiere ni permite:

- acceso a la API o base de datos SGI;
- rutas públicas nuevas;
- credenciales, cookies o sesiones SGI;
- permisos RBAC nuevos;
- operaciones de inventario o ventas;
- acceso a staging o producción.

### Conexión futura con datos reales de SGI

Está bloqueada por `REQUIRES_HUMAN_APPROVAL` en
[ADR-016](../decisions/ADR-016-alexa-read-only-poc.md). Antes de diseñarla o
implementarla se deben aprobar, como gates separados:

- alcance mínimo y de solo lectura: `inventory.read` y/o `sales.read`;
- account linking con OAuth 2.0; Amazon recomienda Authorization Code y PKCE;
- identidad máquina-a-máquina revocable para el componente que consulte SGI;
- rotación y revocación, rate limiting y auditoría redactada;
- transporte privado y validación de que cada solicitud proviene de Alexa y de
  la Skill correcta;
- política para cuenta/hogar/persona autorizada en un Echo compartido;
- allowlist audible que excluya precios, costos, pagos, contactos, personas,
  direcciones y texto libre.

Account linking conecta la identidad Amazon del usuario con su identidad en el
sistema tercero sin compartir su contraseña. Los requisitos oficiales están en
[Requisitos de account linking][alexa-account-linking]. Esta futura decisión no
autoriza una ruta pública de datos SGI; cualquier endpoint de autorización o
transporte requerido necesita su propio diseño y aprobación de seguridad.

## 16. Solución de problemas

| Problema | Comprobación segura |
| --- | --- |
| La Skill no aparece en la app | Confirme que app, Echo y Developer usan exactamente la misma cuenta Amazon; que `Test` está en `Development`; abra `Your Skills > Dev`; cierre y abra de nuevo la app después de verificar esos puntos. |
| Alexa dice que la Skill no existe | Confirme `Español (México)` en el Echo y `Spanish (MX)` en la Skill; use `inventario comarca` como nombre de invocación; compruebe que la versión de desarrollo esté habilitada. |
| El modelo reconoce mal la frase | Confirme que pegó el archivo `es-MX.json` completo, guardó y ejecutó `Build Skill`; pruebe primero la frase exacta en el simulador. |
| El modelo figura sin construir | Use `Save Model`, luego `Build Skill`, y espere el mensaje de construcción completa. Guardar por sí solo no basta. |
| `Deploy` falla en `Code` | Confirme que reemplazó completo `lambda/index.js`, que el archivo termina en `.lambda();` y que el `lambda/package.json` original todavía declara `ask-sdk-core`. No agregue paquetes ni cambie el endpoint. |
| El modelo funciona, pero ejecuta Hello World | El modelo y el código se despliegan por separado. Vuelva a `Code`, compruebe que ve el artefacto demo en `lambda/index.js`, pulse `Save` y después `Deploy`; espere el resultado correcto antes de probar. |
| El simulador funciona, pero el Echo no | Revise cuenta registrada, idioma del Echo y activación en `Your Skills > Dev`. Confirme que no está probando otra versión de la Skill con el mismo nombre. |
| El Echo pertenece a otra cuenta | Revise `Registered To` en la cuenta anterior, desregistre oficialmente y vuelva a agregarlo con la cuenta nueva. Un reset físico no sustituye la comprobación de cuenta. |
| La app no detecta el Echo | Reinicie primero; si sigue sin entrar en configuración, use el botón Acción 20 segundos conforme a la sección 6. Reserve el restablecimiento de fábrica para el último recurso. |
| Alexa responde con el error genérico del POC | Reproduzca la misma frase en el simulador, inspeccione `Skill I/O` y luego `Code > Logs`. No copie al repositorio request IDs, tokens, ARN, Skill ID ni contenido sensible. Verifique que el último `Deploy` haya terminado correctamente. |

## 17. Checklist final

### Cuenta y dispositivo

- [ ] La app Alexa está instalada y actualizada.
- [ ] La app inició sesión con la cuenta Amazon nueva.
- [ ] La misma cuenta quedó registrada gratuitamente como Amazon Developer.
- [ ] El Echo anterior fue desregistrado oficialmente, si correspondía.
- [ ] Se aceptó conscientemente cualquier pérdida de configuración antes de un
      reset.
- [ ] El Echo aparece en la app y `Registrado a` corresponde a la cuenta nueva.
- [ ] El idioma del Echo es `Español (México)`.

### Skill y código demo Alexa-hosted

- [ ] La Skill se llama `Inventario Comarca` y usa el modelo `Custom`.
- [ ] Su locale de desarrollo es `Spanish (MX)` / `es-MX`.
- [ ] El JSON local se pegó completo, se guardó y se construyó sin errores.
- [ ] La Skill fue creada como `Alexa-hosted (Node.js)`.
- [ ] `lambda/index.js` se reemplazó completo con el artefacto versionado.
- [ ] El `lambda/package.json` original conserva `ask-sdk-core`; no se añadió
      otra dependencia.
- [ ] `Save` y `Deploy` terminaron correctamente en la pestaña `Code`.
- [ ] El código no contiene conexión, token, cookie ni dato real de SGI.
- [ ] La pestaña `Test` está habilitada en `Development`.
- [ ] La Skill aparece en `Your Skills > Dev` y está activada.

### Evidencia y seguridad

- [ ] Las tres frases demo funcionan primero en el simulador y luego en el Echo.
- [ ] Las respuestas no pronuncian información personal, financiera o de pago.
- [ ] No se guardaron contraseñas, ARN, Skill ID, tokens ni datos privados en el
      repositorio.
- [ ] No se accedió a staging ni a producción.
- [ ] Cualquier conexión real queda detenida en el gate humano de ADR-016.

## Documentación oficial consultada

- [Crear una cuenta Amazon Developer][amazon-developer-account]
- [Pasos para construir una Custom Skill][alexa-build-steps]
- [Crear y administrar Skills][alexa-create-skill]
- [Crear el modelo de interacción][alexa-interaction-model]
- [Alojar una Custom Skill en AWS Lambda][alexa-lambda-hosting]
- [Crear y administrar Skills Alexa-hosted][alexa-hosted-manage]
- [Probar Skills en la consola][alexa-console-testing]
- [Probar una Skill de desarrollo en app y Echo][alexa-device-testing]
- [Configurar un Echo][amazon-echo-setup]
- [Cambiar el idioma del Echo][amazon-echo-language]
- [Restablecer un Echo Dot][amazon-echo-reset]
- [Configurar dispositivos de prueba Alexa][alexa-device-account]
- [Alta de una cuenta AWS][aws-account-signup]
- [Prácticas de seguridad de AWS][aws-security-best-practices]
- [Requisitos de account linking][alexa-account-linking]

[alexa-account-linking]: https://developer.amazon.com/docs/alexaplus/account-linking/requirements-account-linking.html
[alexa-app-download]: https://www.amazon.com/gp/help/customer/display.html?nodeId=GMR4JYXHYDSTNQRK
[alexa-build-steps]: https://developer.amazon.com/en-US/docs/alexa/custom-skills/steps-to-build-a-custom-skill.html
[alexa-console-testing]: https://developer.amazon.com/en-US/docs/alexa/devconsole/test-your-skill.html
[alexa-create-skill]: https://developer.amazon.com/en-US/docs/alexa/devconsole/create-a-skill-and-choose-the-interaction-model.html
[alexa-device-account]: https://www.developer.amazon.com/docs/video-skills-fire-tv-apps/create-video-skill-and-set-up-devices.html
[alexa-device-testing]: https://www.developer.amazon.com/en-US/docs/alexa/test/test-your-skill-overview.html
[alexa-interaction-model]: https://developer.amazon.com/en-US/docs/alexa/custom-skills/create-the-interaction-model-for-your-skill.html
[alexa-hosted-manage]: https://developer.amazon.com/en-US/docs/alexa/hosted-skills/alexa-hosted-skills-create.html
[alexa-lambda-hosting]: https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-an-aws-lambda-function.html
[alexa-test-debug]: https://developer.amazon.com/en-US/docs/alexa/custom-skills/test-and-debug-a-custom-skill.html
[amazon-developer-account]: https://developer.amazon.com/en-US/docs/alexa/ask-overviews/create-developer-account.html
[amazon-developer-console]: https://developer.amazon.com/alexa/console/ask
[amazon-echo-language]: https://digprjsurvey.amazon.com/csad/help/node/G96ABGB2ASX5M2NK
[amazon-echo-reset]: https://digprjsurvey.amazon.com/csad/help/node/GK84VTU42NKF2E8E
[amazon-echo-setup]: https://digprjsurvey.amazon.com/csad/help/node/GKFJXZCLQ83HGHQZ
[aws-account-signup]: https://docs.aws.amazon.com/accounts/latest/reference/getting-started.html
[aws-security-best-practices]: https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html

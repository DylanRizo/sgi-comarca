import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../lambda/index.js', import.meta.url),
  'utf8',
);
const interactionModel = JSON.parse(
  readFileSync(new URL('../../models/es-MX.json', import.meta.url), 'utf8'),
);

function loadHandler(setupCode) {
  const commonJsModule = { exports: {} };
  const context = vm.createContext({
    Buffer,
    URL,
    capturedEnvelope: undefined,
    capturedToken: undefined,
    exports: commonJsModule.exports,
    module: commonJsModule,
    process: { env: {} },
    require(specifier) {
      assert.equal(specifier, 'node:https');
      return {
        request() {
          throw new Error('Network was not stubbed.');
        },
      };
    },
  });
  vm.runInContext(source, context);
  if (setupCode) vm.runInContext(setupCode, context);
  assert.equal(typeof commonJsModule.exports.handler, 'function');
  return { context, handler: commonJsModule.exports.handler };
}

function launchEvent(accessToken) {
  return {
    context: accessToken ? { System: { user: { accessToken } } } : undefined,
    request: { locale: 'es-MX', requestId: 'request-1', type: 'LaunchRequest' },
    version: '1.0',
  };
}

function intentEvent(name, slots = {}, accessToken = 'a'.repeat(43)) {
  return {
    context: {
      System: {
        device: { deviceId: 'must-not-leave-lambda' },
        user: { accessToken, userId: 'must-not-leave-lambda' },
      },
    },
    request: {
      intent: { confirmationStatus: 'NONE', name, slots },
      locale: 'es-MX',
      requestId: 'request-2',
      type: 'IntentRequest',
    },
    session: { user: { userId: 'must-not-leave-lambda' } },
    version: '1.0',
  };
}

function speech(result) {
  return result.response.outputSpeech?.text;
}

test('keeps the versioned es-MX intent and slot contract', () => {
  const intents = interactionModel.interactionModel.languageModel.intents;
  const customIntents = intents.filter(
    (intent) => !intent.name.startsWith('AMAZON.'),
  );
  assert.deepEqual(customIntents.map((intent) => intent.name).sort(), [
    'ConsultarExistenciasIntent',
    'ConsultarResumenVentasEnTransitoIntent',
    'ConsultarVentaEnTransitoIntent',
  ]);
  assert.deepEqual(
    Object.fromEntries(
      customIntents.map((intent) => [
        intent.name,
        (intent.slots || []).map((candidate) => candidate.name).sort(),
      ]),
    ),
    {
      ConsultarExistenciasIntent: ['bodega', 'producto'],
      ConsultarResumenVentasEnTransitoIntent: [],
      ConsultarVentaEnTransitoIntent: ['numeroVenta'],
    },
  );
});

test('asks to link the SGI account when Alexa supplies no token', async () => {
  const { handler } = loadHandler();
  const result = await handler(launchEvent());
  assert.equal(result.version, '1.0');
  assert.equal(result.response.card.type, 'LinkAccount');
  assert.match(speech(result), /vincular tu cuenta del SGI/iu);
});

test('forwards only approved voice fields and returns the SGI response', async () => {
  const { context, handler } = loadHandler(`
    requestSgi = async (token, envelope) => {
      capturedToken = token;
      capturedEnvelope = envelope;
      return {
        version: '1.0',
        response: {
          outputSpeech: { type: 'PlainText', text: 'Hay 12.5 unidades.' },
          shouldEndSession: true,
        },
      };
    };
  `);
  const result = await handler(
    intentEvent('ConsultarExistenciasIntent', {
      bodega: {
        name: 'bodega',
        resolutions: { private: 'must-not-leave-lambda' },
        value: 'Casa Dylan',
      },
      producto: { name: 'producto', value: 'Café molido' },
      secreto: { name: 'secreto', value: 'must-not-leave-lambda' },
    }),
  );

  assert.equal(speech(result), 'Hay 12.5 unidades.');
  assert.equal(context.capturedToken, 'a'.repeat(43));
  assert.deepEqual(JSON.parse(JSON.stringify(context.capturedEnvelope)), {
    request: {
      intent: {
        confirmationStatus: 'NONE',
        name: 'ConsultarExistenciasIntent',
        slots: {
          bodega: { name: 'bodega', value: 'Casa Dylan' },
          producto: { name: 'producto', value: 'Café molido' },
        },
      },
      locale: 'es-MX',
      requestId: 'request-2',
      type: 'IntentRequest',
    },
    version: '1.0',
  });
  assert.doesNotMatch(
    JSON.stringify(context.capturedEnvelope),
    /accessToken|deviceId|userId|resolutions|secreto/iu,
  );
});

test('turns an expired token into an Alexa account-linking card', async () => {
  const { handler } = loadHandler(`
    requestSgi = async () => { throw new SgiRequestError(401); };
  `);
  const result = await handler(launchEvent('a'.repeat(43)));
  assert.equal(result.response.card.type, 'LinkAccount');
});

test('handles rate limits and upstream failures without leaking details', async () => {
  const limited = loadHandler(`
    requestSgi = async () => { throw new SgiRequestError(429); };
  `);
  assert.match(
    speech(await limited.handler(launchEvent('a'.repeat(43)))),
    /límite de consultas/iu,
  );

  const failed = loadHandler(`
    requestSgi = async () => { throw new Error('private database detail'); };
  `);
  const result = await failed.handler(launchEvent('a'.repeat(43)));
  assert.match(speech(result), /No pude consultar el SGI/iu);
  assert.doesNotMatch(JSON.stringify(result), /private database detail/iu);
});

import { describe, expect, it, vi } from 'vitest';

import type {
  AlexaRequestEnvelope,
  AlexaResponseEnvelope,
  AlexaSlot,
  InventoryLookupPort,
} from '../src/index.js';
import {
  createAskSdkRequestHandler,
  createLambdaHandler,
  DemoInventoryGateway,
  handleAlexaRequest,
} from '../src/testing.js';

function event(
  product?: string,
  warehouse?: string,
  name = 'ConsultarExistenciasIntent',
): AlexaRequestEnvelope {
  const slots: Record<string, AlexaSlot | undefined> = {};
  if (product !== undefined) {
    slots.producto = { name: 'producto', value: product };
  }
  if (warehouse !== undefined) {
    slots.bodega = { name: 'bodega', value: warehouse };
  }
  return {
    request: {
      intent: { confirmationStatus: 'NONE', name, slots },
      locale: 'es-MX',
      requestId: 'test-request',
      type: 'IntentRequest',
    },
    version: '1.0',
  };
}

function speech(result: AlexaResponseEnvelope): string | undefined {
  return result.response.outputSpeech?.text;
}

function elicitedSlot(result: AlexaResponseEnvelope): string | undefined {
  return result.response.directives?.[0]?.slotToElicit;
}

describe('Alexa inventory skill', () => {
  it('returns the warehouse quantity through a Lambda-shaped handler', async () => {
    const handler = createLambdaHandler(new DemoInventoryGateway());

    const result = await handler(event('cafe molido demo', 'casa dylan'));

    expect(speech(result)).toBe(
      'Hay 12.5 unidades de Café molido demo en Casa Dylan.',
    );
    expect(result.response.shouldEndSession).toBe(true);
  });

  it('elicits a missing product without querying inventory', async () => {
    const gateway = new DemoInventoryGateway();
    const search = vi.spyOn(gateway, 'searchProducts');

    const result = await handleAlexaRequest(
      event(undefined, 'Casa Dylan'),
      gateway,
    );

    expect(elicitedSlot(result)).toBe('producto');
    expect(speech(result)).toBe('¿Qué producto quieres consultar?');
    expect(search).not.toHaveBeenCalled();
  });

  it('elicits a missing warehouse without querying catalogs', async () => {
    const gateway = new DemoInventoryGateway();
    const search = vi.spyOn(gateway, 'searchProducts');

    const result = await handleAlexaRequest(event('Café molido demo'), gateway);

    expect(elicitedSlot(result)).toBe('bodega');
    expect(speech(result)).toBe('¿En qué bodega?');
    expect(search).not.toHaveBeenCalled();
  });

  it('does not guess when the product phrase is ambiguous', async () => {
    const result = await handleAlexaRequest(
      event('café molido', 'Casa Dylan'),
      new DemoInventoryGateway(),
    );

    expect(elicitedSlot(result)).toBe('producto');
    expect(speech(result)).toContain('Encontré varias opciones:');
    expect(speech(result)).toContain('Café molido demo grande');
  });

  it('does not guess when the warehouse phrase is ambiguous', async () => {
    const result = await handleAlexaRequest(
      event('Café molido demo', 'casa'),
      new DemoInventoryGateway(),
    );

    expect(elicitedSlot(result)).toBe('bodega');
    expect(speech(result)).toContain('Encontré varias bodegas:');
  });

  it('elicits another product when none exists', async () => {
    const result = await handleAlexaRequest(
      event('producto inexistente', 'Casa Dylan'),
      new DemoInventoryGateway(),
    );

    expect(elicitedSlot(result)).toBe('producto');
    expect(speech(result)).toBe(
      'No encontré el producto producto inexistente. ¿Qué producto quieres consultar?',
    );
  });

  it('elicits another warehouse when none exists', async () => {
    const result = await handleAlexaRequest(
      event('Café molido demo', 'bodega inexistente'),
      new DemoInventoryGateway(),
    );

    expect(elicitedSlot(result)).toBe('bodega');
    expect(speech(result)).toBe(
      'No encontré la bodega bodega inexistente. ¿En qué bodega?',
    );
  });

  it('distinguishes an absent balance from a recorded zero', async () => {
    const result = await handleAlexaRequest(
      event('Café molido demo grande', 'Casa Dylan'),
      new DemoInventoryGateway(),
    );

    expect(speech(result)).toBe(
      'No hay un saldo registrado de Café molido demo grande en Casa Dylan.',
    );

    const recordedZero = await handleAlexaRequest(
      event('Café molido demo', 'Casa Luden'),
      new DemoInventoryGateway(),
    );
    expect(speech(recordedZero)).toBe(
      'Hay 0 unidades de Café molido demo en Casa Luden.',
    );
  });

  it('does not trust a multi-value Alexa resolution as unambiguous', async () => {
    const request = event('cafe', 'Casa Dylan');
    request.request.intent!.slots = {
      ...request.request.intent!.slots,
      producto: {
        name: 'producto',
        resolutions: {
          resolutionsPerAuthority: [
            {
              status: { code: 'ER_SUCCESS_MATCH' },
              values: [
                { value: { name: 'Café molido demo' } },
                { value: { name: 'Café molido demo grande' } },
              ],
            },
          ],
        },
        value: 'cafe',
      },
    };

    const result = await handleAlexaRequest(
      request,
      new DemoInventoryGateway(),
    );

    expect(elicitedSlot(result)).toBe('producto');
    expect(speech(result)).toContain('Encontré varias opciones:');
  });

  it('uses Alexa slot resolution values when supplied', async () => {
    const request = event('cafe', 'casa');
    const intent = request.request.intent!;
    intent.slots = {
      bodega: {
        name: 'bodega',
        resolutions: {
          resolutionsPerAuthority: [
            {
              status: { code: 'ER_SUCCESS_MATCH' },
              values: [{ value: { name: 'Casa Dylan' } }],
            },
          ],
        },
        value: 'casa',
      },
      producto: {
        name: 'producto',
        resolutions: {
          resolutionsPerAuthority: [
            {
              status: { code: 'ER_SUCCESS_MATCH' },
              values: [{ value: { name: 'Café molido demo' } }],
            },
          ],
        },
        value: 'cafe',
      },
    };

    const result = await handleAlexaRequest(
      request,
      new DemoInventoryGateway(),
    );

    expect(speech(result)).toBe(
      'Hay 12.5 unidades de Café molido demo en Casa Dylan.',
    );
  });

  it('returns a safe retry response when the read boundary fails', async () => {
    const gateway: InventoryLookupPort = {
      getProductInventory: vi.fn(),
      searchProducts: vi.fn().mockRejectedValue(new Error('private detail')),
      searchWarehouses: vi.fn(),
    };

    const result = await handleAlexaRequest(
      event('Café molido demo', 'Casa Dylan'),
      gateway,
    );

    expect(speech(result)).toBe(
      'No pude completar la consulta en este momento. Intenta de nuevo.',
    );
    expect(JSON.stringify(result)).not.toContain('private detail');
  });

  it('provides a structurally compatible ASK SDK request handler', async () => {
    const handler = createAskSdkRequestHandler(new DemoInventoryGateway());
    const input = { requestEnvelope: event('Café molido demo', 'Casa Dylan') };

    expect(handler.canHandle(input)).toBe(true);
    expect((await handler.handle(input)).outputSpeech?.text).toContain('12.5');
  });
});

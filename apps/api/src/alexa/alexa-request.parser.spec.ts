import { describe, expect, it } from 'vitest';

import { AlexaOAuthError } from './alexa-oauth.errors.js';
import { sanitizeAlexaEnvelope } from './alexa-request.parser.js';

describe('Alexa request parser', () => {
  it('keeps only the approved voice request fields', () => {
    expect(
      sanitizeAlexaEnvelope({
        context: { System: { user: { accessToken: 'secret' } } },
        request: {
          intent: {
            name: 'ConsultarExistenciasIntent',
            slots: {
              bodega: { resolutions: { private: true }, value: 'Casa Dylan' },
              producto: { value: 'Café molido' },
              unexpected: { value: 'private' },
            },
          },
          locale: 'es-MX',
          requestId: 'request-1',
          type: 'IntentRequest',
        },
        session: { user: { userId: 'private' } },
        version: '1.0',
      }),
    ).toEqual({
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
        requestId: 'request-1',
        type: 'IntentRequest',
      },
      version: '1.0',
    });
  });

  it.each([
    null,
    {},
    { request: { locale: 'en-US', type: 'LaunchRequest' } },
    { request: { type: 'AudioPlayer.PlaybackStarted' } },
    {
      request: {
        intent: { name: 'x'.repeat(121), slots: {} },
        type: 'IntentRequest',
      },
    },
  ])('rejects malformed or out-of-scope envelopes', (input) => {
    expect(() => sanitizeAlexaEnvelope(input)).toThrowError(AlexaOAuthError);
  });
});

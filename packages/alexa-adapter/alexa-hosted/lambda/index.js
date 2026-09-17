'use strict';

/*
 * Alexa-hosted bridge for SGI La Comarca.
 *
 * This Lambda contains no business data and no SGI credentials. Alexa supplies
 * the user's short-lived OAuth access token after account linking. The bridge
 * forwards only the request type, locale, intent name and approved slot values.
 */

const https = require('node:https');

const API_BASE_URL =
  process.env.SGI_API_BASE_URL || 'https://api-sgi.lacomarcanic.com';
const MAX_RESPONSE_BYTES = 64 * 1024;
const ALLOWED_SLOTS = new Set(['bodega', 'numeroVenta', 'producto']);

class SgiRequestError extends Error {
  constructor(statusCode) {
    super('SGI request failed.');
    this.statusCode = statusCode;
  }
}

function speech(text, shouldEndSession, card) {
  return {
    version: '1.0',
    response: {
      ...(card ? { card } : {}),
      outputSpeech: { text, type: 'PlainText' },
      shouldEndSession,
    },
  };
}

function linkAccountResponse() {
  return speech(
    'Necesitas vincular tu cuenta del SGI en la aplicación Alexa para consultar datos reales.',
    true,
    { type: 'LinkAccount' },
  );
}

function boundedString(value, maximum) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum ? trimmed : undefined;
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeEnvelope(envelope) {
  const source = isRecord(envelope) ? envelope.request : null;
  if (!isRecord(source)) throw new Error('Invalid Alexa request.');
  const type = boundedString(source.type, 40);
  if (
    !['IntentRequest', 'LaunchRequest', 'SessionEndedRequest'].includes(type)
  ) {
    throw new Error('Unsupported Alexa request.');
  }
  const request = { type };
  const locale = boundedString(source.locale, 16);
  const requestId = boundedString(source.requestId, 256);
  if (locale) request.locale = locale;
  if (requestId) request.requestId = requestId;

  if (type === 'IntentRequest') {
    const sourceIntent = source.intent;
    const name = boundedString(
      isRecord(sourceIntent) && sourceIntent.name,
      120,
    );
    if (!name) throw new Error('Invalid Alexa intent.');
    const intent = { confirmationStatus: 'NONE', name, slots: {} };
    const sourceSlots = sourceIntent.slots;
    if (isRecord(sourceSlots)) {
      for (const [slotName, sourceSlot] of Object.entries(sourceSlots)) {
        if (!ALLOWED_SLOTS.has(slotName) || !isRecord(sourceSlot)) continue;
        const value = boundedString(sourceSlot.value, 200);
        intent.slots[slotName] = {
          name: slotName,
          ...(value ? { value } : {}),
        };
      }
    }
    request.intent = intent;
  }
  return { request, version: '1.0' };
}

let requestSgi = (accessToken, envelope) =>
  new Promise((resolve, reject) => {
    const url = new URL('/api/v1/alexa/requests', API_BASE_URL);
    const body = JSON.stringify(envelope);
    const request = https.request(
      url,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'Content-Length': Buffer.byteLength(body),
          'Content-Type': 'application/json',
        },
        method: 'POST',
        timeout: 4_000,
      },
      (response) => {
        const chunks = [];
        let bytes = 0;
        response.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_RESPONSE_BYTES) {
            request.destroy(new Error('SGI response too large.'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          const statusCode = response.statusCode || 500;
          if (statusCode < 200 || statusCode >= 300) {
            reject(new SgiRequestError(statusCode));
            return;
          }
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (!isRecord(parsed) || !isRecord(parsed.data)) {
              throw new Error('Invalid SGI response.');
            }
            resolve(parsed.data);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('SGI timeout.')));
    request.end(body);
  });

exports.handler = async (event) => {
  const accessToken = boundedString(
    event?.context?.System?.user?.accessToken,
    256,
  );
  if (!accessToken) return linkAccountResponse();

  try {
    return await requestSgi(accessToken, sanitizeEnvelope(event));
  } catch (error) {
    if (error instanceof SgiRequestError && error.statusCode === 401) {
      return linkAccountResponse();
    }
    if (error instanceof SgiRequestError && error.statusCode === 403) {
      return speech(
        'Tu cuenta no tiene permisos para esta consulta. Revisa el acceso en el SGI.',
        true,
      );
    }
    if (error instanceof SgiRequestError && error.statusCode === 429) {
      return speech(
        'Se alcanzó el límite de consultas. Intenta nuevamente en un minuto.',
        true,
      );
    }
    return speech(
      'No pude consultar el SGI en este momento. Intenta de nuevo más tarde.',
      true,
    );
  }
};

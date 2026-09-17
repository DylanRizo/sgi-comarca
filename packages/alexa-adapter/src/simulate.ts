import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { AlexaRequestEnvelope } from './alexa-types.js';
import { DemoInventoryGateway } from './demo-inventory.gateway.js';
import { DemoSalesGateway } from './demo-sales.gateway.js';
import { createLambdaHandler } from './lambda-handler.js';

function isAlexaRequestEnvelope(value: unknown): value is AlexaRequestEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const request = Reflect.get(value, 'request');
  return (
    typeof request === 'object' &&
    request !== null &&
    typeof Reflect.get(request, 'type') === 'string'
  );
}

const eventPath = resolve(
  process.cwd(),
  process.argv[2] ??
    'packages/alexa-adapter/examples/consultar-existencias.request.json',
);
const parsed: unknown = JSON.parse(await readFile(eventPath, 'utf8'));
if (!isAlexaRequestEnvelope(parsed)) {
  throw new Error('The file is not a supported Alexa request envelope.');
}

const handler = createLambdaHandler(
  new DemoInventoryGateway(),
  new DemoSalesGateway(),
);
process.stdout.write(`${JSON.stringify(await handler(parsed), null, 2)}\n`);

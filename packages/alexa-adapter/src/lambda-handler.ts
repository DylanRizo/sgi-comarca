import type {
  AlexaRequestEnvelope,
  AlexaResponseEnvelope,
} from './alexa-types.js';
import type { InventoryLookupPort } from './inventory-lookup.port.js';
import type { SaleLookupPort } from './sale-lookup.port.js';
import { handleAlexaRequest } from './skill.js';

export type AlexaLambdaHandler = (
  event: AlexaRequestEnvelope,
) => Promise<AlexaResponseEnvelope>;

/** Creates an AWS Lambda-shaped handler without coupling the core to AWS. */
export function createLambdaHandler(
  inventory: InventoryLookupPort,
  sales?: SaleLookupPort,
): AlexaLambdaHandler {
  return async (event) => handleAlexaRequest(event, inventory, sales);
}

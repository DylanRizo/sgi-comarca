import type {
  AlexaRequestEnvelope,
  AlexaSkillResponse,
} from './alexa-types.js';
import type { InventoryLookupPort } from './inventory-lookup.port.js';
import type { SaleLookupPort } from './sale-lookup.port.js';
import { handleAlexaRequest } from './skill.js';

export interface AskSdkHandlerInput {
  requestEnvelope: AlexaRequestEnvelope;
}

/** Structural subset of ASK SDK's RequestHandler used by the POC. */
export interface AskSdkRequestHandler {
  canHandle(input: AskSdkHandlerInput): boolean;
  handle(input: AskSdkHandlerInput): Promise<AlexaSkillResponse>;
}

/**
 * Catch-all ASK SDK request handler. A future Lambda can register it with
 * SkillBuilders.custom().addRequestHandlers(...) after wiring an authorized
 * InventoryLookupPort and, when enabled, SaleLookupPort.
 */
export function createAskSdkRequestHandler(
  inventory: InventoryLookupPort,
  sales?: SaleLookupPort,
): AskSdkRequestHandler {
  return {
    canHandle: () => true,
    handle: async (input) =>
      (await handleAlexaRequest(input.requestEnvelope, inventory, sales))
        .response,
  };
}

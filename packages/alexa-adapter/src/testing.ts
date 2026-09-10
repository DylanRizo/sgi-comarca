export { DemoInventoryGateway } from './demo-inventory.gateway.js';
export { DemoSalesGateway } from './demo-sales.gateway.js';
export {
  createAskSdkRequestHandler,
  type AskSdkHandlerInput,
  type AskSdkRequestHandler,
} from './ask-sdk-handler.js';
export {
  createLambdaHandler,
  type AlexaLambdaHandler,
} from './lambda-handler.js';
export { handleAlexaRequest } from './skill.js';
export type {
  AlexaIntent,
  AlexaRequestEnvelope,
  AlexaResponseEnvelope,
} from './alexa-types.js';
export type { InventoryLookupPort } from './inventory-lookup.port.js';
export type {
  SaleLookupPort,
  VoiceSaleItem,
  VoiceSaleList,
  VoiceSaleSummary,
} from './sale-lookup.port.js';

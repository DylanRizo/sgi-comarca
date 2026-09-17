export type {
  AlexaIntent,
  AlexaRequestEnvelope,
  AlexaResponseEnvelope,
  AlexaSkillResponse,
  AlexaSlot,
} from './alexa-types.js';
export {
  createAskSdkRequestHandler,
  type AskSdkHandlerInput,
  type AskSdkRequestHandler,
} from './ask-sdk-handler.js';
export {
  normalizeSpokenValue,
  resolveCatalogCandidate,
  type CatalogResolution,
} from './catalog-resolution.js';
export type { InventoryLookupPort } from './inventory-lookup.port.js';
export {
  normalizeSaleNumber,
  resolveSaleNumber,
  type SaleLookupPort,
  type SaleNumberResolution,
  type VoiceSaleItem,
  type VoiceSaleList,
  type VoiceSaleSummary,
} from './sale-lookup.port.js';
export {
  createLambdaHandler,
  type AlexaLambdaHandler,
} from './lambda-handler.js';
export {
  handleAlexaRequest,
  INVENTORY_INTENT,
  PRODUCT_SLOT,
  SALE_NUMBER_SLOT,
  TRANSIT_SALE_INTENT,
  TRANSIT_SALES_SUMMARY_INTENT,
  WAREHOUSE_SLOT,
} from './skill.js';

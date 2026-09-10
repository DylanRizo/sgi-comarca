import type { ProductSummary, WarehouseSummary } from '@sgi/contracts';

import type {
  AlexaIntent,
  AlexaRequestEnvelope,
  AlexaResponseEnvelope,
  AlexaSkillResponse,
  AlexaSlot,
} from './alexa-types.js';
import {
  normalizeSpokenValue,
  resolveCatalogCandidate,
  type CatalogResolution,
} from './catalog-resolution.js';
import type { InventoryLookupPort } from './inventory-lookup.port.js';
import {
  resolveSaleNumber,
  type SaleLookupPort,
  type VoiceSaleItem,
  type VoiceSaleSummary,
} from './sale-lookup.port.js';

export const INVENTORY_INTENT = 'ConsultarExistenciasIntent';
export const TRANSIT_SALES_SUMMARY_INTENT =
  'ConsultarResumenVentasEnTransitoIntent';
export const TRANSIT_SALE_INTENT = 'ConsultarVentaEnTransitoIntent';
export const PRODUCT_SLOT = 'producto';
export const WAREHOUSE_SLOT = 'bodega';
export const SALE_NUMBER_SLOT = 'numeroVenta';

function plainText(text: string) {
  return { text, type: 'PlainText' as const };
}

function response(
  text: string,
  shouldEndSession: boolean,
  reprompt?: string,
): AlexaResponseEnvelope {
  return {
    response: {
      outputSpeech: plainText(text),
      ...(reprompt ? { reprompt: { outputSpeech: plainText(reprompt) } } : {}),
      shouldEndSession,
    },
    version: '1.0',
  };
}

function elicitSlot(
  intent: AlexaIntent,
  slot: string,
  prompt: string,
): AlexaResponseEnvelope {
  return {
    response: {
      directives: [
        {
          slotToElicit: slot,
          type: 'Dialog.ElicitSlot',
          updatedIntent: intent,
        },
      ],
      outputSpeech: plainText(prompt),
      reprompt: { outputSpeech: plainText(prompt) },
      shouldEndSession: false,
    },
    version: '1.0',
  };
}

function resolvedSlotValue(slot: AlexaSlot | undefined): string | undefined {
  const resolvedNames =
    slot?.resolutions?.resolutionsPerAuthority
      ?.filter((authority) => authority.status.code === 'ER_SUCCESS_MATCH')
      .flatMap((authority) =>
        (authority.values ?? []).map((resolved) => resolved.value.name),
      ) ?? [];
  const uniqueNames = [
    ...new Map(
      resolvedNames.map((name) => [normalizeSpokenValue(name), name]),
    ).values(),
  ];
  return uniqueNames.length === 1
    ? uniqueNames[0]
    : (slot?.value?.trim() ?? undefined);
}

function choices<T extends { name: string }>(values: readonly T[]): string {
  return values
    .slice(0, 3)
    .map((value) => value.name)
    .join(', ');
}

function productResolutionResponse(
  intent: AlexaIntent,
  spokenValue: string,
  resolution: Exclude<CatalogResolution<ProductSummary>, { kind: 'found' }>,
): AlexaResponseEnvelope {
  if (resolution.kind === 'not_found') {
    return elicitSlot(
      intent,
      PRODUCT_SLOT,
      `No encontré el producto ${spokenValue}. ¿Qué producto quieres consultar?`,
    );
  }
  return elicitSlot(
    intent,
    PRODUCT_SLOT,
    `Encontré varias opciones: ${choices(resolution.values)}. ¿Cuál producto quieres?`,
  );
}

function warehouseResolutionResponse(
  intent: AlexaIntent,
  spokenValue: string,
  resolution: Exclude<CatalogResolution<WarehouseSummary>, { kind: 'found' }>,
): AlexaResponseEnvelope {
  if (resolution.kind === 'not_found') {
    return elicitSlot(
      intent,
      WAREHOUSE_SLOT,
      `No encontré la bodega ${spokenValue}. ¿En qué bodega?`,
    );
  }
  return elicitSlot(
    intent,
    WAREHOUSE_SLOT,
    `Encontré varias bodegas: ${choices(resolution.values)}. ¿Cuál bodega?`,
  );
}

async function inventoryIntent(
  intent: AlexaIntent,
  inventory: InventoryLookupPort,
): Promise<AlexaResponseEnvelope> {
  const spokenProduct = resolvedSlotValue(intent.slots?.[PRODUCT_SLOT]);
  if (!spokenProduct) {
    return elicitSlot(intent, PRODUCT_SLOT, '¿Qué producto quieres consultar?');
  }

  const spokenWarehouse = resolvedSlotValue(intent.slots?.[WAREHOUSE_SLOT]);
  if (!spokenWarehouse) {
    return elicitSlot(intent, WAREHOUSE_SLOT, '¿En qué bodega?');
  }

  const product = resolveCatalogCandidate(
    spokenProduct,
    await inventory.searchProducts(spokenProduct),
  );
  if (product.kind !== 'found') {
    return productResolutionResponse(intent, spokenProduct, product);
  }

  const warehouse = resolveCatalogCandidate(
    spokenWarehouse,
    await inventory.searchWarehouses(spokenWarehouse),
  );
  if (warehouse.kind !== 'found') {
    return warehouseResolutionResponse(intent, spokenWarehouse, warehouse);
  }

  const stock = await inventory.getProductInventory(
    product.value.id,
    warehouse.value.id,
  );
  const balance = stock.balances.find(
    (candidate) => candidate.warehouse.id === warehouse.value.id,
  );
  if (!balance) {
    return response(
      `No hay un saldo registrado de ${product.value.name} en ${warehouse.value.name}.`,
      true,
    );
  }

  const unit = product.value.unit?.name;
  const amount = unit ? `${balance.quantity} ${unit}` : balance.quantity;
  return response(
    `Hay ${amount} de ${product.value.name} en ${warehouse.value.name}.`,
    true,
  );
}

const spanishMonths = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

function formatBusinessDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return value;
  const month = spanishMonths[Number(match[2]) - 1];
  if (!month) return value;
  return `${Number(match[3])} de ${month} de ${match[1]}`;
}

function describeSaleItem(item: VoiceSaleItem): string {
  const warehouse = item.warehouse ? `, desde ${item.warehouse.name}` : '';
  return `${item.product.name}, cantidad ${item.quantity}${warehouse}`;
}

function describeTransitSale(sale: VoiceSaleSummary): string {
  const items = sale.items.map(describeSaleItem).join('; ');
  const contents = items || 'sin productos registrados';
  return `Venta ${sale.saleNumber}, en tránsito, del ${formatBusinessDate(sale.businessDate)}. Incluye: ${contents}.`;
}

function uniqueWarehouseNames(sale: VoiceSaleSummary): string[] {
  return [
    ...new Set(
      sale.items.flatMap((item) =>
        item.warehouse ? [item.warehouse.name] : [],
      ),
    ),
  ];
}

function describeTransitSaleSummary(sale: VoiceSaleSummary): string {
  const productCount = sale.items.length;
  const warehouses = uniqueWarehouseNames(sale);
  const source =
    warehouses.length > 0 ? `, desde ${warehouses.join(' y ')}` : '';
  return `${sale.saleNumber}, del ${formatBusinessDate(sale.businessDate)}, ${productCount} ${productCount === 1 ? 'producto' : 'productos'}${source}`;
}

async function transitSalesSummaryIntent(
  sales: SaleLookupPort | undefined,
): Promise<AlexaResponseEnvelope> {
  if (!sales) {
    return response(
      'La consulta de ventas no está disponible en este piloto.',
      false,
      'Puedes consultar existencias por producto y bodega.',
    );
  }

  const transitSales = await sales.listSalesInTransit();
  if (transitSales.total === 0) {
    return response('No hay ventas en tránsito.', true);
  }
  const shownSales = transitSales.items.slice(0, 3);
  const summaries = shownSales.map(describeTransitSaleSummary).join('; ');
  const remaining = transitSales.total - shownSales.length;
  const remainder = remaining > 0 ? `; y ${remaining} más` : '';
  return response(
    `Hay ${transitSales.total} ${transitSales.total === 1 ? 'venta' : 'ventas'} en tránsito: ${summaries}${remainder}.`,
    true,
  );
}

function spanishSaleStatus(status: VoiceSaleSummary['status']): string {
  switch (status) {
    case 'IN_TRANSIT':
      return 'en tránsito';
    case 'COMPLETED':
      return 'completada';
    case 'CANCELLED':
      return 'cancelada';
    case 'LEGACY_UNKNOWN':
      return 'con estado desconocido';
  }
}

async function transitSaleIntent(
  intent: AlexaIntent,
  sales: SaleLookupPort | undefined,
): Promise<AlexaResponseEnvelope> {
  const spokenNumber = resolvedSlotValue(intent.slots?.[SALE_NUMBER_SLOT]);
  if (!spokenNumber) {
    return elicitSlot(
      intent,
      SALE_NUMBER_SLOT,
      '¿Qué número de venta quieres consultar?',
    );
  }
  if (!sales) {
    return response(
      'La consulta de ventas no está disponible en este piloto.',
      false,
      'Puedes consultar existencias por producto y bodega.',
    );
  }

  const resolution = resolveSaleNumber(
    spokenNumber,
    await sales.searchSalesByNumber(spokenNumber),
  );
  if (resolution.kind === 'not_found') {
    return elicitSlot(
      intent,
      SALE_NUMBER_SLOT,
      `No encontré la venta ${spokenNumber}. ¿Qué número de venta quieres consultar?`,
    );
  }
  if (resolution.kind === 'ambiguous') {
    const options = resolution.values
      .slice(0, 3)
      .map((sale) => sale.saleNumber)
      .join(', ');
    return elicitSlot(
      intent,
      SALE_NUMBER_SLOT,
      `Encontré varias ventas: ${options}. ¿Cuál quieres consultar?`,
    );
  }
  if (resolution.value.status !== 'IN_TRANSIT') {
    return response(
      `La venta ${resolution.value.saleNumber} no está en tránsito. Su estado es ${spanishSaleStatus(resolution.value.status)}.`,
      true,
    );
  }
  return response(describeTransitSale(resolution.value), true);
}

function emptyResponse(): AlexaResponseEnvelope {
  return { response: {}, version: '1.0' };
}

export async function handleAlexaRequest(
  envelope: AlexaRequestEnvelope,
  inventory: InventoryLookupPort,
  sales?: SaleLookupPort,
): Promise<AlexaResponseEnvelope> {
  try {
    if (envelope.request.type === 'LaunchRequest') {
      return response(
        'Puedes consultar existencias por producto y bodega, pedir el resumen de ventas en tránsito, o consultar una venta por número.',
        false,
        'Dime el producto y la bodega, pide el resumen de ventas en tránsito, o dime el número de venta.',
      );
    }
    if (envelope.request.type === 'SessionEndedRequest') return emptyResponse();
    if (envelope.request.type !== 'IntentRequest') {
      return response('No entendí la consulta.', false, 'Intenta otra vez.');
    }

    const intent = envelope.request.intent;
    if (!intent) return response('No entendí la consulta.', false);

    if (intent.name === INVENTORY_INTENT) {
      return await inventoryIntent(intent, inventory);
    }
    if (intent.name === TRANSIT_SALES_SUMMARY_INTENT) {
      return await transitSalesSummaryIntent(sales);
    }
    if (intent.name === TRANSIT_SALE_INTENT) {
      return await transitSaleIntent(intent, sales);
    }
    if (intent.name === 'AMAZON.HelpIntent') {
      return response(
        'Pregunta cuántas existencias hay de un producto en una bodega, pide el resumen de ventas en tránsito, o consulta una venta por número.',
        false,
        'Dime el producto y la bodega, pide el resumen de ventas en tránsito, o dime el número de venta.',
      );
    }
    if (
      intent.name === 'AMAZON.CancelIntent' ||
      intent.name === 'AMAZON.StopIntent'
    ) {
      return response('Hasta luego.', true);
    }
    return response(
      'Solo puedo consultar existencias o ventas en tránsito.',
      false,
      'Dime el producto y la bodega, pide el resumen de ventas en tránsito, o dime el número de venta.',
    );
  } catch {
    return response(
      'No pude completar la consulta en este momento. Intenta de nuevo.',
      false,
      'Dime el producto y la bodega, pide el resumen de ventas en tránsito, o dime el número de venta.',
    );
  }
}

export type { AlexaSkillResponse };

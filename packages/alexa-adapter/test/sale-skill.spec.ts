import { describe, expect, it, vi } from 'vitest';

import type {
  AlexaRequestEnvelope,
  AlexaResponseEnvelope,
  AlexaSlot,
  SaleLookupPort,
  VoiceSaleSummary,
} from '../src/index.js';
import {
  DemoInventoryGateway,
  DemoSalesGateway,
  handleAlexaRequest,
} from '../src/testing.js';

function saleEvent(number?: string): AlexaRequestEnvelope {
  const slots: Record<string, AlexaSlot | undefined> = {};
  if (number !== undefined) {
    slots.numeroVenta = { name: 'numeroVenta', value: number };
  }
  return {
    request: {
      intent: {
        confirmationStatus: 'NONE',
        name: 'ConsultarVentaEnTransitoIntent',
        slots,
      },
      locale: 'es-MX',
      requestId: 'test-sale-request',
      type: 'IntentRequest',
    },
    version: '1.0',
  };
}

function salesSummaryEvent(): AlexaRequestEnvelope {
  return {
    request: {
      intent: {
        confirmationStatus: 'NONE',
        name: 'ConsultarResumenVentasEnTransitoIntent',
        slots: {},
      },
      locale: 'es-MX',
      requestId: 'test-sales-summary-request',
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

describe('Alexa in-transit sale skill', () => {
  it('summarizes all in-transit sales without financial or personal data', async () => {
    const result = await handleAlexaRequest(
      salesSummaryEvent(),
      new DemoInventoryGateway(),
      new DemoSalesGateway(),
    );

    expect(speech(result)).toBe(
      'Hay 2 ventas en tránsito: VTA-000000123, del 7 de septiembre de 2026, 2 productos, desde Casa Dylan y Casa Luden; VTA-000000126, del 8 de septiembre de 2026, 1 producto, desde Casa Jean.',
    );
    expect(speech(result)).not.toMatch(
      /cliente|contacto|dirección|pago|precio|total/iu,
    );
  });

  it('reports an empty in-transit summary', async () => {
    const sales: SaleLookupPort = {
      listSalesInTransit: async () => ({ items: [], total: 0 }),
      searchSalesByNumber: async () => [],
    };

    const result = await handleAlexaRequest(
      salesSummaryEvent(),
      new DemoInventoryGateway(),
      sales,
    );

    expect(speech(result)).toBe('No hay ventas en tránsito.');
  });

  it('announces the total while keeping the spoken summary bounded', async () => {
    const sales: SaleLookupPort = {
      listSalesInTransit: async () => ({
        items: [
          {
            businessDate: '2026-09-09',
            items: [],
            saleNumber: 'VTA-000000001',
            status: 'IN_TRANSIT',
          },
          {
            businessDate: '2026-09-09',
            items: [],
            saleNumber: 'VTA-000000002',
            status: 'IN_TRANSIT',
          },
          {
            businessDate: '2026-09-09',
            items: [],
            saleNumber: 'VTA-000000003',
            status: 'IN_TRANSIT',
          },
        ],
        total: 8,
      }),
      searchSalesByNumber: async () => [],
    };
    const result = await handleAlexaRequest(
      salesSummaryEvent(),
      new DemoInventoryGateway(),
      sales,
    );
    expect(speech(result)).toContain('Hay 8 ventas en tránsito');
    expect(speech(result)).toContain('y 5 más');
    expect(speech(result)?.match(/VTA-/gu)).toHaveLength(3);
  });

  it('describes the identifier, status, date, items, quantities and warehouses', async () => {
    const result = await handleAlexaRequest(
      saleEvent('123'),
      new DemoInventoryGateway(),
      new DemoSalesGateway(),
    );

    expect(speech(result)).toBe(
      'Venta VTA-000000123, en tránsito, del 7 de septiembre de 2026. Incluye: Café molido demo, cantidad 2, desde Casa Dylan; Té de hierbabuena demo, cantidad 1.5, desde Casa Luden.',
    );
    expect(result.response.shouldEndSession).toBe(true);
  });

  it('normalizes a spoken operational sale number', async () => {
    const result = await handleAlexaRequest(
      saleEvent('venta ciento veintitrés 123'),
      new DemoInventoryGateway(),
      new DemoSalesGateway(),
    );

    expect(speech(result)).toContain('Venta VTA-000000123, en tránsito');
  });

  it('elicits a missing sale number before using the gateway', async () => {
    const sales = new DemoSalesGateway();
    const search = vi.spyOn(sales, 'searchSalesByNumber');

    const result = await handleAlexaRequest(
      saleEvent(),
      new DemoInventoryGateway(),
      sales,
    );

    expect(elicitedSlot(result)).toBe('numeroVenta');
    expect(speech(result)).toBe('¿Qué número de venta quieres consultar?');
    expect(search).not.toHaveBeenCalled();
  });

  it('elicits another number when the sale does not exist', async () => {
    const result = await handleAlexaRequest(
      saleEvent('999'),
      new DemoInventoryGateway(),
      new DemoSalesGateway(),
    );

    expect(elicitedSlot(result)).toBe('numeroVenta');
    expect(speech(result)).toBe(
      'No encontré la venta 999. ¿Qué número de venta quieres consultar?',
    );
  });

  it('reports a non-transit state without disclosing payment information', async () => {
    const result = await handleAlexaRequest(
      saleEvent('124'),
      new DemoInventoryGateway(),
      new DemoSalesGateway(),
    );

    expect(speech(result)).toBe(
      'La venta VTA-000000124 no está en tránsito. Su estado es completada.',
    );
    expect(speech(result)).not.toMatch(/pago|precio|total/iu);
  });

  it('does not guess between ambiguous sale numbers', async () => {
    const result = await handleAlexaRequest(
      saleEvent('venta'),
      new DemoInventoryGateway(),
      new DemoSalesGateway(),
    );

    expect(elicitedSlot(result)).toBe('numeroVenta');
    expect(speech(result)).toContain(
      'Encontré varias ventas: VTA-000000123, VTA-000000124, VTA-000000126.',
    );
  });

  it('renders only the shared-device safe projection', async () => {
    const unsafeSource: VoiceSaleSummary & {
      deliveryPlace: string;
      paymentMethodText: string;
      total: string;
    } = {
      businessDate: '2026-09-07',
      deliveryPlace: 'Dirección privada 123',
      items: [
        {
          product: { code: 'DEMO', name: 'Producto demo' },
          quantity: '4',
        },
      ],
      paymentMethodText: 'Tarjeta privada',
      saleNumber: 'VTA-000000125',
      status: 'IN_TRANSIT',
      total: '999.99',
    };
    const sales: SaleLookupPort = {
      listSalesInTransit: async () => ({ items: [unsafeSource], total: 1 }),
      searchSalesByNumber: async () => [unsafeSource],
    };

    const detailResult = await handleAlexaRequest(
      saleEvent('125'),
      new DemoInventoryGateway(),
      sales,
    );
    const summaryResult = await handleAlexaRequest(
      salesSummaryEvent(),
      new DemoInventoryGateway(),
      sales,
    );
    const detail = speech(detailResult) ?? '';
    const renderedResponses = [detail, speech(summaryResult) ?? ''];

    expect(detail).toContain('Producto demo, cantidad 4');
    for (const rendered of renderedResponses) {
      expect(rendered).not.toContain('Dirección privada 123');
      expect(rendered).not.toContain('Tarjeta privada');
      expect(rendered).not.toContain('999.99');
    }
  });

  it('returns a generic error without leaking gateway details', async () => {
    const sales: SaleLookupPort = {
      listSalesInTransit: async () => ({ items: [], total: 0 }),
      searchSalesByNumber: vi
        .fn()
        .mockRejectedValue(new Error('private sale detail')),
    };

    const result = await handleAlexaRequest(
      saleEvent('123'),
      new DemoInventoryGateway(),
      sales,
    );

    expect(speech(result)).toBe(
      'No pude completar la consulta en este momento. Intenta de nuevo.',
    );
    expect(JSON.stringify(result)).not.toContain('private sale detail');
  });

  it('keeps the previous handler compatible when no sales port is wired', async () => {
    const result = await handleAlexaRequest(
      saleEvent('123'),
      new DemoInventoryGateway(),
    );

    expect(speech(result)).toBe(
      'La consulta de ventas no está disponible en este piloto.',
    );
  });
});

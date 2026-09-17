import { normalizeSpokenValue } from './catalog-resolution.js';
import {
  normalizeSaleNumber,
  type SaleLookupPort,
  type VoiceSaleSummary,
} from './sale-lookup.port.js';

const demoSales: readonly VoiceSaleSummary[] = [
  {
    businessDate: '2026-09-07',
    items: [
      {
        product: { code: 'DEMO-CAFE', name: 'Café molido demo' },
        quantity: '2',
        warehouse: { code: 'CASA_DYLAN', name: 'Casa Dylan' },
      },
      {
        product: { code: 'DEMO-TE', name: 'Té de hierbabuena demo' },
        quantity: '1.5',
        warehouse: { code: 'CASA_LUDEN', name: 'Casa Luden' },
      },
    ],
    saleNumber: 'VTA-000000123',
    status: 'IN_TRANSIT',
  },
  {
    businessDate: '2026-09-06',
    items: [
      {
        product: { code: 'DEMO-CAFE', name: 'Café molido demo' },
        quantity: '1',
        warehouse: { code: 'CASA_DYLAN', name: 'Casa Dylan' },
      },
    ],
    saleNumber: 'VTA-000000124',
    status: 'COMPLETED',
  },
  {
    businessDate: '2026-09-08',
    items: [
      {
        product: { code: 'DEMO-CACAO', name: 'Cacao en polvo demo' },
        quantity: '3',
        warehouse: { code: 'CASA_JEAN', name: 'Casa Jean' },
      },
    ],
    saleNumber: 'VTA-000000126',
    status: 'IN_TRANSIT',
  },
];

export class DemoSalesGateway implements SaleLookupPort {
  async listSalesInTransit() {
    const items = demoSales.filter((sale) => sale.status === 'IN_TRANSIT');
    return { items, total: items.length };
  }

  async searchSalesByNumber(
    query: string,
  ): Promise<readonly VoiceSaleSummary[]> {
    const normalizedWords = normalizeSpokenValue(query);
    const normalizedNumber = normalizeSaleNumber(query);
    if (normalizedWords === 'venta') return demoSales;
    return demoSales.filter(
      (sale) => normalizeSaleNumber(sale.saleNumber) === normalizedNumber,
    );
  }
}

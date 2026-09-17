import type { DatabaseClient } from '../client.js';

// Approved legacy unit vocabulary. No products, balances or historical category
// assignments are inferred or imported by this preparation.
const units = [
  ['UNIDADES', 'Unidades'],
  ['KILOGRAMOS', 'Kilogramos'],
  ['GRAMOS', 'Gramos'],
  ['TONELADAS', 'Toneladas'],
  ['LITROS', 'Litros'],
  ['MILILITROS', 'Mililitros'],
  ['METROS', 'Metros'],
  ['CENTIMETROS', 'Centímetros'],
  ['METROS_CUADRADOS', 'Metros cuadrados'],
  ['METROS_CUBICOS', 'Metros cúbicos'],
  ['PIEZAS', 'Piezas'],
  ['CAJAS', 'Cajas'],
  ['PAQUETES', 'Paquetes'],
  ['DOCENAS', 'Docenas'],
] as const;

export async function prepareOperationalCatalogs(client: DatabaseClient) {
  return client.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('operational-catalogs-v1', 0))`;
    for (const [code, name] of units) {
      await transaction.unit.upsert({
        where: { code },
        create: { code, name },
        update: {},
      });
    }
    await transaction.productGroup.upsert({
      where: { code: 'GENERAL' },
      create: { code: 'GENERAL', name: 'General' },
      update: {},
    });
    return { approvedUnits: units.length, defaultCategory: 'GENERAL' };
  });
}

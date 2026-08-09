import type {
  AppliedSecurityLimits,
  MappingStatus,
} from '../domain/profile-types.js';

export const SGI_SOURCE_CODE = 'legacy-inventory-xlsx';
export const SGI_EXPECTED_SHA256 =
  'd0bb929d9498db888295d2c556a51e1a90f3d5834e9c4d544d9b1bb65d46e550';

export const DEFAULT_SECURITY_LIMITS: AppliedSecurityLimits = {
  maxWorkbookBytes: 32 * 1024 * 1024,
  maxSheets: 64,
  maxRowsPerSheet: 100_000,
  maxColumnsPerSheet: 512,
  maxCells: 2_000_000,
  maxArchiveParts: 4096,
  maxPartBytes: 16 * 1024 * 1024,
  maxXmlBytes: 8 * 1024 * 1024,
  maxTotalUncompressedBytes: 256 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxFindings: 10_000,
};

export interface SheetProfileConfig {
  name: string;
  headerRow: number;
  expectedHeaders: string[];
  candidateKeys: string[][];
  requiredHeaders: string[];
  sensitiveHeaders: string[];
  nonSensitiveCatalog: boolean;
}

export interface RelationConfig {
  sourceSheet: string;
  sourceColumn: string;
  targetSheet: string;
  targetColumn: string;
  evidenceCodes: string[];
}

export interface TargetMappingConfig {
  targetModel: string;
  status: MappingStatus;
  sourceSheets: string[];
  rationaleCode: string;
  phase: 'PHASE_3C_OBSERVATION' | 'PHASE_4';
  requiresHumanDecision: boolean;
}

export const SGI_SHEET_CONFIGS: SheetProfileConfig[] = [
  {
    name: 'Productos',
    headerRow: 1,
    expectedHeaders: [
      'Código',
      'Nombre',
      'Unidad',
      'Grupo',
      'Stock Mínimo',
      'Precio',
      'Fecha Creación',
    ],
    candidateKeys: [['Código']],
    requiredHeaders: ['Código', 'Nombre'],
    sensitiveHeaders: ['Nombre', 'Precio'],
    nonSensitiveCatalog: false,
  },
  {
    name: 'Finanzas',
    headerRow: 1,
    expectedHeaders: [
      'ID_Movimiento',
      'Fecha',
      'Tipo',
      'Categoría',
      'Monto',
      'Responsable',
      'Observaciones',
    ],
    candidateKeys: [['ID_Movimiento']],
    requiredHeaders: ['ID_Movimiento'],
    sensitiveHeaders: ['Monto', 'Responsable', 'Observaciones'],
    nonSensitiveCatalog: false,
  },
  {
    name: 'CierresDiarios',
    headerRow: 1,
    expectedHeaders: [
      'ID_Cierre',
      'Fecha del Cierre',
      'Datos JSON',
      'Total Ventas Sistema',
      'Total Gastos Sistema',
      'Total Efectivo Real',
      'Total Digital Real',
      'Diferencia',
      'Estado',
      'Encargado',
      'Timestamp',
      'Observaciones',
    ],
    candidateKeys: [['ID_Cierre']],
    requiredHeaders: ['ID_Cierre', 'Fecha del Cierre'],
    sensitiveHeaders: [],
    nonSensitiveCatalog: false,
  },
  {
    name: 'Movimientos',
    headerRow: 1,
    expectedHeaders: [
      'Código',
      'Fecha',
      'Tipo',
      'Cantidad',
      'Usuario',
      'Timestamp',
      'Observaciones',
      'Stock Resultante',
      'Ubicación',
    ],
    candidateKeys: [['Código', 'Timestamp', 'Ubicación']],
    requiredHeaders: ['Código', 'Tipo', 'Cantidad', 'Ubicación'],
    sensitiveHeaders: ['Responsable', 'Observaciones'],
    nonSensitiveCatalog: false,
  },
  {
    name: 'Entrada de Productos',
    headerRow: 14,
    expectedHeaders: [
      'codigo unico del producto',
      'nombre del producto',
      'cantidad de entrada del producto',
      'Descripción del Producto',
      'costo',
      'precio',
      'fecha y hora',
    ],
    candidateKeys: [],
    requiredHeaders: ['codigo unico del producto'],
    sensitiveHeaders: [
      'nombre del producto',
      'Descripción del Producto',
      'costo',
      'precio',
    ],
    nonSensitiveCatalog: false,
  },
  {
    name: 'Inventario',
    headerRow: 1,
    expectedHeaders: [
      'codigo unico del producto',
      'nombre del producto',
      'cantidad disponible',
      'Descripción del producto',
      'costo',
      'precio',
      'ubicacion del producto',
      'fecha y hora',
    ],
    candidateKeys: [['codigo unico del producto', 'ubicacion del producto']],
    requiredHeaders: ['codigo unico del producto', 'ubicacion del producto'],
    sensitiveHeaders: [
      'nombre del producto',
      'Descripción del producto',
      'costo',
      'precio',
      'ubicacion del producto',
    ],
    nonSensitiveCatalog: false,
  },
  {
    name: 'Ventas',
    headerRow: 1,
    expectedHeaders: [
      'ID Venta',
      'Fecha',
      'Hora Salida',
      'Hora Finalización',
      'Vendedor',
      'Entregador',
      'Items Vendidos',
      'Monto Cobrado',
      'Envío Cobrado',
      'Total',
      'Lugar Extracción',
      'Lugar Entrega',
      'Observaciones',
      'Timestamp',
      'Canal Venta',
      'Precio Unitario',
      'Columna 1',
    ],
    candidateKeys: [],
    requiredHeaders: ['ID Venta', 'Items Vendidos', 'Lugar Extracción'],
    sensitiveHeaders: [
      'Cliente',
      'Vendedor',
      'Responsable',
      'Observaciones',
      'Total',
      'Precio',
    ],
    nonSensitiveCatalog: false,
  },
  {
    name: 'Unidades',
    headerRow: 1,
    expectedHeaders: ['Unidad'],
    candidateKeys: [['Unidad']],
    requiredHeaders: ['Unidad'],
    sensitiveHeaders: [],
    nonSensitiveCatalog: true,
  },
  {
    name: 'Grupos',
    headerRow: 1,
    expectedHeaders: ['Grupo'],
    candidateKeys: [['Grupo']],
    requiredHeaders: ['Grupo'],
    sensitiveHeaders: [],
    nonSensitiveCatalog: true,
  },
];

export const SGI_RELATIONS: RelationConfig[] = [
  {
    sourceSheet: 'Productos',
    sourceColumn: 'Código',
    targetSheet: 'Inventario',
    targetColumn: 'codigo unico del producto',
    evidenceCodes: ['PRODUCT_INVENTORY_CODE_OVERLAP'],
  },
  {
    sourceSheet: 'Inventario',
    sourceColumn: 'codigo unico del producto',
    targetSheet: 'Movimientos',
    targetColumn: 'Código',
    evidenceCodes: ['INVENTORY_MOVEMENT_CODE_OVERLAP'],
  },
  {
    sourceSheet: 'Movimientos',
    sourceColumn: 'Código',
    targetSheet: 'Entrada de Productos',
    targetColumn: 'codigo unico del producto',
    evidenceCodes: ['MOVEMENT_RECEIPT_CODE_OVERLAP'],
  },
  {
    sourceSheet: 'Productos',
    sourceColumn: 'Unidad',
    targetSheet: 'Unidades',
    targetColumn: 'Unidad',
    evidenceCodes: ['PRODUCT_UNIT_CATALOG_OVERLAP'],
  },
  {
    sourceSheet: 'Productos',
    sourceColumn: 'Grupo',
    targetSheet: 'Grupos',
    targetColumn: 'Grupo',
    evidenceCodes: ['PRODUCT_GROUP_CATALOG_OVERLAP'],
  },
  {
    sourceSheet: 'Ventas',
    sourceColumn: 'ID Venta',
    targetSheet: 'Ventas',
    targetColumn: 'ID Venta',
    evidenceCodes: ['SALE_LINE_GROUPING_CANDIDATE', 'REQUIRES_HUMAN_DECISION'],
  },
  {
    sourceSheet: 'Inventario',
    sourceColumn: 'ubicacion del producto',
    targetSheet: 'TARGET_MODEL',
    targetColumn: 'Warehouse',
    evidenceCodes: [
      'CONCEPTUAL_TARGET_ONLY',
      'WAREHOUSE_MAPPING_CANDIDATE',
      'REQUIRES_HUMAN_DECISION',
    ],
  },
];

export const SGI_TARGET_MAPPINGS: TargetMappingConfig[] = [
  [
    'User',
    'NOT_APPLICABLE',
    [],
    'LEGACY_USER_TEXT_NOT_FOREIGN_KEY',
    'PHASE_3C_OBSERVATION',
    false,
  ],
  [
    'Warehouse',
    'CANDIDATE',
    ['Inventario', 'Movimientos'],
    'LEGACY_LOCATION_CANDIDATE',
    'PHASE_3C_OBSERVATION',
    true,
  ],
  [
    'Unit',
    'CANDIDATE',
    ['Productos', 'Unidades'],
    'UNIT_CATALOG_CANDIDATE',
    'PHASE_3C_OBSERVATION',
    true,
  ],
  [
    'Product',
    'CONFIRMED',
    ['Productos'],
    'PRODUCT_MAPPING_APPROVED',
    'PHASE_3C_OBSERVATION',
    false,
  ],
  [
    'InventoryBalance',
    'CONFIRMED',
    ['Inventario'],
    'INVENTORY_IS_INITIAL_BALANCE_SOURCE',
    'PHASE_3C_OBSERVATION',
    false,
  ],
  [
    'ProductWarehouseValuation',
    'CONFIRMED',
    ['Inventario'],
    'INVENTORY_VALUATION_SOURCE',
    'PHASE_3C_OBSERVATION',
    false,
  ],
  [
    'InventoryMovement',
    'CANDIDATE',
    ['Movimientos'],
    'MOVEMENT_MAPPING_NEEDS_RECONCILIATION',
    'PHASE_3C_OBSERVATION',
    true,
  ],
  [
    'Sale',
    'CANDIDATE',
    ['Ventas'],
    'SALE_GROUPING_UNRESOLVED',
    'PHASE_3C_OBSERVATION',
    true,
  ],
  [
    'SaleItem',
    'CANDIDATE',
    ['Ventas'],
    'SALE_LINE_MAPPING_CANDIDATE',
    'PHASE_3C_OBSERVATION',
    true,
  ],
  [
    'SaleCancellation',
    'UNRESOLVED',
    ['Ventas'],
    'SALE_CANCELLATION_MAPPING_UNRESOLVED',
    'PHASE_3C_OBSERVATION',
    true,
  ],
  [
    'InTransitConfirmation',
    'UNRESOLVED',
    ['Ventas', 'Movimientos'],
    'IN_TRANSIT_CONFIRMATION_MAPPING_UNRESOLVED',
    'PHASE_3C_OBSERVATION',
    true,
  ],
  [
    'LegacySource',
    'CONFIRMED',
    [],
    'PHASE_4_PROVENANCE_MODEL',
    'PHASE_4',
    false,
  ],
  ['ImportBatch', 'CONFIRMED', [], 'PHASE_4_IMPORT_MODEL', 'PHASE_4', false],
  [
    'LegacyRecord',
    'CONFIRMED',
    [],
    'PHASE_4_RAW_RECORD_MODEL',
    'PHASE_4',
    false,
  ],
  [
    'ReconciliationIssue',
    'CONFIRMED',
    [],
    'PHASE_4_RECONCILIATION_MODEL',
    'PHASE_4',
    false,
  ],
].map(
  ([
    targetModel,
    status,
    sourceSheets,
    rationaleCode,
    phase,
    requiresHumanDecision,
  ]) => ({
    targetModel: targetModel as string,
    status: status as MappingStatus,
    sourceSheets: sourceSheets as string[],
    rationaleCode: rationaleCode as string,
    phase: phase as 'PHASE_3C_OBSERVATION' | 'PHASE_4',
    requiresHumanDecision: requiresHumanDecision as boolean,
  }),
);

export function getSheetConfig(name: string): SheetProfileConfig | undefined {
  return SGI_SHEET_CONFIGS.find((sheet) => sheet.name === name);
}

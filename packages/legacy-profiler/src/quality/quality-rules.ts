import { createHash } from 'node:crypto';

import {
  getSheetConfig,
  type SheetProfileConfig,
} from '../config/sgi-legacy-inventory-profile.js';
import { canonicalFingerprint } from '../domain/canonical-json.js';
import {
  PROFILE_SCHEMA_VERSION,
  type Finding,
  type FindingSeverity,
  type NeutralCell,
  type NeutralSheet,
  type NeutralWorkbook,
  type WorkbookProfile,
} from '../domain/profile-types.js';
import { normalizeHeaderCandidate } from '../profiling/column-profiler.js';

interface FindingInput {
  ruleCode: string;
  severity: FindingSeverity;
  sheet: string | null;
  sheetIndex: number;
  location: string;
  blocksProfiling?: boolean;
  blocksPhase4?: boolean;
  requiresHumanDecision?: boolean;
  evidence: Finding['evidence'];
}

function findingId(sourceSha256: string, finding: FindingInput): string {
  const seed = [
    PROFILE_SCHEMA_VERSION,
    sourceSha256,
    finding.sheetIndex,
    finding.ruleCode,
    finding.location,
    canonicalFingerprint(finding.evidence),
  ].join('\u0000');
  return createHash('sha256').update(seed, 'utf8').digest('hex');
}

export function createFinding(
  sourceSha256: string,
  input: FindingInput,
): Finding {
  return {
    findingId: findingId(sourceSha256, input),
    ruleCode: input.ruleCode,
    severity: input.severity,
    sheet: input.sheet,
    location: input.location,
    blocksProfiling: input.blocksProfiling ?? false,
    blocksPhase4: input.blocksPhase4 ?? false,
    requiresHumanDecision: input.requiresHumanDecision ?? false,
    evidence: input.evidence,
  };
}

function cellKey(cell: NeutralCell | undefined): string {
  if (cell === undefined || cell.value === null || cell.value === undefined)
    return 'null';
  if (cell.value instanceof Date) return `date:${cell.value.toISOString()}`;
  return `${cell.physicalType}:${String(cell.value)}`;
}

function rowMaps(sheet: NeutralSheet): Map<number, Map<number, NeutralCell>> {
  const rows = new Map<number, Map<number, NeutralCell>>();
  for (const cell of sheet.cells) {
    const row = rows.get(cell.row) ?? new Map<number, NeutralCell>();
    row.set(cell.column, cell);
    rows.set(cell.row, row);
  }
  return rows;
}

function headerColumns(
  sheet: NeutralSheet,
  config: SheetProfileConfig,
): Map<string, number> {
  const columns = new Map<string, number>();
  for (const cell of sheet.cells.filter(
    (item) => item.row === config.headerRow,
  )) {
    if (cell.value !== null && cell.value !== undefined) {
      columns.set(normalizeHeaderCandidate(String(cell.value)), cell.column);
    }
  }
  return columns;
}

function duplicateRowFindings(
  workbook: NeutralWorkbook,
  sheet: NeutralSheet,
  config: SheetProfileConfig,
): Finding[] {
  const rows = rowMaps(sheet);
  const signatures = new Map<string, number[]>();
  const maxColumn = Math.max(
    config.expectedHeaders.length,
    ...sheet.cells.map((cell) => cell.column),
  );
  for (const [rowNumber, row] of rows) {
    if (rowNumber <= config.headerRow) continue;
    const values = Array.from({ length: maxColumn }, (_, index) =>
      cellKey(row.get(index + 1)),
    );
    if (values.every((value) => value === 'null')) continue;
    const signature = canonicalFingerprint(values);
    const positions = signatures.get(signature) ?? [];
    positions.push(rowNumber);
    signatures.set(signature, positions);
  }
  return [...signatures.values()]
    .filter((positions) => positions.length > 1)
    .map((positions) =>
      createFinding(workbook.sourceSha256, {
        ruleCode: 'EXACT_DUPLICATE_ROW',
        severity: 'WARNING',
        sheet: sheet.name,
        sheetIndex: sheet.index,
        location: `rows:${positions.join(',')}`,
        blocksPhase4: true,
        requiresHumanDecision: true,
        evidence: {
          duplicateRowCount: positions.length,
          rowNumbers: positions.map(String),
          decision: 'REQUIRES_HUMAN_DECISION',
        },
      }),
    );
}

function candidateKeyFindings(
  workbook: NeutralWorkbook,
  sheet: NeutralSheet,
  config: SheetProfileConfig,
): Finding[] {
  const findings: Finding[] = [];
  const rows = rowMaps(sheet);
  const columns = headerColumns(sheet, config);
  for (const keyHeaders of config.candidateKeys) {
    const keyColumns = keyHeaders.map((header) =>
      columns.get(normalizeHeaderCandidate(header)),
    );
    if (keyColumns.some((column) => column === undefined)) continue;
    const signatures = new Map<string, number[]>();
    const emptyRows: number[] = [];
    for (const [rowNumber, row] of rows) {
      if (rowNumber <= config.headerRow) continue;
      const hasAnyData = [...row.values()].some(
        (cell) =>
          cell.value !== null &&
          cell.value !== undefined &&
          String(cell.value).length > 0,
      );
      if (!hasAnyData) continue;
      const values = keyColumns.map((column) =>
        cellKey(row.get(column as number)),
      );
      if (values.some((value) => value === 'null' || value === 'string:')) {
        emptyRows.push(rowNumber);
        continue;
      }
      const signature = canonicalFingerprint(values);
      const positions = signatures.get(signature) ?? [];
      positions.push(rowNumber);
      signatures.set(signature, positions);
    }
    if (emptyRows.length > 0) {
      findings.push(
        createFinding(workbook.sourceSha256, {
          ruleCode: 'EMPTY_IDENTIFIER',
          severity: 'ERROR',
          sheet: sheet.name,
          sheetIndex: sheet.index,
          location: `key:${keyHeaders.join('+')}`,
          blocksPhase4: true,
          evidence: {
            count: emptyRows.length,
            rowNumbers: emptyRows.map(String),
          },
        }),
      );
    }
    const duplicates = [...signatures.values()].filter(
      (positions) => positions.length > 1,
    );
    if (duplicates.length > 0) {
      const legacyControl =
        sheet.name === 'Productos'
          ? 'DGGR-X'
          : sheet.name === 'Inventario'
            ? 'CCWH-L'
            : null;
      findings.push(
        createFinding(workbook.sourceSha256, {
          ruleCode:
            legacyControl === null
              ? 'DUPLICATE_IDENTIFIER'
              : `LEGACY_${legacyControl.replace('-', '_')}_DUPLICATE`,
          severity: 'ERROR',
          sheet: sheet.name,
          sheetIndex: sheet.index,
          location: `key:${keyHeaders.join('+')}`,
          blocksPhase4: true,
          requiresHumanDecision: true,
          evidence: {
            duplicateGroupCount: duplicates.length,
            affectedRowCount: duplicates.reduce(
              (sum, positions) => sum + positions.length,
              0,
            ),
            rowGroups: duplicates.map((positions) => positions.join(',')),
            control: legacyControl,
            decision: 'REQUIRES_HUMAN_DECISION',
          },
        }),
      );
    }
  }
  return findings;
}

function profileMetricFindings(
  workbook: NeutralWorkbook,
  profile: WorkbookProfile,
): Finding[] {
  const findings: Finding[] = [];
  for (const sheet of profile.sheets) {
    const rawSheet = workbook.sheets[sheet.index];
    if (rawSheet === undefined) continue;
    if (sheet.dataRows === 0) {
      findings.push(
        createFinding(workbook.sourceSha256, {
          ruleCode: 'EMPTY_REQUIRED_SHEET',
          severity: 'BLOCKER',
          sheet: sheet.name,
          sheetIndex: sheet.index,
          location: 'sheet',
          blocksProfiling: true,
          blocksPhase4: true,
          evidence: { dataRows: 0 },
        }),
      );
    }
    if (rawSheet.ooxml.dimensionMissing) {
      findings.push(
        createFinding(workbook.sourceSha256, {
          ruleCode: 'DIMENSION_MISSING',
          severity: 'INFO',
          sheet: sheet.name,
          sheetIndex: sheet.index,
          location: 'worksheet-dimension',
          evidence: { fallback: 'SHEETJS_PUBLIC_RANGE_AND_CELL_SCAN' },
        }),
      );
    }
    if (
      sheet.physicalRows >
      Math.max(sheet.dataRows + 1, (sheet.dataRows + 1) * 2)
    ) {
      findings.push(
        createFinding(workbook.sourceSha256, {
          ruleCode: 'INFLATED_PHYSICAL_RANGE',
          severity: 'WARNING',
          sheet: sheet.name,
          sheetIndex: sheet.index,
          location: 'physicalRange',
          evidence: {
            physicalRows: sheet.physicalRows,
            logicalRows: sheet.dataRows + 1,
          },
        }),
      );
    }
    if (sheet.emptyHeaderCount > 0) {
      findings.push(
        createFinding(workbook.sourceSha256, {
          ruleCode: 'EMPTY_HEADER',
          severity: 'ERROR',
          sheet: sheet.name,
          sheetIndex: sheet.index,
          location: `header:${sheet.headerRow}`,
          blocksPhase4: true,
          evidence: { count: sheet.emptyHeaderCount },
        }),
      );
    }
    if (sheet.duplicateHeaders.length > 0) {
      findings.push(
        createFinding(workbook.sourceSha256, {
          ruleCode: 'DUPLICATE_HEADER',
          severity: 'ERROR',
          sheet: sheet.name,
          sheetIndex: sheet.index,
          location: `header:${sheet.headerRow}`,
          blocksPhase4: true,
          evidence: { count: sheet.duplicateHeaders.length },
        }),
      );
    }
    const missingCache = sheet.formulaCellCount - sheet.cachedFormulaValueCount;
    if (missingCache > 0) {
      findings.push(
        createFinding(workbook.sourceSha256, {
          ruleCode: 'FORMULA_MISSING_CACHED_VALUE',
          severity: 'WARNING',
          sheet: sheet.name,
          sheetIndex: sheet.index,
          location: 'formulas',
          blocksPhase4: true,
          evidence: { count: missingCache },
        }),
      );
    }
    for (const column of sheet.columns) {
      const location = `column:${column.columnLetter}`;
      const rules: Array<[string, number, FindingSeverity]> = [
        ['LEADING_WHITESPACE', column.leadingWhitespaceCount, 'WARNING'],
        ['TRAILING_WHITESPACE', column.trailingWhitespaceCount, 'WARNING'],
        ['CASING_VARIANTS', column.casingVariantCount, 'INFO'],
        ['NON_NFC_TEXT', column.nonNfcCount, 'WARNING'],
        ['SUSPICIOUS_UNICODE', column.suspiciousUnicodeCount, 'ERROR'],
        ['NUMERIC_STORED_AS_TEXT', column.numericStoredAsTextCount, 'WARNING'],
        [
          'APPARENT_TEXT_STORED_AS_NUMBER',
          column.textStoredAsNumberCandidateCount,
          'WARNING',
        ],
        ['EXCEL_ERROR', column.excelErrorCount, 'ERROR'],
      ];
      for (const [ruleCode, count, severity] of rules) {
        if (count > 0)
          findings.push(
            createFinding(workbook.sourceSha256, {
              ruleCode,
              severity,
              sheet: sheet.name,
              sheetIndex: sheet.index,
              location,
              blocksPhase4: severity !== 'INFO',
              evidence: { count },
            }),
          );
      }
      if (column.mixedType)
        findings.push(
          createFinding(workbook.sourceSha256, {
            ruleCode: 'HETEROGENEOUS_COLUMN_TYPES',
            severity: 'WARNING',
            sheet: sheet.name,
            sheetIndex: sheet.index,
            location,
            blocksPhase4: true,
            evidence: {
              apparentTypeCount: Object.keys(column.apparentTypes).length,
            },
          }),
        );
    }
  }
  return findings;
}

function invalidDateFindings(
  workbook: NeutralWorkbook,
  sheet: NeutralSheet,
  config: SheetProfileConfig,
): Finding[] {
  const columns = headerColumns(sheet, config);
  const dateColumns = [...columns.entries()].filter(([header]) =>
    /fecha|timestamp|hora/u.test(header),
  );
  const findings: Finding[] = [];
  for (const [header, column] of dateColumns) {
    const invalid = sheet.cells.filter(
      (cell) =>
        cell.column === column &&
        cell.row > config.headerRow &&
        cell.value !== null &&
        cell.value !== undefined &&
        !(cell.value instanceof Date) &&
        typeof cell.value === 'string' &&
        Number.isNaN(Date.parse(cell.value)),
    ).length;
    if (invalid > 0)
      findings.push(
        createFinding(workbook.sourceSha256, {
          ruleCode: 'INVALID_DATE',
          severity: 'ERROR',
          sheet: sheet.name,
          sheetIndex: sheet.index,
          location: `column:${header}`,
          blocksPhase4: true,
          evidence: { count: invalid },
        }),
      );
  }
  return findings;
}

function brokenReferenceFindings(
  workbook: NeutralWorkbook,
  sheet: NeutralSheet,
): Finding[] {
  const count = sheet.cells.filter(
    (cell) =>
      cell.physicalType === 'error' ||
      (cell.formula?.includes('#REF!') ?? false),
  ).length;
  return count === 0
    ? []
    : [
        createFinding(workbook.sourceSha256, {
          ruleCode: 'BROKEN_REFERENCE',
          severity: 'ERROR',
          sheet: sheet.name,
          sheetIndex: sheet.index,
          location: 'worksheet',
          blocksPhase4: true,
          evidence: { count },
        }),
      ];
}

function requiredCellFindings(
  workbook: NeutralWorkbook,
  sheet: NeutralSheet,
  config: SheetProfileConfig,
): Finding[] {
  const columns = headerColumns(sheet, config);
  const requiredColumns = config.requiredHeaders
    .map((header) => columns.get(normalizeHeaderCandidate(header)))
    .filter((column): column is number => column !== undefined);
  if (requiredColumns.length === 0) return [];
  const rows = rowMaps(sheet);
  let inconsistent = 0;
  for (const [rowNumber, row] of rows) {
    if (rowNumber <= config.headerRow) continue;
    const hasAnyData = [...row.values()].some(
      (cell) =>
        cell.value !== null &&
        cell.value !== undefined &&
        String(cell.value).length > 0,
    );
    if (!hasAnyData) continue;
    if (requiredColumns.some((column) => cellKey(row.get(column)) === 'null')) {
      inconsistent += 1;
    }
  }
  return inconsistent === 0
    ? []
    : [
        createFinding(workbook.sourceSha256, {
          ruleCode: 'STRUCTURALLY_INCONSISTENT_ROWS',
          severity: 'ERROR',
          sheet: sheet.name,
          sheetIndex: sheet.index,
          location: 'required-columns',
          blocksPhase4: true,
          evidence: { count: inconsistent },
        }),
      ];
}

function valueColumn(
  sheet: NeutralSheet,
  config: SheetProfileConfig,
  header: string,
): NeutralCell[] {
  const column = headerColumns(sheet, config).get(
    normalizeHeaderCandidate(header),
  );
  if (column === undefined) return [];
  return sheet.cells.filter(
    (cell) => cell.column === column && cell.row > config.headerRow,
  );
}

function ambiguousDateFindings(
  workbook: NeutralWorkbook,
  sheet: NeutralSheet,
  config: SheetProfileConfig,
): Finding[] {
  const dateHeaders = [...headerColumns(sheet, config).keys()].filter(
    (header) => /fecha|timestamp/u.test(header),
  );
  let count = 0;
  for (const header of dateHeaders) {
    for (const cell of valueColumn(sheet, config, header)) {
      if (typeof cell.value !== 'string') continue;
      const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/u.exec(cell.value);
      if (match !== null && Number(match[1]) <= 12 && Number(match[2]) <= 12) {
        count += 1;
      }
    }
  }
  return count === 0
    ? []
    : [
        createFinding(workbook.sourceSha256, {
          ruleCode: 'AMBIGUOUS_DATE',
          severity: 'WARNING',
          sheet: sheet.name,
          sheetIndex: sheet.index,
          location: 'date-columns',
          blocksPhase4: true,
          requiresHumanDecision: true,
          evidence: { count, decision: 'REQUIRES_HUMAN_DECISION' },
        }),
      ];
}

function legacySaleReconciliationFindings(
  workbook: NeutralWorkbook,
): Finding[] {
  const sales = workbook.sheets.find((sheet) => sheet.name === 'Ventas');
  const movements = workbook.sheets.find(
    (sheet) => sheet.name === 'Movimientos',
  );
  const salesConfig =
    sales === undefined ? undefined : getSheetConfig(sales.name);
  const movementConfig =
    movements === undefined ? undefined : getSheetConfig(movements.name);
  if (
    sales === undefined ||
    movements === undefined ||
    salesConfig === undefined ||
    movementConfig === undefined
  )
    return [];
  const saleIds = new Set(
    valueColumn(sales, salesConfig, 'ID Venta')
      .map((cell) => String(cell.value ?? '').trim())
      .filter(Boolean),
  );
  const observations = valueColumn(movements, movementConfig, 'Observaciones')
    .map((cell) => String(cell.value ?? ''))
    .filter(Boolean);
  const salesWithoutMovement = [...saleIds].filter(
    (id) => !observations.some((observation) => observation.includes(id)),
  ).length;
  const movementWithoutSale = observations.filter(
    (observation) =>
      /^venta\s+\S+\s+-/iu.test(observation) &&
      ![...saleIds].some((id) => observation.includes(id)),
  ).length;
  const findings: Finding[] = [];
  if (salesWithoutMovement > 0)
    findings.push(
      createFinding(workbook.sourceSha256, {
        ruleCode: 'LEGACY_SALES_WITHOUT_MOVEMENT',
        severity: 'ERROR',
        sheet: 'Ventas',
        sheetIndex: sales.index,
        location: 'sale-movement-reconciliation',
        blocksPhase4: true,
        requiresHumanDecision: true,
        evidence: {
          count: salesWithoutMovement,
          decision: 'REQUIRES_HUMAN_DECISION',
        },
      }),
    );
  if (movementWithoutSale > 0)
    findings.push(
      createFinding(workbook.sourceSha256, {
        ruleCode: 'LEGACY_MOVEMENT_WITHOUT_SALE',
        severity: 'ERROR',
        sheet: 'Movimientos',
        sheetIndex: movements.index,
        location: 'sale-movement-reconciliation',
        blocksPhase4: true,
        requiresHumanDecision: true,
        evidence: {
          count: movementWithoutSale,
          decision: 'REQUIRES_HUMAN_DECISION',
        },
      }),
    );
  return findings;
}

function legacyInventoryReconciliationFinding(
  workbook: NeutralWorkbook,
): Finding[] {
  const inventory = workbook.sheets.find(
    (sheet) => sheet.name === 'Inventario',
  );
  const movements = workbook.sheets.find(
    (sheet) => sheet.name === 'Movimientos',
  );
  const inventoryConfig =
    inventory === undefined ? undefined : getSheetConfig(inventory.name);
  const movementConfig =
    movements === undefined ? undefined : getSheetConfig(movements.name);
  if (
    inventory === undefined ||
    movements === undefined ||
    inventoryConfig === undefined ||
    movementConfig === undefined
  )
    return [];
  const inventoryColumns = headerColumns(inventory, inventoryConfig);
  const movementColumns = headerColumns(movements, movementConfig);
  const inventoryCode = inventoryColumns.get(
    normalizeHeaderCandidate('codigo unico del producto'),
  );
  const inventoryLocation = inventoryColumns.get(
    normalizeHeaderCandidate('ubicacion del producto'),
  );
  const inventoryQuantity = inventoryColumns.get(
    normalizeHeaderCandidate('cantidad de entrada del producto'),
  );
  const movementCode = movementColumns.get(normalizeHeaderCandidate('Código'));
  const movementLocation = movementColumns.get(
    normalizeHeaderCandidate('Ubicación'),
  );
  const movementBalance = movementColumns.get(
    normalizeHeaderCandidate('Stock Resultante'),
  );
  if (
    [
      inventoryCode,
      inventoryLocation,
      inventoryQuantity,
      movementCode,
      movementLocation,
      movementBalance,
    ].some((column) => column === undefined)
  )
    return [];
  const inventoryBalances = new Map<string, number>();
  for (const row of rowMaps(inventory).values()) {
    const code = row.get(inventoryCode as number)?.value;
    const location = row.get(inventoryLocation as number)?.value;
    const quantity = row.get(inventoryQuantity as number)?.value;
    if (
      code !== undefined &&
      location !== undefined &&
      typeof quantity === 'number'
    ) {
      inventoryBalances.set(
        `${String(code)}\u0000${String(location)}`,
        quantity,
      );
    }
  }
  const movementBalances = new Map<string, number>();
  for (const row of [...rowMaps(movements).entries()]
    .sort(([left], [right]) => left - right)
    .map(([, value]) => value)) {
    const code = row.get(movementCode as number)?.value;
    const location = row.get(movementLocation as number)?.value;
    const balance = row.get(movementBalance as number)?.value;
    if (
      code !== undefined &&
      location !== undefined &&
      typeof balance === 'number' &&
      !/[→>-]/u.test(String(location))
    ) {
      movementBalances.set(`${String(code)}\u0000${String(location)}`, balance);
    }
  }
  let differing = 0;
  let inventoryOnly = 0;
  for (const [key, balance] of inventoryBalances) {
    const movementBalanceValue = movementBalances.get(key);
    if (movementBalanceValue === undefined) inventoryOnly += 1;
    else if (movementBalanceValue !== balance) differing += 1;
  }
  const movementOnly = [...movementBalances.keys()].filter(
    (key) => !inventoryBalances.has(key),
  ).length;
  return [
    createFinding(workbook.sourceSha256, {
      ruleCode: 'LEGACY_INVENTORY_MOVEMENT_DIFFERENCE',
      severity: 'ERROR',
      sheet: 'Inventario',
      sheetIndex: inventory.index,
      location: 'inventory-movement-reconciliation',
      blocksPhase4: true,
      requiresHumanDecision: true,
      evidence: {
        differingComparableKeys: differing,
        inventoryOnlyKeys: inventoryOnly,
        movementOnlyKeys: movementOnly,
        decision: 'REQUIRES_HUMAN_DECISION',
      },
    }),
  ];
}

function salesItemPatternFinding(workbook: NeutralWorkbook): Finding[] {
  const sales = workbook.sheets.find((sheet) => sheet.name === 'Ventas');
  const config = sales === undefined ? undefined : getSheetConfig(sales.name);
  if (sales === undefined || config === undefined) return [];
  let invalid = 0;
  for (const cell of valueColumn(sales, config, 'Items Vendidos')) {
    if (typeof cell.value !== 'string') continue;
    const tokens = cell.value
      .split(/[,;]+/u)
      .map((token) => token.trim())
      .filter(Boolean);
    invalid += tokens.filter(
      (token) => !/^.+:\s*[+-]?\d+(?:[.,]\d+)?$/u.test(token),
    ).length;
  }
  return invalid === 0
    ? []
    : [
        createFinding(workbook.sourceSha256, {
          ruleCode: 'UNEXPECTED_PATTERN',
          severity: 'ERROR',
          sheet: 'Ventas',
          sheetIndex: sales.index,
          location: 'column:items_vendidos',
          blocksPhase4: true,
          requiresHumanDecision: true,
          evidence: {
            count: invalid,
            patternCode: 'SALE_ITEM_CODE_QUANTITY',
            decision: 'REQUIRES_HUMAN_DECISION',
          },
        }),
      ];
}

function pendingBusinessDecisionFindings(workbook: NeutralWorkbook): Finding[] {
  const decisions = [
    ['DEC_004_TO_DEC_009_PENDING', 'legacy-reconciliation'],
    ['DEC_015_PENDING_ASPECTS', 'valuation'],
    ['DEC_025_PENDING_ASPECTS', 'daily-closings'],
    ['SALE_GROUPING_UNRESOLVED', 'Ventas'],
    ['SALE_CANCELLATION_MAPPING_UNRESOLVED', 'Ventas'],
    ['IN_TRANSIT_CONFIRMATION_MAPPING_UNRESOLVED', 'Ventas'],
  ] as const;
  return decisions.map(([ruleCode, scope]) =>
    createFinding(workbook.sourceSha256, {
      ruleCode,
      severity: 'WARNING',
      sheet: scope === 'Ventas' ? 'Ventas' : null,
      sheetIndex:
        scope === 'Ventas'
          ? (workbook.sheets.find((sheet) => sheet.name === 'Ventas')?.index ??
            -1)
          : -1,
      location: `decision:${scope}`,
      blocksPhase4: true,
      requiresHumanDecision: true,
      evidence: { decision: 'REQUIRES_HUMAN_DECISION', scope },
    }),
  );
}

export function evaluateQualityRules(
  workbook: NeutralWorkbook,
  profile: WorkbookProfile,
): Finding[] {
  const findings = profileMetricFindings(workbook, profile);
  for (const sheet of workbook.sheets) {
    const config = getSheetConfig(sheet.name);
    if (config === undefined) continue;
    findings.push(...duplicateRowFindings(workbook, sheet, config));
    findings.push(...candidateKeyFindings(workbook, sheet, config));
    findings.push(...invalidDateFindings(workbook, sheet, config));
    findings.push(...ambiguousDateFindings(workbook, sheet, config));
    findings.push(...brokenReferenceFindings(workbook, sheet));
    findings.push(...requiredCellFindings(workbook, sheet, config));
  }
  findings.push(...legacySaleReconciliationFindings(workbook));
  findings.push(...legacyInventoryReconciliationFinding(workbook));
  findings.push(...salesItemPatternFinding(workbook));
  findings.push(...pendingBusinessDecisionFindings(workbook));
  if (findings.length > workbook.securityLimits.maxFindings) {
    return [
      createFinding(workbook.sourceSha256, {
        ruleCode: 'FINDING_LIMIT_EXCEEDED',
        severity: 'BLOCKER',
        sheet: null,
        sheetIndex: -1,
        location: 'workbook',
        blocksProfiling: true,
        blocksPhase4: true,
        evidence: {
          limit: workbook.securityLimits.maxFindings,
          observed: findings.length,
        },
      }),
    ];
  }
  return findings.sort((left, right) =>
    [left.sheet ?? '', left.location, left.ruleCode, left.findingId]
      .join('\u0000')
      .localeCompare(
        [
          right.sheet ?? '',
          right.location,
          right.ruleCode,
          right.findingId,
        ].join('\u0000'),
        'en',
      ),
  );
}

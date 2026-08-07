import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as SheetJsEsm from 'xlsx';

import {
  createSmokeWorkbookBytes,
  createStoredZip,
} from './ooxml-smoke-fixture.mjs';
import {
  ARCHIVE_LIMITS,
  getBookFileText,
  inspectWorksheetBookPart,
  inspectWorksheetXml,
  validateArchiveEntryPolicy,
  validateBookFiles,
  validateOoxmlArchive,
  validateXmlPart,
} from './ooxml-limited-inspector.mjs';

const require = createRequire(import.meta.url);
const SheetJsCjs = require('xlsx');
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(currentDirectory, '../../..');
const legacyWorkbookPath = path.join(
  repositoryRoot,
  'legacy',
  'private',
  'datos-inventario.xlsx',
);
const expectedLegacyHash =
  'd0bb929d9498db888295d2c556a51e1a90f3d5834e9c4d544d9b1bb65d46e550';
const expectedLegacySheets = [
  'Productos',
  'Finanzas',
  'CierresDiarios',
  'Movimientos',
  'Entrada de Productos',
  'Inventario',
  'Ventas',
  'Unidades',
  'Grupos',
];
const expectedLegacyRanges = {
  Productos: 'A1:G146',
  Finanzas: 'A1:G7',
  CierresDiarios: 'A1:L5',
  Movimientos: 'A1:I1070',
  'Entrada de Productos': 'A14:G66',
  Inventario: 'A1:H360',
  Ventas: 'A1:Q405',
  Unidades: 'A1:A15',
  Grupos: 'A1:A12',
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readWorkbook(library, bytes) {
  return library.read(bytes, {
    type: 'buffer',
    bookFiles: true,
    cellDates: true,
    cellFormula: true,
    cellNF: true,
    cellStyles: true,
    sheetStubs: true,
    WTF: true,
  });
}

function assertSyntheticPublicApi(workbook, expectedDate1904) {
  assert.deepEqual(workbook.SheetNames, ['Smoke Data', 'Second']);
  const worksheet = workbook.Sheets['Smoke Data'];
  assert.equal(worksheet.A1.t, 's');
  assert.equal(worksheet.B1.t, 'n');
  assert.equal(worksheet.C1.t, 'b');
  assert.equal(worksheet.D1.t, 'e');
  assert.equal(worksheet.E1.t, 'd');
  assert.equal(worksheet.E1.z, 'yyyy-mm-dd');
  assert.ok('s' in worksheet.E1);
  assert.equal(worksheet.F1.f, 'SUM(B1,1)');
  assert.equal(worksheet.F1.v, 43);
  assert.equal(worksheet.G1.f, 'B1*2');
  assert.equal(worksheet.G1.v, 84);
  assert.equal(worksheet.G2.f, 'B2*2');
  assert.equal(worksheet.G2.v, 86);
  assert.equal(worksheet.J1.f, 'NOW()');
  assert.equal(worksheet.J1.v, undefined);
  assert.equal(worksheet['!ref'], 'A1:J5');
  assert.deepEqual(worksheet['!merges'], [
    { s: { c: 7, r: 0 }, e: { c: 8, r: 0 } },
  ]);
  assert.equal(worksheet['!autofilter'].ref, 'A1:J5');
  assert.equal(Boolean(workbook.Workbook?.WBProps?.date1904), expectedDate1904);
  assert.ok(workbook.files !== undefined);
}

function assertSyntheticInspector(workbook) {
  const inspection = inspectWorksheetBookPart(workbook, 'Smoke Data');
  assert.equal(inspection.dimension, 'A1:J5');
  const sharedMaster = inspection.formulas.find(
    (formula) => formula.cell === 'G1',
  );
  assert.deepEqual(sharedMaster?.attributes, {
    t: 'shared',
    ref: 'G1:G2',
    si: '0',
  });
  assert.equal(sharedMaster?.hasCachedValue, true);
  const sharedFollower = inspection.formulas.find(
    (formula) => formula.cell === 'G2',
  );
  assert.deepEqual(sharedFollower?.attributes, { t: 'shared', si: '0' });
  assert.equal(sharedFollower?.hasCachedValue, true);
  assert.equal(
    inspection.formulas.find((formula) => formula.cell === 'J1')
      ?.hasCachedValue,
    false,
  );
  assert.equal(inspection.tables.length, 1);
  assert.deepEqual(inspection.tables[0], {
    part: 'xl/tables/table1.xml',
    name: 'SmokeTable',
    displayName: 'SmokeTable',
    ref: 'A3:B5',
    autoFilterRef: 'A3:B5',
    columnCount: 2,
  });
  return inspection;
}

function assertSecurityLimits() {
  assert.throws(
    () => inspectWorksheetXml('<!DOCTYPE x [<!ENTITY y "z">]><worksheet/>'),
    /EXTERNAL_DECLARATION/u,
  );
  assert.throws(
    () => validateXmlPart(`<?xml version="1.0"?><!ENTITY unsafe "x"><x/>`),
    /EXTERNAL_DECLARATION/u,
  );
  assert.throws(
    () => validateXmlPart('x'.repeat(ARCHIVE_LIMITS.maximumXmlBytes + 1)),
    /XML_TOO_LARGE/u,
  );
  assert.throws(
    () => validateOoxmlArchive(createStoredZip([['../escape.xml', '<x/>']])),
    /UNSAFE_PART_PATH/u,
  );
  assert.throws(
    () => validateOoxmlArchive(createStoredZip([['unexpected.xml', '<x/>']])),
    /UNEXPECTED_PART_PATH/u,
  );
  assert.throws(
    () =>
      validateArchiveEntryPolicy(
        Array.from(
          { length: ARCHIVE_LIMITS.maximumEntries + 1 },
          (_, index) => ({
            name: `xl/worksheets/sheet${index}.xml`,
            flags: 0,
            method: 0,
            compressedSize: 0,
            uncompressedSize: 0,
          }),
        ),
      ),
    /TOO_MANY_PARTS/u,
  );
  assert.throws(
    () =>
      validateArchiveEntryPolicy([
        {
          name: 'xl/worksheets/sheet1.xml',
          flags: 0,
          method: 8,
          compressedSize: 1,
          uncompressedSize: ARCHIVE_LIMITS.maximumCompressionRatio + 1,
        },
      ]),
    /COMPRESSION_RATIO/u,
  );
  assert.throws(
    () =>
      validateArchiveEntryPolicy([
        {
          name: 'xl/worksheets/sheet1.xml',
          flags: 0,
          method: 0,
          compressedSize: ARCHIVE_LIMITS.maximumPartBytes + 1,
          uncompressedSize: ARCHIVE_LIMITS.maximumPartBytes + 1,
        },
      ]),
    /PART_TOO_LARGE/u,
  );
}

async function inspectLegacyWorkbook() {
  const bytesBefore = await readFile(legacyWorkbookPath);
  const hashBefore = sha256(bytesBefore);
  assert.equal(hashBefore, expectedLegacyHash);
  const archiveEntries = validateOoxmlArchive(bytesBefore);
  const workbook = readWorkbook(SheetJsEsm, bytesBefore);
  assert.deepEqual(workbook.SheetNames, expectedLegacySheets);
  const physicalRanges = {};
  for (const [sheetName, logicalRange] of Object.entries(
    expectedLegacyRanges,
  )) {
    const physicalRange = workbook.Sheets[sheetName]['!ref'];
    const physicalBounds = SheetJsEsm.utils.decode_range(physicalRange);
    const logicalBounds = SheetJsEsm.utils.decode_range(logicalRange);
    assert.ok(physicalBounds.s.r <= logicalBounds.s.r);
    assert.ok(physicalBounds.s.c <= logicalBounds.s.c);
    assert.ok(physicalBounds.e.r >= logicalBounds.e.r);
    assert.ok(physicalBounds.e.c >= logicalBounds.e.c);
    physicalRanges[sheetName] = physicalRange;
  }
  const bookFileCount = validateBookFiles(workbook);
  const inventoryInspection = inspectWorksheetBookPart(workbook, 'Inventario');
  const sharedFormulas = inventoryInspection.formulas.filter(
    (formula) => formula.attributes.t === 'shared',
  );
  assert.ok(sharedFormulas.length >= 1);
  assert.ok(sharedFormulas.some((formula) => formula.hasCachedValue));
  assert.ok(
    getBookFileText(workbook, inventoryInspection.sheetPart).length > 0,
  );

  const bytesAfter = await readFile(legacyWorkbookPath);
  const hashAfter = sha256(bytesAfter);
  assert.equal(hashAfter, expectedLegacyHash);
  assert.equal(hashAfter, hashBefore);

  return {
    archiveEntryCount: archiveEntries.length,
    bookFileCount,
    hashBefore,
    hashAfter,
    physicalRanges,
    sheetCount: workbook.SheetNames.length,
    sheetNames: workbook.SheetNames,
    sharedFormulaCount: sharedFormulas.length,
    sharedFormulaWithCachedValueCount: sharedFormulas.filter(
      (formula) => formula.hasCachedValue,
    ).length,
  };
}

const warnings = [];
const warningListener = (warning) => {
  warnings.push({
    code: warning.code,
    name: warning.name,
    message: warning.message,
  });
};
process.on('warning', warningListener);

const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), 'sgi-sheetjs-gate-'),
);
try {
  assert.equal(Number(process.versions.node.split('.')[0]), 24);
  assert.equal(SheetJsEsm.version, '0.20.3');
  assert.equal(SheetJsCjs.version, '0.20.3');

  const workbook1900Bytes = createSmokeWorkbookBytes({ date1904: false });
  const workbook1904Bytes = createSmokeWorkbookBytes({ date1904: true });
  const workbook1900Path = path.join(temporaryDirectory, 'synthetic-1900.xlsx');
  const workbook1904Path = path.join(temporaryDirectory, 'synthetic-1904.xlsx');
  await writeFile(workbook1900Path, workbook1900Bytes);
  await writeFile(workbook1904Path, workbook1904Bytes);

  validateOoxmlArchive(await readFile(workbook1900Path));
  validateOoxmlArchive(await readFile(workbook1904Path));
  const workbook1900 = readWorkbook(
    SheetJsEsm,
    await readFile(workbook1900Path),
  );
  const workbook1904 = readWorkbook(
    SheetJsCjs,
    await readFile(workbook1904Path),
  );
  assertSyntheticPublicApi(workbook1900, false);
  assertSyntheticPublicApi(workbook1904, true);
  const syntheticInspection = assertSyntheticInspector(workbook1900);
  assertSyntheticInspector(workbook1904);
  assertSecurityLimits();

  const legacy = await inspectLegacyWorkbook();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(warnings, []);

  console.log(
    JSON.stringify(
      {
        status: 'SHEETJS_GATE_SMOKE_PASSED',
        node: process.versions.node,
        esmVersion: SheetJsEsm.version,
        cjsVersion: SheetJsCjs.version,
        synthetic: {
          sheetCount: workbook1900.SheetNames.length,
          dimension: syntheticInspection.dimension,
          formulaCount: syntheticInspection.formulas.length,
          tableCount: syntheticInspection.tables.length,
          dateSystems: [1900, 1904],
        },
        inspectorLimits: ARCHIVE_LIMITS,
        legacy,
        warnings: warnings.length,
      },
      null,
      2,
    ),
  );
} finally {
  process.off('warning', warningListener);
  await rm(temporaryDirectory, { recursive: true, force: true });
}

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const bundle = buildSync({ stdin: { contents: `export * from './src/utils/warehouseAnalyzer'; export * from './src/utils/warehouseDates'; export * from './src/utils/googleSheets'; export * from './src/utils/logisticsReportMetrics'; export * from './src/utils/departmentSyncService';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false });
const compiled = new Module(path.resolve('__warehouse_tests.cjs'));
compiled.filename = path.resolve('__warehouse_tests.cjs');
compiled.paths = Module._nodeModulePaths(process.cwd());
compiled._compile(bundle.outputFiles[0].text, compiled.filename);
const api = compiled.exports;
const row = (extra = {}) => ({ 'เลขที่ใบจอง': 'BK256909/03360', 'วันที่เปิดบิลขาย': '2026-09-29 00:00:00', 'วันที่รับเอกสาร': '2026-09-29 00:00:00', 'วันที่จัดเสร็จ': '2026-09-29 00:00:00', 'สถานะ': 'Ship', ...extra });
const analyze = rows => api.analyzeWarehouseData(rows);

test('CSV import preserves real source column names and sales opening date', () => {
  const parsed = api.parseGoogleSheetCsvText('\uFEFFเลขที่ใบจอง,สถานะ,วันที่เปิดบิลขาย,วันที่รับเอกสาร,วันที่จัดเสร็จ\nBK256909/03360,Ship,2026-09-29 00:00:00,2026-09-29 00:00:00,2026-09-29 00:00:00', 'warehouse');
  const doc = analyze(parsed).warehouseDocs[0];
  assert.equal(doc.completedDate, '2026-09-29');
  assert.equal(doc.salesOrderDate, '2026-09-29');
  assert.equal(doc.receivedBookingDate, '2026-09-29');
  assert.equal(doc.status, 'completed');
  assert.equal(api.calculateWarehouseMetrics([doc]).leadTimeStats.mean, 0);
});
test('booking issue date is parsed separately from receipt date and retained across duplicate rows', () => {
  const doc = analyze([
    row({ 'วันที่ออกใบจอง': '', 'วันที่รับเอกสาร': '2026-09-29' }),
    row({ 'วันที่ออกใบจอง': '2026-09-28', 'วันที่รับเอกสาร': '2026-09-29' }),
  ]).warehouseDocs[0];
  assert.equal(doc.bookingDate, '2026-09-28');
  assert.equal(doc.receivedBookingDate, '2026-09-29');
});
test('sales opening date from the Google Sheet is normalized and retained across duplicate rows', () => {
  const docs = analyze([
    row({ 'วันที่เปิดบิลขาย': '' }),
    row({ 'วันที่เปิดบิลขาย': '15/08/2569' }),
  ]).warehouseDocs;
  assert.equal(docs.length, 1);
  assert.equal(docs[0].salesOrderDate, '2026-08-15');
});
test('completion evidence survives blank, unknown and pending status labels', () => {
  for (const status of ['', 'Ship', 'Release', 'Pack', 'รอส่งต่อ', 'จัดเสร็จแล้ว', 'verified', 'other']) {
    const doc = analyze([row({ 'สถานะ': status })]).warehouseDocs[0];
    assert.equal(doc.completedDate, '2026-09-29', status);
    assert.equal(doc.status, 'completed', status);
    assert.equal(doc.pendingDays, undefined);
  }
});
test('XLSX fallback produces the same completion result as CSV', () => {
  const XLSX = require('xlsx');
  const sheet = XLSX.utils.json_to_sheet([row()]);
  const doc = analyze(api.parseXlsxWorksheet(sheet, 'warehouse')).warehouseDocs[0];
  assert.equal(doc.completedDate, '2026-09-29');
  assert.equal(doc.leadTimeDays, 0);
});
test('no fabricated completion or receipt from status, handover or load dates', () => {
  for (const status of ['Ship', 'Release', 'completed']) {
    const doc = analyze([row({ 'สถานะ': status, 'วันที่รับเอกสาร': '', 'วันที่จัดเสร็จ': '', 'วันที่ส่งมอบ': '2026-09-29', 'วันที่โหลดสินค้าจริง': '2026-09-30' })]).warehouseDocs[0];
    assert.equal(doc.completedDate, undefined);
    assert.equal(doc.date, '');
    assert.equal(api.calculateWarehouseMetrics([doc]).leadTimeStats.count, 0);
  }
});
test('picking lead time starts at sales opening date, not warehouse receipt date', () => {
  const doc = analyze([row({ 'วันที่เปิดบิลขาย': '2026-09-25', 'วันที่รับเอกสาร': '2026-09-28', 'วันที่จัดเสร็จ': '2026-09-30' })]).warehouseDocs[0];
  assert.equal(doc.leadTimeDays, 5);
  assert.equal(api.getPickingLeadTimeDays(doc), 5);
  assert.equal(api.calculateWarehouseMetrics([doc]).leadTimeStats.mean, 5);
});
test('picking lead time falls back to booking issue date when sales opening date is missing', () => {
  const doc = analyze([row({ 'วันที่เปิดบิลขาย': '', 'วันที่ออกใบจอง': '2026-09-25', 'วันที่รับเอกสาร': '2026-09-28', 'วันที่จัดเสร็จ': '2026-09-30' })]).warehouseDocs[0];
  assert.equal(doc.bookingDate, '2026-09-25');
  assert.equal(doc.leadTimeDays, 5);
  assert.equal(api.getPickingLeadTimeDays(doc), 5);
});
test('picking lead time falls back to receipt date when other start dates are missing', () => {
  const doc = analyze([row({ 'วันที่เปิดบิลขาย': '', 'วันที่รับเอกสาร': '2026-09-28', 'วันที่จัดเสร็จ': '2026-09-30' })]).warehouseDocs[0];
  assert.equal(doc.salesOrderDate, undefined);
  assert.equal(doc.leadTimeDays, 2);
  assert.equal(api.getPickingLeadTimeDays(doc), 2);
});
test('picking lead time is omitted when the sales opening date is missing', () => {
  const doc = analyze([row({ 'วันที่เปิดบิลขาย': '', 'วันที่รับเอกสาร': '', 'วันที่จัดเสร็จ': '2026-09-30' })]).warehouseDocs[0];
  assert.equal(doc.leadTimeDays, undefined);
  assert.equal(api.calculateWarehouseMetrics([doc]).leadTimeStats.count, 0);
});
test('pending days use current date minus sales opening date, not warehouse receipt date', () => {
  const salesOrderDate = '2026-09-25';
  const doc = analyze([row({ 'วันที่เปิดบิลขาย': salesOrderDate, 'วันที่รับเอกสาร': '2026-09-30', 'วันที่จัดเสร็จ': '', 'สถานะ': 'รอจัดสินค้า' })]).warehouseDocs[0];
  assert.equal(doc.pendingDays, Math.max(0, api.warehouseDays(salesOrderDate, new Date())));
  assert.notEqual(doc.pendingDays, Math.max(0, api.warehouseDays('2026-09-30', new Date())));
});
test('warehouse summary counts unknown non-completed bills as pending', () => {
  const result = analyze([
    row({ 'เลขที่ใบจอง': 'BK-COMPLETED' }),
    row({ 'เลขที่ใบจอง': 'BK-UNKNOWN', 'วันที่จัดเสร็จ': '', 'สถานะ': 'ไม่ระบุ' }),
  ]);
  assert.equal(result.totalDocs, 2);
  assert.equal(result.completedDocs, 1);
  assert.equal(result.pendingDocsCount, 1);
  assert.equal(result.warehouseSummary.pendingDocsCount, result.totalDocs - result.completedDocs);
});
test('header whitespace, BE, ISO timestamps and serial dates are parsed', () => {
  const doc = analyze([{ 'เลขที่ใบจอง': 'A', ' วันที่เปิดบิลขาย ': '27/09/2569', ' วันที่รับเอกสาร ': '28/09/2569', 'วันที่จัด\nเสร็จ': '29/09/2569' }]).warehouseDocs[0];
  assert.equal(doc.salesOrderDate, '2026-09-27');
  assert.equal(doc.leadTimeDays, 2);
  const serial = (Date.UTC(2026, 8, 29) - Date.UTC(1899, 11, 30)) / 86400000;
  assert.equal(analyze([row({ 'วันที่จัดเสร็จ': serial })]).warehouseDocs[0].completedDate, '2026-09-29');
});
test('invalid and reversed dates do not enter picking lead-time average', () => {
  for (const date of ['31/02/2569', '-', '08:30', '2026-09-28']) {
    const doc = analyze([row({ 'วันที่จัดเสร็จ': date })]).warehouseDocs[0];
    assert.equal(doc.leadTimeDays, undefined);
    assert.equal(api.calculateWarehouseMetrics([doc]).leadTimeStats.count, 0);
  }
});
test('duplicate rows use earliest receipt and latest completion independent of order', () => {
  const rows = [row({ 'วันที่เปิดบิลขาย': '2026-09-26', 'วันที่จัดเสร็จ': '', 'วันที่รับเอกสาร': '2026-09-27' }), row({ 'วันที่เปิดบิลขาย': '2026-09-26' }), row({ 'วันที่เปิดบิลขาย': '2026-09-26', 'วันที่จัดเสร็จ': '2026-09-30', 'วันที่ส่งมอบ': '2026-10-01' })];
  for (const input of [rows, [...rows].reverse()]) {
    const result = analyze(input), doc = result.warehouseDocs[0];
    assert.equal(result.totalDocs, 1);
    assert.equal(doc.leadTimeDays, 4);
    assert.equal(doc.completedDate, '2026-09-30');
    assert.equal(doc.pendingDays, undefined);
    assert.equal(doc.delayDays, 1);
    assert.equal(result.transferredToDeliveryCount, 1);
  }
});
test('warehouse date filter uses receipt column rather than completion', () => {
  assert.equal(api.analyzeWarehouseData([row()], { fromDate: '2026-09-30' }).totalDocs, 0);
  assert.equal(api.analyzeWarehouseData([row()], { fromDate: '2026-09-29', toDate: '2026-09-29' }).totalDocs, 1);
});
const storage = new Map();
global.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
test('old derived warehouse cache is recomputed from raw source rows', () => {
  storage.clear();
  api.setDepartmentCache('warehouse', 'https://docs.google.com/spreadsheets/d/example/edit', { rawRows: [row()] }, { warehouseDocs: [] });
  const cached = api.getDepartmentCache('warehouse');
  assert.equal(cached.data.warehouseDocs[0].completedDate, '2026-09-29');
});
test('explicit gid is fetched first, tab caches are isolated and force refresh bypasses cache', async () => {
  storage.clear();
  const original = global.fetch, urls = [];
  global.fetch = async url => { urls.push(url); return new Response('เลขที่ใบจอง,สถานะ,วันที่รับเอกสาร,วันที่จัดเสร็จ\nBK256909/03360,Ship,2026-09-29,2026-09-29'); };
  try {
    const base = 'https://docs.google.com/spreadsheets/d/abcdefghijklmnop/edit#gid=';
    await api.fetchSingleDepartmentSheet(base + '0', 'picking');
    assert.match(urls[0], /export\?format=csv&gid=0$/);
    await api.fetchSingleDepartmentSheet(base + '0', 'picking');
    assert.equal(urls.length, 1);
    await api.fetchSingleDepartmentSheet(base + '99', 'picking');
    assert.equal(urls.length, 2);
    await api.fetchSingleDepartmentSheet(base + '99', 'picking', { forceRefresh: true });
    assert.equal(urls.length, 3);
  } finally { global.fetch = original; }
});
test('all downloaded source rows retain completion dates after CSV analysis', { skip: !fs.existsSync('test-results/warehouse-source.csv') }, () => {
  const parsed = api.parseGoogleSheetCsvText(fs.readFileSync('test-results/warehouse-source.csv', 'utf8'), 'Warehouse DB');
  const result = analyze(parsed);
  const dated = parsed.rawRows.filter(row => row['วันที่จัดเสร็จ']);
  for (const source of dated) assert.ok(result.warehouseDocs.find(doc => doc.docNo === source['เลขที่ใบจอง'])?.completedDate, source['เลขที่ใบจอง']);
  const doc = result.warehouseDocs.find(doc => doc.docNo === 'BK256909/03360');
  assert.equal(doc.completedDate, '2026-09-29');
  assert.equal(doc.leadTimeDays, 0);
  console.log(`Source audit: ${parsed.rowCount} rows, ${result.totalDocs} documents, ${dated.length} completion dates retained.`);
});
test('failed explicit tab never falls back to a default department tab', async () => {
  storage.clear();
  const original = global.fetch, warn = console.warn, urls = [];
  global.fetch = async url => { urls.push(url); return new Response('', {status:404}); };
  console.warn = () => {};
  try {
    await assert.rejects(api.fetchSingleDepartmentSheet('https://docs.google.com/spreadsheets/d/abcdefghijklmnop/edit#gid=99', 'picking', {forceRefresh:true}));
    assert.ok(urls.length > 0);
    assert.ok(urls.every(url => url.includes('gid=99')));
  } finally { global.fetch = original; console.warn = warn; }
});

test('reload restores every linked raw sheet before a single department is reprocessed', () => {
  storage.clear();
  const urls = {sales:'https://docs.google.com/spreadsheets/d/salesexample12345/edit',warehouse:'https://docs.google.com/spreadsheets/d/warehouseexample12345/edit',delivery:'https://docs.google.com/spreadsheets/d/deliveryexample12345/edit'};
  for(const department of Object.keys(urls)) {
    api.saveDepartmentUrl(department, urls[department]);
    api.setDepartmentCache(department,urls[department],{rawRows:[department==='warehouse'?row():{docNo:'BK1',totalPrice:100,quantity:1}],rowCount:1},{});
  }
  const restored=api.restoreDepartmentFiles();
  assert.equal(restored.salesOrderParsed.rawRows.length,1);
  assert.equal(restored.pickingListParsed.rawRows.length,1);
  assert.equal(restored.deliveryTagParsed.rawRows.length,1);
  api.saveDepartmentUrl('warehouse','https://docs.google.com/spreadsheets/d/differentexample12345/edit');
  assert.equal(api.restoreDepartmentFiles().pickingListParsed,undefined);
});

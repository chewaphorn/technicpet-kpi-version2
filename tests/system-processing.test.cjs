const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
const bundle = buildSync({ stdin: { contents: `export * from './src/utils/dataProcessor'; export * from './src/utils/dateUtils'; export * from './src/utils/logisticsReportMetrics'; export * from './src/utils/salesReportMetrics';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false });
const compiled = new Module(path.resolve('__system_tests.cjs'));
compiled.filename = path.resolve('__system_tests.cjs');
compiled.paths = Module._nodeModulePaths(process.cwd());
compiled._compile(bundle.outputFiles[0].text, compiled.filename);
const api = compiled.exports;
const sales = (overrides = {}) => ({ docNo: 'BK001', date: '15/08/2569', customer: 'Customer A', salesperson: 'Rep', productCode: 'SKU1', productName: 'Product', quantity: 2, unitPrice: 100, totalPrice: 200, ...overrides });
const delivery = (overrides = {}) => ({ salesOrderNo: 'BK001', plannedDate: '15/08/2569', handoffDate: '14/08/2569', loadedDate: '15/08/2569', ...overrides });

test('date validation agrees for filters and lead time; impossible/reversed dates never count as zero-day success', () => {
  for (const value of ['31/02/2026', '2026-13-01', '-', '08:30', '15/08/69']) {
    assert.equal(api.normalizeDateToISO(value), '');
    assert.equal(api.parseDateFlexible(value), null);
  }
  for (const value of ['15/08/2569', '2026-08-15', '15.08.2026']) assert.equal(api.normalizeDateToISO(value), '2026-08-15');
  assert.equal(api.calculateDaysDiff('2026-08-15', '2026-08-14'), undefined);
  assert.equal(api.calculateDaysDiff('14/08/2569', '2026-08-15'), 1);
});
test('zero-priced bills, free products, decimal quantities and negative returns survive import', () => {
  const result = api.analyzeSalesData([sales({ totalPrice: 0, quantity: 1.5 })]);
  assert.equal(result.totalOrders, 1);
  assert.equal(result.totalSalesAmount, 0);
  assert.equal(result.detailedSalesOrders[0].totalQuantity, 1.5);
  assert.equal(result.topProducts[0].totalAmount, 0);
  const returns = api.analyzeSalesData([sales({ docNo: 'BKR1', quantity: -2, totalPrice: -200 })]);
  assert.equal(returns.detailedSalesOrders[0].totalQuantity, -2);
  assert.equal(returns.totalSalesAmount, -200);
});
test('date filtering never imports summary rows without a bill number', () => {
  const result = api.analyzeSalesData([sales(), { date: '15/08/2569', totalPrice: 200 }], 15, { fromDate: '2026-08-15', toDate: '2026-08-15' });
  assert.equal(result.totalOrders, 1);
  assert.equal(result.totalSalesAmount, 200);
});
test('warehouse aggregation joins the sales opening date by booking number', () => {
  const docs = api.aggregateWarehouseDocs(
    [{ docNo: ' bk001 ', customer: 'Customer A', status: 'pending', itemsCount: 1 }],
    [sales({ date: '15/08/2569' })]
  );
  assert.equal(docs[0].salesOrderDate, '15/08/2569');
});
test('bill identity and document classification do not depend on letter case or an R inside ORDER', () => {
  const result = api.analyzeSalesData([sales({ docNo: 'order-1' }), sales({ docNo: 'ORDER-1' })]);
  assert.equal(result.totalOrders, 1);
  assert.equal(result.detailedSalesOrders[0].docType, 'BK');
  assert.equal(result.totalSalesAmount, 400);
  const repeated = api.analyzeSalesData([...result.detailedSalesOrders, ...result.detailedSalesOrders]);
  assert.equal(repeated.totalSalesAmount, 400);
});
test('delivery duplicates are combined before OTD, counts and distribution are calculated', () => {
  const result = api.analyzeDeliveryData([delivery(), delivery()]);
  assert.equal(result.totalTrips, 1);
  assert.equal(result.otdPercent, 100);
  assert.equal(result.speedDistribution.reduce((n, bucket) => n + bucket.trips, 0), 1);
});
test('missing load date and unknown status remain pending; planned dates cannot become actual lead time', () => {
  const result = api.analyzeDeliveryData([delivery({ loadedDate: '-', status: '' })]);
  assert.equal(result.pendingDeliveriesCount, 1);
  assert.equal(result.deliveryTrips[0].loadedDate, undefined);
  assert.equal(api.calculateDeliveryMetrics(result.deliveryTrips).leadTimeStats.count, 0);
  assert.equal(api.calculateDeliveryMetrics([{ ...delivery({ handoffDate: undefined, loadedDate: '2026-08-15' }), orderDate: '2026-08-01', status: 'completed', deliveryLeadTimeDays: 14 }]).leadTimeStats.count, 0);
});
test('latest loading date drives duplicate-bill lead time regardless of row order', () => {
  for (const rows of [[delivery(), delivery({ loadedDate: '18/08/2569' })], [delivery({ loadedDate: '18/08/2569' }), delivery()]]) {
    const result = api.analyzeDeliveryData(rows);
    assert.equal(result.avgDeliveryDays, 4);
    assert.equal(result.otdPercent, 0);
  }
});
test('delivery importer and report select the same planning-date cohort', () => {
  const rows = [delivery({ loadedDate: '18/08/2569' }), delivery({ salesOrderNo: 'BK002', plannedDate: '16/08/2569' })];
  const range = { fromDate: '2026-08-15', toDate: '2026-08-15' };
  const result = api.analyzeDeliveryData(rows, range);
  const report = api.filterDeliveryTrips(api.analyzeDeliveryData(rows).deliveryTrips, range);
  assert.equal(result.totalTrips, 1);
  assert.equal(result.totalTrips, report.length);
});
test('non-finite numeric input does not poison report totals', () => {
  assert.equal(api.parseNumberSafe(Infinity), 0);
  assert.equal(api.parseNumberSafe('-Infinity'), 0);
});

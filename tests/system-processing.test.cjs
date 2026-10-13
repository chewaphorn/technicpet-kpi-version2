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
test('warehouse aggregation does not source its opening date from the sales report', () => {
  const docs = api.aggregateWarehouseDocs(
    [{ docNo: ' bk001 ', customer: 'Customer A', status: 'pending', itemsCount: 1 }],
    [sales({ date: '15/08/2569' })]
  );
  assert.equal(docs[0].salesOrderDate, undefined);
});
test('warehouse metrics summarize filtered records by booking date', () => {
  const metrics = api.calculateWarehouseMetrics([
    { docNo: 'BK1', date: '2026-08-10', receivedBookingDate: '2026-08-10', status: 'pending', transferredToDelivery: false },
    { docNo: 'BK2', date: '2026-08-10', receivedBookingDate: '2026-08-10', status: 'completed', completedDate: '2026-08-12', salesOrderDate: '2026-08-11', transferredToDelivery: true },
    { docNo: 'BK3', date: '2026-08-11', receivedBookingDate: '2026-08-11', status: 'picking', transferredToDelivery: false },
  ]);
  assert.deepEqual(metrics.dailySummaries, [
    { date: '2026-08-11', inboundBookings: 1, pickedOrders: 0, transferredCount: 0, pendingCount: 1 },
    { date: '2026-08-10', inboundBookings: 2, pickedOrders: 1, transferredCount: 1, pendingCount: 1 },
  ]);
  assert.deepEqual(metrics.monthlySummaries, [
    { month: '2026-08', inboundBookings: 3, pickedOrders: 1, pendingCount: 2, completionRate: 33.3 },
  ]);
});
test('warehouse completed-card count matches measurable lead-time denominator despite stale status', () => {
test('pending totals include every received bill without a completion date', () => {
  const docs = [
    { docNo: 'BK-DONE', date: '2026-08-10', completedDate: '2026-08-12', salesOrderDate: '2026-08-10', status: 'completed' },
    { docNo: 'BK-PENDING', date: '2026-08-10', salesOrderDate: '2026-08-10', status: 'pending' },
    { docNo: 'BK-UNKNOWN', date: '2026-08-10', salesOrderDate: '2026-08-10', status: 'unknown' },
  ];
  const metrics = api.calculateWarehouseMetrics(docs);
  assert.equal(metrics.totalDocsCount, 3);
  assert.equal(metrics.completedDocsCount, 1);
  assert.equal(metrics.pendingDocsCount, 2);
  assert.equal(metrics.totalDocsCount, metrics.completedDocsCount + metrics.pendingDocsCount);
  assert.equal(metrics.dailySummaries[0].pendingCount, 2);
  assert.equal(api.filterWarehouseDocs(docs, { status: 'pending_all' }).length, 2);
});
  const [doc] = api.aggregateWarehouseDocs([
    {
      docNo: 'BK-COMPLETE',
      date: '2026-08-10',
      receivedBookingDate: '2026-08-10',
      salesOrderDate: '2026-08-10',
      completedDate: '2026-08-12',
      status: 'pending',
      statusLabel: 'รอจัดสินค้า',
      itemsCount: 1,
    },
  ]);
  const metrics = api.calculateWarehouseMetrics([doc]);
  assert.equal(doc.status, 'completed');
  assert.equal(metrics.completedDocsCount, 1);
  assert.equal(metrics.pendingDocsCount, 0);
  assert.equal(metrics.leadTimeRecords.length, 1);
  assert.equal(metrics.onPlanLeadTimeCount, 1);
  assert.equal(metrics.dailySummaries[0].pickedOrders, 1);
  assert.equal(metrics.dailySummaries[0].pendingCount, 0);
});
test('warehouse minimum and maximum lead time use only completed bills in the selected date range', () => {
  const docs = [
    { docNo: 'BK1', date: '2026-08-02', salesOrderDate: '2026-08-01', completedDate: '2026-08-04', status: 'completed' },
    { docNo: 'BK2', date: '2026-08-12', salesOrderDate: '2026-08-10', completedDate: '2026-08-16', status: 'completed' },
    { docNo: 'BK4', date: '2026-08-14', salesOrderDate: '2026-08-10', completedDate: '2026-08-16', status: 'completed' },
    { docNo: 'BK3', date: '2026-09-02', salesOrderDate: '2026-09-01', completedDate: '2026-09-11', status: 'completed' },
  ];
  const selectedPeriod = api.filterWarehouseDocs(docs, { fromDate: '2026-08-01', toDate: '2026-08-31' });
  const metrics = api.calculateWarehouseMetrics(selectedPeriod);
  assert.equal(metrics.leadTimeStats.count, 3);
  assert.equal(metrics.leadTimeStats.min, 3);
  assert.equal(metrics.leadTimeStats.max, 6);
  assert.deepEqual(metrics.maximumLeadTimeRecords.map(({ doc }) => doc.docNo), ['BK2', 'BK4']);
});
test('lead-time coverage distinguishes completed bills from bills with both dates', () => {
  const metrics = api.calculateWarehouseMetrics([
    { docNo: 'BK1', salesOrderDate: '2026-08-01', completedDate: '2026-08-04', status: 'completed' },
    { docNo: 'BK2', salesOrderDate: '', completedDate: '2026-08-05', status: 'completed' },
  ]);
  assert.equal(metrics.completedDocsCount, 2);
  assert.equal(metrics.leadTimeStats.count, 1);
  assert.equal(metrics.completedDocsCount - metrics.leadTimeStats.count, 1);
  assert.equal(metrics.leadTimeUnavailableDocs.length, 1);
  assert.equal(metrics.leadTimeUnavailableDocs[0].doc.docNo, 'BK2');
  assert.equal(metrics.leadTimeUnavailableDocs[0].reason, 'ไม่มีวันที่เปิดบิลขาย');
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

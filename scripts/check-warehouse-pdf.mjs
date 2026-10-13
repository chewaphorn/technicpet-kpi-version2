import { build } from 'esbuild';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(root, 'package.json'));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
// Render the actual report components without connecting to Firebase or downloading files.
const result = await build({
  stdin: {
    contents: "export { PDFReportPreviewModal } from './src/components/PDFReportPreviewModal'; export { WarehouseReportView } from './src/components/WarehouseReportView'; export { analyzeWarehouseData } from './src/utils/warehouseAnalyzer';",
    resolveDir: root,
    loader: 'tsx',
  },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  plugins: [{ name: 'isolate-auth-for-render', setup(build) {
    build.onResolve({ filter: /lib\/authControl$/ }, () => ({ path: 'auth', namespace: 'render-test' }));
    build.onLoad({ filter: /.*/, namespace: 'render-test' }, () => ({ contents: 'export const canAccessReport = () => true;', loader: 'js' }));
  } }],
});
const compiled = new Module(path.join(root, '__warehouse_report_check.cjs'));
compiled.filename = path.join(root, '__warehouse_report_check.cjs');
compiled.paths = Module._nodeModulePaths(root);
compiled._compile(result.outputFiles[0].text, compiled.filename);
const { PDFReportPreviewModal, WarehouseReportView } = compiled.exports;
const doc = (docNo, completedDate, extra = {}) => ({
  id: docNo, docNo, customer: 'Example', date: '2026-08-10', receivedBookingDate: '2026-08-10',
  completedDate, startTime: '', itemsCount: 1, status: completedDate ? 'completed' : 'pending',
  statusLabel: '', pickerName: '', priority: 'normal', ...extra,
});
const plain = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const cases = [
  { name: 'same-day, target, overdue, duplicate and missing source dates', docs: [doc('A','2026-08-10'), doc('B','2026-08-12'), doc('C','2026-08-15'), doc('A','2026-08-10'), doc('D',undefined), doc('E','2026-08-12',{receivedBookingDate:'',date:''})], count: 3, onPlan: 2, pct: '66.7' },
  { name: 'no data', docs: [], count: 0, onPlan: 0, pct: '0' },
  { name: 'all on plan including target boundary', docs: [doc('A','2026-08-10'),doc('B','2026-08-13')], count: 2, onPlan: 2, pct: '100.0' },
  { name: 'all overdue', docs: [doc('A','2026-08-14')], count: 1, onPlan: 0, pct: '0.0' },
];
for (const c of cases) {
  const pdf = plain(renderToStaticMarkup(React.createElement(PDFReportPreviewModal,{isOpen:true,onClose(){},department:'warehouse',warehouseDocs:c.docs})));
  const dashboard = plain(renderToStaticMarkup(React.createElement(WarehouseReportView,{docs:c.docs,onSelectDoc(){}})));
  assert.ok(!pdf.includes('99.4%') && !pdf.includes('Picking SLA'));
  assert.ok(pdf.includes(`ตรงตามแผน ≤ 3 วัน ${c.pct}% ${c.onPlan} จาก ${c.count} บิล`), c.name + ': PDF mismatch');
  assert.ok(dashboard.includes(`${c.onPlan} จาก ${c.count} บิล (${c.pct}%)`), c.name + ': dashboard mismatch');
  console.log('PASS:',c.name);
}
// Missing booking dates must not bypass the status filter.
const filtered = plain(renderToStaticMarkup(React.createElement(PDFReportPreviewModal,{
  isOpen:true, onClose(){}, department:'warehouse',
  warehouseDocs:[doc('A','2026-08-12',{date:'',receivedBookingDate:''})],
  reportFilters:{department:'warehouse',status:'pending_all'},
})));
assert.ok(filtered.includes('ตรงตามแผน ≤ 3 วัน 0% 0 จาก 0 บิล'));
assert.ok(filtered.includes('สำเร็จ 0 ใบ (0%)'));
console.log('PASS: missing-date records obey status filter');

const imported = compiled.exports.analyzeWarehouseData([{
  'เลขที่ใบจอง': 'BK256909/03360', 'สถานะ': 'Ship',
  'วันที่รับเอกสาร': '2026-09-29 00:00:00', 'วันที่จัดเสร็จ': '2026-09-29 00:00:00',
  'วันที่โหลดสินค้าจริง': '2026-09-30',
}]).warehouseDocs;
const importedHtml = renderToStaticMarkup(React.createElement(WarehouseReportView, { docs: imported, onSelectDoc(){} }));
const importedRow = importedHtml.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g).find(row => row.includes('BK256909/03360'));
assert.ok(importedRow, 'Imported booking is visible');
assert.equal((importedRow.match(/2026-09-29/g) || []).length, 2, 'Receipt and completion dates are both visible');
assert.ok(!importedRow.includes('2026-09-30'), 'Loading date must not replace completion');
console.log('PASS: imported Ship booking shows actual receipt and completion dates in warehouse table');

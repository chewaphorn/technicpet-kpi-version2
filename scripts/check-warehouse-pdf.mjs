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
  id: docNo, docNo, customer: 'Example', date: '2026-08-10', receivedBookingDate: '2026-08-10', salesOrderDate: '2026-08-10',
  completedDate, startTime: '', itemsCount: 1, status: completedDate ? 'completed' : 'pending',
  statusLabel: '', pickerName: '', priority: 'normal', ...extra,
});
const plain = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const cases = [
  { name: 'same-day, target, overdue, duplicate and missing receipt date', docs: [doc('A','2026-08-10'), doc('B','2026-08-12'), doc('C','2026-08-15'), doc('A','2026-08-10'), doc('D',undefined), doc('E','2026-08-12',{receivedBookingDate:''})], total: 5, completed: 4, leadTimeCount: 4, min: 0, max: 5 },
  { name: 'no data', docs: [], total: 0, completed: 0, leadTimeCount: 0, min: '-', max: '-' },
  { name: 'same-day and three-day lead times', docs: [doc('A','2026-08-10'),doc('B','2026-08-13')], total: 2, completed: 2, leadTimeCount: 2, min: 0, max: 3 },
  { name: 'four-day maximum', docs: [doc('A','2026-08-14')], total: 1, completed: 1, leadTimeCount: 1, min: 4, max: 4 },
];
for (const c of cases) {
  const pdf = plain(renderToStaticMarkup(React.createElement(PDFReportPreviewModal,{isOpen:true,onClose(){},department:'warehouse',warehouseDocs:c.docs})));
  const dashboard = plain(renderToStaticMarkup(React.createElement(WarehouseReportView,{docs:c.docs,onSelectDoc(){}})));
  assert.ok(pdf.includes(`รับเข้าใบจองทั้งหมด ${c.total} ใบ`), c.name + ': PDF inbound total mismatch');
  assert.ok(pdf.includes(`จัดได้ทั้งหมด ${c.completed} ใบ`), c.name + ': PDF completed total mismatch');
  assert.ok(pdf.includes(`ค้างจัดทั้งหมด ${c.total - c.completed} ใบ`), c.name + ': PDF pending total mismatch');
  assert.ok(pdf.includes(`คำนวณได้ ${c.leadTimeCount} / ${c.completed} บิลจัดเสร็จ`), c.name + ': PDF lead-time coverage mismatch');
  assert.ok(pdf.includes(`MIN (ต่ำสุด) ${c.min} วัน MAX (สูงสุด) ${c.max} วัน`), c.name + ': PDF min/max mismatch');
  assert.ok(dashboard.includes(`คำนวณได้ ${c.leadTimeCount} / ${c.completed} บิลจัดเสร็จ`), c.name + ': dashboard coverage mismatch');
  console.log('PASS:',c.name);
}
// Missing booking dates must not bypass the status filter.
const filtered = plain(renderToStaticMarkup(React.createElement(PDFReportPreviewModal,{
  isOpen:true, onClose(){}, department:'warehouse',
  warehouseDocs:[doc('A','2026-08-12',{date:'',receivedBookingDate:''})],
  reportFilters:{department:'warehouse',status:'pending_all'},
})));
assert.ok(filtered.includes('รับเข้าใบจองทั้งหมด 0 ใบ'));
assert.ok(filtered.includes('จัดได้ทั้งหมด 0 ใบ'));
assert.ok(filtered.includes('ค้างจัดทั้งหมด 0 ใบ'));
assert.ok(filtered.includes('คำนวณได้ 0 / 0 บิลจัดเสร็จ'));
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

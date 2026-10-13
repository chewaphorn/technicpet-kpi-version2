import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import confetti from 'canvas-confetti';
import { PDFReportPreviewModal } from '../src/components/PDFReportPreviewModal';
import { SalesReportView } from '../src/components/SalesReportView';
import { WarehouseReportView } from '../src/components/WarehouseReportView';
import { DeliveryReportView } from '../src/components/DeliveryReportView';
import { ExecutiveOverview } from '../src/components/ExecutiveOverview';
import { NewReportModal } from '../src/components/NewReportModal';
import { SettingsModal } from '../src/components/SettingsModal';
import { LoginView } from '../src/components/LoginView';
import { Sidebar } from '../src/components/Sidebar';
import { Header } from '../src/components/Header';
import { HelpModal } from '../src/components/HelpModal';
import { ProfileModal } from '../src/components/ProfileModal';
import { DocumentTrackingModal } from '../src/components/DocumentTrackingModal';
import { BookingTrackingSection } from '../src/components/BookingTrackingSection';
import { buildBookingTracking } from '../src/utils/bookingTracking';
import { GoogleSheetIntegrationModal } from '../src/components/GoogleSheetIntegrationModal';
import { createReportRequest } from '../src/utils/reportRequest';
import { aggregateWarehouseDocs, filterWarehouseDocs, calculateWarehouseMetrics, aggregateDeliveryTrips, filterDeliveryTrips, calculateDeliveryMetrics } from '../src/utils/logisticsReportMetrics';
import { filterSalesOrders, calculateSalesReportMetrics } from '../src/utils/salesReportMetrics';
import { analyzeWarehouseData } from '../src/utils/warehouseAnalyzer';
import { parseGoogleSheetCsvText } from '../src/utils/googleSheets';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const root = createRoot(document.getElementById('root'));
const assert = (value, message) => { if (!value) throw Error(message); };
const equal = (value, expected, message) => assert(JSON.stringify(value) === JSON.stringify(expected), `${message}: ${JSON.stringify(value)} != ${JSON.stringify(expected)}`);
const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const report = () => document.getElementById('technicpet-pdf-printable-report');
const button = label => [...document.querySelectorAll('button')].find(b => text(b) === label);
const containingButton = label => [...document.querySelectorAll('button')].find(b => text(b).includes(label));
const render = async node => { await act(async () => root.render(node)); };
const click = async node => { assert(node, 'Missing clickable control'); await act(async () => node.click()); };
const change = async (node, value) => {
  assert(node, 'Missing input');
  await act(async () => {
    const proto = node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value);
    node.dispatchEvent(new Event(node instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
};
const admin = { uid:'test-admin', displayName:'Report Test', email:'admin@example.com', initials:'RT', role:'admin', allowedScreens:['overview','sales','warehouse','delivery'] };
const item = quantity => ({ seqNo:1, productCode:'P1', productName:'Test Product', quantity, unit:'ชิ้น', unitPrice:100, totalPrice:quantity*100 });
const order = (docNo, date, totalAmount, extra={}) => ({ docNo,date,totalAmount,customer:'Customer A',salesperson:'Sales A',status:'completed',items:[item(2)],totalItemsCount:1,totalQuantity:2,...extra });
const orders = [order('BK1','2026-08-01',1000),order('BKET2','2026-08-02',3000,{docType:'BKET'}),order('BKR3','2026-08-03',-200,{docType:'BKR'})];
const doc = (docNo, completedDate, extra={}) => ({ id:docNo,docNo,date:'2026-07-10',receivedBookingDate:'2026-07-10',salesOrderDate:'2026-07-10',completedDate,customer:'Warehouse Customer',itemsCount:1,status:completedDate?'completed':'pending',statusLabel:'',...extra });
const docs = [doc('W1','2026-07-10'),doc('W1','2026-07-10',{transferredToDelivery:true}),doc('W2','2026-07-12'),doc('W3','2026-07-15'),doc('W4',undefined),doc('W5','2026-07-14',{date:'',receivedBookingDate:''})];
const trip = (docNo, extra={}) => ({ id:docNo,docNo,plannedDate:'2026-09-01',handoffDate:'2026-09-01',loadedDate:'2026-09-03',status:'completed',statusLabel:'',licensePlate:'Truck 1',customer:'Delivery Customer',weightTon:1,items:[item(2)],...extra });
const trips = [trip('D1'),trip('D1',{items:[item(3)]}),trip('D2',{loadedDate:'2026-09-05',licensePlate:'Truck 2'}),trip('D3',{loadedDate:undefined,status:'in_transit',statusLabel:'โหลดแล้ว',licensePlate:'รอระบุ'}),trip('D4',{loadedDate:undefined,status:'delayed',licensePlate:'-'})];
const source = {currentUser:admin,detailedSalesOrders:orders,warehouseDocs:docs,deliveryTrips:trips};
const preview = extra => <PDFReportPreviewModal isOpen onClose={()=>{}} {...source} {...extra} />;
const log = message => { window.__passes.push(message); console.log('PASS:', message); };
window.__passes=[];
window.__exports=[];
window.__pdfWrites=[];

window.runReportChecks = async () => {
  const importedWarehouse = analyzeWarehouseData(parseGoogleSheetCsvText('เลขที่ใบจอง,สถานะ,วันที่เปิดบิลขาย,วันที่รับเอกสาร,วันที่จัดเสร็จ,วันที่โหลดสินค้าจริง\nBK256909/03360,Ship,2026-09-29,2026-09-29,2026-09-29,2026-09-30', 'warehouse'));
  await render(<WarehouseReportView docs={importedWarehouse.warehouseDocs} onSelectDoc={()=>{}} />);
  const bookingRow = [...document.querySelectorAll('tbody tr')].find(row => text(row).includes('BK256909/03360'));
  assert(bookingRow, 'Imported booking appears in warehouse status report');
  assert(text(bookingRow).includes('2026-09-29'), 'Imported completion date is visible');
  assert(!text(bookingRow).includes('2026-09-30'), 'Loading date is not substituted for picking date');
  assert(importedWarehouse.warehouseDocs[0].status === 'completed' && text(bookingRow).includes('0 วัน'), 'Ship with completion date is completed and has zero-day lead time');
  log('Warehouse CSV import renders BK256909/03360 with real picking completion date');
  localStorage.setItem('technicpet_kpi_targets',JSON.stringify({monthlySalesTarget:2,warehousePickingLeadTimeTarget:2}));
  const before = JSON.stringify(trips);
  const grouped = aggregateDeliveryTrips(trips,orders);
  equal(grouped.length,4,'Delivery deduplicates bills');
  equal(grouped[0].items[0].quantity,5,'Merged item quantity');
  equal(aggregateDeliveryTrips(trips,orders)[0].items[0].quantity,5,'Repeated aggregation is stable');
  equal(JSON.stringify(trips),before,'Source data was not mutated');
  const delivery = calculateDeliveryMetrics(grouped);
  equal([delivery.totalBillsCount,delivery.completedBillsCount,delivery.pendingDeliveriesCount,delivery.uniqueVehiclesCount,delivery.totalWeight],[4,3,1,2,5],'Delivery totals');
  equal([delivery.leadTimeStats.count,delivery.leadTimeStats.mean,delivery.leadTimeStats.min,delivery.leadTimeStats.max],[2,3,2,4],'Only measured delivery lead times');
  equal(calculateDeliveryMetrics([trip('Unknown',{plannedDate:undefined,handoffDate:undefined,loadedDate:undefined})]).leadTimeStats.count,0,'Do not fabricate one day');
  equal(filterDeliveryTrips(grouped,{status:'completed',vehicle:'Truck 2',search:'d2'}).length,1,'Delivery status, search and vehicle together');
  const warehouse = calculateWarehouseMetrics(aggregateWarehouseDocs(docs,orders),2);
  equal([warehouse.totalDocsCount,warehouse.completedDocsCount,warehouse.pendingDocsCount,warehouse.leadTimeStats.count,warehouse.leadTimeStats.min,warehouse.leadTimeStats.max,warehouse.onPlanLeadTimeCount],[5,4,1,4,0,5,2],'Warehouse date-pair denominator and deduplication');
  equal(filterWarehouseDocs(aggregateWarehouseDocs(docs),{status:'pending_all'}).length,1,'Missing dates do not bypass filters');
  equal(calculateSalesReportMetrics(filterSalesOrders(orders,{docType:'BKET'}),[],2).totalRevenueAmount,3000,'Sales type filter');
  equal(calculateSalesReportMetrics(orders,[],2).computedReps[0].completionRate,0.2,'Real company target for sales reps');
  equal(createReportRequest('sales','2026-08-02','').dateRange,{start:'2026-08-02',end:''},'One-sided dates preserved');
  log('Shared calculations: duplicate bills, source immutability, missing dates, filters and configured targets');

  // Real React effects previously reverted warehouse/delivery tabs to sales
  // when the departments had different source date ranges.
  await render(preview({department:'sales',startDate:'',endDate:''}));
  const expectedTitles = {sales:'Sales Executive Summary Report',warehouse:'Warehouse Executive Summary Report',delivery:'Logistics Executive Summary Report',overview:'Executive Overview Summary Report'};
  const labels={sales:'ฝ่ายขาย',warehouse:'ฝ่ายคลัง',delivery:'ฝ่ายจัดส่ง',overview:'ภาพรวมผู้บริหาร'};
  for(const dept of ['warehouse','delivery','sales','overview','warehouse','sales']) {
    await click(button(labels[dept]));
    assert(text(report()).includes(expectedTitles[dept]),`Tab stays on ${dept}`);
    equal([...document.querySelectorAll('input[type=date]')].map(i=>i.value),['',''],'Tab switch preserves selected date range');
  }
  log('Switching all four report tabs repeatedly preserves department and dates');
  await render(<PDFReportPreviewModal isOpen={false} onClose={()=>{}} {...source} department="sales" />);
  await render(preview({department:'delivery'}));
  equal([...document.querySelectorAll('input[type=date]')].map(i=>i.value),['2026-09-01','2026-09-01'],'Reopening picks correct department date range');
  assert(!text(report()).includes('Sales Executive Summary Report'),'Previous department did not leak');
  // Same live modal receives a background sync; its source snapshot stays stable.
  const oldText=text(report());
  await render(preview({department:'delivery',deliveryTrips:[]}));
  equal(text(report()),oldText,'Background update cannot change an in-progress report');
  log('Close/reopen and background updates do not mix report sessions');

  await render(preview({department:'sales',startDate:'2026-08-02',endDate:'',reportFilters:{department:'sales',docType:'BKET'}}));
  assert(text(report()).includes('ยอดคำสั่งซื้อรวม 1 บิล') && text(report()).includes('฿3,000'),'Filtered sales PDF');
  assert(text(report()).includes('เป้าหมาย ≥ ฿2 ล้าน/เดือน') && text(report()).includes('ยอดขายเฉลี่ยต่อเดือน'),'PDF uses current monthly sales target');
  assert(report().querySelectorAll('[data-testid^="pdf-goal-"]').length===2,'Sales PDF shows both current department goals');
  assert(!text(report()).includes('สำเร็จแล้ว 100%'),'No fake success rate');
  await render(preview({department:'sales',startDate:'2030-01-01',endDate:'2030-01-02',salesSummary:{totalRevenueAmount:999999},salesReps:[{name:'Stale sales rep'}]}));
  assert(text(report()).includes('ยอดคำสั่งซื้อรวม 0 บิล')&&!text(report()).includes('999,999')&&!text(report()).includes('Stale sales rep'),'Empty date range does not fall back to summaries');
  log('Sales PDF follows dates, document filters, settings and empty results');

  // Exercise the actual dashboard buttons and their callbacks, not just models.
  let request;
  const open=(dept)=>(start,end,filters)=>{request=createReportRequest(dept,start,end,filters);};
  await render(<SalesReportView detailedOrders={orders} currentUser={admin} onOpenPDFReport={open('sales')} />);
  await change(document.querySelectorAll('input[type=date]')[0],'2026-08-02');
  await change(document.querySelectorAll('input[type=date]')[1],'');
  await click(containingButton('Export PDF'));
  equal(request.dateRange,{start:'2026-08-02',end:''},'Sales button forwards visible dates');
  await render(preview({department:request.department,startDate:request.dateRange.start,endDate:request.dateRange.end,reportFilters:request.filters}));
  assert(text(report()).includes('฿2,800')&&text(report()).includes('ยอดคำสั่งซื้อรวม 2 บิล'),'Sales button opens matching data');
  assert(text(report()).includes('เป้าหมาย ≥ ฿20,000'),'Sales PDF includes current average-bill target');
  log('Sales dashboard export callback and preview agree');

  await render(<WarehouseReportView docs={docs} detailedOrders={orders} onSelectDoc={()=>{}} currentUser={admin} onOpenPDFReport={open('warehouse')} />);
  assert(text(document.body).includes('คำนวณได้ 3 / 3 บิลจัดเสร็จ')&&text(document.body).includes('ค่าสูงสุด (MAX)'),'Warehouse dashboard shows current lead-time coverage and max');
  const statusSelect=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='pending_all'));
  await change(statusSelect,'pending_all');
  await click(containingButton('Export PDF'));
  equal(request.filters.status,'pending_all','Warehouse status forwarded');
  await render(preview({department:request.department,startDate:request.dateRange.start,endDate:request.dateRange.end,reportFilters:request.filters}));
  assert(text(report()).includes('รับเข้าใบจองทั้งหมด1 ใบ')&&text(report()).includes('จัดได้ทั้งหมด0 ใบ')&&text(report()).includes('ค้างจัดทั้งหมด1 ใบ'),`Warehouse PDF filters match dashboard: ${text(report())}`);
  assert(report().querySelectorAll('[data-testid^="pdf-goal-"]').length===2 && text(report()).includes('Picking Lead Time'),'Warehouse PDF shows current completion and picking targets');
  log('Warehouse dashboard export respects status and picking target');

  await render(<DeliveryReportView trips={trips} detailedSalesOrders={orders} onSelectDoc={()=>{}} currentUser={admin} onOpenPDFReport={open('delivery')} />);
  const vehicle=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='Truck 2'));
  await change(vehicle,'Truck 2');
  await click(containingButton('Export PDF'));
  equal(request.filters.vehicle,'Truck 2','Vehicle forwarded');
  await render(preview({department:request.department,startDate:request.dateRange.start,endDate:request.dateRange.end,reportFilters:request.filters}));
  assert(text(report()).includes('สำเร็จ 1 จาก 1 บิล')&&text(report()).includes('ทะเบียน: Truck 2'),'Delivery PDF filters match dashboard');
  assert(report().querySelectorAll('[data-testid^="pdf-goal-"]').length===2 && text(report()).includes('เปิดบิลขาย → โหลดเสร็จ'),'Delivery PDF shows current completion and sales-to-loaded targets');
  log('Delivery dashboard export respects vehicle and completion rules');

  const overviewOrders=[...orders,order('D1','2026-08-30',1000,{salesperson:'พนักงานขายชื่อยาวมากสำหรับทดสอบการขึ้นบรรทัด'}),order('D2','2026-08-29',1000,{salesperson:'พนักงานขายชื่อยาวมากสำหรับทดสอบการขึ้นบรรทัด'})];
  const overviewTrips=trips.map(deliveryTrip=>({...deliveryTrip,orderDate:'2026-09-01'}));
  await render(<ExecutiveOverview kpis={{}} trendData={[]} detailedOrders={overviewOrders} warehouseDocs={docs} deliveryTrips={overviewTrips} onSearchDoc={()=>{}} currentUser={admin} onExportPDF={(dept,start,end)=>{request=createReportRequest(dept,start,end);}} />);
  const goalCard=document.querySelector('[data-testid="overview-department-goals"]');
  assert(goalCard&&text(goalCard).includes('ผลลัพธ์เทียบเป้าหมายรายแผนก'),'Overview department goal comparison is visible');
  equal([...goalCard.querySelectorAll('section h4')].map(text),['ฝ่ายขาย','คลังสินค้า','ขนส่ง'],'Overview goal cards follow sales, warehouse, delivery order');
  const goal=id=>text(goalCard.querySelector(`[data-testid="overview-goal-${id}"]`));
  assert(goalCard.querySelectorAll('[role="img"]').length===6,'Six independent result-versus-target bullet charts are shown');
  assert(goal('warehouse-completion').includes('ผลจริง 75%')&&goal('warehouse-completion').includes('เป้าหมาย ≥ 80%')&&goal('warehouse-completion').includes('3/4 บิล'),'Warehouse completion compares unique filtered bills to target');
  assert(goal('warehouse-picking-days').includes('ผลจริง 2.3 วัน')&&goal('warehouse-picking-days').includes('เป้าหมาย ≤ 2 วัน')&&goal('warehouse-picking-days').includes('3 บิล'),'Warehouse picking comparison uses sales-open-to-picked mean');
  assert(goal('sales-monthly').includes('ผลจริง ฿0.002 ล้าน')&&goal('sales-monthly').includes('เป้าหมาย ≥ ฿2 ล้าน')&&goal('sales-monthly').includes('3 เดือน'),'Monthly sales goal compares against average per selected calendar month');
  assert(goal('sales-average-bill').includes('ผลจริง ฿1,160')&&goal('sales-average-bill').includes('เป้าหมาย ≥ ฿20,000'),'Average sale per bill compares with its own goal');
  assert(goal('delivery-completion').includes('ผลจริง 75%')&&goal('delivery-completion').includes('เป้าหมาย ≥ 80%')&&goal('delivery-completion').includes('3/4 บิล'),'Delivery completion compares unique filtered bills to target');
  assert(goal('delivery-sales-to-loaded-days').includes('ผลจริง 5.5 วัน')&&goal('delivery-sales-to-loaded-days').includes('เป้าหมาย ≤ 6 วัน')&&goal('delivery-sales-to-loaded-days').includes('2 บิล'),'Delivery duration compares matched sales-opening-to-loaded mean with target');
  const trackingSection=document.getElementById('booking-tracking');
  const trackingAverageLabel=[...trackingSection.querySelectorAll('p')].find(node=>text(node)==='เฉลี่ยสร้างใบจองถึงโหลดครบ (วัน)');
  assert(text(trackingAverageLabel?.parentElement).includes('5.5'),'Booking tracker and delivery target show the same average for the default period');
  equal([...trackingSection.querySelectorAll('input[type=date]')].map(input=>input.value),['2026-07-10','2026-09-01'],'Booking tracker starts with overview period');
  await click(containingButton('Export PDF'));
  equal(request.department,'overview','Overview routes to overview report');
  equal(request.dateRange,{start:'2026-07-10',end:'2026-09-01'},'Overview applied period forwarded');
  const expectedGoalTexts=Object.fromEntries(['sales-monthly','sales-average-bill','warehouse-completion','warehouse-picking-days','delivery-completion','delivery-sales-to-loaded-days'].map(id=>[id,goal(id)]));
  await render(preview({department:'overview',startDate:request.dateRange.start,endDate:request.dateRange.end,detailedSalesOrders:overviewOrders,warehouseDocs:docs,deliveryTrips:overviewTrips}));
  assert(report().querySelectorAll('[data-testid^="pdf-goal-"]').length===6,'Overview PDF shows all six current department targets');
  for(const [id,expected] of Object.entries(expectedGoalTexts)) equal(text(report().querySelector(`[data-testid="pdf-goal-${id}"]`)),expected,`Overview PDF and dashboard agree on ${id}`);
  assert(text(report()).includes('กราฟสถิติยอดขายรายเดือน') && text(report()).includes('2026-08'),'Overview PDF includes the current sales trend');
  assert(!text(report()).includes('อันดับผลงานพนักงานขายยอดเยี่ยม')&&!text(report()).includes('แนวโน้ม KPI คลังสินค้ารายเดือน')&&!text(report()).includes('Fleet Operations & Logistics Summary'),'Executive PDF excludes stale department detail sections');
  await render(<ExecutiveOverview kpis={{}} trendData={[]} detailedOrders={overviewOrders} warehouseDocs={docs} deliveryTrips={overviewTrips} onSearchDoc={()=>{}} currentUser={admin} onExportPDF={(dept,start,end)=>{request=createReportRequest(dept,start,end);}} />);
  const salesChart=()=>[...document.querySelectorAll('h3')].find(heading=>text(heading).startsWith('กราฟสถิติยอดขาย'));
  const departmentFilter=[...document.querySelectorAll('select')].find(select=>[...select.options].some(option=>option.value==='คลังสินค้า'));
  assert(salesChart(),'Sales chart is visible when all departments are selected');
  for(const [department,visible] of [['คลังสินค้า',false],['การจัดส่ง',false],['ฝ่ายขาย',true],['ทั้งหมด',true]]) {
    await change(departmentFilter,department);
    await click(document.getElementById('btn-overview-filter-submit'));
    assert(Boolean(salesChart())===visible,`Sales chart visibility follows applied department ${department}`);
    if(department==='คลังสินค้า') assert(text(document.querySelector('#section-warehouse-department')).includes('4 ใบ'),'Warehouse cards use the selected date window');
    if(department==='การจัดส่ง') assert(text(document.querySelector('#section-delivery-department')).includes('4 ใบ'),'Delivery cards use the selected date window');
    assert(!['สรุปผลงานฝ่ายขายและพนักงานขาย','รายการเอกสารคลังสินค้าตามตัวกรอง','รายการเที่ยวจัดส่งตามตัวกรอง'].some(title=>text(document.getElementById('root')).includes(title)),`Expanded department detail panels stay removed for ${department}`);
  }
  await change(departmentFilter,'ฝ่ายขาย');
  await click(document.getElementById('btn-overview-filter-submit'));
  await click([...document.querySelectorAll('button')].find(control=>/\d{2}\/\d{2}\/\d{4} - \d{2}\/\d{2}\/\d{4}/.test(text(control))));
  const overviewDateInputs=[...document.querySelectorAll('input[type=date]')].filter(input=>!input.closest('#booking-tracking'));
  await change(overviewDateInputs[0],'2026-08-29');
  await change(overviewDateInputs[1],'2026-08-30');
  await click(containingButton('นำไปใช้ (Apply)'));
  assert(text(document.getElementById('card-sales-total-orders')).includes('2 ใบ'),'Sales KPI card follows the selected date range without an expanded sales table');
  await render(<ExecutiveOverview kpis={{}} trendData={[]} detailedOrders={overviewOrders} warehouseDocs={docs} deliveryTrips={[...overviewTrips]} onSearchDoc={()=>{}} currentUser={admin} />);
  assert(text(document.getElementById('root')).includes('29/08/2026 - 30/08/2026')&&text(document.getElementById('root')).includes('แผนก: ฝ่ายขาย'),'A background data refresh does not reset the applied department or date range');
  assert(text(document.getElementById('card-sales-total-orders')).includes('2 ใบ'),'Filtered sales KPI remains stable after background refresh');
  await click([...document.querySelectorAll('button')].find(control=>/\d{2}\/\d{2}\/\d{4} - \d{2}\/\d{2}\/\d{4}/.test(text(control))));
  const emptyPeriodInputs=[...document.querySelectorAll('input[type=date]')].filter(input=>!input.closest('#booking-tracking'));
  await change(emptyPeriodInputs[0],'2030-01-01');
  await change(emptyPeriodInputs[1],'2030-01-31');
  await click(containingButton('นำไปใช้ (Apply)'));
  await render(<ExecutiveOverview kpis={{}} trendData={[{month:'ม.ค. 2030',totalVolume:999}]} detailedOrders={overviewOrders} warehouseDocs={docs} deliveryTrips={overviewTrips} onSearchDoc={()=>{}} currentUser={admin} />);
  assert(text(salesChart()?.parentElement?.parentElement?.parentElement).includes('ไม่มีข้อมูลยอดขายตามช่วงเวลาที่เลือก'),'Empty selected period does not revive stale legacy sales trend');
  log('Executive Overview exports its applied period');

  await render(<NewReportModal isOpen onClose={()=>{}} {...source} onOpenPDFPreview={(dept,start,end)=>{request=createReportRequest(dept,start,end);}} />);
  assert(!text(document.getElementById('root')).includes('สรุปข้อมูลที่จะส่งออกในรายงาน'),'Export dialog omits the crossed-out data summary');
  await click(containingButton('ฝ่ายจัดส่ง (Logistics & Fleet)'));
  equal([...document.querySelectorAll('input[type=date]')].map(i=>i.value),['2026-09-01','2026-09-01'],'Global export uses delivery dates, not sales dates');
  await click(containingButton('ฝ่ายคลังสินค้า (Warehouse)'));
  equal([...document.querySelectorAll('input[type=date]')].map(i=>i.value),['2026-07-10','2026-07-10'],'Global export uses warehouse dates');
  log('Global export dialog uses the selected department date column');

  // Use the production authorization predicates, isolated from Firebase only.
  await render(preview({department:'sales',currentUser:{...admin,role:'sales_manager',allowedScreens:['sales']}}));
  assert(button('ฝ่ายคลัง').disabled&&button('ฝ่ายจัดส่ง').disabled&&button('ภาพรวมผู้บริหาร').disabled,'Restricted report tabs disabled');
  await click(button('ฝ่ายคลัง'));
  assert(text(report()).includes(expectedTitles.sales),'Restricted user cannot switch departments');
  log('Department permissions remain enforced');

  // Generate actual PDFs with the production capture pipeline. Only save() is
  // redirected to local test artifacts, so no download dialog is needed.
  for(const dept of ['sales','warehouse','delivery','overview']) {
    await render(preview({department:dept,startDate:'',endDate:''}));
    assert(text(report()).includes(expectedTitles[dept]),`PDF content ${dept}`);
    const previousCount=window.__exports.length;
    await click(document.getElementById('btn-download-pdf-doc'));
    assert(button('ฝ่ายขาย').disabled&&document.querySelector('input[type=date]').disabled,'Controls locked during capture');
    const deadline=Date.now()+30000;
    while(window.__exports.length===previousCount&&Date.now()<deadline) await act(async()=>{await new Promise(resolve=>setTimeout(resolve,100));});
    assert(window.__exports.length===previousCount+1,`Generated ${dept} PDF`);
    const exported=window.__exports.at(-1);
    const names={sales:'Sales_Performance',warehouse:'Warehouse_Operations',delivery:'Delivery_Logistics',overview:'Executive_Overview'};
    assert(exported.name.includes(names[dept]),`Filename matches ${dept}`);
    assert(exported.text.includes(expectedTitles[dept]),`Capture matches ${dept}`);
    assert(Math.abs(exported.width-210)<0.1&&Math.abs(exported.height-297)<0.1,'PDF A4 dimensions');
    assert(exported.size>5000&&exported.pages>=1,'PDF has rendered pages');
    log(`Actual A4 PDF: ${dept} (${exported.pages} pages)`);
  }
  await Promise.all(window.__pdfWrites);
  confetti.reset();
  await render(preview({department:'warehouse',startDate:'',endDate:''}));
  return {passed:window.__passes, exports:window.__exports.map(({text,...meta})=>meta)};
};

window.runOverviewResponsiveChecks = async () => {
  const longText='ชื่อลูกค้าและสถานที่จัดส่งที่ยาวเป็นพิเศษเพื่อทดสอบการแสดงผลโดยไม่ตัดข้อมูล';
  const longOrder=order('BK-LONG-001','2026-09-01',123456,{customer:longText,salesperson:'พนักงานฝ่ายขายชื่อยาวเป็นพิเศษสำหรับทดสอบหน้าจอขนาดเล็ก'});
  const longDoc=doc('BK-LONG-001','2026-09-02',{date:'-',receivedBookingDate:'2026-09-01',customer:longText,pickerName:longText});
  const longTrip=trip('BK-LONG-001',{deliveryNo:'DL-LONG-001',salesOrderNo:'BK-LONG-001',plannedDate:'-',orderDate:'2026-09-01',destination:longText,driverName:longText});
  await render(<ExecutiveOverview kpis={{}} trendData={[]} detailedOrders={[longOrder]} warehouseDocs={[longDoc]} deliveryTrips={[longTrip]} onSearchDoc={()=>{}} currentUser={admin} />);
  const departmentFilter=[...document.querySelectorAll('select')].find(select=>[...select.options].some(option=>option.value==='คลังสินค้า'));
  for(const department of ['ทั้งหมด','ฝ่ายขาย','คลังสินค้า','การจัดส่ง']) {
    await change(departmentFilter,department);
    await click(document.getElementById('btn-overview-filter-submit'));
    const pageWidth=document.documentElement.scrollWidth;
    assert(pageWidth<=window.innerWidth+2,`Overview ${department} fits the ${window.innerWidth}px viewport without page-level horizontal overflow (${pageWidth}px)`);
    for(const card of document.querySelectorAll('[id^="card-"]')) {
      assert(card.scrollWidth<=card.clientWidth+2,`KPI card ${card.id} does not clip text at ${window.innerWidth}px`);
      assert(!card.querySelector('.truncate'),`KPI card ${card.id} shows its full title and note`);
    }
    assert(!['สรุปผลงานฝ่ายขายและพนักงานขาย','รายการเอกสารคลังสินค้าตามตัวกรอง','รายการเที่ยวจัดส่งตามตัวกรอง'].some(title=>text(document.getElementById('root')).includes(title)),`No expanded department detail at ${window.innerWidth}px`);
  }
  log(`Overview layout and KPI text at ${window.innerWidth}px`);
  return {width:window.innerWidth};
};

window.runSystemChecks = async () => {
  await render(null);
  let loggedIn = null;
  window.__loginError = 'Account is not authorized';
  await render(<LoginView onLoginSuccess={user=>{loggedIn=user;}} />);
  await click(containingButton('เข้าสู่ระบบด้วย Google'));
  assert(text(document.querySelector('[role=alert]')).includes('not authorized') && !loggedIn, 'Denied Google login stays on login screen');
  window.__loginError = '';
  window.__loginUser = admin;
  await click(containingButton('เข้าสู่ระบบด้วย Google'));
  assert(loggedIn?.uid === admin.uid, 'Authorized Google login callback');
  log('Login screen handles denied accounts and successful authentication callbacks');

  let screen = '';
  const manager = {...admin,role:'sales_manager',allowedScreens:['overview','sales']};
  await render(<Sidebar currentScreen="sales" currentUser={manager} onSelectScreen={value=>screen=value} onOpenNewReport={()=>{}} onOpenSettings={()=>{}} onLogout={()=>{}} />);
  await click(document.getElementById('nav-item-warehouse'));
  assert(screen === '' && document.getElementById('nav-item-warehouse').disabled, 'Sidebar blocks other departments');
  await click(document.getElementById('nav-item-overview'));
  equal(screen,'overview','Permitted navigation works');
  log('Sidebar enforces role and department permissions on navigation');

  await render(<SettingsModal isOpen currentUser={manager} onClose={()=>{}} />);
  assert(document.getElementById('tab-kpi-targets').disabled && !document.getElementById('btn-save-settings'), 'Non-admin cannot edit KPI settings');
  await render(null);
  await render(<SettingsModal isOpen currentUser={admin} onClose={()=>{}} />);
  assert(!document.getElementById('tab-kpi-targets').disabled, 'Admin can open KPI settings');
  const targetIds=['target-warehouse-completion','target-warehouse-picking-days','target-sales-monthly','target-sales-average-bill','target-delivery-completion','target-delivery-sales-to-loaded-days'];
  equal(targetIds.map(id=>Number(document.getElementById(id)?.value)),[80,2,2,20000,80,6],'Six department KPI goals load with configured and requested defaults');
  assert(!text(document.getElementById('root')).includes('On-Time Delivery')&&!text(document.getElementById('root')).includes('Fleet Utilization'),'Removed KPI goals are absent from settings');
  await change(document.getElementById('target-sales-average-bill'),'25000');
  await click(document.getElementById('btn-save-settings'));
  assert(window.__savedTargets?.averageSalesPerBillTargetBaht===25000&&window.__savedTargets?.deliveryCompletionTargetPercent===80&&!Object.hasOwn(window.__savedTargets,'slaTargetPercent'),'Admin submits only the six new department goals');
  log('Settings hides KPI editing from non-admins and submits admin settings');

  for (const node of [<HelpModal isOpen onClose={()=>{}} />, <ProfileModal isOpen currentUser={admin} onClose={()=>{}} onLogout={()=>{}} onUpdateUser={()=>{}} />, <Header currentScreen="warehouse" currentUser={admin} onOpenSettings={()=>{}} onOpenHelp={()=>{}} onOpenProfile={()=>{}} />]) {
    await render(node);
    assert(document.getElementById('root').textContent.trim().length > 20,'Information screen renders');
  }
  log('Help, profile and header render without runtime errors');

  const tracked = {...trip('BK1'),salesOrderNo:'BK1',deliveryNo:'DLV1',loadedDate:undefined,status:'in_transit'};
  await render(<DocumentTrackingModal docNo="dlv-1" detailedSalesOrders={orders} warehouseDocs={[]} deliveryTrips={[tracked]} onClose={()=>{}} />);
  assert(text(document.getElementById('root')).includes('รอเริ่มจัดส่ง'), 'Tracking resolves delivery alias and does not invent loading from in-transit status');
  await render(<DocumentTrackingModal docNo="BK1" detailedSalesOrders={orders} deliveryTrips={[{...tracked,loadedDate:'2026-09-03',status:'delayed'}]} onClose={()=>{}} />);
  assert(text(document.getElementById('root')).includes('โหลดสินค้าแล้ว (Loaded)'), 'Loaded evidence takes precedence over old delayed label');
  await render(<DocumentTrackingModal docNo="missing" onClose={()=>{}} />);
  assert(text(document.getElementById('root')).includes('ไม่พบ'), 'Unknown booking has clear empty state');
  await render(<BookingTrackingSection rows={buildBookingTracking(orders,[],[])} />);
  await change(document.querySelector('input'), 'BKR3');
  assert(text(document.querySelector('tbody')).includes('BKR3')&&!text(document.querySelector('tbody')).includes('BKET2'),'Booking search restricts results');
  log('Booking tracking: aliases, incomplete loading, completion evidence and no-result searches');

  for(const dept of ['warehouse','delivery']) {
    const records=Array.from({length:26},(_,i)=> dept==='warehouse' ? doc(`PAGE${i+1}`,'2026-07-12') : trip(`PAGE${i+1}`));
    await render(null);
    await render(dept==='warehouse' ? <WarehouseReportView docs={records} onSelectDoc={()=>{}} currentUser={admin} /> : <DeliveryReportView trips={records} onSelectDoc={()=>{}} currentUser={admin} />);
    equal(document.querySelectorAll('tbody tr').length,10,`${dept} initial page has 10 bills`);
    await click(document.querySelector('button[aria-label="หน้าถัดไป"]'));
    assert(text(document.querySelector('tbody')).includes('PAGE11'),`${dept} next page advances`);
    await change(document.getElementById(`${dept}-page-size`),'25');
    equal(document.querySelectorAll('tbody tr').length,25,`${dept} page size changes`);
    await click(containingButton('Export Excel'));
    const excelExport=window.__excelExports.at(-1);
    equal(excelExport.rows.length,26,`${dept} exports all filtered rows, including other pages`);
    if(dept==='warehouse') {
      equal(excelExport.sheets.map(sheet=>sheet.name),['สรุป KPI','สรุปรายวัน','สรุปรายเดือน','สถานะการจัดสินค้า'],'Warehouse Excel exports current summary and trend sheets');
      assert(excelExport.sheets[0].rows.some(row=>row['รายการ']==='จำนวนที่จัดได้ทั้งหมด'&&row['ค่า']===26),'Warehouse Excel summary matches filtered total');
      assert(excelExport.sheets[0].rows.some(row=>row['รายการ']==='อัตราจัดสำเร็จ (%)'&&row['ค่า']===100),'Warehouse Excel exports the completion rate shown on the dashboard');
      assert(excelExport.sheets[0].rows.some(row=>row['รายการ']==='Lead Time เฉลี่ย (วัน)'&&row['ค่า']===2),'Warehouse Excel exports the average lead time shown below the table');
      equal(Object.keys(excelExport.sheets[3].rows[0]),['เลขที่ใบจอง','ลูกค้า','วันที่เปิดบิลขาย','วันที่รับใบจอง','วันที่จัดเสร็จ','จำนวนวันค้างจัดของ','Lead Time (วัน)','จำนวนรายการ'],'Warehouse Excel detail columns match the visible report table');
    }
  }
  log('Warehouse and delivery pagination, page sizes and Excel export include all filtered bills');

  await render(<GoogleSheetIntegrationModal isOpen targetDepartment="sales" currentUser={manager} filesState={{}} onClose={()=>{}} onUpdateFiles={()=>{}} onProcessComplete={()=>{}} />);
  assert(document.getElementById('input-sales-sheet-url')&&!document.getElementById('input-warehouse-sheet-url'),'Sheet setup shows only permitted department');
  await change(document.getElementById('input-sales-sheet-url'),'');
  await click(document.getElementById('btn-sync-dept-sales'));
  assert(document.getElementById('btn-sync-dept-sales').disabled, 'Sheet setup blocks a missing link');
  log('Sheet setup limits department controls and validates missing source URL');
  await render(null);
  return {passed:window.__passes};
};

window.runPaginationChecks = async () => {
  const validatePages = expectedRows => {
    const pages=[...report().querySelectorAll('[data-pdf-page]')];
    assert(pages.length>1,'Long report must have more than one A4 page');
    for(const page of pages) {
      const content=page.querySelector('.pdf-page-content');
      const bounds=content.getBoundingClientRect();
      assert(content.lastElementChild.getBoundingClientRect().bottom<=bounds.bottom+0.5,'No block extends below the paper content area');
      assert(page.scrollWidth<=page.clientWidth+1,'No content extends beyond A4 width');
      for(const row of content.querySelectorAll('tr')) {
        const rect=row.getBoundingClientRect();
        assert(rect.top>=bounds.top-0.5&&rect.bottom<=bounds.bottom+0.5,'Each table row stays entirely on one page');
      }
      assert(text(page.querySelector('.pdf-page-number')).includes(`/ ${pages.length}`),'Every page has a page number');
    }
    for(const table of ['sales-customers','sales-products','sales-reps']) {
      equal(report().querySelectorAll(`[data-pdf-table="${table}"] tbody tr`).length,expectedRows,`All ${table} rows preserved exactly once`);
      for(const fragment of report().querySelectorAll(`[data-pdf-table="${table}"]`)) assert(fragment.tHead&&fragment.tBodies[0].rows.length,'Every table fragment has headers and rows');
    }
    return pages.length;
  };
  const longOrders=Array.from({length:10},(_,index)=>order(`BK-LONG-${index}`,'2026-08-15',200029-index*15000,{
    customer:`ลูกค้า ${index+1} ร้านรุ่งเรือง อาหารสัตว์ (สาขาตลาดทองไท คลองใหญ่) จังหวัดปราจีนบุรี`,
    salesperson:`พนักงานขาย ${index+1} ผู้ดูแลลูกค้าเขตภาคตะวันออก`,
    items:[{...item(100+index),productCode:`LONG-${index}`,productName:`สินค้า ${index+1} +OKIKO CLASSIC อาหารสัตว์ สูตรแมวและสุนัข บรรจุ 10 กิโลกรัม [ x 6.00 ]`}],
  }));
  await render(preview({department:'sales',startDate:'2026-08-01',endDate:'2026-08-31',detailedSalesOrders:longOrders}));
  const pages=validatePages(10);
  const before=window.__exports.length;
  await click(document.getElementById('btn-download-pdf-doc'));
  const deadline=Date.now()+30000;
  while(window.__exports.length===before&&Date.now()<deadline) await act(async()=>{await new Promise(resolve=>setTimeout(resolve,100));});
  assert(window.__exports.length===before+1,'Long report PDF generated');
  equal(window.__exports.at(-1).pages,pages,'Download has exactly the preview page count');
  log('Long Thai names and all Top 10 rows fit complete A4 pages without clipping');

  // Make both parallel tables taller than a whole page to exercise row-level
  // continuation, including columns with substantially different row heights.
  const stressOrders=longOrders.map((o,index)=>({...o,
    customer:o.customer+(index%2?' รายละเอียดสาขา'.repeat(15):''),
    items:o.items.map(i=>({...i,productName:i.productName+' รายละเอียดสินค้า'.repeat(26)})),
  }));
  await render(<PDFReportPreviewModal isOpen={false} onClose={()=>{}} />);
  await render(preview({department:'sales',startDate:'2026-08-01',endDate:'2026-08-31',detailedSalesOrders:stressOrders}));
  const stressPages=validatePages(10);
  assert(report().querySelectorAll('[data-pdf-table="sales-products"]').length>1,'Oversized tables continue with repeated headers');
  log('Oversized parallel tables split between rows with repeated headers and no lost data');
  await Promise.all(window.__pdfWrites);
  confetti.reset();
  // Leave the realistic case on screen for native print and visual inspection.
  await render(<PDFReportPreviewModal isOpen={false} onClose={()=>{}} />);
  await render(preview({department:'sales',startDate:'2026-08-01',endDate:'2026-08-31',detailedSalesOrders:longOrders}));
  return {pages:validatePages(10),stressPages};
};

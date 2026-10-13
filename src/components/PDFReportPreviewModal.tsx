import { useReportTargets } from '../hooks/useReportTargets';
import { buildDepartmentGoalGroups, formatGoalValue, type GoalMetric } from '../utils/departmentGoals';
import { buildBookingTracking, filterBookingTracking } from '../utils/bookingTracking';
import { ReportFilters } from '../utils/reportRequest';
import { calculateSalesReportMetrics, calculateSalesCustomers, calculateSalesTotals, filterSalesOrders, getSalesDocumentType } from '../utils/salesReportMetrics';
import { aggregateWarehouseDocs, filterWarehouseDocs, calculateWarehouseMetrics, aggregateDeliveryTrips, filterDeliveryTrips, calculateDeliveryMetrics, getWarehouseReportDate, getDeliveryReportDate } from '../utils/logisticsReportMetrics';
import { canAccessReport } from '../lib/authControl';
import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PaginatedReport } from './PaginatedReport';
import { 
  X, 
  Download, 
  Printer, 
  FileText, 
  TrendingUp, 
  Warehouse, 
  Truck, 
  LayoutGrid, 
  CheckCircle2, 
  Calendar,
  Building2,
  Receipt,
  Users,
  Award,
  Package,
  Clock,
  AlertCircle
} from 'lucide-react';
import { 
  DetailedSalesOrder, 
  SalesRepPerformance, 
  WarehouseDoc, 
  DeliveryTrip, 
  TopProductItem, 
  CustomerSpender,
  KPIStats,
  AuthUser
} from '../types';
import { exportElementToPDF } from '../utils/pdfExport';
import { getMinMaxDates, normalizeDateToISO } from '../utils/dateUtils';
import confetti from 'canvas-confetti';

const PDFGoalMetric = ({ metric, color }: { metric: GoalMetric; color: string }) => {
  const scale = metric.unit === 'percent' ? 100 : Math.max(metric.actual ?? 0, metric.target, 1) * 1.1;
  const resultWidth = metric.actual === null ? 0 : Math.min(100, Math.max(0, metric.actual / scale * 100));
  const targetPosition = Math.min(100, Math.max(0, metric.target / scale * 100));
  const met = metric.actual !== null && (metric.direction === 'higher' ? metric.actual >= metric.target : metric.actual <= metric.target);
  return <div className="space-y-1.5" data-testid={`pdf-goal-${metric.id}`} data-pdf-section>
    <p className="text-[11px] font-bold text-slate-800">{metric.label}</p>
    <div className="flex items-center justify-between gap-2 text-[10px]">
      <span className="font-bold text-slate-900">ผลจริง {metric.actual === null ? '—' : formatGoalValue(metric.actual, metric.unit)}</span>
      <span className="font-semibold text-slate-600">เป้าหมาย {metric.direction === 'higher' ? '≥' : '≤'} {formatGoalValue(metric.target, metric.unit)}</span>
    </div>
    <div className="relative h-2.5 rounded-full bg-slate-100">
      <div className="h-full rounded-full" style={{ width: `${resultWidth}%`, backgroundColor: color }} />
      <div className="absolute -top-0.5 h-3.5 w-0.5 bg-slate-800" style={{ left: `${targetPosition}%` }} />
    </div>
    <div className="flex justify-between gap-2 text-[9px]">
      <span className="text-slate-500">{metric.note}</span>
      <span className={metric.actual === null ? 'text-slate-500' : met ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>
        {metric.actual === null ? 'ไม่มีข้อมูล' : met ? 'ถึงเป้าหมาย' : metric.direction === 'higher' ? 'ต่ำกว่าเป้าหมาย' : 'เกินเป้าหมาย'}
      </span>
    </div>
  </div>;
};

export interface PDFReportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  department?: 'overview' | 'sales' | 'warehouse' | 'delivery' | 'all';
  startDate?: string;
  endDate?: string;
  reportFilters?: ReportFilters | null;
  currentUser?: AuthUser | null;
  kpis?: KPIStats;
  detailedSalesOrders?: DetailedSalesOrder[];
  salesReps?: SalesRepPerformance[];
  warehouseDocs?: WarehouseDoc[];
  deliveryTrips?: DeliveryTrip[];
  topProducts?: TopProductItem[];
  topSpenders?: CustomerSpender[];
  salesSummary?: any;
  warehouseSummary?: any;
  deliverySummary?: any;
}

// Closing unmounts the session. A new request starts from its own department,
// range and source snapshot; switching tabs never resets from dataset bounds.
export const PDFReportPreviewModal: React.FC<PDFReportPreviewModalProps> = (props) =>
  props.isOpen ? <PDFReportSession key={JSON.stringify([props.department, props.startDate, props.endDate, props.reportFilters])} {...props} /> : null;

const PDFReportSession: React.FC<PDFReportPreviewModalProps> = (props) => {
  const [snapshot] = useState(props);
  return <PDFReportContent {...snapshot} currentUser={props.currentUser} onClose={props.onClose} />;
};

const PDFReportContent: React.FC<PDFReportPreviewModalProps> = ({
  isOpen,
  onClose,
  department = 'sales',
  startDate,
  endDate,
  reportFilters,
  currentUser,
  detailedSalesOrders = [],
  salesReps = [],
  warehouseDocs = [],
  deliveryTrips = [],
}) => {
  const [activeDept, setActiveDept] = useState<'overview' | 'sales' | 'warehouse' | 'delivery' | 'all'>(department === 'all' ? 'overview' : department);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  const printContainerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  const handleLayout = React.useCallback((pages: number, error: string | null) => {
    setPageCount(pages);
    setPaginationError(error);
  }, []);
  const reportTargets = useReportTargets();
  const { warehousePickingLeadTimeTarget, monthlySalesTarget } = reportTargets;

  const safeSalesOrders = React.useMemo(() => detailedSalesOrders, [detailedSalesOrders]);
  const safeWarehouseDocs = React.useMemo(() => warehouseDocs, [warehouseDocs]);
  const safeDeliveryTrips = React.useMemo(() => deliveryTrips, [deliveryTrips]);
  const safeSalesReps = React.useMemo(() => salesReps, [salesReps]);

  // Use the same source date as each department dashboard when opening a PDF.
  const datasetDateRange = React.useMemo(() => {
    const salesDates = safeSalesOrders.map((order) => order.date);
    const warehouseDates = safeWarehouseDocs.map(getWarehouseReportDate);
    const deliveryDates = safeDeliveryTrips.map(getDeliveryReportDate);
    const dates = activeDept === 'sales'
      ? salesDates
      : activeDept === 'warehouse'
        ? warehouseDates
        : activeDept === 'delivery'
          ? deliveryDates
          : [...salesDates, ...warehouseDates, ...deliveryDates];
    return getMinMaxDates(dates, '', '');
  }, [activeDept, safeSalesOrders, safeWarehouseDocs, safeDeliveryTrips]);

  const [activeStartDate, setActiveStartDate] = useState<string>(startDate ?? datasetDateRange.min);
  const [activeEndDate, setActiveEndDate] = useState<string>(endDate ?? datasetDateRange.max);

  const salesFilters = reportFilters?.department === 'sales' && activeDept === 'sales' ? reportFilters : null;
  const filteredOrders = React.useMemo(() => filterSalesOrders(safeSalesOrders, {
    fromDate: activeStartDate, toDate: activeEndDate,
    docType: salesFilters?.docType, searchQuery: salesFilters?.search,
  }), [safeSalesOrders, activeStartDate, activeEndDate, salesFilters]);
  const salesMetrics = React.useMemo(() => calculateSalesReportMetrics(filteredOrders, safeSalesReps, monthlySalesTarget), [filteredOrders, safeSalesReps, monthlySalesTarget]);
  const {totalRevenue, totalOrders: totalOrdersCount, averageTicket: avgTicket} = calculateSalesTotals(filteredOrders);
  const displaySalesReps = salesMetrics.computedReps;
  const displayTopProducts = salesMetrics.allProducts;
  const displayTopSpenders = React.useMemo(() => calculateSalesCustomers(filteredOrders).allSpenders, [filteredOrders]);
  const normalBills = filteredOrders.filter(o => getSalesDocumentType(o) === 'BK');
  const specialBills = filteredOrders.filter(o => getSalesDocumentType(o) === 'BKET');
  const claimBills = filteredOrders.filter(o => getSalesDocumentType(o) === 'BKR');
  const normalBillsAmt = calculateSalesTotals(normalBills).totalRevenue;
  const specialBillsAmt = calculateSalesTotals(specialBills).totalRevenue;
  const claimBillsAmt = calculateSalesTotals(claimBills).totalRevenue;

  const aggregatedWarehouseDocs = React.useMemo(() => aggregateWarehouseDocs(safeWarehouseDocs, safeSalesOrders), [safeWarehouseDocs, safeSalesOrders]);
  const warehouseFilters = reportFilters?.department === 'warehouse' && activeDept === 'warehouse' ? reportFilters : null;
  const filteredWarehouseDocs = React.useMemo(() => filterWarehouseDocs(aggregatedWarehouseDocs, {
    ...warehouseFilters, fromDate: activeStartDate, toDate: activeEndDate,
  }, warehousePickingLeadTimeTarget), [aggregatedWarehouseDocs, activeStartDate, activeEndDate, warehouseFilters, warehousePickingLeadTimeTarget]);
  const {
    totalDocsCount: totalWarehouseDocs, completedDocsCount: completedWarehouseDocs,
    pendingDocsCount: pendingWarehouseDocs, completionPercent: warehouseCompletionRate,
    leadTimeUnavailableDocs: warehouseLeadTimeUnavailableDocs,
    leadTimeStats: warehouseLeadTimeStats, monthlySummaries: warehouseMonthlySummaries,
  } = React.useMemo(() => calculateWarehouseMetrics(filteredWarehouseDocs, warehousePickingLeadTimeTarget), [filteredWarehouseDocs, warehousePickingLeadTimeTarget]);

  const groupedDeliveryTrips = React.useMemo(() => aggregateDeliveryTrips(safeDeliveryTrips, safeSalesOrders), [safeDeliveryTrips, safeSalesOrders]);
  const deliveryFilters = reportFilters?.department === 'delivery' && activeDept === 'delivery' ? reportFilters : null;
  const filteredDeliveryTrips = React.useMemo(() => filterDeliveryTrips(groupedDeliveryTrips, {
    ...deliveryFilters, fromDate: activeStartDate, toDate: activeEndDate,
  }), [groupedDeliveryTrips, activeStartDate, activeEndDate, deliveryFilters]);
  const {
    totalBillsCount: totalTrips, completedBillsCount: completedTrips,
    completedBillsRate: deliveryCompletionRate, totalWeight: totalWeightTon,
    uniqueVehiclesCount, pendingDeliveriesCount, delayed: delayedTrips,
    leadTimeStats: deliveryLeadTimeStats,
  } = React.useMemo(() => calculateDeliveryMetrics(filteredDeliveryTrips), [filteredDeliveryTrips]);
  const bookingRows = React.useMemo(() => buildBookingTracking(safeSalesOrders, safeWarehouseDocs, safeDeliveryTrips), [safeSalesOrders, safeWarehouseDocs, safeDeliveryTrips]);
  const periodBookingRows = React.useMemo(() => filterBookingTracking(bookingRows, '', activeStartDate, activeEndDate), [bookingRows, activeStartDate, activeEndDate]);
  const departmentGoalGroups = React.useMemo(() => buildDepartmentGoalGroups({
    orders: filteredOrders,
    warehouseDocs: filteredWarehouseDocs,
    deliveryTrips: filteredDeliveryTrips,
    bookingRows: periodBookingRows,
    startDate: activeStartDate,
    endDate: activeEndDate,
    targets: reportTargets,
    department: activeDept === 'overview' || activeDept === 'all' ? 'all' : activeDept,
  }), [filteredOrders, filteredWarehouseDocs, filteredDeliveryTrips, periodBookingRows, activeStartDate, activeEndDate, reportTargets, activeDept]);
  const salesMonthlyGoal = departmentGoalGroups.flatMap(group => group.metrics).find(metric => metric.id === 'sales-monthly');
  const salesMonthlyTrend = React.useMemo(() => {
    const buckets = new Map<string, DetailedSalesOrder[]>();
    filteredOrders.forEach(order => {
      const month = normalizeDateToISO(order.date).slice(0, 7);
      if (!month) return;
      const rows = buckets.get(month) || [];
      rows.push(order);
      buckets.set(month, rows);
    });
    return [...buckets].sort(([left], [right]) => left.localeCompare(right)).map(([month, rows]) => ({
      month, orders: rows.length, revenue: calculateSalesTotals(rows).totalRevenue,
    }));
  }, [filteredOrders]);
  const maxMonthlyRevenue = Math.max(1, ...salesMonthlyTrend.map(month => month.revenue));
  const activeRowCount = activeDept === 'sales' ? totalOrdersCount
    : activeDept === 'warehouse' ? totalWarehouseDocs
    : activeDept === 'delivery' ? totalTrips
    : totalOrdersCount + totalWarehouseDocs + totalTrips;
  const activeFilters = reportFilters?.department === activeDept ? reportFilters : null;
  const statusLabels: Record<string, string> = { completed: 'เสร็จแล้ว', pending_all: 'บิลค้างจัด', delayed: 'ล่าช้า', in_transit: 'รอขึ้นรถ' };
  const filterDescription = [
    activeFilters?.docType && activeFilters.docType !== 'ALL' ? `ประเภทบิล: ${activeFilters.docType}` : '',
    activeFilters?.status && activeFilters.status !== 'all' ? `สถานะ: ${statusLabels[activeFilters.status] || activeFilters.status}` : '',
    activeFilters?.search ? `คำค้น: ${activeFilters.search}` : '',
    activeFilters?.vehicle && activeFilters.vehicle !== 'all' ? `ทะเบียน: ${activeFilters.vehicle}` : '',
  ].filter(Boolean).join(' · ');

  // Current Date/Time for Report Header
  const reportDateFormatted = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Stable report document number
  const reportDocNo = React.useMemo(() => {
    const now = new Date();
    const yr = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    return `RPT-${yr}${mo}-${Math.floor(1000 + Math.random() * 9000)}`;
  }, [isOpen, activeDept]);

  const getDeptTitle = () => {
    switch (activeDept) {
      case 'overview':
        return 'รายงานสรุปภาพรวมผู้บริหาร (Executive Overview Summary Report)';
      case 'sales':
        return 'รายงานสรุปผลการดำเนินงานฝ่ายขาย (Sales Executive Summary Report)';
      case 'warehouse':
        return 'รายงานสรุปผลการดำเนินงานฝ่ายคลังสินค้า (Warehouse Executive Summary Report)';
      case 'delivery':
        return 'รายงานสรุปผลการดำเนินงานฝ่ายจัดส่ง (Logistics Executive Summary Report)';
      case 'all':
        return 'รายงานสรุปผลการดำเนินงานภาพรวม(Integrated Executive Report)';
    }
  };

  const handleDownloadPDF = async () => {
    if (!canAccessReport(currentUser, activeDept)) return;
    if (!printContainerRef.current || isExporting || !pageCount || paginationError) return;
    setIsExporting(true);
    setExportProgress(10);
    setExportError(null);
    setExportSuccess(false);

    const deptFileNameMap = {
      overview: 'Executive_Overview_Report',
      sales: 'Sales_Performance_Report',
      warehouse: 'Warehouse_Operations_Report',
      delivery: 'Delivery_Logistics_Report',
      all: 'Integrated_3Dept_Report',
    };

    const fileName = `TechnicPet_${deptFileNameMap[activeDept] || 'Report'}_${activeStartDate || 'all'}_to_${activeEndDate || 'all'}.pdf`;

    try {
      const success = await exportElementToPDF({
        element: printContainerRef.current,
        fileName: fileName,
        orientation: 'portrait',
        quality: 2,
        onProgress: (p) => setExportProgress(p),
      });

      setIsExporting(false);
      if (success) {
        setExportSuccess(true);
        confetti({ particleCount: 50, origin: { y: 0.7 } });
        setTimeout(() => setExportSuccess(false), 5000);
      } else {
        setExportError('ไม่สามารถสร้างไฟล์ PDF ได้ กรุณาลองใช้ปุ่ม "พิมพ์ / Print" เพื่อบันทึกเป็น PDF');
      }
    } catch (err: any) {
      console.error(err);
      setIsExporting(false);
      setExportError('เกิดข้อผิดพลาดในการดาวน์โหลด PDF กรุณาลองใหม่อีกครั้ง หรือใช้ปุ่ม พิมพ์ / Print');
    }
  };

  const handleBrowserPrint = () => {
    if (!canAccessReport(currentUser, activeDept) || !pageCount || paginationError || isExporting) return;
    window.print();
  };

  if (!isOpen || !canAccessReport(currentUser, activeDept)) return null;

  const modal = (
    <div className="pdf-report-modal fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <style>{`@media print { @page { size: A4 portrait; margin: 0; } }`}</style>
      <div className="pdf-report-dialog bg-slate-100 rounded-2xl sm:rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-300 flex flex-col max-h-[95vh] overflow-hidden my-auto animate-in zoom-in-95 duration-200">
        
        {/* Modal Top Control Bar */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0a2558] text-white flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  หน้าต่างพิมพ์ & ส่งออกรายงาน PDF (PDF Report Preview)
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                  A4 · {pageCount || '…'} หน้า
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                เลือกรูปแบบฝ่ายที่ต้องการ และดาวน์โหลดไฟล์ PDF คุณภาพสูง หรือสั่งพิมพ์รายงาน
              </p>
            </div>
          </div>

          {/* Department Switcher Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            {[
              { id: 'sales', label: 'ฝ่ายขาย', icon: <TrendingUp className="w-3.5 h-3.5" /> },
              { id: 'warehouse', label: 'ฝ่ายคลัง', icon: <Warehouse className="w-3.5 h-3.5" /> },
              { id: 'delivery', label: 'ฝ่ายจัดส่ง', icon: <Truck className="w-3.5 h-3.5" /> },
              { id: 'overview', label: 'ภาพรวมผู้บริหาร', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                disabled={isExporting || !canAccessReport(currentUser, tab.id as any)}
                onClick={() => { if (!isExporting && canAccessReport(currentUser, tab.id as any)) { setActiveDept(tab.id as any); setExportError(null); setExportSuccess(false); } }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activeDept === tab.id
                    ? 'bg-[#0a2558] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isExporting || !pageCount || !!paginationError}
              onClick={handleBrowserPrint}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center gap-2 cursor-pointer shadow-2xs"
              title="พิมพ์เอกสารออกเครื่องพิมพ์ / บันทึกด้วย Print Dialog"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span className="hidden sm:inline">พิมพ์ / Print</span>
            </button>

            <button
              type="button"
              id="btn-download-pdf-doc"
              onClick={handleDownloadPDF}
              disabled={isExporting || !pageCount || !!paginationError}
              className="px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-all flex items-center gap-2 shadow-xs cursor-pointer"
            >
              {isExporting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                  <span>กำลังแปลงเป็น PDF ({exportProgress}%)...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>ดาวน์โหลด PDF (.pdf)</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isExporting}
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Notification Banners */}
        {(exportError || paginationError) && (
          <div className="bg-rose-50 border-b border-rose-200 px-6 py-2.5 flex items-center justify-between text-xs text-rose-800 animate-in fade-in duration-150 print:hidden">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{exportError || paginationError}</span>
            </div>
            <button
              onClick={() => setExportError(null)}
              className="text-rose-500 hover:text-rose-800 text-xs font-bold"
            >
              ปิด
            </button>
          </div>
        )}

        {exportSuccess && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 flex items-center justify-between text-xs text-emerald-800 animate-in fade-in duration-150 print:hidden">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>ดาวน์โหลดไฟล์ PDF รายงานสำเร็จเรียบร้อย!</span>
            </div>
            <button
              onClick={() => setExportSuccess(false)}
              className="text-emerald-500 hover:text-emerald-800 text-xs font-bold"
            >
              ปิด
            </button>
          </div>
        )}

        {/* Quick Date Range & Filter Toolbar */}
        <div className="bg-slate-100 border-b border-slate-200 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#0a2558]" />
              <span>ช่วงวันที่รายงาน:</span>
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                disabled={isExporting}
                value={activeStartDate}
                onChange={(e) => setActiveStartDate(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono text-xs focus:ring-1 focus:ring-blue-500 shadow-2xs"
              />
              <span className="text-slate-400">ถึง</span>
              <input
                type="date"
                disabled={isExporting}
                value={activeEndDate}
                onChange={(e) => setActiveEndDate(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono text-xs focus:ring-1 focus:ring-blue-500 shadow-2xs"
              />
            </div>
            <button
              type="button"
              disabled={isExporting}
              onClick={() => {
                setActiveStartDate(datasetDateRange.min);
                setActiveEndDate(datasetDateRange.max);
              }}
              className="px-3 py-1 bg-slate-200 hover:bg-slate-300 rounded-lg text-slate-700 font-semibold transition-colors cursor-pointer"
            >
              แสดงข้อมูลทั้งหมด ({datasetDateRange.min} ถึง {datasetDateRange.max})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeRowCount === 0 ? (
              <span className="text-[11px] text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200 font-medium">
                ไม่พบข้อมูลตามตัวกรองที่เลือก (0 รายการ)
              </span>
            ) : (
              <span className="text-[11px] text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200 font-medium">
                ข้อมูลตามตัวกรอง: <strong className="text-slate-900">{activeRowCount}</strong> รายการ
              </span>
            )}
          </div>
        </div>

        {/* Scrollable Printable A4 Report Canvas */}
        <div className="pdf-preview-scroll p-4 sm:p-8 overflow-auto flex-1 bg-slate-200/80">
          <PaginatedReport
            reportRef={printContainerRef}
            revision={JSON.stringify([activeDept, activeStartDate, activeEndDate, reportDocNo, reportTargets])}
            onLayout={handleLayout}
          >
            {/* 1. Formal Report Header */}
            <div className="border-b-2 border-slate-800 pb-4" data-pdf-section>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-[#0a2558] text-white flex items-center justify-center font-black text-xl shadow-xs shrink-0">
                    TP
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl font-black text-[#0a2558] tracking-tight whitespace-nowrap">
                      TECHNIC PET CO., LTD.
                    </h2>
                    <p className="text-xs font-semibold leading-relaxed text-slate-600 break-words">
                      ระบบบริหารจัดการและติดตามตัวชี้วัดองค์กร (KPI Management & Operations System)
                    </p>
                  </div>
                </div>

                <div className="max-w-[42%] min-w-0 text-right text-xs leading-relaxed space-y-1.5">
                  <div className="inline-block max-w-full px-3 py-1 bg-slate-100 rounded-lg border border-slate-200 font-mono font-bold text-slate-800 break-words">
                    เลขที่รายงาน: {reportDocNo}
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium break-words">
                    วันที่ออกเอกสาร: <span className="font-bold text-slate-700">{reportDateFormatted}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium break-words">
                    ผู้จัดทำ: <span className="font-bold text-slate-700">{currentUser?.displayName || currentUser?.name || '-'}</span>
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-200 pt-3 space-y-2">
                <h1 className="text-lg font-black leading-snug text-slate-900 break-words">
                  {getDeptTitle()}
                </h1>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="font-semibold text-slate-500">ช่วงข้อมูลที่ประมวลผล:</span>
                  <span className="font-bold text-[#0a2558] bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200 font-mono">
                    {activeStartDate || 'ไม่จำกัดวันเริ่มต้น'} ถึง {activeEndDate || 'ไม่จำกัดวันสิ้นสุด'}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. SALES REPORT SECTION */}
            {filterDescription && <p className="text-xs text-slate-600">ตัวกรอง: {filterDescription}</p>}
            {(activeDept === 'overview' || activeDept === 'all') && <div className="space-y-3" data-pdf-flow>
              <div className="border-b border-slate-200 pb-2" data-pdf-keep-next>
                <h3 className="text-sm font-black text-[#0a2558]">สรุปภาพรวมผู้บริหารตามช่วงวันที่เลือก</h3>
                <p className="text-[10px] text-slate-500">ข้อมูลและเงื่อนไขการคำนวณชุดเดียวกับหน้ารายงานภาพรวม</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px]" data-pdf-section>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 space-y-1">
                  <p className="font-black text-blue-900">ฝ่ายขาย</p>
                  <p>จำนวนคำสั่งซื้อ <strong>{totalOrdersCount.toLocaleString()} บิล</strong></p>
                  <p>ยอดขายรวม <strong>฿{totalRevenue.toLocaleString()}</strong></p>
                  <p>ยอดเฉลี่ยต่อบิล <strong>฿{avgTicket.toLocaleString()}</strong></p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 space-y-1">
                  <p className="font-black text-emerald-900">คลังสินค้า</p>
                  <p>รับเข้า <strong>{totalWarehouseDocs.toLocaleString()} ใบ</strong></p>
                  <p>จัดเสร็จ <strong>{completedWarehouseDocs.toLocaleString()} ใบ</strong></p>
                  <p>ค้างจัด <strong>{pendingWarehouseDocs.toLocaleString()} ใบ</strong></p>
                </div>
                <div className="rounded-xl border border-purple-200 bg-purple-50 p-2.5 space-y-1">
                  <p className="font-black text-purple-900">ขนส่ง</p>
                  <p>บิลทั้งหมด <strong>{totalTrips.toLocaleString()} ใบ</strong></p>
                  <p>โหลดสำเร็จ <strong>{completedTrips.toLocaleString()} ใบ</strong></p>
                  <p>ค้างส่ง / ล่าช้า <strong>{pendingDeliveriesCount.toLocaleString()} ใบ</strong></p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 space-y-2" data-pdf-flow data-testid="pdf-sales-trend">
                <div data-pdf-keep-next>
                  <h4 className="text-[11px] font-black text-slate-800">กราฟสถิติยอดขายรายเดือน</h4>
                  <p className="text-[9px] text-slate-500">ยอดขายรวมเป็นแถบ · จำนวนบิลขายแสดงทางขวา</p>
                </div>
                {salesMonthlyTrend.length ? salesMonthlyTrend.map(month => <div key={month.month} className="grid grid-cols-[65px_1fr_90px] items-center gap-2 text-[9px]" data-pdf-section>
                  <span className="font-semibold text-slate-600">{month.month}</span>
                  <div className="h-4 rounded bg-slate-100 relative overflow-hidden">
                    <div className="h-full rounded bg-[#0a2558]" style={{ width: `${Math.max(0, month.revenue) / maxMonthlyRevenue * 100}%` }} />
                    <span className="absolute inset-0 flex items-center justify-center font-bold text-slate-700">฿{month.revenue.toLocaleString()}</span>
                  </div>
                  <span className="text-right font-semibold text-sky-700">{month.orders.toLocaleString()} บิล</span>
                </div>) : <p className="text-[10px] text-slate-500">ไม่มีข้อมูลยอดขายตามช่วงเวลาที่เลือก</p>}
              </div>
            </div>}

            <div className="space-y-3" data-pdf-flow data-testid="pdf-department-goals">
              <div className="border-b border-slate-200 pb-2" data-pdf-keep-next>
                <h3 className="text-sm font-black text-[#0a2558]">ผลลัพธ์เทียบเป้าหมายรายแผนก ({activeDept === 'overview' || activeDept === 'all' ? 'ทั้งหมด' : activeDept === 'sales' ? 'ฝ่ายขาย' : activeDept === 'warehouse' ? 'คลังสินค้า' : 'การจัดส่ง'})</h3>
                <p className="text-[10px] text-slate-500">แถบสีคือผลจริง ขีดเข้มคือเป้าหมาย · ระยะเวลานับจากวันที่เปิดบิลขาย</p>
              </div>
              <div className={departmentGoalGroups.length === 1 ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-3 gap-2'}>
                {departmentGoalGroups.map(group => <section key={group.department} className="rounded-xl border border-slate-200 p-2.5 space-y-3" data-pdf-section>
                  <h4 className="text-xs font-black" style={{ color: group.color }}>{group.department}</h4>
                  {group.metrics.map(metric => <div key={metric.id}><PDFGoalMetric metric={metric} color={group.color} /></div>)}
                </section>)}
              </div>
            </div>

            {activeDept === 'sales' && (
              <div className="space-y-3.5" data-pdf-flow>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2" data-pdf-keep-next>
                  <h3 className="text-sm font-black text-[#0a2558] flex items-center gap-2 uppercase tracking-wide">
                    <TrendingUp className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>สรุปผลการดำเนินงานฝ่ายขาย (Sales KPIs & Highlights)</span>
                  </h3>
                  <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">
                    ยอดคำสั่งซื้อรวม {totalOrdersCount.toLocaleString()} บิล
                  </span>
                </div>

                {/* Sales KPI Cards */}
                <div className="grid grid-cols-4 gap-2.5 text-center">
                  <div className="p-2.5 bg-blue-50/70 rounded-xl border border-blue-200">
                    <p className="text-[10px] font-bold text-blue-800 uppercase whitespace-nowrap">ยอดขายรวมสุทธิ</p>
                    <p className="text-base font-black text-slate-900 mt-0.5 whitespace-nowrap">
                      ฿{totalRevenue.toLocaleString()}
                    </p>
                    <p className="text-[9px] text-slate-500 whitespace-nowrap">รวมทุกประเภทเอกสาร</p>
                  </div>
                  <div className="p-2.5 bg-emerald-50/70 rounded-xl border border-emerald-200">
                    <p className="text-[10px] font-bold text-emerald-800 uppercase whitespace-nowrap">จำนวนคำสั่งซื้อ</p>
                    <p className="text-base font-black text-slate-900 mt-0.5 whitespace-nowrap">
                      {totalOrdersCount.toLocaleString()} <span className="text-xs font-normal">บิล</span>
                    </p>
                    <p className="text-[9px] text-slate-500 whitespace-nowrap">จำนวนบิลในช่วงที่เลือก</p>
                  </div>
                  <div className="p-2.5 bg-purple-50/70 rounded-xl border border-purple-200">
                    <p className="text-[10px] font-bold text-purple-800 uppercase whitespace-nowrap">ยอดเฉลี่ยต่อบิล</p>
                    <p className="text-base font-black text-slate-900 mt-0.5 whitespace-nowrap">
                      ฿{avgTicket.toLocaleString()}
                    </p>
                    <p className="text-[9px] text-slate-500 whitespace-nowrap">Average Ticket Size</p>
                  </div>
                  <div className="p-2.5 bg-indigo-50/70 rounded-xl border border-indigo-200">
                    <p className="text-[10px] font-bold text-indigo-800 uppercase whitespace-nowrap">ยอดขายเฉลี่ยต่อเดือน</p>
                    <p className="text-base font-black text-slate-900 mt-0.5 whitespace-nowrap">
                      {salesMonthlyGoal?.actual === null || salesMonthlyGoal?.actual === undefined ? '—' : formatGoalValue(salesMonthlyGoal.actual, 'million-baht')}
                    </p>
                    <p className="text-[9px] text-slate-500 whitespace-nowrap">เป้าหมาย ≥ ฿{monthlySalesTarget.toLocaleString()} ล้าน/เดือน</p>
                  </div>
                </div>

                {/* Sales Doc Types Breakdown */}
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-3 gap-2.5 text-xs">
                  <div className="flex items-center justify-between border-r border-slate-200 pr-3">
                    <div>
                      <span className="px-2 py-0.5 rounded font-black text-[10px] bg-blue-100 text-blue-900 whitespace-nowrap">BK ปกติ</span>
                      <p className="text-xs font-black text-slate-800 mt-1 whitespace-nowrap">{normalBills.length} บิล</p>
                    </div>
                    <span className="font-bold text-blue-800 whitespace-nowrap">฿{normalBillsAmt.toLocaleString()}</span>
                  </div>

                  <div className="flex items-center justify-between border-r border-slate-200 pr-3">
                    <div>
                      <span className="px-2 py-0.5 rounded font-black text-[10px] bg-purple-100 text-purple-900 whitespace-nowrap">BKET พิเศษ</span>
                      <p className="text-xs font-black text-slate-800 mt-1 whitespace-nowrap">{specialBills.length} บิล</p>
                    </div>
                    <span className="font-bold text-purple-800 whitespace-nowrap">฿{specialBillsAmt.toLocaleString()}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="px-2 py-0.5 rounded font-black text-[10px] bg-rose-100 text-rose-900 whitespace-nowrap">BKR เคลม/รับคืน</span>
                      <p className="text-xs font-black text-slate-800 mt-1 whitespace-nowrap">{claimBills.length} บิล</p>
                    </div>
                    <span className="font-bold text-rose-800 whitespace-nowrap">฿{claimBillsAmt.toLocaleString()}</span>
                  </div>
                </div>

                {/* Top Sales Reps Table */}
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-amber-500" />
                    <span>อันดับผลงานพนักงานขายยอดเยี่ยม (Sales Representatives Ranking)</span>
                  </h4>
                  <div className="overflow-hidden border border-slate-200 rounded-xl text-xs">
                    <table className="w-full text-left border-collapse" data-pdf-table="sales-reps">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200">
                          <th className="py-2 px-3 w-12 text-center whitespace-nowrap">อันดับ</th>
                          <th className="py-2 px-3 whitespace-nowrap">ชื่อพนักงานขาย</th>
                          <th className="py-2 px-3 text-right whitespace-nowrap">ยอดขายจริง (บาท)</th>
                          <th className="py-2 px-3 text-center whitespace-nowrap">จำนวนบิล</th>
                          <th className="py-2 px-3 text-right whitespace-nowrap">% สัดส่วน</th>
                          <th className="py-2 px-3 text-right whitespace-nowrap">บรรลุเป้าหมาย</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {displaySalesReps.slice(0, 10).map((rep, idx) => (
                          <tr key={`pdf-rep-${idx}`} className={idx === 0 ? 'bg-amber-50/40' : 'bg-white'}>
                            <td className="py-1.5 px-3 text-center font-bold text-slate-700 whitespace-nowrap">#{idx + 1}</td>
                            <td className="py-1.5 px-3 font-bold text-slate-900 whitespace-nowrap">{rep.name}</td>
                            <td className="py-1.5 px-3 text-right font-black text-slate-900 whitespace-nowrap">{rep.salesFormatted}</td>
                            <td className="py-1.5 px-3 text-center whitespace-nowrap">{rep.ordersCount || 0}</td>
                            <td className="py-1.5 px-3 text-right font-semibold text-slate-700 whitespace-nowrap">{rep.shareOfTotalSales || 0}%</td>
                            <td className="py-1.5 px-3 text-right font-black text-emerald-700 whitespace-nowrap">{rep.completionRate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Top Customers & Top Products Compact Tables */}
                <div className="grid grid-cols-2 gap-3.5">
                  {/* Top 10 Customers */}
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>10 ลูกค้าที่มียอดสั่งซื้อสูงสุด (Top Spenders)</span>
                    </h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden text-[11px]">
                      <table className="w-full text-left" data-pdf-table="sales-customers">
                        <thead>
                          <tr className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                            <th className="p-1.5 px-2.5 whitespace-nowrap">ชื่อลูกค้า</th>
                            <th className="p-1.5 px-2.5 text-right whitespace-nowrap">ยอดซื้อรวม</th>
                            <th className="p-1.5 px-2.5 text-center whitespace-nowrap">บิล</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {displayTopSpenders.slice(0, 10).map((cust, i) => (
                            <tr key={`pdf-cust-${i}`} className="bg-white">
                              <td className="p-1.5 px-2.5 font-semibold text-slate-900 break-words leading-tight max-w-[190px]">{cust.customerName}</td>
                              <td className="p-1.5 px-2.5 text-right font-bold text-slate-800 whitespace-nowrap">{cust.totalAmountFormatted}</td>
                              <td className="p-1.5 px-2.5 text-center text-slate-600 whitespace-nowrap">{cust.ordersCount}</td>
                            </tr>
                          ))}
                          {displayTopSpenders.length === 0 && (
                            <tr>
                              <td colSpan={3} className="p-3 text-center text-slate-400">
                                ไม่พบข้อมูลลูกค้าในช่วงเวลาที่เลือก
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Top 10 Products */}
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <Package className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>10 สินค้าขายดีที่สุด (Top Products)</span>
                    </h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden text-[11px]">
                      <table className="w-full text-left" data-pdf-table="sales-products">
                        <thead>
                          <tr className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                            <th className="p-1.5 px-2.5 whitespace-nowrap">รายการสินค้า</th>
                            <th className="p-1.5 px-2.5 text-right whitespace-nowrap">จำนวน</th>
                            <th className="p-1.5 px-2.5 text-right whitespace-nowrap">ยอดรวม</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {displayTopProducts.slice(0, 10).map((prod, i) => (
                            <tr key={`pdf-prod-${i}`} className="bg-white">
                              <td className="p-1.5 px-2.5 font-semibold text-slate-900 break-words leading-tight max-w-[190px]">{prod.productName}</td>
                              <td className="p-1.5 px-2.5 text-right text-slate-700 whitespace-nowrap">{prod.totalQuantity.toLocaleString()} {prod.unit}</td>
                              <td className="p-1.5 px-2.5 text-right font-bold text-slate-800 whitespace-nowrap">{prod.totalAmountFormatted || `฿${(prod.totalAmount || 0).toLocaleString()}`}</td>
                            </tr>
                          ))}
                          {displayTopProducts.length === 0 && (
                            <tr>
                              <td colSpan={3} className="p-3 text-center text-slate-400">
                                ไม่พบข้อมูลสินค้าในช่วงเวลาที่เลือก
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. WAREHOUSE REPORT SECTION */}
            {activeDept === 'warehouse' && (
              <div className="space-y-3.5 pt-1" data-pdf-flow>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2" data-pdf-keep-next>
                  <h3 className="text-sm font-black text-[#0a2558] flex items-center gap-2 uppercase tracking-wide">
                    <Warehouse className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>สรุปผลการดำเนินงานฝ่ายคลังสินค้า (Warehouse & Picking Operations)</span>
                  </h3>
                  <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">
                    อัตราความสำเร็จ {warehouseCompletionRate}%
                  </span>
                </div>

                {/* Warehouse summary totals */}
                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className="p-2.5 bg-blue-50/80 rounded-xl border border-blue-200">
                    <p className="text-[10px] font-bold text-blue-900 uppercase whitespace-nowrap">รับเข้าใบจองทั้งหมด</p>
                    <p className="text-base font-black text-blue-700 mt-0.5 whitespace-nowrap">{totalWarehouseDocs.toLocaleString()} <span className="text-xs font-normal">ใบ</span></p>
                    <p className="text-[9px] text-slate-500 whitespace-nowrap">ตามช่วงวันที่เลือก</p>
                  </div>
                  <div className="p-2.5 bg-emerald-50/80 rounded-xl border border-emerald-200">
                    <p className="text-[10px] font-bold text-emerald-900 uppercase whitespace-nowrap">จัดได้ทั้งหมด</p>
                    <p className="text-base font-black text-emerald-700 mt-0.5 whitespace-nowrap">{completedWarehouseDocs.toLocaleString()} <span className="text-xs font-normal">ใบ</span></p>
                    <p className="text-[9px] text-slate-500 whitespace-nowrap">สำเร็จ {warehouseCompletionRate}%</p>
                  </div>
                  <div className="p-2.5 bg-amber-50/80 rounded-xl border border-amber-200">
                    <p className="text-[10px] font-bold text-amber-900 uppercase whitespace-nowrap">ค้างจัดทั้งหมด</p>
                    <p className="text-base font-black text-amber-700 mt-0.5 whitespace-nowrap">{pendingWarehouseDocs.toLocaleString()} <span className="text-xs font-normal">ใบ</span></p>
                    <p className="text-[9px] text-slate-500 whitespace-nowrap">รับเข้าทั้งหมด - จัดเสร็จทั้งหมด</p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 overflow-hidden" data-pdf-section>
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                    <p className="text-[11px] font-bold text-slate-700">แนวโน้ม KPI คลังสินค้ารายเดือน</p>
                  </div>
                  <table className="w-full text-left text-[10px]">
                    <thead className="bg-white text-slate-600 font-bold border-b border-slate-100">
                      <tr>
                        <th className="py-1.5 px-3">เดือนรับใบจอง</th>
                        <th className="py-1.5 px-3 text-right">รับเข้า</th>
                        <th className="py-1.5 px-3 text-right">จัดเสร็จ</th>
                        <th className="py-1.5 px-3 text-right">ค้างจัด</th>
                        <th className="py-1.5 px-3 text-right">อัตราจัดสำเร็จ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {warehouseMonthlySummaries.length === 0 ? (
                        <tr><td colSpan={5} className="py-3 px-3 text-center text-slate-400">ไม่มีข้อมูลตามตัวกรอง</td></tr>
                      ) : warehouseMonthlySummaries.map((month) => (
                        <tr key={month.month}>
                          <td className="py-1.5 px-3">{new Intl.DateTimeFormat('th-TH', { month: 'short', year: 'numeric' }).format(new Date(Number(month.month.slice(0, 4)), Number(month.month.slice(5, 7)) - 1, 1))}</td>
                          <td className="py-1.5 px-3 text-right">{month.inboundBookings.toLocaleString()}</td>
                          <td className="py-1.5 px-3 text-right">{month.pickedOrders.toLocaleString()}</td>
                          <td className="py-1.5 px-3 text-right">{month.pendingCount.toLocaleString()}</td>
                          <td className="py-1.5 px-3 text-right">{month.completionRate.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-xl border border-slate-200 p-3 space-y-2 text-xs" data-pdf-section>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-bold text-slate-700">Picking Lead Time · วันที่จัดเสร็จ - วันที่เปิดบิลขาย</p>
                    <p className="text-slate-500">คำนวณได้ {warehouseLeadTimeStats.count.toLocaleString()} / {completedWarehouseDocs.toLocaleString()} บิลจัดเสร็จ · ไม่มีคู่วันที่ {warehouseLeadTimeUnavailableDocs.length.toLocaleString()} บิล</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center border-t border-slate-100 pt-2">
                    <p>MIN (ต่ำสุด) <strong>{warehouseLeadTimeStats.count ? warehouseLeadTimeStats.min : '-'} วัน</strong></p>
                    <p>MEAN (เฉลี่ย) <strong>{warehouseLeadTimeStats.count ? warehouseLeadTimeStats.mean : '-'} วัน</strong></p>
                    <p>MAX (สูงสุด) <strong>{warehouseLeadTimeStats.count ? warehouseLeadTimeStats.max : '-'} วัน</strong></p>
                  </div>
                </div>
              </div>
            )}

            {/* 4. DELIVERY & FLEET REPORT SECTION */}
            {activeDept === 'delivery' && (
              <div className="space-y-3.5 pt-1" data-pdf-flow>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2" data-pdf-keep-next>
                  <h3 className="text-sm font-black text-[#0a2558] flex items-center gap-2 uppercase tracking-wide">
                    <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>สรุปผลการดำเนินงานฝ่ายจัดส่งและขนส่ง (Logistics & Fleet KPIs)</span>
                  </h3>
                  <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">
                    อัตราจัดส่งสำเร็จ {deliveryCompletionRate}%
                  </span>
                </div>

                {/* Delivery KPI Cards: 6 cards including uniqueVehiclesCount and pendingDeliveriesCount */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 bg-blue-50/80 rounded-xl border border-blue-200">
                    <p className="text-[10px] font-bold text-blue-900 uppercase whitespace-nowrap">รถที่จัดเส้นทาง</p>
                    <p className="text-base font-black text-[#0a2558] mt-0.5 whitespace-nowrap">
                      {uniqueVehiclesCount.toLocaleString()} <span className="text-xs font-normal">คัน</span>
                    </p>
                    <p className="text-[9px] text-slate-500 whitespace-nowrap">นับทะเบียนรถไม่ซ้ำ</p>
                  </div>
                  <div className="p-2.5 bg-amber-50/80 rounded-xl border border-amber-200">
                    <p className="text-[10px] font-bold text-amber-900 uppercase whitespace-nowrap">บิลที่ค้างส่ง</p>
                    <p className="text-base font-black text-amber-700 mt-0.5 whitespace-nowrap">
                      {pendingDeliveriesCount.toLocaleString()} <span className="text-xs font-normal">ใบ</span>
                    </p>
                    <p className="text-[9px] text-amber-600 whitespace-nowrap">ยังส่งไม่สำเร็จ</p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-[10px] font-bold text-slate-700 uppercase whitespace-nowrap">จำนวนบิลทั้งหมด</p>
                    <p className="text-base font-black text-slate-900 mt-0.5 whitespace-nowrap">
                      {totalTrips.toLocaleString()} <span className="text-xs font-normal">บิล</span>
                    </p>
                    <p className="text-[9px] text-slate-500 whitespace-nowrap">โหลดสำเร็จ {completedTrips} บิล</p>
                  </div>
                  <div className="p-2.5 bg-emerald-50/80 rounded-xl border border-emerald-200">
                    <p className="text-[10px] font-bold text-emerald-800 uppercase whitespace-nowrap">อัตราจัดส่งสำเร็จ</p>
                    <p className="text-base font-black text-emerald-700 mt-0.5 whitespace-nowrap">
                      {deliveryCompletionRate}%
                    </p>
                    <p className="text-[9px] text-slate-500 whitespace-nowrap">สำเร็จ {completedTrips} จาก {totalTrips} บิล</p>
                  </div>
                  <div className="p-2.5 bg-purple-50/80 rounded-xl border border-purple-200">
                    <p className="text-[10px] font-bold text-purple-800 uppercase whitespace-nowrap">น้ำหนักรวม</p>
                    <p className="text-base font-black text-slate-900 mt-0.5 whitespace-nowrap">
                      {totalWeightTon} <span className="text-xs font-normal">ตัน</span>
                    </p>
                    <p className="text-[9px] text-slate-500 whitespace-nowrap">Total Weight</p>
                  </div>
                  <div className="p-2.5 bg-sky-50/80 rounded-xl border border-sky-200">
                    <p className="text-[10px] font-bold text-sky-800 uppercase whitespace-nowrap">ระยะเวลาจัดส่งเฉลี่ย</p>
                    <p className="text-base font-black text-slate-900 mt-0.5 whitespace-nowrap">
                      {departmentGoalGroups[0]?.metrics.find(metric => metric.id === 'delivery-sales-to-loaded-days')?.actual ?? '—'} <span className="text-xs font-normal">วัน</span>
                    </p>
                    <p className="text-[9px] text-slate-500 whitespace-nowrap">เปิดบิลขาย → โหลดเสร็จ</p>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500" data-pdf-section>ระยะเวลาจากรับงานขนส่งถึงโหลดเสร็จ (ตัวชี้วัดปฏิบัติงาน): เฉลี่ย {deliveryLeadTimeStats.count ? `${deliveryLeadTimeStats.mean} วัน` : 'ไม่มีข้อมูล'}</div>
                {/* Delivery Logistics Operations Summary */}
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>สรุปประสิทธิภาพการขนส่งและกองยานพาหนะ (Fleet Operations & Logistics Summary)</span>
                  </h4>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-3 gap-3 text-xs">
                    <div className="sm:border-r sm:border-slate-200 pr-3">
                      <span className="px-2 py-0.5 rounded font-black text-[10px] bg-emerald-100 text-emerald-900 whitespace-nowrap">โหลดสินค้าสำเร็จ (Loaded)</span>
                      <p className="text-sm font-black text-slate-800 mt-1">{completedTrips.toLocaleString()} บิล ({deliveryCompletionRate}%)</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">บันทึกการโหลดสินค้าและส่งต่อให้ฝ่ายขนส่งแล้ว</p>
                    </div>
                    <div className="sm:border-r sm:border-slate-200 pr-3">
                      <span className="px-2 py-0.5 rounded font-black text-[10px] bg-blue-100 text-blue-900 whitespace-nowrap">บิลค้างส่ง / ส่งล่าช้า</span>
                      <p className="text-sm font-black text-slate-800 mt-1">{pendingDeliveriesCount.toLocaleString()} บิล</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">สถานะล่าช้า {delayedTrips.toLocaleString()} บิล</p>
                    </div>
                    <div>
                      <span className="px-2 py-0.5 rounded font-black text-[10px] bg-purple-100 text-purple-900 whitespace-nowrap">อัตราจัดส่งสำเร็จ</span>
                      <p className="text-sm font-black text-emerald-800 mt-1">{deliveryCompletionRate}%</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">สำเร็จ {completedTrips} จาก {totalTrips} บิล</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 5. Formal Signatures & Validation Footer */}
            <div className="pt-5 border-t-2 border-slate-300 space-y-5 [break-inside:avoid]" data-pdf-section>
              <div className="grid grid-cols-3 gap-6 text-center text-xs">
                <div className="space-y-10">
                  <p className="font-bold text-slate-700">ผู้จัดทำรายงาน (Prepared By)</p>
                  <div className="border-t border-slate-400 pt-1 text-[11px] text-slate-600">
                    <p className="font-bold text-slate-800">{currentUser?.displayName || currentUser?.name || '-'}</p>
                    <p className="text-[10px] text-slate-500">{currentUser?.role || 'ฝ่ายวิเคราะห์ข้อมูล'}</p>
                  </div>
                </div>

                <div className="space-y-10">
                  <p className="font-bold text-slate-700">ผู้ตรวจสอบข้อมูล (Verified By)</p>
                  <div className="border-t border-slate-400 pt-1 text-[11px] text-slate-600">
                    <p className="font-bold text-slate-800">หัวหน้าฝ่ายปฏิบัติการ</p>
                    <p className="text-[10px] text-slate-500">Operations Manager</p>
                  </div>
                </div>

                <div className="space-y-10">
                  <p className="font-bold text-slate-700">ผู้อนุมัติรายงาน (Approved By)</p>
                  <div className="border-t border-slate-400 pt-1 text-[11px] text-slate-600">
                    <p className="font-bold text-slate-800">ผู้อำนวยการฝ่ายบริหาร</p>
                    <p className="text-[10px] text-slate-500">Managing Director</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-200">
                <span>Technic Pet Operations & KPI Management System • เอกสารออกโดยระบบคอมพิวเตอร์</span>
                <span>ระบบตรวจสอบข้อมูลสมบูรณ์ • System Verified</span>
              </div>
            </div>
          </PaginatedReport>
        </div>

        {/* Modal Bottom Bar */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>รายงานรูปแบบ A4 มาตรฐาน พร้อมกราฟิก ตารางสรุปข้อมูล และลายเซ็นกำกับอย่างเป็นทางการ</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isExporting}
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isExporting || !pageCount || !!paginationError}
              className="px-5 py-2 rounded-xl text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 transition-all flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>ดาวน์โหลด PDF รายงาน</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
};

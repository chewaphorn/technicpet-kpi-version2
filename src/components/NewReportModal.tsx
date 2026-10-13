import { filterSalesOrders, calculateSalesReportMetrics, calculateSalesCustomers } from '../utils/salesReportMetrics';
import { aggregateWarehouseDocs, filterWarehouseDocs, aggregateDeliveryTrips, filterDeliveryTrips } from '../utils/logisticsReportMetrics';
import { useReportTargets } from '../hooks/useReportTargets';
import { canAccessReport } from '../lib/authControl';
import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  FileText, 
  Download, 
  Check, 
  TrendingUp,
  Warehouse,
  Truck,
  LayoutGrid,
  CheckCircle2,
  Sparkles,
  Printer,
  Eye,
  RotateCcw,
  AlertCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import * as XLSX from 'xlsx';
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
import { normalizeDateToISO, getMinMaxDates } from '../utils/dateUtils';

export interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  detailedSalesOrders?: DetailedSalesOrder[];
  salesReps?: SalesRepPerformance[];
  warehouseDocs?: WarehouseDoc[];
  deliveryTrips?: DeliveryTrip[];
  topProducts?: TopProductItem[];
  topSpenders?: CustomerSpender[];
  kpis?: KPIStats;
  currentUser?: AuthUser | null;
  onOpenPDFPreview?: (
    dept: 'overview' | 'sales' | 'warehouse' | 'delivery' | 'all',
    startDate?: string,
    endDate?: string
  ) => void;
}

export const NewReportModal: React.FC<ExportReportModalProps> = ({
  isOpen,
  onClose,
  detailedSalesOrders = [],
  salesReps = [],
  warehouseDocs = [],
  deliveryTrips = [],
  topProducts = [],
  topSpenders = [],
  kpis,
  currentUser,
  onOpenPDFPreview
}) => {
  // Department / Report Scope
  const [selectedDept, setSelectedDept] = useState<'all' | 'sales' | 'warehouse' | 'delivery'>('sales');

  const canExport = (dept: 'all' | 'sales' | 'warehouse' | 'delivery') => canAccessReport(currentUser, dept);
  useEffect(() => {
    if (!canExport(selectedDept)) {
      const first = (['sales', 'warehouse', 'delivery', 'all'] as const).find(canExport);
      if (first) setSelectedDept(first);
    }
  }, [isOpen, currentUser?.role, JSON.stringify(currentUser?.allowedScreens)]);

  // Export File Format: 'excel' or 'pdf'
  const [exportFormat, setExportFormat] = useState<'excel' | 'pdf'>('pdf');

  const safeSalesOrders = useMemo(() => detailedSalesOrders, [detailedSalesOrders]);
  const safeWarehouseDocs = useMemo(() => warehouseDocs, [warehouseDocs]);
  const safeDeliveryTrips = useMemo(() => deliveryTrips, [deliveryTrips]);
  const safeSalesReps = useMemo(() => salesReps, [salesReps]);

  const { monthlySalesTarget } = useReportTargets();
  // Each department has its own date column and available period.
  const datasetRange = useMemo(() => {
    const sales = safeSalesOrders.map(o => o.date);
    const warehouse = safeWarehouseDocs.map(d => d.date);
    const delivery = safeDeliveryTrips.map(t => t.plannedDate || t.orderDate || t.handoffDate || t.loadedDate);
    return getMinMaxDates(selectedDept === 'sales' ? sales : selectedDept === 'warehouse' ? warehouse : selectedDept === 'delivery' ? delivery : [...sales, ...warehouse, ...delivery], '', '');
  }, [selectedDept, safeSalesOrders, safeWarehouseDocs, safeDeliveryTrips]);

  // Date Range (Dynamic to match available orders)
  const [startDate, setStartDate] = useState(datasetRange.min);
  const [endDate, setEndDate] = useState(datasetRange.max);

  useEffect(() => {
    setStartDate(datasetRange.min);
    setEndDate(datasetRange.max);
  }, [isOpen, selectedDept, datasetRange.min, datasetRange.max]);

  // Status
  const [isExporting, setIsExporting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Helper date normalizer
  const normalizeDateStr = (dStr?: string) => normalizeDateToISO(dStr);

  const analyzedReportData = useMemo(() => {
    const orders = filterSalesOrders(safeSalesOrders, {fromDate: startDate, toDate: endDate});
    const sales = calculateSalesReportMetrics(orders, safeSalesReps, monthlySalesTarget);
    const customers = calculateSalesCustomers(orders);
    return {
      orders, customers: customers.allSpenders, products: sales.allProducts, reps: sales.computedReps,
      warehouse: filterWarehouseDocs(aggregateWarehouseDocs(safeWarehouseDocs, safeSalesOrders), {fromDate: startDate, toDate: endDate}),
      delivery: filterDeliveryTrips(aggregateDeliveryTrips(safeDeliveryTrips, safeSalesOrders), {fromDate: startDate, toDate: endDate}),
      totalSalesRevenue: sales.totalRevenueAmount,
      totalOrderItemsQty: orders.reduce((sum, order) => sum + (order.totalQuantity || 0), 0),
    };
  }, [safeSalesOrders, safeSalesReps, safeWarehouseDocs, safeDeliveryTrips, startDate, endDate, monthlySalesTarget]);

  if (!isOpen) return null;

  // Handle Real Excel (.xlsx) Generation & Download
  const handleExportExcel = () => {
    if (!canExport(selectedDept)) return;
    setIsExporting(true);

    setTimeout(() => {
      try {
        const wb = XLSX.utils.book_new();

        // 1. SALES DEPARTMENT SHEETS
        if (selectedDept === 'all' || selectedDept === 'sales') {
          // Sheet 1: Detailed Orders (ALL Orders)
          const ordersRows = analyzedReportData.orders.map((o, idx) => ({
            'ลำดับ': idx + 1,
            'เลขที่เอกสาร (Doc No)': o.docNo,
            'วันที่สั่งซื้อ': o.date,
            'ชื่อลูกค้า': o.customer,
            'พนักงานขาย': o.salesperson || '-',
            'ประเภทบิล': o.docTypeLabel || o.docType,
            'รหัสประเภท': o.docType,
            'จำนวนชิ้นรวม': o.totalQuantity,
            'มูลค่ารวมสุทธิ (บาท)': o.totalAmount,
            'สถานะเอกสาร': o.status || 'เสร็จสมบูรณ์',
            'หมายเหตุ/เคลม': o.claimReason || '-',
          }));

          const wsOrders = XLSX.utils.json_to_sheet(
            ordersRows.length > 0
              ? ordersRows
              : [{ 'หมายเหตุ': 'ไม่พบรายการคำสั่งซื้อในช่วงวันที่เลือก' }]
          );
          wsOrders['!cols'] = [
            { wch: 8 },
            { wch: 18 },
            { wch: 14 },
            { wch: 32 },
            { wch: 20 },
            { wch: 18 },
            { wch: 12 },
            { wch: 14 },
            { wch: 20 },
            { wch: 16 },
            { wch: 24 },
          ];
          XLSX.utils.book_append_sheet(wb, wsOrders, 'คำสั่งซื้อละเอียด (Orders)');

          // Sheet 2: All Sales Reps Performance & Monthly Targets
          if (analyzedReportData.reps.length > 0) {
            const repRows = analyzedReportData.reps.map((r) => ({
              'อันดับ': r.rank,
              'ชื่อพนักงานขาย': r.name,
              'ยอดขายจริง (บาท)': r.sales,
              'เป้าหมายรายเดือน (บาท)': r.target,
              'บรรลุเป้าหมายรายเดือน (%)': `${r.completionRate}%`,
              'สัดส่วนต่อยอดขายรวม (%)': `${r.shareOfTotalSales}%`,
              'จำนวนคำสั่งซื้อที่เปิด (บิล)': r.ordersCount,
            }));
            const wsReps = XLSX.utils.json_to_sheet(repRows);
            wsReps['!cols'] = [
              { wch: 8 },
              { wch: 24 },
              { wch: 20 },
              { wch: 22 },
              { wch: 24 },
              { wch: 22 },
              { wch: 24 },
            ];
            XLSX.utils.book_append_sheet(wb, wsReps, 'ผลงานพนักงานขายทั้งหมด (Reps)');
          }

          // Sheet 3: ALL Customers Analysis (Full analyzed customer database)
          if (analyzedReportData.customers.length > 0) {
            const customerRows = analyzedReportData.customers.map((c) => ({
              'อันดับ': c.rank,
              'ชื่อลูกค้า': c.customerName,
              'พนักงานขายที่ดูแล': c.salesperson || '-',
              'ยอดสั่งซื้อสะสม (บาท)': c.totalAmount,
              'จำนวนคำสั่งซื้อ (บิล)': c.ordersCount,
              'จำนวนสินค้าทั้งหมด (ชิ้น)': c.totalQuantity,
              'ยอดเฉลี่ยต่อบิล (บาท)': c.avgTicket,
              'สัดส่วนยอดขาย (%)': `${c.percentageOfTotalSales}%`,
              'สั่งซื้อล่าสุดเมื่อ': c.lastOrderDate || '-',
            }));
            const wsCust = XLSX.utils.json_to_sheet(customerRows);
            wsCust['!cols'] = [
              { wch: 8 },
              { wch: 34 },
              { wch: 20 },
              { wch: 22 },
              { wch: 20 },
              { wch: 22 },
              { wch: 20 },
              { wch: 18 },
              { wch: 18 },
            ];
            XLSX.utils.book_append_sheet(wb, wsCust, 'ข้อมูลลูกค้าทั้งหมด (Customers)');
          }

          // Sheet 4: ALL Products Sold (Full analyzed product catalogue)
          if (analyzedReportData.products.length > 0) {
            const productRows = analyzedReportData.products.map((p) => ({
              'อันดับ': p.rank,
              'รหัสสินค้า (SKU)': p.productCode,
              'ชื่อสินค้า': p.productName,
              'จำนวนที่จำหน่ายรวม': p.totalQuantity,
              'หน่วยนับ': p.unit || 'ชิ้น',
              'ยอดขายรวมสุทธิ (บาท)': p.totalAmount,
              'จำนวนบิลที่สั่งซื้อ': p.ordersCount,
              'สัดส่วนยอดขาย (%)': `${p.percentageOfSales}%`,
            }));
            const wsProd = XLSX.utils.json_to_sheet(productRows);
            wsProd['!cols'] = [
              { wch: 8 },
              { wch: 20 },
              { wch: 38 },
              { wch: 20 },
              { wch: 12 },
              { wch: 22 },
              { wch: 18 },
              { wch: 18 },
            ];
            XLSX.utils.book_append_sheet(wb, wsProd, 'รายการสินค้าทั้งหมด (Products)');
          }
        }

        // 2. WAREHOUSE DEPARTMENT SHEETS
        if (selectedDept === 'all' || selectedDept === 'warehouse') {
          const warehouseRows = analyzedReportData.warehouse.map((w, idx) => ({
            'ลำดับ': idx + 1,
            'เลขที่ใบเบิก/อ้างอิง': w.docNo,
            'ชื่อลูกค้า': w.customer,
            'พนักงานจัดสินค้า': w.pickerName || 'คลังส่วนกลาง',
            'จำนวนรายการ': w.itemsCount,
            'สถานะการเบิก': w.statusLabel || w.status,
            'เวลาเริ่มจัด': w.startTime || '-',
            'ระดับความสำคัญ': w.priority === 'urgent' ? 'ด่วนพิเศษ' : w.priority === 'high' ? 'ด่วน' : w.priority === 'normal' ? 'ปกติ' : '-',
            'หมายเหตุ': w.notes || '-',
          }));

          const wsWarehouse = XLSX.utils.json_to_sheet(
            warehouseRows.length > 0
              ? warehouseRows
              : [{ 'หมายเหตุ': 'ไม่พบรายการเอกสารคลังสินค้าในช่วงวันที่เลือก' }]
          );
          wsWarehouse['!cols'] = [
            { wch: 8 },
            { wch: 20 },
            { wch: 30 },
            { wch: 20 },
            { wch: 14 },
            { wch: 18 },
            { wch: 18 },
            { wch: 16 },
            { wch: 20 },
          ];
          XLSX.utils.book_append_sheet(wb, wsWarehouse, 'งานคลังสินค้า (Warehouse)');
        }

        // 3. DELIVERY & LOGISTICS SHEETS
        if (selectedDept === 'all' || selectedDept === 'delivery') {
          const deliveryRows = analyzedReportData.delivery.map((d, idx) => ({
            'ลำดับ': idx + 1,
            'รหัสเที่ยวรถ': d.deliveryNo,
            'อ้างอิงใบสั่งซื้อ': d.salesOrderNo || '-',
            'พนักงานขับรถ': d.driverName,
            'เบอร์ติดต่อ': d.driverPhone || '-',
            'ทะเบียนรถขนส่ง': d.licensePlate,
            'ปลายทาง/สถานที่ส่ง': d.destination,
            'น้ำหนักสินค้า (ตัน)': d.weightTon,
            'จำนวนพัสดุ/ชิ้น': d.itemsCount,
            'เวลาออกเดินทาง': d.departureTime,
            'เวลาส่งถึงโดยประมาณ': d.estimatedArrival,
            'เวลาส่งถึงจริง': d.actualArrival || '-',
            'สถานะการจัดส่ง': d.statusLabel || d.status,
          }));

          const wsDelivery = XLSX.utils.json_to_sheet(
            deliveryRows.length > 0
              ? deliveryRows
              : [{ 'หมายเหตุ': 'ไม่พบรายการขนส่งในช่วงวันที่เลือก' }]
          );
          wsDelivery['!cols'] = [
            { wch: 8 },
            { wch: 18 },
            { wch: 20 },
            { wch: 20 },
            { wch: 16 },
            { wch: 16 },
            { wch: 30 },
            { wch: 16 },
            { wch: 16 },
            { wch: 18 },
            { wch: 20 },
            { wch: 20 },
            { wch: 18 },
          ];
          XLSX.utils.book_append_sheet(wb, wsDelivery, 'งานขนส่งจัดส่ง (Delivery)');
        }

        // Generate Filename
        const deptNames = {
          all: 'รายงานรวมทุกฝ่าย_IntegratedReport',
          sales: 'รายงานฝ่ายขาย_SalesPerformance',
          warehouse: 'รายงานฝ่ายคลังสินค้า_WarehouseOperations',
          delivery: 'รายงานฝ่ายจัดส่ง_LogisticsDelivery',
        };
        const fileName = `TechnicPet_${deptNames[selectedDept]}_${startDate}_to_${endDate}.xlsx`;

        // Write and Download Native Excel File
        XLSX.writeFile(wb, fileName);

        setIsExporting(false);
        setIsSuccess(true);
        confetti({ particleCount: 60, origin: { y: 0.7 } });

        setTimeout(() => {
          setIsSuccess(false);
          onClose();
        }, 1500);
      } catch (err) {
        console.error('Export Error:', err);
        setIsExporting(false);
      }
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs ${
              exportFormat === 'pdf' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {exportFormat === 'pdf' ? <FileText className="w-5 h-5" /> : <FileSpreadsheet className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 leading-tight">
                ส่งออกรายงาน (Export Dashboard Report)
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                เลือกรูปแบบรายงาน (PDF รูปรายงาน / Excel ข้อมูลดิบ) และระบุช่วงวันที่
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Format Selection (PDF vs Excel) */}
          <div>
            <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-2.5">
              1. เลือกรูปแบบไฟล์ที่ต้องการส่งออก (Export Format)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExportFormat('pdf')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                  exportFormat === 'pdf'
                    ? 'border-rose-500 bg-rose-50/60 text-rose-950 ring-2 ring-rose-500/30 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                    เอกสาร PDF รายงาน (PDF Report)
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    ฟอร์แมต A4 สวยงาม พร้อม KPI, ตาราง, ลายเซ็น
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('excel')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                  exportFormat === 'excel'
                    ? 'border-emerald-500 bg-emerald-50/60 text-emerald-950 ring-2 ring-emerald-500/30 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                    สเปรดชีต Excel (.xlsx)
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    ไฟล์ตารางข้อมูลดิบ Multi-sheets ครบถ้วน
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* 2. Department Selection */}
          <div>
            <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-2.5">
              2. เลือกฝ่าย / ข้อมูลที่ต้องการส่งออก
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                { 
                  id: 'sales', 
                  title: 'ฝ่ายขาย (Sales Department)', 
                  desc: 'คำสั่งซื้อทุกบิล, ผลงานพนักงานขายทุกคน, ข้อมูลลูกค้าทั้งหมด, รายการสินค้าทั้งหมด',
                  icon: <TrendingUp className="w-4 h-4 text-blue-600" />,
                  color: 'border-blue-500 bg-blue-50/50 text-blue-950'
                },
                { 
                  id: 'warehouse', 
                  title: 'ฝ่ายคลังสินค้า (Warehouse)', 
                  desc: 'รายการใบเบิกสินค้าทั้งหมด, เวลาจัดเตรียม, ผู้จัดเตรียม, สถานะสต็อก',
                  icon: <Warehouse className="w-4 h-4 text-amber-600" />,
                  color: 'border-amber-500 bg-amber-50/50 text-amber-950'
                },
                { 
                  id: 'delivery', 
                  title: 'ฝ่ายจัดส่ง (Logistics & Fleet)', 
                  desc: 'รายการเที่ยวรถทั้งหมด, ใบนำส่ง, ทะเบียนรถ, พนักงานขับรถ, สถานะ OTD',
                  icon: <Truck className="w-4 h-4 text-emerald-600" />,
                  color: 'border-emerald-500 bg-emerald-50/50 text-emerald-950'
                },
              ].map((item) => {
                const isSelected = selectedDept === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!canExport(item.id as any)}
                    onClick={() => { if (canExport(item.id as any)) setSelectedDept(item.id as any); }}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      isSelected
                        ? `${item.color} ring-2 ring-emerald-600/30 shadow-xs`
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">{item.icon}</div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Date Range Picker (Only Start Date & End Date as requested) */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                3. กำหนดช่วงเวลาที่ต้องการ Export
              </label>
              <span className="text-[11px] text-slate-500 font-medium">
                ระบุวันเริ่มต้น และสิ้นสุด
              </span>
            </div>

            {/* Date Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50/80 p-4 rounded-2xl border border-slate-200">
              <div>
                <span className="block text-[11px] font-bold text-slate-700 mb-1.5">
                  วันที่เริ่มต้น (Start Date):
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-semibold bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>

              <div>
                <span className="block text-[11px] font-bold text-slate-700 mb-1.5">
                  วันที่สิ้นสุด (End Date):
                </span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-semibold bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>
            </div>
          </div>

          {/* 4. Export Data Analysis Preview (Full data, not just top 10) */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-extrabold text-slate-900">
                  สรุปข้อมูลที่จะส่งออกในรายงาน ({exportFormat === 'pdf' ? 'PDF Report' : 'Excel Spreadsheet'})
                </span>
              </div>
              <span className="text-[11px] font-black text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200">
                ข้อมูลครบถ้วนทั้งหมด
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-900 font-semibold">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-col">
                <span className="text-[10px] text-slate-500 font-medium">คำสั่งซื้อทั้งหมด</span>
                <span className="text-sm font-black text-slate-900">{analyzedReportData.orders.length} บิล</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-col">
                <span className="text-[10px] text-slate-500 font-medium">ลูกค้าทั้งหมด</span>
                <span className="text-sm font-black text-slate-900">{analyzedReportData.customers.length} ราย</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-col">
                <span className="text-[10px] text-slate-500 font-medium">สินค้าทั้งหมด</span>
                <span className="text-sm font-black text-slate-900">{analyzedReportData.products.length} รายการ</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-col">
                <span className="text-[10px] text-slate-500 font-medium">มูลค่ายอดขายรวม</span>
                <span className="text-sm font-black text-emerald-700">฿{analyzedReportData.totalSalesRevenue.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>
              {exportFormat === 'pdf' 
                ? 'สร้างเอกสาร PDF มาตรฐานรายงาน A4 สรุปข้อมูลตัวชี้วัดและตาราง' 
                : 'สร้างไฟล์ Excel มาตรฐาน (.xlsx) พร้อมชีตแยกตามฝ่าย'}
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>

            {exportFormat === 'pdf' ? (
              <button
                type="button"
                id="btn-open-pdf-preview"
                onClick={() => {
                  if (onOpenPDFPreview) {
                    if (canExport(selectedDept)) onOpenPDFPreview(selectedDept === 'all' ? 'overview' : selectedDept, startDate, endDate);
                  }
                  onClose();
                }}
                className="w-1/2 sm:w-auto px-6 py-2.5 rounded-xl text-xs font-extrabold text-white flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer bg-rose-600 hover:bg-rose-700 active:bg-rose-800"
              >
                <FileText className="w-4 h-4" />
                <span>เปิดดู & ดาวน์โหลด PDF รายงาน</span>
              </button>
            ) : (
              <button
                type="button"
                id="btn-confirm-export"
                onClick={handleExportExcel}
                disabled={isExporting}
                className={`w-1/2 sm:w-auto px-6 py-2.5 rounded-xl text-xs font-extrabold text-white flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
                  isSuccess
                    ? 'bg-emerald-600'
                    : 'bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900'
                }`}
              >
                {isExporting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                    <span>กำลังสร้างไฟล์...</span>
                  </>
                ) : isSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>ดาวน์โหลดสำเร็จ!</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>ดาวน์โหลดไฟล์ Excel (.xlsx)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

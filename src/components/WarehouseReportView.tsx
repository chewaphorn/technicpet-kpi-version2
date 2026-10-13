import { useReportTargets } from '../hooks/useReportTargets';
import { aggregateWarehouseDocs, filterWarehouseDocs, calculateWarehouseMetrics, getPickingLeadTimeDays } from '../utils/logisticsReportMetrics';
import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { WarehouseDoc, DetailedSalesOrder, SalesOrderItem, AuthUser } from '../types';
import { 
  Inbox, 
  CheckCircle2, 
  Search, 
  Filter, 
  FileText,
  AlertTriangle,
  Eye,
  FileSpreadsheet,
  Truck,
  ArrowRightCircle,
  CalendarDays,
  Clock,
  Hourglass,
  Calendar,
  Layers,
  X,
  Package,
  Boxes,
  ExternalLink,
  ChevronRight,
  Info,
  RefreshCw,
  AlertCircle,
  RotateCcw,
  BarChart2
} from 'lucide-react';
import { getMinMaxDates } from '../utils/dateUtils';

interface WarehouseReportViewProps {
  docs: WarehouseDoc[];
  detailedOrders?: DetailedSalesOrder[];
  onSelectDoc: (docNo: string) => void;
  summary?: {
    totalDocs: number;
    completedDocs: number;
    completionPercent: number;
    avgItemsPerDoc?: string;
    avgPickingMinutes?: string;
    dailyInboundBookings?: number;
    dailyPickedOrders?: number;
    transferredToDeliveryCount?: number;
    transferredPercent?: number;
    pendingDocsCount?: number;
    avgLeadTimeDays?: number;
    delayedDocsCount?: number;
  };
  onOpenPDFReport?: (startDate?: string, endDate?: string, filters?: { status?: string; search?: string }) => void;
  onOpenGoogleSheetsModal?: (dept?: 'all' | 'sales' | 'warehouse' | 'delivery') => void;
  currentUser?: AuthUser | null;
  onSyncWarehouse?: () => Promise<void>;
  isSyncingWarehouse?: boolean;
  syncErrorWarehouse?: string;
  lastSyncWarehouse?: string;
}

export const WarehouseReportView: React.FC<WarehouseReportViewProps> = ({ 
  docs, 
  detailedOrders = [],
  onSelectDoc,
  summary,
  onOpenPDFReport,
  onOpenGoogleSheetsModal,
  currentUser,
  onSyncWarehouse,
  isSyncingWarehouse = false,
  syncErrorWarehouse,
  lastSyncWarehouse,
}) => {
  const datasetDateRange = useMemo(() => {
    const dates = docs.map(d => d.date);
    return getMinMaxDates(dates, '', '');
  }, [docs]);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDocForItems, setSelectedDocForItems] = useState<WarehouseDoc | null>(null);
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const { warehousePickingLeadTimeTarget: pickingLeadTimeTarget } = useReportTargets();

  // Sync date filter range when dataset changes
  useEffect(() => {
    if (docs.length > 0) {
      setFromDate(datasetDateRange.min);
      setToDate(datasetDateRange.max);
    }
  }, [datasetDateRange.min, datasetDateRange.max, docs.length]);

  const handleResetFilter = () => {
    setFromDate(datasetDateRange.min);
    setToDate(datasetDateRange.max);
    setSearchQuery('');
    setStatusFilter('all');
    setCurrentPage(1);
  };

  // รวมกลุ่มข้อมูลด้วย Map ตาม docNo (เลขที่ใบจอง) เพื่อให้ 1 เลขที่ใบจองแสดงเพียง 1 แถวในตาราง
  const aggregatedDocs = useMemo(() => aggregateWarehouseDocs(docs, detailedOrders), [docs, detailedOrders]);

  const filteredDocs = useMemo(() => filterWarehouseDocs(aggregatedDocs, {fromDate, toDate, search: searchQuery, status: statusFilter}, pickingLeadTimeTarget), [aggregatedDocs, fromDate, toDate, searchQuery, statusFilter, pickingLeadTimeTarget]);

  // Keep pagination consistent with the Delivery Lead Time report.
  useEffect(() => {
    setCurrentPage(1);
  }, [fromDate, toDate, searchQuery, statusFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / pageSize));
  const paginatedDocs = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredDocs.slice(startIndex, startIndex + pageSize);
  }, [filteredDocs, currentPage, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const {totalDocsCount, completedDocsCount, completionPercent, pendingDocsCount, delayedDocsCount, isDocDelayed, leadTimeRecords, docsWithLeadTime, leadTimeStats, avgLeadTimeDays, onPlanLeadTimeCount, onPlanLeadTimePercent, dailyInboundBookings, dailyPickedOrders, transferredCount, transferredPct} = useMemo(() => calculateWarehouseMetrics(filteredDocs, pickingLeadTimeTarget), [filteredDocs, pickingLeadTimeTarget]);

  // Helper to retrieve detailed items for a doc
  const getDocItems = (doc: WarehouseDoc): SalesOrderItem[] => {
    if (doc.items && doc.items.length > 0) return doc.items;
    const matched = detailedOrders.find(
      (order) => order.docNo.trim().toUpperCase() === doc.docNo.trim().toUpperCase()
    );
    return matched?.items || [];
  };

  const getStatusBadge = (status: WarehouseDoc['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            จัดเสร็จแล้ว
          </span>
        );
      case 'picking':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            กำลังหยิบสินค้า
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            รอจัดสินค้า
          </span>
        );
      case 'verified':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
            ตรวจสอบแล้ว
          </span>
        );
      case 'unknown':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            ไม่ระบุสถานะ
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  const handleExportExcel = () => {
    try {
      const exportRows = filteredDocs.map((doc, index) => {
        const isCompleted = doc.status === 'completed' || doc.status === 'verified';
        const isDelayed = isDocDelayed(doc);
        const statusLabel = isDelayed
          ? `จัดช้าเกิน SLA (+${Math.max(0, (getPickingLeadTimeDays(doc) ?? doc.pendingDays ?? 0) - pickingLeadTimeTarget)} วัน)`
          : isCompleted
            ? 'จัดเสร็จแล้ว'
            : doc.status === 'picking'
              ? 'กำลังหยิบสินค้า'
              : doc.statusLabel || 'ไม่ระบุสถานะ';
        const itemCount = doc.itemsCount;

        return {
          'ลำดับ': index + 1,
          'เลขที่ใบจอง': doc.docNo,
          'ลูกค้า': doc.customer || '-',
          'วันที่เปิดบิลขาย': doc.salesOrderDate || '-',
          'วันที่รับใบจอง': doc.receivedBookingDate || doc.date || '-',
          'วันที่จัดเสร็จ': doc.completedDate || '-',
          'จำนวนวันค้างจัดของ': isCompleted ? '-' : (doc.pendingDays ?? '-'),
          'Lead Time (วัน)': getPickingLeadTimeDays(doc) ?? '-',
          'สถานะ': statusLabel,
          'จำนวนรายการ': itemCount,
          'ผู้จัดสินค้า': doc.pickerName || '-',
          'ส่งต่อฝ่ายขนส่ง': doc.transferredToDelivery ? 'ส่งต่อแล้ว' : 'ยังไม่ส่งต่อ',
          'วันเริ่มล่าช้า': doc.delayDate || '-',
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(
        exportRows.length > 0
          ? exportRows
          : [{ 'หมายเหตุ': 'ไม่พบข้อมูลรายงานสถานะใบสั่งจัดสินค้าตามเงื่อนไขที่เลือก' }]
      );
      worksheet['!cols'] = [
        { wch: 8 }, { wch: 20 }, { wch: 30 }, { wch: 16 },
        { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 16 },
        { wch: 24 }, { wch: 16 }, { wch: 24 }, { wch: 18 },
        { wch: 18 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'สถานะการจัดสินค้า');
      const dateRangeSuffix = `${fromDate || 'ทั้งหมด'}_ถึง_${toDate || 'ทั้งหมด'}`;
      XLSX.writeFile(workbook, `TechnicPet_รายงานสถานะใบสั่งจัดสินค้า_${dateRangeSuffix}.xlsx`);
    } catch (error) {
      console.error('ไม่สามารถส่งออกรายงานสถานะใบสั่งจัดสินค้าเป็น Excel ได้:', error);
      window.alert('ไม่สามารถส่งออก Excel ได้ กรุณาลองใหม่อีกครั้ง');
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-300">
      {/* Title & Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Warehouse Report Dashboard
          </h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            สรุปข้อมูลผลงานแผนกคลังสินค้า การจัดสินค้า และบิลค้างจัด
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          {onSyncWarehouse && (
            <button
              type="button"
              id="btn-sync-warehouse-only"
              onClick={onSyncWarehouse}
              disabled={isSyncingWarehouse}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-60 shadow-xs transition-all cursor-pointer"
              title="ดึงเฉพาะข้อมูลคลังสินค้าจาก Google Sheet และประมวลผลทันที"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingWarehouse ? 'animate-spin' : ''}`} />
              <span>{isSyncingWarehouse ? 'กำลังดึงข้อมูลคลังสินค้า...' : 'ดึงเฉพาะข้อมูลคลังสินค้า'}</span>
            </button>
          )}

          {onOpenGoogleSheetsModal && (
            <button
              type="button"
              id="btn-warehouse-sheet-config"
              onClick={() => onOpenGoogleSheetsModal('warehouse')}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-200 shadow-xs transition-all cursor-pointer"
              title="กำหนดและอัปเดตลิงก์ Google Sheet แผนกคลังสินค้า"
            >
              <FileSpreadsheet className="w-4 h-4 text-amber-600" />
              <span>ลิงก์ Google Sheet คลังสินค้า</span>
            </button>
          )}

          {onOpenPDFReport && (
            <button
              type="button"
              id="btn-warehouse-export-pdf"
              onClick={() => onOpenPDFReport(fromDate, toDate, { status: statusFilter, search: searchQuery })}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-xs transition-all cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>Export PDF รายงานคลังสินค้า</span>
            </button>
          )}
        </div>
      </div>

      {/* Sync Error Alert for Warehouse only */}
      {syncErrorWarehouse && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-rose-800">พบข้อผิดพลาดในการดึงข้อมูลคลังสินค้า</p>
            <p className="text-rose-600 mt-0.5">{syncErrorWarehouse}</p>
            <p className="text-rose-500 mt-1 font-medium">คำแนะนำ: ตรวจสอบสิทธิ์การแชร์ของชีตคลังสินค้าให้เป็น "ทุกคนที่มีลิงก์มีสิทธิ์ดู"</p>
          </div>
        </div>
      )}

      {/* Date Filter Bar */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              จากวันที่
            </label>
            <div className="relative">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 w-44"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              ถึงวันที่
            </label>
            <div className="relative">
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 w-44"
              />
            </div>
          </div>

          <div className="self-end flex items-center gap-2">
            <button
              id="btn-warehouse-filter-apply"
              className="bg-[#0a2558] hover:bg-[#0d3175] text-white px-5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>กรองข้อมูล</span>
            </button>

            {(fromDate !== datasetDateRange.min || toDate !== datasetDateRange.max || searchQuery || statusFilter !== 'all') && (
              <button
                type="button"
                id="btn-warehouse-filter-reset"
                onClick={handleResetFilter}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
                title="ล้างตัวกรองและแสดงข้อมูลทั้งหมด"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>รีเซ็ตตัวกรอง</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Core warehouse metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-6 rounded-xl border-2 border-blue-200/80 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-700">จำนวนรับเข้าใบจอง / วัน</h4>
              <p className="text-xs text-slate-500 mt-0.5">Daily Inbound Bookings</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs"><Inbox className="w-5 h-5" /></div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
            <div><span className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight tabular-nums">{dailyInboundBookings.toLocaleString()}</span><span className="text-sm font-bold text-slate-600 ml-1.5">ใบ / วัน</span></div>
            <div className="text-right"><span className="text-xs font-semibold text-slate-500">สะสมทั้งหมด</span><p className="text-xs font-bold text-blue-700 tabular-nums">{totalDocsCount.toLocaleString()} ใบ</p></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border-2 border-emerald-200/80 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-700">จำนวนที่จัดของได้ / วัน</h4>
              <p className="text-xs text-slate-500 mt-0.5">Daily Picked &amp; Completed</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs"><CheckCircle2 className="w-5 h-5" /></div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
            <div><span className="text-3xl sm:text-4xl font-bold text-emerald-600 tracking-tight tabular-nums">{dailyPickedOrders.toLocaleString()}</span><span className="text-sm font-bold text-slate-600 ml-1.5">ใบ / วัน</span></div>
            <div className="text-right"><span className="text-xs font-semibold text-slate-500">อัตราจัดสำเร็จ</span><p className="text-xs font-bold text-emerald-700 tabular-nums">{completionPercent}% ({completedDocsCount.toLocaleString()} ใบ)</p></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border-2 border-indigo-200/80 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-700">จำนวนที่ส่งต่อฝ่ายขนส่ง</h4>
              <p className="text-xs text-slate-500 mt-0.5">Transferred to Delivery</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs"><Truck className="w-5 h-5" /></div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
            <div><span className="text-3xl sm:text-4xl font-bold text-indigo-600 tracking-tight tabular-nums">{transferredCount.toLocaleString()}</span><span className="text-sm font-bold text-slate-600 ml-1.5">ใบ</span></div>
            <div className="text-right"><span className="text-xs font-semibold text-slate-500">ส่งต่อสำเร็จ</span><p className="text-xs font-bold text-indigo-700 tabular-nums">{transferredPct}% ของที่จัดเสร็จ</p></div>
          </div>
        </div>
      </div>

      {/* Pending and average lead-time reports */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white p-6 rounded-xl border border-amber-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div><span className="text-xs font-bold text-slate-500">นับจากวันที่รับใบจอง</span><h3 className="text-base font-bold text-slate-900">เลขที่บิลที่ค้างจัดของ (Pending Picking Orders)</h3><p className="text-xs text-slate-500 leading-relaxed">บิลที่ยังไม่ได้จัดหรืออยู่ระหว่างจัด นับจำนวนวันค้างจากวันที่รับใบจอง</p></div>
            <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0"><Hourglass className="w-5 h-5" /></div>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-end justify-between">
            <div><div className="flex items-baseline gap-2"><span className="text-3xl sm:text-4xl font-black text-amber-600 tracking-tight">{pendingDocsCount.toLocaleString()}</span><span className="text-sm font-bold text-slate-600">เลขที่บิลค้าง</span></div><p className="text-xs text-slate-500 mt-1">{pendingDocsCount > 0 ? 'ต้องติดตามเร่งรัดเพื่อไม่ให้กระทบ SLA' : 'ไม่มีรายการบิลค้างจัดในขณะนี้'}</p></div>
            <button onClick={() => setStatusFilter(statusFilter === 'pending_all' ? 'all' : 'pending_all')} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${statusFilter === 'pending_all' ? 'bg-amber-600 text-white border-amber-600 shadow-xs' : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'}`}><span>{statusFilter === 'pending_all' ? 'แสดงทั้งหมด' : 'ดูเฉพาะบิลค้าง'}</span><ArrowRightCircle className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-sky-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between"><div><span className="text-xs font-bold text-slate-500">วันที่จัดเสร็จ - วันที่ใบจอง</span><h3 className="text-base font-bold text-slate-900">ระยะเวลาจัดของ (Picking Lead Time)</h3><p className="text-xs text-slate-500 leading-relaxed">คำนวณจำนวนวันที่ใช้จัดของในแต่ละเลขที่บิล</p></div><div className="w-11 h-11 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-xs shrink-0"><Clock className="w-5 h-5" /></div></div>
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-end justify-between"><div><div className="flex items-baseline gap-2"><span className="text-3xl sm:text-4xl font-black text-sky-700 tracking-tight">{avgLeadTimeDays}</span><span className="text-sm font-bold text-slate-600">วันเฉลี่ย / บิล</span></div><p className="text-xs text-slate-500 mt-1">เป้าหมาย SLA ไม่เกิน {pickingLeadTimeTarget} วันทำการ</p></div><div className="text-right"><span className="text-xs font-semibold text-slate-500">ตรงตามแผน ≤ {pickingLeadTimeTarget} วัน</span><p className="text-xs font-bold text-emerald-600 tabular-nums">{onPlanLeadTimeCount.toLocaleString()} จาก {leadTimeRecords.length.toLocaleString()} บิล ({onPlanLeadTimePercent}%)</p></div></div>
        </div>
      </div>

      {/* Picking Lead Time statistics */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3.5 border-b border-slate-100">
          <div><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 border border-indigo-100"><BarChart2 className="w-3.5 h-3.5" /></div><h3 className="text-xs sm:text-sm font-bold text-slate-900">ระยะเวลาจัดสินค้าของแต่ละเลขที่บิล (Picking Lead Time: Max, Mean, Min)</h3><span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">คำนวณจาก {leadTimeStats.count.toLocaleString()} บิล</span></div><p className="text-xs text-slate-500 mt-1">คำนวณจากวันที่รับใบจองถึงวันที่จัดเสร็จจริง</p></div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap lg:justify-end">
            <div className="flex-1 sm:flex-initial min-w-[90px] bg-emerald-50/70 border border-emerald-100 rounded-xl px-3 py-2 text-center"><span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">MIN (เร็วสุด)</span><div className="flex items-baseline justify-center gap-1 mt-0.5"><span className="text-lg sm:text-xl font-black text-emerald-700 font-mono">{leadTimeStats.min}</span><span className="text-[11px] font-semibold text-emerald-800">วัน</span></div></div>
            <div className="flex-1 sm:flex-initial min-w-[105px] bg-blue-50/80 border border-blue-200/80 rounded-xl px-3.5 py-2 text-center shadow-2xs"><span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider block">MEAN (เฉลี่ย)</span><div className="flex items-baseline justify-center gap-1 mt-0.5"><span className="text-xl sm:text-2xl font-black text-blue-900 font-mono">{leadTimeStats.mean}</span><span className="text-xs font-bold text-blue-800">วัน</span></div></div>
            <div className="flex-1 sm:flex-initial min-w-[90px] bg-rose-50/70 border border-rose-100 rounded-xl px-3 py-2 text-center"><span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">MAX (นานสุด)</span><div className="flex items-baseline justify-center gap-1 mt-0.5"><span className="text-lg sm:text-xl font-black text-rose-700 font-mono">{leadTimeStats.max}</span><span className="text-[11px] font-semibold text-rose-800">วัน</span></div></div>
            <div className="min-w-[145px] text-right"><span className="text-xs font-semibold text-slate-500 block">เกณฑ์ SLA: ไม่เกิน {pickingLeadTimeTarget} วันทำการ</span><span className="text-xs font-bold text-emerald-600 tabular-nums">ตรงตามแผน {onPlanLeadTimeCount.toLocaleString()} / {leadTimeRecords.length.toLocaleString()} บิล ({onPlanLeadTimePercent}%)</span></div>
          </div>
        </div>
        <div className="pt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          {leadTimeStats.distribution.map((item, index) => { const barColors = ['bg-emerald-500', 'bg-blue-500', 'bg-indigo-500', 'bg-amber-500']; const lightBgs = ['bg-emerald-50/60 border-emerald-100', 'bg-blue-50/60 border-blue-100', 'bg-indigo-50/60 border-indigo-100', 'bg-amber-50/60 border-amber-100']; return <div key={item.range} className={`p-3 rounded-xl border ${lightBgs[index % lightBgs.length]} flex flex-col justify-between`}><div className="flex items-center justify-between text-xs mb-1.5"><span className="font-semibold text-slate-700">{item.range}</span><span className="font-mono font-bold text-slate-900">{item.count.toLocaleString()} บิล</span></div><div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden my-1"><div className={`h-full rounded-full transition-all duration-500 ${barColors[index % barColors.length]}`} style={{ width: `${Math.max(item.percentage, item.count > 0 ? 4 : 0)}%` }} /></div><div className="flex items-center justify-between text-[11px] text-slate-500 mt-1"><span>สัดส่วน</span><span className="font-bold text-slate-700">{item.percentage}%</span></div></div>; })}
        </div>
      </div>
      {/* Main Table: รายงานสถานะใบสั่งจัดสินค้า */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Table Header & Search Filter */}
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-blue-50 text-blue-700">
                <Boxes className="w-4 h-4" />
              </span>
              <h3 className="text-base font-bold text-slate-900">
                รายงานสถานะใบสั่งจัดสินค้า(Warehouse Picking & Lead Time Status)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              แสดงเลขที่ใบจอง วันที่เปิดบิลขาย วันที่รับใบจอง วันที่จัดเสร็จ จำนวนวันค้างจัดของ (สำหรับบิลค้างจัด) ติดตาม Lead Time และกดดูรายการสินค้า (ทั้งหมด {filteredDocs.length} รายการ)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="ค้นหาเลขที่บิล, ชื่อลูกค้า..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 w-56"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="กรองตามสถานะงานคลัง"
              className="py-1.5 px-3 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer font-sans"
            >
              <option value="all">สถานะทั้งหมด</option>
              <option value="pending_all">⏳ บิลค้างจัดของ ({pendingDocsCount})</option>
              <option value="delayed">⚠️ เฉพาะบิลที่ล่าช้าเกิน {pickingLeadTimeTarget} วัน ({delayedDocsCount})</option>
              <option value="completed">จัดเสร็จแล้ว ({completedDocsCount})</option>
            </select>

            <button
              type="button"
              id="btn-warehouse-export-excel"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-200 shadow-2xs transition-all cursor-pointer"
              title="ส่งออกรายงานสถานะใบสั่งจัดสินค้าตามตัวกรองเป็น Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4 whitespace-nowrap">เลขที่ใบจอง</th>
                <th className="py-3.5 px-4 whitespace-nowrap">ลูกค้า</th>
                <th className="py-3.5 px-4 whitespace-nowrap">วันที่เปิดบิลขาย</th>
                <th className="py-3.5 px-4 whitespace-nowrap">วันที่รับใบจอง</th>
                <th className="py-3.5 px-4 whitespace-nowrap">วันที่จัดเสร็จ</th>
                <th className="py-3.5 px-4 text-center bg-amber-50/80 text-amber-900 border-x border-amber-200/70 whitespace-nowrap">
                  <div className="flex items-center justify-center gap-1">
                    <Hourglass className="w-3 h-3 text-amber-600" />
                    <span>จำนวนวันค้างจัดของ</span>
                  </div>
                  <span className="text-[9px] font-normal normal-case block text-amber-700/80">ปัจจุบัน - วันที่รับใบจอง</span>
                </th>
                <th className="py-3.5 px-4 text-center bg-sky-50/80 text-sky-900 border-r border-sky-200/70 whitespace-nowrap">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3 text-sky-600" />
                    <span>Lead Time (วัน)</span>
                  </div>
                  <span className="text-[9px] font-normal normal-case block text-sky-700/80">เริ่มจากวันที่รับใบจอง</span>
                </th>
                <th className="py-3.5 px-4 text-center whitespace-nowrap">
                  <div className="flex items-center justify-center gap-1">
                    <Package className="w-3 h-3 text-slate-500" />
                    <span>จำนวนรายการ (กดดูได้)</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                        <Boxes className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-slate-700">ไม่พบข้อมูลใบสั่งจัดสินค้าตามเงื่อนไขที่เลือก (0 รายการ)</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {fromDate || toDate ? `ช่วงวันที่ ${fromDate || '...'} ถึง ${toDate || '...'} ไม่มีรายการคำสั่งจัดของที่ตรงตามเงื่อนไข` : 'ไม่มีรายการคำสั่งจัดของ'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetFilter}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>ล้างตัวกรองและแสดงข้อมูลทั้งหมด</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedDocs.map((doc, docIdx) => {
                  const isCompleted = doc.status === 'completed' || doc.status === 'verified';
                  const isPending = doc.status === 'pending' || doc.status === 'picking';
                  const isDelayed = isDocDelayed(doc);
                  const isOverTargetPending = isPending && (doc.pendingDays || 0) > pickingLeadTimeTarget;
                  const leadTimeDays = getPickingLeadTimeDays(doc);

                  return (
                    <tr 
                      key={`wh-row-${doc.id || doc.docNo || docIdx}-${(currentPage - 1) * pageSize + docIdx}`}
                      className={`hover:bg-blue-50/40 transition-colors ${
                        isOverTargetPending ? 'bg-amber-50/30' : isDelayed ? 'bg-rose-50/20' : docIdx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'
                      }`}
                    >
                      {/* 1. เลขที่เอกสาร */}
                      <td className="py-3.5 px-4 font-mono font-bold text-[#0a2558] whitespace-nowrap">
                        <span 
                          className="hover:underline cursor-pointer" 
                          onClick={() => {
                            if (onSelectDoc) onSelectDoc(doc.docNo);
                            else setSelectedDocForItems(doc);
                          }}
                          title="คลิกเพื่อดูรายละเอียด / ติดตามบิล"
                        >
                          {doc.docNo}
                        </span>
                      </td>

                      {/* 2. ลูกค้า จากข้อมูลฝ่ายขายที่มีเลขที่ใบจองตรงกัน */}
                      <td className="py-3.5 px-4 font-semibold text-slate-900 max-w-[220px] truncate" title={doc.customer}>
                        {doc.customer || '-'}
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px] whitespace-nowrap">{doc.salesOrderDate || '-'}</td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px] whitespace-nowrap">{doc.receivedBookingDate || doc.date || '-'}</td>
                      <td className="py-3.5 px-4 text-slate-700 font-mono text-[11px] whitespace-nowrap">
                        {doc.completedDate || '-'}
                      </td>

                      {/* 4. จำนวนวันค้างจัดของ (สำหรับรายการที่จัดเสร็จแล้วแสดงเป็น '-' ส่วนบิลที่ยังไม่เสร็จแสดงจำนวนวันค้างตามจริง) */}
                      <td className="py-3.5 px-4 text-center font-mono border-x border-amber-100/80 bg-amber-50/25 whitespace-nowrap">
                        {isCompleted ? (
                          <span className="text-slate-400 font-mono text-xs font-bold">-</span>
                        ) : (
                          <div className="inline-flex flex-col items-center">
                            <span className={`inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full font-black text-xs ${
                              (doc.pendingDays || 0) > pickingLeadTimeTarget
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : (doc.pendingDays || 0) >= 2
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-amber-50 text-amber-800 border border-amber-200'
                            }`}>
                              <Hourglass className="w-3 h-3" />
                              <span>{doc.pendingDays === undefined ? '-' : `${doc.pendingDays} วัน`}</span>
                            </span>
                            {(doc.pendingDays || 0) > pickingLeadTimeTarget && (
                              <span className="text-[10px] text-rose-600 font-bold mt-0.5">
                                เกินเป้า {(doc.pendingDays || 0) - pickingLeadTimeTarget} วัน
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 5. การติดตามจำนวนวัน Lead Time โดยเริ่มวันที่รับใบจอง */}
                      <td className="py-3.5 px-4 text-center font-mono border-r border-sky-100/80 bg-sky-50/25 whitespace-nowrap">
                        {leadTimeDays !== undefined ? (
                          <div className="inline-flex flex-col items-center">
                            <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full font-black text-xs ${
                              leadTimeDays < pickingLeadTimeTarget
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : leadTimeDays === pickingLeadTimeTarget
                                ? 'bg-sky-100 text-sky-800 border border-sky-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}>
                              {leadTimeDays} วัน
                            </span>
                            <span className="text-[9px] text-slate-500 mt-0.5">
                              {leadTimeDays <= pickingLeadTimeTarget ? '✓ ทันเป้า SLA' : `⚠️ เกิน SLA +${leadTimeDays - pickingLeadTimeTarget} วัน`}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs font-bold">-</span>
                        )}
                      </td>

                      {/* 7. Popup แสดงจำนวนรายการจากข้อมูลฝ่ายขาย ว่ามีรายการอะไรบ้าง กดดูได้ */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedDocForItems(doc)}
                          className="group inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200/80 transition-all cursor-pointer hover:shadow-xs"
                          title="คลิกเพื่อดูรายการสินค้าในบิลนี้"
                        >
                          <Package className="w-3.5 h-3.5 text-blue-600 group-hover:scale-110 transition-transform" />
                          <span className="font-bold text-xs">{doc.itemsCount} รายการ</span>
                          <span className="text-[10px] text-blue-500 font-normal underline decoration-dotted">ดู</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer info */}
        <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-700">แสดงผล:</span>
            <span>
              {filteredDocs.length === 0
                ? '0'
                : `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredDocs.length)}`
              } จากทั้งหมด {filteredDocs.length} รายการ
            </span>
            <span className="text-slate-300">•</span>
            <span>บิลค้างจัด: <strong className="text-amber-700 font-bold">{pendingDocsCount}</strong> ใบ</span>
            <span className="text-slate-300">•</span>
            <span>Lead Time เฉลี่ย: <strong className="text-sky-700 font-bold">{avgLeadTimeDays}</strong> วัน</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <label htmlFor="warehouse-page-size" className="font-semibold text-slate-600 whitespace-nowrap">
              จำนวนรายการ:
            </label>
            <select
              id="warehouse-page-size"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value) as 10 | 25 | 50)}
              className="px-2 py-1 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              aria-label="จำนวนรายการต่อหน้า"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage <= 1}
              className="px-2 py-1 rounded-md border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              aria-label="หน้าก่อนหน้า"
            >
              ก่อนหน้า
            </button>
            <span className="min-w-16 text-center font-semibold text-slate-600">
              หน้า {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage >= totalPages}
              className="px-2 py-1 rounded-md border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              aria-label="หน้าถัดไป"
            >
              หน้าถัดไป
            </button>
          </div>
        </div>
      </div>

      {/* Item Detail Popup Modal */}
      {selectedDocForItems && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 bg-slate-50/80 flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#0a2558] text-white">
                    ORDER ITEMS DETAIL
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-700">
                    เลขที่: {selectedDocForItems.docNo}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  รายการสินค้าที่ต้องจัด (Picking Items)
                </h3>
                <p className="text-xs text-slate-500">
                  ลูกค้า: <span className="font-semibold text-slate-800">{selectedDocForItems.customer || '-'}</span> • วันที่รับใบจอง: <span className="font-mono text-slate-700">{selectedDocForItems.receivedBookingDate || '-'}</span>
                </p>
              </div>

              <button
                onClick={() => setSelectedDocForItems(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer transition-colors"
                aria-label="ปิดหน้าต่าง"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Status Bar */}
            <div className="px-5 py-3 bg-blue-50/50 border-b border-blue-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-600">สถานะงานจัด:</span>
                {getStatusBadge(selectedDocForItems.status)}
              </div>
              <div className="flex items-center gap-4 text-slate-600 font-mono text-[11px]">
                {selectedDocForItems.status === 'pending' || selectedDocForItems.status === 'picking' ? (
                  <span>
                    จำนวนวันค้างจัด: <strong className="text-amber-700">{selectedDocForItems.pendingDays ?? '-'} วัน</strong>
                  </span>
                ) : (
                  <>
                    <span>
                      วันที่จัดเสร็จ: <strong className="text-slate-800">{selectedDocForItems.completedDate || '-'}</strong>
                    </span>
                    <span>
                      Lead Time ที่ใช้: <strong className="text-sky-700">{getPickingLeadTimeDays(selectedDocForItems) ?? 0} วัน</strong>
                    </span>
                  </>
                )}
                <span>
                  รวมรายการ: <strong className="text-slate-900">{getDocItems(selectedDocForItems).length} รายการ</strong>
                </span>
              </div>
            </div>

            {/* Items Table List */}
            <div className="p-5 overflow-y-auto flex-1">
              <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center">ลำดับ</th>
                    <th className="py-2.5 px-3">รหัสสินค้า</th>
                    <th className="py-2.5 px-3">ชื่อรายการสินค้า</th>
                    <th className="py-2.5 px-3 text-right">จำนวน</th>
                    <th className="py-2.5 px-3 text-center">หน่วยนับ</th>
                    <th className="py-2.5 px-3 text-right">ราคา/หน่วย</th>
                    <th className="py-2.5 px-3 text-right">รวมเงิน (บาท)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {getDocItems(selectedDocForItems).map((item, idx) => (
                    <tr key={`item-${selectedDocForItems.docNo}-${idx}`} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px] font-semibold">{item.productCode}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{item.productName}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700">
                        {item.quantity.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-500">{item.unit || 'ชิ้น'}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        ฿{(item.unitPrice || 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        ฿{((item.totalPrice || (item.quantity * (item.unitPrice || 0)))).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Total Summary inside Modal */}
              <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-600">
                  <Info className="w-4 h-4 text-blue-600" />
                  <span>
                    ข้อมูลรายการสินค้าสอดคล้องกับใบสั่งจัดสินค้าคลัง
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500">มูลค่ารวมทั้งสิ้น: </span>
                  <strong className="text-sm font-black text-slate-900">
                    ฿{getDocItems(selectedDocForItems).reduce((sum, it) => sum + (it.totalPrice || (it.quantity * (it.unitPrice || 0))), 0).toLocaleString()}
                  </strong>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => {
                  const docNo = selectedDocForItems.docNo;
                  setSelectedDocForItems(null);
                  onSelectDoc(docNo);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0a2558] hover:text-blue-700 hover:underline cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>เปิดหน้าติดตามสถานะครบวงจร (Tracking Modal)</span>
              </button>

              <button
                onClick={() => setSelectedDocForItems(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold cursor-pointer transition-colors shadow-xs"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};



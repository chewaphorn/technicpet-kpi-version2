import { aggregateDeliveryTrips, filterDeliveryTrips, calculateDeliveryMetrics, isCompletedTrip, deliveryPlanStatus, isDelayedDeliveryTrip, formatShortDate, getDeliveryReportDate } from '../utils/logisticsReportMetrics';
import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { DeliveryTrip, AuthUser, DetailedSalesOrder } from '../types';
import { parseDateFlexible, calculateDaysDiff } from '../utils/dataProcessor';
import { getMinMaxDates } from '../utils/dateUtils';
import { useReportTargets } from '../hooks/useReportTargets';
import { 
  Truck, 
  CheckCircle2, 
  Clock, 
  Weight, 
  Timer, 
  Search, 
  Filter, 
  RotateCcw,
  AlertTriangle,
  Eye,
  FileText,
  FileSpreadsheet,
  Package,
  Calendar,
  Hourglass,
  X,
  MapPin,
  User,
  Phone,
  Layers,
  BarChart2,
  TrendingUp,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

interface DeliveryReportViewProps {
  trips: DeliveryTrip[];
  detailedSalesOrders: DetailedSalesOrder[];
  onSelectDoc: (docNo: string) => void;
  summary?: {
    totalTrips: number;
    otdPercent: number;
    avgDeliveryDays: number;
    totalWeightTon: number;
    inTransitCount: number;
    delayedCount: number;
    uniqueVehiclesCount?: number;
    pendingDeliveriesCount?: number;
    speedDistribution?: { range: string; trips: number }[];
  };
  onOpenPDFReport?: (startDate?: string, endDate?: string, filters?: { status?: string; search?: string; vehicle?: string }) => void;
  onOpenGoogleSheetsModal?: (dept?: 'all' | 'sales' | 'warehouse' | 'delivery') => void;
  currentUser?: AuthUser | null;
  onSyncDelivery?: () => Promise<void>;
  isSyncingDelivery?: boolean;
  syncErrorDelivery?: string;
  lastSyncDelivery?: string;
}

/**
 * แปลงวันที่เป็นรูปแบบตัวย่อ วว/ดด/ปป (DD/MM/YY เช่น 21/07/69)
 */

export const DeliveryReportView: React.FC<DeliveryReportViewProps> = ({ 
  trips, 
  detailedSalesOrders,
  onSelectDoc,
  summary,
  onOpenPDFReport,
  onOpenGoogleSheetsModal,
  currentUser,
  onSyncDelivery,
  isSyncingDelivery = false,
  syncErrorDelivery,
  lastSyncDelivery,
}) => {
  const { deliveryCompletionTargetPercent } = useReportTargets();
  const datasetDateRange = useMemo(() => {
    const dates = trips.map(getDeliveryReportDate);
    return getMinMaxDates(dates, '', '');
  }, [trips]);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchDocFilter, setSearchDocFilter] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [selectedPlate, setSelectedPlate] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'all' | 'completed' | 'in_transit' | 'delayed'>('all');
  const [selectedTripForItems, setSelectedTripForItems] = useState<DeliveryTrip | null>(null);
  const [tableScale, setTableScale] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  const [currentPage, setCurrentPage] = useState(1);



  // Sync date range when dataset changes
  useEffect(() => {
    if (trips.length > 0) {
      setFromDate(datasetDateRange.min);
      setToDate(datasetDateRange.max);
    }
  }, [datasetDateRange.min, datasetDateRange.max, trips.length]);

  // Close modal with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedTripForItems) {
        setSelectedTripForItems(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTripForItems]);

  const handleResetFilter = () => {
    setFromDate(datasetDateRange.min);
    setToDate(datasetDateRange.max);
    setSearchDocFilter('');
    setTableSearch('');
    setSelectedPlate('all');
    setActiveTab('all');
    setCurrentPage(1);
  };

  // 1. Group and aggregate trips by docNo (เลขที่ใบจอง) to prevent duplicate rows (1 docNo = 1 row)
  const uniqueGroupedTrips = useMemo(() => aggregateDeliveryTrips(trips, detailedSalesOrders), [trips, detailedSalesOrders]);

  // Extract all unique license plates for the vehicle dropdown filter
  const uniqueLicensePlates = useMemo(() => {
    const plates = new Set<string>();
    uniqueGroupedTrips.forEach((t) => {
      const p = (t.licensePlate || t.vehicleNo || '').trim();
      if (p && p !== '-' && p !== 'รอระบุ') {
        plates.add(p);
      }
    });
    return Array.from(plates).sort((a, b) => a.localeCompare(b, 'th'));
  }, [uniqueGroupedTrips]);

  // Filter grouped trips by date range, search text (docNo, customerName, route, licensePlate), vehicle plate, and status tab
  const filteredTrips = useMemo(() => filterDeliveryTrips(uniqueGroupedTrips, {fromDate, toDate, search: tableSearch || searchDocFilter, vehicle: selectedPlate, status: activeTab}), [uniqueGroupedTrips, fromDate, toDate, tableSearch, searchDocFilter, selectedPlate, activeTab]);
  const statusTrips = useMemo(() => filterDeliveryTrips(uniqueGroupedTrips, {fromDate, toDate, search: tableSearch || searchDocFilter, vehicle: selectedPlate}), [uniqueGroupedTrips, fromDate, toDate, tableSearch, searchDocFilter, selectedPlate]);

  useEffect(() => {
    setCurrentPage(1);
  }, [fromDate, toDate, tableSearch, searchDocFilter, selectedPlate, activeTab, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredTrips.length / pageSize));
  const paginatedTrips = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredTrips.slice(startIndex, startIndex + pageSize);
  }, [filteredTrips, currentPage, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const {totalBillsCount, completedBillsCount, completedBillsRate, uniqueVehiclesCount, pendingDeliveriesCount, totalWeight, inTransit, delayed, leadTimeStats} = useMemo(() => calculateDeliveryMetrics(filteredTrips), [filteredTrips]);

  const getStatusPill = (status: DeliveryTrip['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            จัดส่งสำเร็จ
          </span>
        );
      case 'in_transit':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
            <Timer className="w-3 h-3 text-blue-600" />
            กำลังเดินทาง
          </span>
        );
      case 'delayed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            ล่าช้า
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-50 text-slate-600 border border-slate-200">
            ????????????
          </span>
        );
    }
  };

  const getTripItems = (trip: DeliveryTrip) => trip.items || [];

  const handleExportExcel = () => {
    try {
      const exportRows = filteredTrips.map((trip, index) => {
        const orderDate = trip.orderDate;
        const handoffDate = trip.handoffDate || trip.handoverDate;
        const plannedDate = trip.plannedDate;
        const loadedDate = trip.loadedDate;
        const docNo = trip.docNo || trip.salesOrderNo || trip.deliveryNo || '-';
        const customer = trip.customer || trip.customerName || '-';
        const leadTimeDays = calculateDaysDiff(handoffDate, loadedDate);
        const pendingDays = !isCompletedTrip(trip)
          ? (() => {
              const parsedHandoff = parseDateFlexible(handoffDate);
              if (!parsedHandoff) return trip.pendingDeliveryDays;
              const today = new Date();
              const todayTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
              const handoffTime = new Date(parsedHandoff.getFullYear(), parsedHandoff.getMonth(), parsedHandoff.getDate()).getTime();
              const calculatedDays = Math.round((todayTime - handoffTime) / (1000 * 60 * 60 * 24));
              return calculatedDays > 0 ? calculatedDays : trip.pendingDeliveryDays;
            })()
          : undefined;

        return {
          'ลำดับ': index + 1,
          'เลขที่เอกสาร': docNo,
          'เลขที่จัดส่ง': trip.deliveryNo || '-',
          'ชื่อลูกค้า': customer,
          'วันที่รับใบจอง': formatShortDate(orderDate),
          'วันที่รับจากคลัง': formatShortDate(handoffDate),
          'วันที่วางแผน': formatShortDate(plannedDate),
          'วันที่โหลดสินค้าจริง': formatShortDate(loadedDate),
          'สถานะ': trip.status === 'completed'
            ? 'จัดส่งสำเร็จ'
            : trip.status === 'delayed'
              ? 'ล่าช้า'
              : 'กำลังเดินทาง',
          'วันค้างส่ง': pendingDays ?? '-',
          'LEAD TIME (วัน)': leadTimeDays ?? '-',
          'สายส่ง': trip.route || '-',
          'ทะเบียนรถ': trip.licensePlate || trip.vehicleNo || '-',
          'พนักงานขับรถ': trip.driverName || '-',
          'น้ำหนัก (ตัน)': trip.weightTon ?? 0,
          'จำนวนรายการ': trip.itemsCount ?? getTripItems(trip).length,
          'ปลายทาง': trip.destination || '-',
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(
        exportRows.length > 0
          ? exportRows
          : [{ 'หมายเหตุ': 'ไม่พบข้อมูลการติดตามการจัดส่งตามเงื่อนไขที่เลือก' }]
      );
      worksheet['!cols'] = [
        { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 28 },
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
        { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 18 },
        { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 14 },
        { wch: 14 }, { wch: 28 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'ติดตามการจัดส่ง');
      const dateRangeSuffix = `${fromDate || 'ทั้งหมด'}_ถึง_${toDate || 'ทั้งหมด'}`;
      XLSX.writeFile(workbook, `TechnicPet_รายงานติดตามการจัดส่ง_${dateRangeSuffix}.xlsx`);
    } catch (error) {
      console.error('ไม่สามารถส่งออกรายงานติดตามการจัดส่งเป็น Excel ได้:', error);
      window.alert('ไม่สามารถส่งออกรายงาน Excel ได้ กรุณาลองใหม่อีกครั้ง');
    }
  };

  return (
    <div className="p-3 sm:p-4 lg:p-5 space-y-4 w-full max-w-[1550px] mx-auto animate-in fade-in duration-300">
      {/* Title & Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-600 tracking-tight">
            Transport Report Dashboard
          </h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            สรุปข้อมูลผลงานแผนกขนส่งและสถานะการจัดส่ง 
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          {onSyncDelivery && (
            <button
              type="button"
              id="btn-sync-delivery-only"
              onClick={onSyncDelivery}
              disabled={isSyncingDelivery}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:opacity-60 shadow-xs transition-all cursor-pointer"
              title="ดึงเฉพาะข้อมูลการจัดส่งจาก Google Sheet และประมวลผลทันที"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingDelivery ? 'animate-spin' : ''}`} />
              <span>{isSyncingDelivery ? 'กำลังดึงข้อมูลการจัดส่ง...' : 'ดึงเฉพาะข้อมูลการจัดส่ง'}</span>
            </button>
          )}

          {onOpenGoogleSheetsModal && (
            <button
              type="button"
              id="btn-delivery-sheet-config"
              onClick={() => onOpenGoogleSheetsModal('delivery')}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold text-purple-800 bg-purple-50 hover:bg-purple-100 active:bg-purple-200 border border-purple-200 shadow-xs transition-all cursor-pointer"
              title="กำหนดและอัปเดตลิงก์ Google Sheet แผนกขนส่ง"
            >
              <FileSpreadsheet className="w-4 h-4 text-purple-600" />
              <span>ลิงก์ Google Sheet ขนส่ง</span>
            </button>
          )}

          {onOpenPDFReport && (
            <button
              type="button"
              id="btn-delivery-export-pdf"
              onClick={() => onOpenPDFReport(fromDate, toDate, { status: activeTab, search: tableSearch || searchDocFilter, vehicle: selectedPlate })}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-200 shadow-2xs transition-all cursor-pointer self-start sm:self-auto"
            >
              <FileText className="w-4 h-4 text-rose-500" />
              <span>Export PDF รายงานขนส่ง</span>
            </button>
          )}
        </div>
      </div>

      {/* Sync Error Alert for Delivery only */}
      {syncErrorDelivery && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-rose-800">พบข้อผิดพลาดในการดึงข้อมูลการจัดส่ง</p>
            <p className="text-rose-600 mt-0.5">{syncErrorDelivery}</p>
            <p className="text-rose-500 mt-1 font-medium">คำแนะนำ: ตรวจสอบสิทธิ์การแชร์ของชีตการจัดส่งให้เป็น "ทุกคนที่มีลิงก์มีสิทธิ์ดู"</p>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white rounded-xl p-3 sm:p-4 border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              จากวันที่
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 w-40"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              ถึงวันที่
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 w-40"
            />
          </div>

          {/* Enhanced Search Input */}
          <div className="flex-1 min-w-[220px]">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              ค้นหา (เลขที่เอกสาร, ชื่อลูกค้า, สายส่ง, ทะเบียนรถ)
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="พิมพ์เลขที่บิล, ชื่อลูกค้า, สายส่ง, ทะเบียนรถ..."
                value={searchDocFilter}
                onChange={(e) => {
                  setSearchDocFilter(e.target.value);
                  setTableSearch(e.target.value);
                }}
                className="pl-9 pr-8 py-1.5 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 w-full"
              />
              {searchDocFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchDocFilter('');
                    setTableSearch('');
                  }}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="ล้างคำค้นหา"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Vehicle License Plate Dropdown Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 text-blue-700" />
              <span>ทะเบียนรถ</span>
            </label>
            <select
              value={selectedPlate}
              onChange={(e) => setSelectedPlate(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 min-w-[160px] cursor-pointer"
            >
              <option value="all">ทะเบียนรถทั้งหมด ({uniqueLicensePlates.length} คัน)</option>
              {uniqueLicensePlates.map((plate) => (
                <option key={plate} value={plate}>
                  {plate}
                </option>
              ))}
            </select>
          </div>

          <div className="self-end flex items-center gap-2">
            <button
              id="btn-delivery-filter-apply"
              className="bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>กรองข้อมูล</span>
            </button>
            <button
              onClick={handleResetFilter}
              className="border border-slate-300 hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
              title="ล้างตัวกรองทั้งหมด"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>รีเซ็ต</span>
            </button>
          </div>
        </div>
      </div>

      {/* แถบการ์ดสรุปผล KPI: Clean & White Theme Modern Minimalist */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* การ์ดที่ 1: จำนวนบิลทั้งหมด */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all flex items-center justify-between">
          <div>
            <span className="text-[11.5px] font-bold text-slate-500 tracking-wider uppercase block">
              จำนวนบิลทั้งหมด
            </span>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight tabular-nums">{totalBillsCount.toLocaleString()}</span>
              <span className="text-xs font-semibold text-slate-500">ใบ</span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-1.5 truncate">
              <FileText className="w-3 h-3 text-sky-500 shrink-0" />
              <span>ผลรวมบิลทั้งหมดในระบบ</span>
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 border border-sky-100 shadow-2xs">
            <FileText className="w-5 h-5 text-sky-600" />
          </div>
        </div>

        {/* การ์ดที่ 2: จำนวนบิลที่ส่งสำเร็จ */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all flex items-center justify-between">
          <div>
            <span className="text-[11.5px] font-bold text-slate-500 tracking-wider uppercase block">
              จำนวนบิลที่ส่งสำเร็จ
            </span>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight tabular-nums">{completedBillsCount.toLocaleString()}</span>
              <span className="text-xs font-semibold text-slate-500">ใบ</span>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 ml-1 tabular-nums">
                {completedBillsRate}%
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-1.5 truncate">
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
              <span>ดำเนินการจัดส่งเสร็จสิ้น · เป้าหมาย ≥ {deliveryCompletionTargetPercent}%</span>
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100 shadow-2xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
        </div>

        {/* การ์ดที่ 3: จำนวนบิลที่ค้างส่ง (ปรับจากจำนวนเที่ยวที่ส่งล่าช้า) */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all flex items-center justify-between">
          <div>
            <span className="text-[11.5px] font-bold text-slate-500 tracking-wider uppercase block">
              จำนวนบิลที่ค้างส่ง
            </span>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-bold text-amber-600 tracking-tight tabular-nums">{pendingDeliveriesCount.toLocaleString()}</span>
              <span className="text-xs font-semibold text-slate-500">ใบ</span>
              {delayed > 0 && (
                <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 ml-1 tabular-nums" title="บิลที่เกินกำหนดเวลา">
                  ล่าช้า {delayed}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-1.5 truncate">
              <Hourglass className="w-3 h-3 text-amber-500 shrink-0" />
              <span>รอขึ้นรถหรือกำลังจัดส่ง</span>
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100 shadow-2xs">
            <Hourglass className="w-5 h-5 text-amber-600" />
          </div>
        </div>

        {/* การ์ดที่ 4: จำนวนรถที่ออกต่อวัน (นับทะเบียนรถไม่ซ้ำที่วิ่งรอบจัดส่ง) */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all flex items-center justify-between">
          <div>
            <span className="text-[11.5px] font-bold text-slate-500 tracking-wider uppercase block">
              จำนวนรถที่ออกต่อวัน
            </span>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-bold text-blue-900 tracking-tight tabular-nums">{uniqueVehiclesCount.toLocaleString()}</span>
              <span className="text-xs font-semibold text-slate-500">คัน/วัน</span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-1.5 truncate">
              <Truck className="w-3 h-3 text-blue-500 shrink-0" />
              <span>จัดวิ่ง {filteredTrips.length} เที่ยวจัดส่ง</span>
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100 shadow-2xs">
            <Truck className="w-5 h-5 text-blue-600" />
          </div>
        </div>
      </div>

      {/* แถบการวิเคราะห์ระยะเวลาจัดส่งของแต่ละเลขที่บิล (Max, Mean, Min Lead Time Banner & Chart) */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3.5 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 border border-indigo-100">
                <BarChart2 className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                ระยะเวลาจัดส่งของแต่ละเลขที่บิล (Lead Time: Max, Mean, Min)
              </h3>
              <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                คำนวณจาก {leadTimeStats.count} บิล
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              สถิติจำนวนวันตั้งแต่รับใบจอง/รับจากคลังจนถึงโหลดสินค้าจริงของแต่ละเลขที่บิล
            </p>
          </div>

          {/* ไฮไลต์ตัวเลข 3 ค่าสำคัญ: Min, Mean (เฉลี่ย), Max */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* MIN */}
            <div className="flex-1 sm:flex-initial min-w-[90px] bg-emerald-50/70 border border-emerald-100 rounded-xl px-3 py-2 text-center">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                MIN (เร็วสุด)
              </span>
              <div className="flex items-baseline justify-center gap-1 mt-0.5">
                <span className="text-lg sm:text-xl font-black text-emerald-700 font-mono">
                  {leadTimeStats.min}
                </span>
                <span className="text-[11px] font-semibold text-emerald-800">วัน</span>
              </div>
            </div>

            {/* MEAN (ค่าเฉลี่ย) */}
            <div className="flex-1 sm:flex-initial min-w-[105px] bg-blue-50/80 border border-blue-200/80 rounded-xl px-3.5 py-2 text-center shadow-2xs">
              <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider block">
                MEAN (ค่าเฉลี่ย)
              </span>
              <div className="flex items-baseline justify-center gap-1 mt-0.5">
                <span className="text-xl sm:text-2xl font-black text-blue-900 font-mono">
                  {leadTimeStats.mean}
                </span>
                <span className="text-xs font-bold text-blue-800">วัน</span>
              </div>
            </div>

            {/* MAX */}
            <div className="flex-1 sm:flex-initial min-w-[90px] bg-rose-50/70 border border-rose-100 rounded-xl px-3 py-2 text-center">
              <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">
                MAX (นานสุด)
              </span>
              <div className="flex items-baseline justify-center gap-1 mt-0.5">
                <span className="text-lg sm:text-xl font-black text-rose-700 font-mono">
                  {leadTimeStats.max}
                </span>
                <span className="text-[11px] font-semibold text-rose-800">วัน</span>
              </div>
            </div>
          </div>
        </div>

        {/* กราฟแท่งแสดงการกระจายตัวของจำนวนวันจัดส่ง (Lead Time Distribution Bar Chart) */}
        <div className="pt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          {leadTimeStats.distribution.map((dist, dIdx) => {
            const barColors = [
              'bg-emerald-500',
              'bg-blue-500',
              'bg-indigo-500',
              'bg-amber-500',
            ];
            const lightBgs = [
              'bg-emerald-50/60 border-emerald-100',
              'bg-blue-50/60 border-blue-100',
              'bg-indigo-50/60 border-indigo-100',
              'bg-amber-50/60 border-amber-100',
            ];
            return (
              <div 
                key={`dist-${dIdx}`}
                className={`p-3 rounded-xl border ${lightBgs[dIdx % lightBgs.length]} flex flex-col justify-between`}
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-700">{dist.range}</span>
                  <span className="font-mono font-bold text-slate-900">{dist.count} บิล</span>
                </div>
                {/* Horizontal Bar */}
                <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden my-1">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${barColors[dIdx % barColors.length]}`}
                    style={{ width: `${Math.max(dist.percentage, 4)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                  <span>สัดส่วน</span>
                  <span className="font-bold text-slate-700">{dist.percentage}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Table: ตารางติดตามการจัดส่งแบบ One-Page ไม่ต้องมีสไลด์บาร์ */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Table Filter Header: Compact One-Page Layout */}
        <div className="px-4 py-3 border-b border-slate-200/80 bg-slate-50/60 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Truck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                  ข้อมูลการติดตามการจัดส่ง (Delivery Lead Time)
                </h3>
                <span className="text-[10px] font-bold bg-blue-50 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200 shrink-0">
                  {filteredTrips.length} / {uniqueGroupedTrips.length} ใบ
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-0.5" title="ปรับขนาดตาราง">
              <button
                type="button"
                onClick={() => setTableScale((scale) => Math.max(0.8, +(scale - 0.1).toFixed(1)))}
                disabled={tableScale <= 0.8}
                className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed rounded cursor-pointer"
                aria-label="ย่อตาราง"
                title="ย่อตาราง"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="min-w-10 text-center text-[10px] font-bold text-slate-600 tabular-nums">
                {Math.round(tableScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setTableScale((scale) => Math.min(1.2, +(scale + 0.1).toFixed(1)))}
                disabled={tableScale >= 1.2}
                className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed rounded cursor-pointer"
                aria-label="ขยายตาราง"
                title="ขยายตาราง"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              id="btn-delivery-export-excel"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-200 shadow-2xs transition-all cursor-pointer"
              title="ส่งออกข้อมูลการติดตามการจัดส่งตามตัวกรองเป็น Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export Excel</span>
            </button>

            {/* Quick Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
              <input
                type="text"
                placeholder="ค้นหาเลขที่บิล, ลูกค้า, ทะเบียน..."
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value);
                  setSearchDocFilter(e.target.value);
                }}
                className="pl-8 pr-7 py-1 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 w-44 sm:w-52"
              />
              {tableSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setTableSearch('');
                    setSearchDocFilter('');
                  }}
                  className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="ล้างคำค้นหา"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Filter Tabs - Compact */}
            <div className="flex bg-slate-200/70 p-0.5 rounded-lg text-[11px] font-semibold">
              {[
                { id: 'all', label: `ทั้งหมด (${statusTrips.length})` },
                { id: 'completed', label: `โหลดแล้ว (${statusTrips.filter(isCompletedTrip).length})` },
                { id: 'in_transit', label: `รอขึ้นรถ (${statusTrips.filter(t => !isCompletedTrip(t)).length})` },
                { id: 'delayed', label: `ล่าช้า (${statusTrips.filter(isDelayedDeliveryTrip).length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 11 Columns Delivery Table */}
        <div className="w-full min-h-[520px] max-h-[680px] overflow-auto overscroll-contain border-t border-slate-100">
          <table
            className="w-full min-w-[1500px] table-auto text-left text-xs border-collapse"
            style={{ zoom: tableScale }}
          >
            <colgroup>
              {[
                'w-[10%]',   // 1. เลขที่ใบจอง 
                'w-[16%]',   // 2. ชื่อลูกค้า
                'w-[6.5%]',  // 3. วันที่รับใบจอง
                'w-[7.5%]',  // 4. วันที่รับจากคลัง
                'w-[7%]',    // 5. วันที่วางแผน
                'w-[7.5%]',  // 6. โหลดสินค้าจริง
                'w-[10%]',   // 7. สถานะตามแผน
                'w-[6.5%]',  // 8. วันค้างส่ง
                'w-[6.5%]',  // 9. LEAD TIME
                'w-[12.5%]', // 10. สายส่ง / ทะเบียน
                'w-[10%]',   // 11. รายการ / ตัน (2 แถว)
              ].map((colWidth, idx) => (
                <col key={idx} className={colWidth} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[11px] shadow-[0_1px_0_0_rgba(226,232,240,1)]">
              <tr>
                {/* 1. เลขที่ใบจอง */}
                <th className="py-2.5 px-2 text-left font-semibold text-slate-600 whitespace-normal leading-tight">เลขที่ใบจอง</th>
                {/* 2. ชื่อลูกค้า */}
                <th className="py-2.5 px-2 text-left font-semibold text-slate-600 whitespace-normal leading-tight">ชื่อลูกค้า</th>
                {/* 3. วันที่รับใบจอง (orderDate) */}
                <th className="py-2.5 px-1 text-center font-semibold text-slate-600 leading-tight">
                  <span className="block">วันที่รับ</span>
                  <span className="block">ใบจอง</span>
                </th>
                {/* 4. วันที่รับจากคลัง (handoffDate) */}
                <th className="py-2.5 px-1 text-center font-semibold text-slate-600 leading-tight">
                  <span className="block">วันที่รับ</span>
                  <span className="block">จากคลัง</span>
                </th>
                {/* 5. วันที่วางแผน (plannedDate) */}
                <th className="py-2.5 px-1 text-center font-semibold text-slate-600 leading-tight">
                  <span className="block">วันที่</span>
                  <span className="block">วางแผน</span>
                </th>
                {/* 6. โหลดสินค้าจริง (loadedDate) */}
                <th className="py-2.5 px-1 text-center font-semibold text-slate-600 leading-tight">
                  <span className="block">โหลดสินค้า</span>
                  <span className="block">จริง</span>
                </th>
                {/* 7. สถานะตามแผน */}
                <th className="py-2.5 px-1 text-center font-semibold text-slate-600 whitespace-normal leading-tight">สถานะตามแผน</th>
                {/* 8. วันค้างส่ง */}
                <th className="py-2.5 px-1 text-center font-semibold text-slate-600 whitespace-normal leading-tight">วันค้างส่ง</th>
                {/* 9. LEAD TIME */}
                <th className="py-2.5 px-1 text-center font-semibold text-slate-600 whitespace-normal leading-tight">LEAD TIME</th>
                {/* 10. สายส่ง / ทะเบียน */}
                <th className="py-2.5 px-2 text-left font-semibold text-slate-600 whitespace-normal leading-tight">สายส่ง / ทะเบียน</th>
                {/* 11. รายการ / ตัน (2 แถว) */}
                <th className="py-2 px-1 text-center font-semibold text-slate-600 leading-tight">
                  <div>ชื่อสินค้า</div>
                  <div className="text-[10px] text-slate-400 font-normal">จำนวน / ตัน</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredTrips.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-400">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                        <Truck className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-slate-700">ไม่พบข้อมูลเที่ยวรถจัดส่งตามเงื่อนไขที่เลือก (0 รายการ)</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {fromDate || toDate ? `ช่วงวันที่ ${fromDate || '...'} ถึง ${toDate || '...'} ไม่มีรายการจัดส่งที่ตรงตามเงื่อนไข` : 'ไม่มีรายการจัดส่ง'}
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
                paginatedTrips.map((trip, tIdx) => {
                  const docNum = trip.docNo || trip.salesOrderNo;
                  const custName = trip.customerName || trip.customer || '-';
                  const orderD = trip.orderDate;
                  const handoffD = trip.handoffDate || trip.handoverDate;
                  const plannedD = trip.plannedDate;
                  const loadedD = trip.loadedDate && trip.loadedDate.trim() !== '' && trip.loadedDate !== '-' ? trip.loadedDate : undefined;

                  // 1. สถานะการโหลดตามแผน (Subtle Pastel Badges)
                  const plan = deliveryPlanStatus(trip);
                  const tones = {
                    waiting: { bg: 'bg-amber-50/80', text: 'text-amber-800', border: 'border-amber-200/70', dot: 'bg-amber-500' },
                    unmeasured: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200/70', dot: 'bg-slate-500' },
                    on_time: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200/70', dot: 'bg-emerald-500' },
                    late: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200/70', dot: 'bg-rose-500' },
                  };
                  const planStatusBadge = { label: plan.label, ...tones[plan.code as keyof typeof tones] };

                  // 2. Delivery Lead Time: loadedDate - handoffDate
                  let leadTimeDays: number | undefined = undefined;
                  if (loadedD && handoffD) {
                    leadTimeDays = calculateDaysDiff(handoffD, loadedD);
                  }

                  // 3. จำนวนวันค้างส่ง: วันที่ปัจจุบัน - handoffDate
                  const isLoaded = Boolean(loadedD);
                  let pendingDays: number | undefined;
                  if (!isCompletedTrip(trip)) {
                    const parsedHandoff = parseDateFlexible(handoffD);
                    if (parsedHandoff) {
                      const today = new Date();
                      const todayTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                      const handoffTime = new Date(parsedHandoff.getFullYear(), parsedHandoff.getMonth(), parsedHandoff.getDate()).getTime();
                      const diffMs = todayTime - handoffTime;
                      const calcDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
                      pendingDays = calcDays > 0 ? calcDays : trip.pendingDeliveryDays;
                    } else {
                      pendingDays = trip.pendingDeliveryDays;
                    }
                  }
                  const isDelayedTrip = trip.status === 'delayed' || (trip.status === 'in_transit' && pendingDays !== undefined && pendingDays > 2);
                  const isRowDelayed = planStatusBadge.label.includes('ล่าช้า') || isDelayedTrip;

                  return (
                    <tr 
                      key={`del-trip-${docNum || trip.id || tIdx}-${tIdx}`}
                      className={`transition-colors border-b border-slate-100 ${
                        isRowDelayed
                          ? 'bg-rose-50/15 hover:bg-rose-50/30'
                          : tIdx % 2 === 1
                          ? 'bg-slate-50/40 hover:bg-slate-50/80'
                          : 'bg-white hover:bg-slate-50/80'
                      }`}
                    >
                      {/* 1. เลขที่ใบจอง (docNo) - Monospace Font ตัวหนา */}
                      <td className="py-2.5 px-2 overflow-hidden">
                        <div className="flex flex-col min-w-0">
                          <button
                            type="button"
                            onClick={() => onSelectDoc(docNum)}
                            className="text-[#0a2558] hover:text-blue-600 font-mono font-bold text-xs text-left cursor-pointer hover:underline truncate tracking-tight transition-colors"
                            title={`คลิกเพื่อติดตามเอกสาร ${docNum}`}
                          >
                            {docNum}
                          </button>
                          {trip.deliveryNo && trip.deliveryNo !== docNum && (
                            <span className="font-mono text-[9.5px] text-slate-400 truncate block mt-0.5">{trip.deliveryNo}</span>
                          )}
                        </div>
                      </td>

                      {/* 2. ชื่อลูกค้า (customerName) */}
                      <td className="py-2.5 px-2 overflow-hidden">
                        <span 
                          className="text-[11.5px] font-medium text-slate-800 truncate block" 
                          title={custName}
                        >
                          {custName}
                        </span>
                      </td>

                      {/* 3. วันที่รับใบจอง (orderDate) - วว/ดด/ปป */}
                      <td className="py-2.5 px-1 text-center">
                        <span className="font-mono text-[11px] text-slate-600 block whitespace-nowrap">
                          {formatShortDate(orderD)}
                        </span>
                      </td>

                      {/* 4. วันที่รับจากคลัง (handoffDate) - วว/ดด/ปป */}
                      <td className="py-2.5 px-1 text-center">
                        <span className="font-mono text-[11px] text-purple-700 font-medium block whitespace-nowrap">
                          {formatShortDate(handoffD)}
                        </span>
                      </td>

                      {/* 5. วันที่วางแผน (plannedDate) - วว/ดด/ปป */}
                      <td className="py-2.5 px-1 text-center">
                        <span className="font-mono text-[11px] text-blue-700 font-medium block whitespace-nowrap">
                          {formatShortDate(plannedD)}
                        </span>
                      </td>

                      {/* 6. โหลดสินค้าจริง (loadedDate) - วว/ดด/ปป */}
                      <td className="py-2.5 px-1 text-center">
                        {loadedD ? (
                          <div className="inline-flex items-center justify-center gap-1 text-emerald-700">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span className="font-mono text-[11px] font-medium whitespace-nowrap">
                              {formatShortDate(loadedD)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300 font-mono text-xs block">-</span>
                        )}
                      </td>

                      {/* 7. สถานะตามแผน (Subtle Pastel Badge) */}
                      <td className="py-2.5 px-1 text-center">
                        <span className={`inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium border ${planStatusBadge.bg} ${planStatusBadge.text} ${planStatusBadge.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${planStatusBadge.dot}`} />
                          <span className="whitespace-nowrap">{planStatusBadge.label}</span>
                        </span>
                      </td>

                      {/* 8. วันค้างส่ง (Soft Danger / Warning Badge เฉพาะที่มีวันค้างส่งจริง) */}
                      <td className="py-2.5 px-1 text-center">
                        {isLoaded ? (
                          <span className="text-slate-300 font-mono text-xs block">-</span>
                        ) : (
                          <span className={`inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10.5px] ${
                            isDelayedTrip
                              ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
                              : 'bg-amber-50 text-amber-800 border border-amber-200/80'
                          }`}>
                            <Hourglass className={`w-2.5 h-2.5 shrink-0 ${isDelayedTrip ? 'text-rose-500' : 'text-amber-600'}`} />
                            <span>{pendingDays} วัน</span>
                          </span>
                        )}
                      </td>

                      {/* 9. LEAD TIME: loadedDate - handoffDate */}
                      <td className="py-2.5 px-1 text-center">
                        {isLoaded && leadTimeDays !== undefined ? (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md font-mono text-[10.5px] font-medium bg-slate-100/90 text-slate-700 border border-slate-200/80">
                            {leadTimeDays} วัน
                          </span>
                        ) : (
                          <span className="text-slate-300 font-mono text-xs block">-</span>
                        )}
                      </td>

                      {/* 10. สายส่ง / ทะเบียน (2 บรรทัดย่อย คลีนและอ่านง่าย) */}
                      <td className="py-2.5 px-2 overflow-hidden">
                        <div className="flex flex-col min-w-0 leading-tight">
                          <div className="flex items-center gap-1 min-w-0" title={trip.route}>
                            <MapPin className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                            <span className="font-semibold text-slate-900 text-[11.5px] truncate">
                              {trip.route || '-'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5 truncate">
                            <span className="font-mono text-slate-600 font-medium">
                              {trip.licensePlate}
                            </span>
                            {trip.driverName && (
                              <>
                                <span className="text-slate-300 text-[9px]">·</span>
                                <span className="truncate text-slate-500">{trip.driverName}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 11. รายการ / ตัน (Action Button 2 แถว: แถวบน รายการ / แถวล่าง น้ำหนักตัน) */}
                      <td className="py-2 px-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedTripForItems(trip)}
                          className="w-full max-w-[96px] mx-auto inline-flex flex-col items-center justify-center px-2 py-1 rounded-lg bg-[#ebf5ff] hover:bg-blue-100 text-blue-950 border border-blue-200/70 hover:border-blue-300 transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-xs active:scale-[0.98] group"
                          title="คลิกเพื่อเปิดดูรายละเอียดสินค้าและน้ำหนักรวมในบิลนี้"
                        >
                          <div className="flex items-center justify-center gap-1 leading-tight">
                            <Package className="w-3 h-3 text-blue-600 group-hover:scale-110 transition-transform shrink-0" />
                            <span className="font-semibold text-[11px] whitespace-nowrap text-blue-950">
                              {trip.itemsCount || getTripItems(trip).length} รายการ
                            </span>
                          </div>
                          <div className="text-[10.5px] font-bold text-blue-700 font-mono leading-tight mt-0.5 whitespace-nowrap">
                            {trip.weightTon.toFixed(2)} ตัน
                          </div>
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
        <div className="p-3 bg-slate-50/80 border-t border-slate-100 flex flex-col lg:flex-row items-center justify-between text-xs text-slate-500 gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-700">แสดงผล:</span>
            <span>
              {filteredTrips.length === 0
                ? '0'
                : `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredTrips.length)}`
              } จากทั้งหมด {filteredTrips.length} เที่ยว
            </span>
            <span className="text-slate-300">•</span>
            <span>รถที่จัดเส้นทาง: <strong className="text-blue-800 font-bold">{uniqueVehiclesCount}</strong> คัน</span>
            <span className="text-slate-300">•</span>
            <span>บิลที่ค้างส่ง: <strong className="text-amber-800 font-bold">{pendingDeliveriesCount}</strong> ใบ</span>
            <span className="text-slate-300">•</span>
            <span>Lead Time เฉลี่ย: <strong className="text-sky-800 font-bold">{leadTimeStats.mean}</strong> วัน</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <label htmlFor="delivery-page-size" className="font-semibold text-slate-600 whitespace-nowrap">
              จำนวนรายการ:
            </label>
            <select
              id="delivery-page-size"
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
              ถัดไป
            </button>
          </div>
          <div className="text-[11px] text-slate-400 text-center">
            * คลิกปุ่ม <strong>"ชื่อสินค้า"</strong> เพื่อเปิดรายละเอียดสินค้าและน้ำหนัก
          </div>
        </div>
      </div>

      {/* Item & Weight Detail Popup Modal */}
      {selectedTripForItems && (
        <div 
          onClick={() => setSelectedTripForItems(null)}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200"
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 bg-slate-50/80 flex items-start justify-between">
              <div className="space-y-1.5 min-w-0 pr-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-[#0a2558] text-white flex items-center gap-1.5 shadow-2xs">
                    <FileText className="w-3.5 h-3.5 text-blue-200" />
                    <span>เลขที่เอกสาร: {selectedTripForItems.docNo || selectedTripForItems.salesOrderNo}</span>
                  </span>
                  {selectedTripForItems.deliveryNo && selectedTripForItems.deliveryNo !== (selectedTripForItems.docNo || selectedTripForItems.salesOrderNo) && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      DO: {selectedTripForItems.deliveryNo}
                    </span>
                  )}
                  {getStatusPill(selectedTripForItems.status)}
                </div>
                <div className="mt-1">
                  <h3 className="text-base font-bold text-slate-900">
                    รายละเอียดสินค้าและน้ำหนักจัดส่ง
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5 truncate">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>ชื่อลูกค้า:</span>
                    <strong className="text-slate-900 font-bold truncate">
                      {selectedTripForItems.customer || selectedTripForItems.customerName || selectedTripForItems.destination || '-'}
                    </strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTripForItems(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                title="ปิดหน้าต่าง (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Shipment Summary Strip */}
            <div className="p-4 bg-blue-50/40 border-b border-blue-100/60 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-white/80 p-2.5 rounded-lg border border-blue-100/80 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-semibold block">น้ำหนักรวมทั้งบิล</span>
                <span className="font-black text-purple-700 block mt-0.5 text-base">
                  {selectedTripForItems.weightTon.toFixed(2)} ตัน
                </span>
              </div>
              <div className="bg-white/80 p-2.5 rounded-lg border border-blue-100/80 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-semibold block">จำนวนรายการสินค้า</span>
                <span className="font-bold text-blue-900 block mt-0.5 text-base">
                  {selectedTripForItems.itemsCount || getTripItems(selectedTripForItems).length} รายการ
                </span>
              </div>
              <div className="bg-white/80 p-2.5 rounded-lg border border-blue-100/80 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-semibold block">สายส่ง</span>
                <span className="font-bold text-[#0a2558] flex items-center gap-1 mt-0.5 truncate" title={selectedTripForItems.route}>
                  <MapPin className="w-3 h-3 text-blue-600 shrink-0" />
                  <span className="truncate">{selectedTripForItems.route || '-'}</span>
                </span>
              </div>
              <div className="bg-white/80 p-2.5 rounded-lg border border-blue-100/80 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-semibold block">ทะเบียนรถ / คนขับ</span>
                <span className="font-mono font-bold text-slate-800 block mt-0.5 text-xs truncate">
                  {selectedTripForItems.licensePlate}
                </span>
                <span className="text-[10px] text-slate-600 truncate block">{selectedTripForItems.driverName}</span>
              </div>
            </div>

            {/* Modal Body: Products Table */}
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-blue-600" />
                  <span>รายชื่อสินค้าทั้งหมดในบิล ({getTripItems(selectedTripForItems).length} รายการ)</span>
                </span>
                <span className="text-[11px] text-purple-700 font-bold bg-purple-50 px-2.5 py-0.5 rounded border border-purple-200">
                  น้ำหนักรวม: {selectedTripForItems.weightTon.toFixed(2)} ตัน
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">ลำดับ</th>
                      <th className="py-2.5 px-3">รหัสสินค้า</th>
                      <th className="py-2.5 px-3">รายการสินค้า</th>
                      <th className="py-2.5 px-3 text-right">จำนวน</th>
                      <th className="py-2.5 px-3 text-center">หน่วยนับ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {getTripItems(selectedTripForItems).map((item, idx) => (
                      <tr key={`item-${idx}`} className={idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}>
                        <td className="py-2 px-3 text-center font-mono text-slate-500">{item.seqNo || idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-800">{item.productCode || '-'}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">{item.productName}</td>
                        <td className="py-2 px-3 text-right font-bold text-[#0a2558]">{item.quantity.toLocaleString()}</td>
                        <td className="py-2 px-3 text-center text-slate-500">{item.unit || 'ถุง'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-xs text-slate-800">
                    <tr>
                      <td colSpan={3} className="py-2.5 px-3 text-right">ยอดรวมจำนวนชิ้น/ถุง:</td>
                      <td className="py-2.5 px-3 text-right font-black text-blue-900">
                        {getTripItems(selectedTripForItems).reduce((sum, it) => sum + (it.quantity || 0), 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-500">หน่วย</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                {selectedTripForItems.driverPhone ? (
                  <span>โทรติดต่อพนักงานขับรถ: <strong className="text-slate-700">{selectedTripForItems.driverPhone}</strong></span>
                ) : (
                  <span>เลขที่เอกสาร: <strong className="text-slate-700">{selectedTripForItems.docNo || selectedTripForItems.salesOrderNo}</strong></span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTripForItems(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer shadow-2xs"
                >
                  ปิดหน้าต่าง
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const doc = selectedTripForItems.docNo || selectedTripForItems.salesOrderNo || '';
                    setSelectedTripForItems(null);
                    onSelectDoc(doc);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0a2558] hover:bg-blue-900 rounded-lg cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>ติดตามบิลนี้</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

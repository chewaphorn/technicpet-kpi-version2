import { useReportTargets } from '../hooks/useReportTargets';
import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import confetti from 'canvas-confetti';
import { getMinMaxDates } from '../utils/dateUtils';
import { calculateSalesReportMetrics, calculateSalesCustomers, filterSalesOrders } from '../utils/salesReportMetrics';
import { 
  SalesRepPerformance, 
  DetailedSalesOrder, 
  DocTypeBreakdown, 
  TopProductItem,
  CustomerSpender,
  CustomerSummary,
  SalesDocType,
  WarehouseDoc,
  DeliveryTrip,
  AuthUser 
} from '../types';
import { 
  TrendingUp, 
  Receipt, 
  CreditCard, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  Package, 
  Award, 
  Flame, 
  ShieldAlert, 
  Sparkles, 
  ShoppingBag, 
  Inbox,
  Users,
  Calendar,
  X,
  ChevronRight,
  Truck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  Filter,
  Info,
  MapPin,
  Phone,
  User,
  Check,
  Building2,
  HelpCircle,
  FileSpreadsheet,
  FileText,
  Eye,
  Target,
  Download,
  BarChart3,
  List,
  RefreshCw
} from 'lucide-react';

interface SalesReportViewProps {
  salesReps: SalesRepPerformance[];
  weeklyTrend?: { name: string; sales: number; target: number; orders: number }[];
  categoryMix?: { name: string; value: number; color: string }[];
  topSpenders?: CustomerSpender[];
  newCustomers?: CustomerSpender[];
  customerSummary?: CustomerSummary;
  summary?: {
    totalRevenueFormatted: string;
    totalRevenueAmount?: number;
    totalRevenueMillions: number;
    totalBookingCount?: number;
    avgTicketFormatted: string;
    avgTicket: number;
    hitRatePercent: number;
    totalOrdersCount: number;
    totalLineItemsCount?: number;
    completedOrdersCount: number;
    normalBillsCount?: number;
    normalBillsAmount?: number;
    normalBillsAmountFormatted?: string;
    specialBillsCount?: number;
    specialBillsAmount?: number;
    specialBillsAmountFormatted?: string;
    claimBillsCount?: number;
    claimBillsAmount?: number;
    claimBillsAmountFormatted?: string;
    topPerformerName?: string;
    topPerformerSales?: string;
  };
  docTypeBreakdowns?: DocTypeBreakdown[];
  topProducts?: TopProductItem[];
  detailedOrders?: DetailedSalesOrder[];
  warehouseDocs?: WarehouseDoc[];
  deliveryTrips?: DeliveryTrip[];
  onSelectDoc?: (docNo: string) => void;
  onNavigateToImport?: () => void;
  onOpenExportModal?: (dept?: 'all' | 'sales' | 'warehouse' | 'delivery') => void;
  onOpenPDFReport?: (startDate?: string, endDate?: string, filters?: { docType?: 'ALL' | SalesDocType; search?: string }) => void;
  onOpenGoogleSheetsModal?: (dept?: 'all' | 'sales' | 'warehouse' | 'delivery') => void;
  currentUser?: AuthUser | null;
  onSyncSales?: () => Promise<void>;
  isSyncingSales?: boolean;
  syncErrorSales?: string;
  lastSyncSales?: string;
}

export const SalesReportView: React.FC<SalesReportViewProps> = ({ 
  salesReps = [], 
  topSpenders = [],
  newCustomers = [],
  customerSummary,
  summary,
  docTypeBreakdowns = [],
  topProducts = [],
  detailedOrders = [],
  warehouseDocs = [],
  deliveryTrips = [],
  onSelectDoc,
  onNavigateToImport,
  onOpenExportModal,
  onOpenPDFReport,
  onOpenGoogleSheetsModal,
  currentUser,
  onSyncSales,
  isSyncingSales = false,
  syncErrorSales,
  lastSyncSales,
}) => {
  // Auto-detect dynamic date range from actual dataset
  const { min: autoMinDate, max: autoMaxDate } = useMemo(() => {
    return getMinMaxDates(detailedOrders.map(o => o.date), '', '');
  }, [detailedOrders]);

  // Real Filter States
  const [fromDate, setFromDate] = useState<string>(() => autoMinDate || '');
  const [toDate, setToDate] = useState<string>(() => autoMaxDate || '');
  const [selectedDocTypeFilter, setSelectedDocTypeFilter] = useState<'ALL' | SalesDocType>('ALL');
  const [trackingStatusFilter, setTrackingStatusFilter] = useState<'ALL' | 'COMPLETED' | 'IN_PROGRESS' | 'CLAIMS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // When detailedOrders updates (e.g. fresh file imported or synced), auto-sync fromDate and toDate
  useEffect(() => {
    if (detailedOrders.length > 0 && autoMinDate && autoMaxDate) {
      setFromDate(autoMinDate);
      setToDate(autoMaxDate);
    }
  }, [detailedOrders, autoMinDate, autoMaxDate]);

  // Rep selection & view mode state
  const [selectedRep, setSelectedRep] = useState<SalesRepPerformance | null>(null);
  const [selectedRepForModal, setSelectedRepForModal] = useState<SalesRepPerformance | null>(null);
  const [repViewMode, setRepViewMode] = useState<'chart' | 'list'>('chart');
  const [expandedOrderNo, setExpandedOrderNo] = useState<string | null>(null);

  // Toast feedback state for direct Excel downloads
  const [exportToastMessage, setExportToastMessage] = useState<string | null>(null);

  // Customer Section States
  const [customerTab, setCustomerTab] = useState<'top_spenders' | 'new_customers' | 'all'>('top_spenders');
  const [customerViewMode, setCustomerViewMode] = useState<'chart' | 'list'>('chart');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerForModal, setSelectedCustomerForModal] = useState<CustomerSpender | null>(null);
  const [showLogicInfo, setShowLogicInfo] = useState(false);

  // Company Monthly Sales Target (Synchronized from Settings)
  const { monthlySalesTarget: companyMonthlySalesTarget } = useReportTargets();

  // Document Tracking Search State (Only shows documents when searched)
  const [trackingSearchQuery, setTrackingSearchQuery] = useState('');
  const [selectedDocForTimeline, setSelectedDocForTimeline] = useState<DetailedSalesOrder | null>(null);

  // Helper to format currency
  const formatCurrency = (amount: number) => {
    if (amount >= 1_000_000) {
      return `฿${(amount / 1_000_000).toFixed(2)}M`;
    }
    return `฿${Math.round(amount).toLocaleString()}`;
  };

  // 1. FILTER ORDERS DYNAMICALLY ACCORDING TO DATE & BILL TYPE
  const filteredOrders = useMemo(
    () => filterSalesOrders(detailedOrders, {
      fromDate,
      toDate,
      docType: selectedDocTypeFilter,
      searchQuery,
    }),
    [detailedOrders, selectedDocTypeFilter, fromDate, toDate, searchQuery]
  );

  // 2. REACTIVE RE-CALCULATIONS FOR ALL METRICS BASED ON FILTERED ORDERS
  const reactiveMetrics = useMemo(() => calculateSalesReportMetrics(filteredOrders, salesReps, companyMonthlySalesTarget), [filteredOrders, salesReps, companyMonthlySalesTarget]);

  // 3. ENHANCED CUSTOMER LOGIC & EXPLICIT COMPUTATION
  const computedCustomers = useMemo(() => calculateSalesCustomers(filteredOrders), [filteredOrders]);

  const displayCustomers = useMemo(() => {
    if (customerSearch.trim()) {
      const q = customerSearch.toLowerCase();
      return computedCustomers.allSpenders.filter(
        (c) =>
          c.customerName.toLowerCase().includes(q) ||
          (c.salesperson && c.salesperson.toLowerCase().includes(q))
      ).slice(0, 10);
    }
    return computedCustomers.top10Spenders;
  }, [computedCustomers, customerSearch]);

  // Trigger feedback toast and confetti when export succeeds
  const triggerToast = (msg: string) => {
    setExportToastMessage(msg);
    try {
      confetti({
        particleCount: 45,
        spread: 70,
        origin: { y: 0.85 }
      });
    } catch (e) {}
    setTimeout(() => {
      setExportToastMessage(null);
    }, 4000);
  };

  // Direct targeted Section Export to Excel (.xlsx)
  const handleDirectExport = (type: 'salesReps' | 'customers' | 'products' | 'breakdowns' | 'all') => {
    try {
      const wb = XLSX.utils.book_new();
      const dateRangeSuffix = `${fromDate || 'all'}_ถึง_${toDate || 'all'}`;

      if (type === 'salesReps') {
        const data = reactiveMetrics.computedReps.map((r, idx) => ({
          'อันดับ': idx + 1,
          'ชื่อพนักงานขาย': r.name,
          'ตำแหน่ง': r.role || 'พนักงานขาย',
          'ยอดขายจริงสะสม (บาท)': r.sales,
          'ยอดขายแสดงผล': r.salesFormatted,
          'เป้าหมายยอดขายบริษัท (บาท)': reactiveMetrics.companyTargetInBaht,
          '% เทียบเป้าหมายบริษัท': `${r.completionRate}%`,
          'จำนวนบิลที่เปิด (บิล)': r.ordersCount || 0,
          'สัดส่วนยอดขายรวม (%)': `${r.shareOfTotalSales || 0}%`,
          'ยอดขายเฉลี่ยต่อบิล (บาท)': r.ordersCount ? Math.round(r.sales / r.ordersCount) : 0,
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'อันดับพนักงานขาย');
        XLSX.writeFile(wb, `TechnicPet_รายงานพนักงานขาย_${dateRangeSuffix}.xlsx`);
        triggerToast(`ส่งออกรายงานพนักงานขายทั้งหมด (${data.length} ท่าน) เป็นไฟล์ Excel (.xlsx) สำเร็จแล้ว!`);
      } else if (type === 'customers') {
        const data = computedCustomers.allSpenders.map((c, idx) => ({
          'อันดับ': idx + 1,
          'ชื่อลูกค้า': c.customerName,
          'พนักงานขายที่ดูแล': c.salesperson || '-',
          'ยอดสั่งซื้อสะสม (บาท)': c.totalAmount,
          'ยอดสั่งซื้อแสดงผล': c.totalAmountFormatted,
          'จำนวนคำสั่งซื้อ (บิล)': c.ordersCount,
          'ยอดสั่งซื้อเฉลี่ยต่อบิล (บาท)': c.avgTicket,
          'จำนวนสินค้ารวม (ชิ้น)': c.totalQuantity,
          'สัดส่วนยอดขายรวม (%)': `${c.percentageOfTotalSales}%`,
          'วันที่สั่งซื้อล่าสุด': c.lastOrderDate || '-'
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'รายงานลูกค้าทั้งหมด');
        XLSX.writeFile(wb, `TechnicPet_รายงานลูกค้าทั้งหมด_${dateRangeSuffix}.xlsx`);
        triggerToast(`ส่งออกรายงานลูกค้าทั้งหมด (${data.length} ราย) เป็นไฟล์ Excel (.xlsx) สำเร็จแล้ว!`);
      } else if (type === 'products') {
        const data = (reactiveMetrics.allProducts || []).map((p, idx) => ({
          'อันดับ': idx + 1,
          'รหัสสินค้า / Barcode': p.productCode || '-',
          'ชื่อสินค้า': p.productName,
          'ยอดขายรวม (บาท)': p.totalAmount,
          'จำนวนที่ขายได้': p.totalQuantity,
          'หน่วยนับ': p.unit || 'ชิ้น',
          'จำนวนบิลที่สั่ง (บิล)': p.ordersCount,
          'สัดส่วนยอดขาย (%)': `${p.percentageOfSales}%`
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'รายงานสินค้าขายดี');
        XLSX.writeFile(wb, `TechnicPet_รายงานสินค้าขายดี_${dateRangeSuffix}.xlsx`);
        triggerToast(`ส่งออกรายงานสินค้าขายดีทั้งหมด (${data.length} รายการ) เป็นไฟล์ Excel (.xlsx) สำเร็จแล้ว!`);
      } else if (type === 'breakdowns') {
        const data = reactiveMetrics.breakdowns.map((b, idx) => ({
          'อันดับ': idx + 1,
          'รหัสประเภทเอกสาร': b.code,
          'ประเภทเอกสาร': b.label,
          'ยอดขายรวม (บาท)': b.amount,
          'สัดส่วนมูลค่ายอดขาย (%)': `${b.percentOfAmount}%`,
          'จำนวนบิล (บิล)': b.billCount,
          'สัดส่วนจำนวนบิล (%)': `${b.percentOfBills}%`,
          'จำนวนสินค้าที่ขาย (ชิ้น)': b.totalQuantity
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'จำแนกประเภทบิล');
        XLSX.writeFile(wb, `TechnicPet_รายงานจำแนกประเภทบิล_${dateRangeSuffix}.xlsx`);
        triggerToast(`ส่งออกรายงานจำแนกประเภทบิลเป็นไฟล์ Excel (.xlsx) สำเร็จแล้ว!`);
      } else if (type === 'all') {
        // Comprehensive multi-sheet workbook
        const wsOrders = XLSX.utils.json_to_sheet(filteredOrders.map((o, i) => ({
          'ลำดับ': i + 1,
          'เลขที่เอกสาร': o.docNo,
          'วันที่': o.date,
          'ชื่อลูกค้า': o.customer,
          'พนักงานขาย': o.salesperson,
          'ประเภทบิล': o.docType || 'BK',
          'ยอดรวม (บาท)': o.totalAmount,
          'จำนวนสินค้า (ชิ้น)': o.totalQuantity,
        })));
        XLSX.utils.book_append_sheet(wb, wsOrders, 'รายการคำสั่งซื้อ');

        const wsReps = XLSX.utils.json_to_sheet(reactiveMetrics.computedReps.map((r, i) => ({
          'อันดับ': i + 1,
          'พนักงานขาย': r.name,
          'ยอดขายรวม (บาท)': r.sales,
          '% เป้าหมาย': `${r.completionRate}%`,
          'จำนวนบิล': r.ordersCount,
        })));
        XLSX.utils.book_append_sheet(wb, wsReps, 'พนักงานขาย');

        const wsCust = XLSX.utils.json_to_sheet(computedCustomers.allSpenders.map((c, i) => ({
          'อันดับ': i + 1,
          'ลูกค้า': c.customerName,
          'ยอดสั่งซื้อ (บาท)': c.totalAmount,
          'จำนวนบิล': c.ordersCount,
          'สัดส่วน (%)': `${c.percentageOfTotalSales}%`,
        })));
        XLSX.utils.book_append_sheet(wb, wsCust, 'ลูกค้า');

        XLSX.writeFile(wb, `TechnicPet_รายงานยอดขายภาพรวม_${dateRangeSuffix}.xlsx`);
        triggerToast(`ส่งออกรายงานภาพรวมทั้งหมดเป็นไฟล์ Excel (.xlsx) ครบทุก Sheet สำเร็จแล้ว!`);
      }
    } catch (err) {
      console.error('Direct Export Error:', err);
    }
  };

  // 4. CROSS-DEPARTMENT TRACKING LOGIC (Sales ➜ Warehouse ➜ Delivery)
  const getDocumentJourney = (order: DetailedSalesOrder) => {
    const normalizeDocKey = (value?: string) => (value || '').trim().toUpperCase().replace(/[\s\-_/.\\]+/g, '');
    const orderKey = normalizeDocKey(order.docNo);
    const deliveryKeys = (delivery: DeliveryTrip) => [delivery.docNo, delivery.salesOrderNo, delivery.deliveryNo]
      .map(normalizeDocKey)
      .filter(Boolean);

    // Link departments by the exact booking/document number. Customer names and
    // partial numeric matches are intentionally excluded because they can join
    // unrelated orders from different departments.
    const warehouseMatches = warehouseDocs.filter((warehouse) => normalizeDocKey(warehouse.docNo) === orderKey);
    const deliveryMatches = deliveryTrips.filter((delivery) => deliveryKeys(delivery).includes(orderKey));
    const statusRank = (status?: string) => ({ completed: 4, verified: 4, delayed: 3, in_transit: 2, picking: 2, pending: 1 }[status || ''] || 0);
    const matchedWarehouse = [...warehouseMatches].sort((a, b) => statusRank(b.status) - statusRank(a.status))[0];
    const matchedDelivery = [...deliveryMatches].sort((a, b) => statusRank(b.status) - statusRank(a.status))[0];

    const docType = order.docType || (order.docNo.startsWith('BKET') ? 'BKET' : (order.docNo.startsWith('BKR') ? 'BKR' : 'BK'));

    // Step 1: Sales Booking Status
    const salesStep = {
      title: 'ฝ่ายขาย (Sales Order)',
      status: 'completed',
      label: docType === 'BKR' ? 'รับแจ้งเคลม' : 'เปิดใบจองสำเร็จ',
      docNo: order.docNo,
      salesperson: order.salesperson || '-',
      date: order.date || '01/07/2026',
      itemsCount: order.items.length,
      amount: order.totalAmount
    };

    // Step 2: Warehouse Picking Status
    let warehouseStatus: 'completed' | 'in_progress' | 'pending' = 'pending';
    let warehouseLabel = 'ยังไม่พบข้อมูลคลังสินค้า';
    let picker = matchedWarehouse?.pickerName || '-';

    if (matchedWarehouse) {
      if (matchedWarehouse.status === 'completed' || matchedWarehouse.status === 'verified' || matchedWarehouse.completedDate) {
        warehouseStatus = 'completed';
        warehouseLabel = matchedWarehouse.statusLabel || 'จัดสินค้าเสร็จสมบูรณ์';
      } else if (matchedWarehouse.status === 'picking' || matchedWarehouse.startTime) {
        warehouseStatus = 'in_progress';
        warehouseLabel = 'กำลังหยิบสินค้า (Picking)';
      } else {
        warehouseStatus = 'pending';
        warehouseLabel = matchedWarehouse.statusLabel || 'รอดำเนินการจัดสินค้า';
      }
      picker = matchedWarehouse.pickerName || '-';
    }

    const warehouseStep = {
      title: 'คลังสินค้า (Warehouse)',
      status: warehouseStatus,
      label: warehouseLabel,
      picker: picker,
      zone: 'โซนหลัก A1-B3',
      receivedDate: matchedWarehouse?.receivedBookingDate || matchedWarehouse?.date || '-',
      startedDate: matchedWarehouse?.startTime || '-',
      completedDate: matchedWarehouse?.completedDate || '-',
      handoffDate: matchedWarehouse?.transferTime || '-',
      verified: true
    };

    // Step 3: Logistics Delivery Status
    let deliveryStatus: 'completed' | 'in_progress' | 'pending' = 'pending';
    let deliveryLabel = 'ยังไม่พบข้อมูลฝ่ายขนส่ง';
    let driver = matchedDelivery?.driverName || '-';
    let plate = matchedDelivery?.licensePlate || '-';

    if (matchedDelivery) {
      if (matchedDelivery.status === 'completed' || matchedDelivery.loadedDate) {
        deliveryStatus = 'completed';
        deliveryLabel = 'โหลดสินค้าแล้ว (Loaded)';
      } else if (matchedDelivery.status === 'in_transit') {
        deliveryStatus = 'in_progress';
        deliveryLabel = 'อยู่ระหว่างนำส่ง (In Transit)';
      } else if (matchedDelivery.status === 'delayed') {
        deliveryStatus = 'in_progress';
        deliveryLabel = 'รอรอบจัดส่งถัดไป';
      } else {
        deliveryStatus = 'pending';
        deliveryLabel = matchedDelivery.statusLabel || 'รอเริ่มจัดส่ง';
      }
      driver = matchedDelivery.driverName || '-';
      plate = matchedDelivery.licensePlate || '-';
    }

    const deliveryStep = {
      title: 'การจัดส่ง (Logistics)',
      status: deliveryStatus,
      label: deliveryLabel,
      driver: driver,
      plate: plate,
      eta: matchedDelivery?.estimatedArrival || '-',
      plannedDate: matchedDelivery?.plannedDate || matchedDelivery?.orderDate || '-',
      loadedDate: matchedDelivery?.loadedDate || '-',
      handoffDate: matchedDelivery?.handoffDate || matchedDelivery?.handoverDate || '-',
      destination: matchedDelivery?.destination || '-'
    };

    // Overall Pipeline State
    const isFullCompleted = warehouseStatus === 'completed' && deliveryStatus === 'completed';
    const isClaim = docType === 'BKR';

    return {
      salesStep,
      warehouseStep,
      deliveryStep,
      isFullCompleted,
      isClaim
    };
  };

  // Documents matching the explicit Tracking Search query (Search-only mode)
  const trackedOrdersToDisplay = useMemo(() => {
    if (!trackingSearchQuery.trim()) return [];
    const normalizeSearchText = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase();
    // Users commonly copy numbers from Sheets with a slash, dash, spaces, or
    // dots. Treat those separators as formatting so the same sales order is
    // found regardless of how its number was entered.
    const normalizeDocSearch = (value: unknown) => normalizeSearchText(value).replace(/[\s\-_/.\\]+/g, '');
    const q = normalizeSearchText(trackingSearchQuery);
    const normalizedDocQuery = normalizeDocSearch(trackingSearchQuery);
    
    return detailedOrders.filter((order) => {
      const matchDocNo = normalizeSearchText(order.docNo).includes(q) ||
        (normalizedDocQuery.length > 0 && normalizeDocSearch(order.docNo).includes(normalizedDocQuery));
      const matchCustomer = normalizeSearchText(order.customer).includes(q);
      const matchSales = normalizeSearchText(order.salesperson).includes(q);
      const matchReason = normalizeSearchText(order.claimReason).includes(q);
      const matchItem = order.items.some(it => 
        normalizeSearchText(it.productName).includes(q) ||
        normalizeSearchText(it.productCode).includes(q)
      );
      
      const isMatched = matchDocNo || matchCustomer || matchSales || matchReason || matchItem;
      if (!isMatched) return false;

      if (trackingStatusFilter === 'ALL') return true;
      const journey = getDocumentJourney(order);
      if (trackingStatusFilter === 'COMPLETED') return journey.isFullCompleted && !journey.isClaim;
      if (trackingStatusFilter === 'IN_PROGRESS') return !journey.isFullCompleted;
      if (trackingStatusFilter === 'CLAIMS') return journey.isClaim;
      return true;
    });
  }, [detailedOrders, trackingSearchQuery, trackingStatusFilter, warehouseDocs, deliveryTrips]);

  const customerOrdersForModal = useMemo(() => {
    if (!selectedCustomerForModal) return [];
    return detailedOrders.filter(
      (ord) => ord.customer.trim().toLowerCase() === selectedCustomerForModal.customerName.trim().toLowerCase()
    );
  }, [selectedCustomerForModal, detailedOrders]);

  const repOrdersForModal = useMemo(() => {
    if (!selectedRepForModal) return [];
    const targetName = selectedRepForModal.name.trim().toLowerCase();
    return detailedOrders.filter(
      (ord) => ord.salesperson && ord.salesperson.trim().toLowerCase() === targetName
    );
  }, [selectedRepForModal, detailedOrders]);

  const hasData = detailedOrders.length > 0 || (summary?.totalOrdersCount ?? 0) > 0 || (summary?.totalRevenueAmount ?? 0) > 0;

  // Quick reset all filters
  const handleResetFilters = () => {
    setFromDate(autoMinDate || '');
    setToDate(autoMaxDate || '');
    setSelectedDocTypeFilter('ALL');
    setTrackingStatusFilter('ALL');
    setSearchQuery('');
    setTrackingSearchQuery('');
    setSelectedRep(null);
  };

  return (
    <div className="p-4 sm:p-8 space-y-7 max-w-[1400px] mx-auto animate-in fade-in duration-300">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
              Sale Report Dashboard
              </h2>
            <p className="text-sm text-slate-500 font-medium">
              สรุปข้อมูลผลงานยอดขายและรายงานลูกค้า
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {onSelectDoc && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const docNo = trackingSearchQuery.trim();
                if (docNo) onSelectDoc(docNo);
              }}
              className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/70 p-1"
            >
              <label htmlFor="sales-header-track-order" className="sr-only">ติดตามสถานะใบสั่งขาย</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-blue-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="sales-header-track-order"
                  type="search"
                  value={trackingSearchQuery}
                  onChange={(event) => setTrackingSearchQuery(event.target.value)}
                  placeholder="เลขที่ใบสั่งขาย เช่น BK256907/02289"
                  className="w-44 sm:w-52 pl-8 pr-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-blue-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <button
                type="submit"
                id="btn-sales-header-track-order"
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-[#0a5c5c] hover:bg-[#074747] transition-colors cursor-pointer whitespace-nowrap"
              >
                ติดตามสถานะใบสั่งขาย
              </button>
            </form>
          )}
          {onSyncSales && (
            <button
              type="button"
              id="btn-sync-sales-only"
              onClick={onSyncSales}
              disabled={isSyncingSales}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 rounded-xl shadow-xs transition-all cursor-pointer"
              title="ดึงเฉพาะข้อมูลฝ่ายขายจาก Google Sheet และประมวลผลทันที"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSales ? 'animate-spin' : ''}`} />
              <span>{isSyncingSales ? 'กำลังดึงข้อมูลฝ่ายขาย...' : 'ดึงเฉพาะข้อมูลฝ่ายขาย'}</span>
            </button>
          )}

          {onOpenGoogleSheetsModal && (
            <button
              type="button"
              id="btn-sales-sheet-config"
              onClick={() => onOpenGoogleSheetsModal('sales')}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-blue-800 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 border border-blue-200 rounded-xl shadow-xs transition-all cursor-pointer"
              title="กำหนดและอัปเดตลิงก์ Google Sheet ฝ่ายขาย"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
              <span>ลิงก์ Google Sheet ฝ่ายขาย</span>
            </button>
          )}

          {onOpenPDFReport && (
            <button
              type="button"
              id="btn-sales-export-pdf"
              onClick={() => onOpenPDFReport(fromDate, toDate, { docType: selectedDocTypeFilter, search: searchQuery })}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export PDF รายงานฝ่ายขาย</span>
            </button>
          )}

          {(fromDate !== (autoMinDate || '') || toDate !== (autoMaxDate || '') || searchQuery || trackingSearchQuery || selectedDocTypeFilter !== 'ALL' || selectedRep !== null) && (
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-all cursor-pointer shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>ล้างตัวกรอง</span>
            </button>
          )}
        </div>
      </div>

      {/* Sync Error Alert for Sales only */}
      {syncErrorSales && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-rose-800">พบข้อผิดพลาดในการดึงข้อมูลฝ่ายขาย</p>
            <p className="text-rose-600 mt-0.5">{syncErrorSales}</p>
            <p className="text-rose-500 mt-1 font-medium">คำแนะนำ: ตรวจสอบสิทธิ์การแชร์ของชีตฝ่ายขายให้เป็น "ทุกคนที่มีลิงก์มีสิทธิ์ดู"</p>
          </div>
        </div>
      )}

      {/* No Data Notice */}
      {!hasData && (
        <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-blue-900">
                ยังไม่มีข้อมูลฝ่ายขายในระบบ
              </p>
              <p className="text-xs text-blue-700 mt-0.5 font-medium">
                กดปุ่ม "ดึงเฉพาะข้อมูลฝ่ายขาย" หรือ "ลิงก์ Google Sheet ฝ่ายขาย" เพื่อเริ่มซิงค์ข้อมูล
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onSyncSales && (
              <button
                onClick={onSyncSales}
                disabled={isSyncingSales}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs whitespace-nowrap flex items-center gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSales ? 'animate-spin' : ''}`} />
                <span>{isSyncingSales ? 'กำลังดึงข้อมูล...' : 'ดึงข้อมูลฝ่ายขายเดี๋ยวนี้'}</span>
              </button>
            )}
            {onOpenGoogleSheetsModal && (
              <button
                onClick={() => onOpenGoogleSheetsModal('sales')}
                className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-blue-300 text-blue-800 text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
              >
                ตั้งค่าลิงก์ฝ่ายขาย
              </button>
            )}
          </div>
        </div>
      )}

      {/* 1. FILTER CONTROLS BAR (Date Range Only: Start & End Date) */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Date Range Pickers */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-xs font-extrabold text-slate-800">ช่วงวันที่วิเคราะห์:</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500">วันที่เริ่มต้น:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="px-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg text-slate-800 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              <span className="text-xs font-bold text-slate-400">ถึง</span>

              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500">วันที่สิ้นสุด:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="px-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg text-slate-800 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              {(fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setFromDate('');
                    setToDate('');
                  }}
                  className="px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                  title="แสดงข้อมูลทั้งหมดโดยไม่จำกัดช่วงวันที่"
                >
                  แสดงทุกช่วงเวลา
                </button>
              )}
            </div>
          </div>

          {/* Quick stats in filter bar */}
          <div className="hidden">
            <span>จำนวนบิล: <strong className="text-slate-800 font-extrabold">{filteredOrders.length} บิล</strong></span>
            <span>•</span>
            <span>ยอดขายรวม: <strong className="text-emerald-700 font-extrabold">{reactiveMetrics.totalRevenueFormatted}</strong></span>
          </div>
        </div>
      </div>

      {/* 2. STAT CARDS (มูลค่ายอดขาย, จำนวนเลขที่ใบจอง, พนักงานขายดีเด่น) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Card 1: มูลค่ายอดขาย */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-extrabold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md uppercase tracking-wider">
                มูลค่ายอดขาย
              </span>
              <p className="text-xs font-semibold text-slate-500 mt-1">
                {selectedDocTypeFilter === 'ALL' ? 'ยอดขายรวมทุกประเภทบิล' : `ยอดขายเฉพาะบิลประเภท ${selectedDocTypeFilter}`}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-slate-900 tracking-tight tabular-nums">
              {reactiveMetrics.totalRevenueFormatted}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 text-xs font-medium text-slate-500">
              <TrendingUp className="w-3.5 h-3.5 text-teal-600" />
              <span>เฉลี่ยต่อบิล {reactiveMetrics.avgTicketFormatted}</span>
            </div>
          </div>
        </div>

        {/* Card 2: จำนวนเลขที่ใบจอง */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md uppercase tracking-wider">
                จำนวนเลขที่ใบจอง
              </span>
              <p className="text-xs font-semibold text-slate-500 mt-1">
                จำนวนเอกสาร / บิลจองตามเงื่อนไขที่เลือก
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-slate-900 tracking-tight tabular-nums">
              {reactiveMetrics.totalBookingsCount.toLocaleString()} <span className="text-lg font-bold text-slate-500">บิล</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 text-xs font-medium text-blue-600 tabular-nums">
              <span>BK {reactiveMetrics.breakdowns[0].billCount} | BKET {reactiveMetrics.breakdowns[1].billCount} | BKR {reactiveMetrics.breakdowns[2].billCount}</span>
            </div>
          </div>
        </div>

        {/* Card 3: พนักงานขายดีเด่นอันดับ 1 */}
        <div className="bg-white p-5 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/40 via-white to-white shadow-2xs flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-extrabold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-amber-600" />
                พนักงานขายดีเด่น (Top 1)
              </span>
              <p className="text-xs font-semibold text-slate-500 mt-1">
                อันดับ 1 ตามเงื่อนไขบิลและช่วงเวลาที่เลือก
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Flame className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-lg font-black text-slate-900 truncate">
              {reactiveMetrics.topPerformerName}
            </div>
            <div className="flex items-center justify-between mt-1 text-xs">
              <span className="font-extrabold text-amber-700 text-sm">{reactiveMetrics.topPerformerSales}</span>
              <span className="font-semibold text-slate-500">
                {reactiveMetrics.computedReps.length > 0 ? `จากพนักงาน ${reactiveMetrics.computedReps.length} ท่าน` : 'รอข้อมูล'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. BREAKDOWN SECTION (BK ปกติ / BKET พิเศษ / BKR เคลม) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-[#0a2558]" />
              จำแนกประเภทบิล & รายการเคลม
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              จำแนกสถิติคำสั่งซื้อตามประเภทเอกสาร: BK (ปกติ), BKET (พิเศษ/โปรโมชัน), BKR (เคลม/รับคืน) — คลิกที่การ์ดเพื่อกรองข้อมูล
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl">
              รวม {reactiveMetrics.totalBookingsCount} บิล ({reactiveMetrics.totalRevenueFormatted})
            </div>
            <button
              type="button"
              onClick={() => handleDirectExport('breakdowns')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all cursor-pointer shadow-2xs"
              title="ส่งออกรายงานจำแนกประเภทบิลเป็น Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>ส่งออก Excel</span>
            </button>
          </div>
        </div>

        {/* 3 Category Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {reactiveMetrics.breakdowns.map((item, idx) => {
            const isBK = item.type === 'BK';
            const isBKET = item.type === 'BKET';
            const isBKR = item.type === 'BKR';
            const isSelected = selectedDocTypeFilter === item.type;

            const cardBg = isSelected
              ? isBK ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20' : isBKET ? 'border-purple-500 bg-purple-50/60 ring-2 ring-purple-500/20' : 'border-rose-500 bg-rose-50/60 ring-2 ring-rose-500/20'
              : isBK ? 'border-blue-200 bg-blue-50/25 hover:border-blue-300' : isBKET ? 'border-purple-200 bg-purple-50/25 hover:border-purple-300' : 'border-rose-200 bg-rose-50/25 hover:border-rose-300';

            const badgeBg = isBK ? 'bg-blue-600 text-white' : isBKET ? 'bg-purple-600 text-white' : 'bg-rose-600 text-white';
            const textColor = isBK ? 'text-blue-900' : isBKET ? 'text-purple-900' : 'text-rose-900';
            const progressColor = isBK ? 'bg-blue-600' : isBKET ? 'bg-purple-600' : 'bg-rose-600';

            return (
              <div 
                key={`doc-type-breakdown-${item.type}-${idx}`} 
                onClick={() => setSelectedDocTypeFilter(selectedDocTypeFilter === item.type ? 'ALL' : item.type)}
                className={`p-5 rounded-2xl border ${cardBg} flex flex-col justify-between transition-all cursor-pointer select-none shadow-2xs hover:shadow-xs`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-black tracking-wider ${badgeBg}`}>
                      {item.code}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      สัดส่วน {item.percentOfBills}% ของบิล
                    </span>
                  </div>

                  <h4 className={`text-sm font-extrabold ${textColor} mb-1 flex items-center justify-between`}>
                    <span>{item.label}</span>
                    {isSelected && (
                      <span className="text-[10px] font-bold bg-white px-2 py-0.5 rounded-full border shadow-2xs">
                        เลือกอยู่ ✓
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-slate-500 font-medium mb-4">
                    {isBK && 'คำสั่งซื้อปกติของลูกค้าทั่วไปและตัวแทนจำหน่าย'}
                    {isBKET && 'คำสั่งซื้อกรณีพิเศษ อีเวนต์ โปรโมชัน หรือล็อตพิเศษ'}
                    {isBKR && 'รายการเคลมสินค้า สินค้าชำรุด หรือส่งคืนคลังสินค้า'}
                  </p>

                  <div className="grid grid-cols-2 gap-3 py-3 border-t border-slate-200/60 bg-white/80 rounded-xl px-4">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-500 block">
                        จำนวนบิล (Orders)
                      </span>
                      <span className="text-xl font-black text-slate-900">
                        {item.billCount.toLocaleString()} <span className="text-xs font-bold text-slate-500">บิล</span>
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-slate-500 block">
                        มูลค่ารวม (Amount)
                      </span>
                      <span className={`text-xl font-black ${isBKR ? 'text-rose-600' : 'text-slate-900'}`}>
                        {item.totalAmountFormatted}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/60">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-1.5">
                    <span>สัดส่วนมูลค่า ({item.percentOfAmount}%)</span>
                    <span>{item.totalQuantity.toLocaleString()} ชิ้น</span>
                  </div>
                  <div className="w-full h-2 bg-white/80 rounded-full overflow-hidden border border-slate-200/60">
                    <div 
                      className={`h-full ${progressColor} rounded-full`}
                      style={{ width: `${Math.min(100, Math.max(0, item.percentOfAmount))}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. อันดับผลงานพนักงานขาย (กราฟแท่งแนวตั้ง & ข้อมูลตัวเลขบนแท่งกราฟ) */}
      <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-200 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#0a2558]" />
              <span>อันดับผลงานพนักงานขาย 10 อันดับแรก</span>
            </h3>
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
              {Math.min(10, reactiveMetrics.computedReps.length)} ท่าน
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setRepViewMode('chart')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  repViewMode === 'chart'
                    ? 'bg-white text-[#0a2558] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>กราฟแท่งแนวตั้ง</span>
              </button>
              <button
                type="button"
                onClick={() => setRepViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  repViewMode === 'list'
                    ? 'bg-white text-[#0a2558] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>ตารางสรุป</span>
              </button>
            </div>
          </div>
        </div>

        {reactiveMetrics.computedReps.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <Inbox className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-bold">ไม่พบข้อมูลพนักงานขายในช่วงเวลานี้</p>
          </div>
        ) : repViewMode === 'chart' ? (
          /* VERTICAL BAR CHART VIEW WITH NUMBERS ON BARS */
          <div className="space-y-4">
            <div className="bg-gradient-to-b from-slate-50/90 to-slate-100/40 border border-slate-200/90 rounded-2xl p-4 sm:p-5 relative">
              {/* Benchmark Reference Target Line Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs mb-2 pb-2.5 border-b border-slate-200/70">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-600 text-xs">เป้าหมายยอดขายรายเดือนบริษัท:</span>
                  <span className="font-bold text-[#0a2558] bg-white px-2.5 py-0.5 rounded-md border border-slate-200 shadow-2xs text-xs">
                    {formatCurrency(reactiveMetrics.companyTargetInBaht)}
                  </span>
                  <span className="text-slate-500 font-medium text-[11px]">
                    (ยอดรวม Top 10: {formatCurrency(reactiveMetrics.top10Reps.reduce((sum, r) => sum + r.sales, 0))})
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium hidden sm:inline-block">
                  * คลิกที่แท่งกราฟเพื่อดูรายละเอียดคำสั่งซื้อ
                </span>
              </div>

              {/* Guidelines & Target Level */}
              <div className="relative mb-2 flex items-center justify-between px-2 py-1 bg-blue-50/60 rounded-lg border border-blue-100/70 text-[10px] text-blue-900 font-medium">
                <span>เกณฑ์เป้าหมาย ฿{(companyMonthlySalesTarget || 15.0).toFixed(1)}M</span>
                <span>Top 10 Performance</span>
              </div>

              {/* Vertical Bar Chart Container with Unified Baseline & Equal Column Distribution */}
              <div className="grid grid-cols-10 gap-1 sm:gap-2 items-end pt-4 pb-1">
                {(() => {
                  const maxSales = Math.max(...reactiveMetrics.top10Reps.map(r => r.sales), 1);
                  return reactiveMetrics.top10Reps.map((rep, index) => {
                    const rank = index + 1;
                    const isTop1 = rank === 1;
                    const isTop2 = rank === 2;
                    const isTop3 = rank === 3;

                    // Relative height percentage between 18% and 88%
                    const heightPct = Math.max(18, Math.min(88, Math.round((rep.sales / maxSales) * 85)));
                    const completionPct = rep.completionRate || 0;

                    return (
                      <div
                        key={`rep-vbar-${rep.id || rep.name}-${index}`}
                        onClick={() => setSelectedRepForModal(rep)}
                        className="flex flex-col items-center justify-end group cursor-pointer relative select-none w-full"
                        title={`คลิกเพื่อดูบิลทั้งหมดของ ${rep.name}`}
                      >
                        {/* 1. Bar Height Stage (Fixed height container for alignment) */}
                        <div className="w-full h-56 sm:h-64 flex flex-col items-center justify-end relative">
                          {/* Upper Stats: Numbers on/above bar */}
                          <div className="mb-1.5 flex flex-col items-center text-center transition-transform duration-200 group-hover:-translate-y-0.5 z-10 w-full">
                            {/* Sales Value */}
                            <span className={`text-[10px] sm:text-[11px] font-bold tracking-tight whitespace-nowrap ${
                              isTop1 ? 'text-amber-800 font-extrabold' : 'text-[#0a2558]'
                            }`}>
                              {rep.sales >= 1_000_000 
                                ? `฿${(rep.sales / 1_000_000).toFixed(2)}M` 
                                : `฿${(rep.sales / 1_000).toFixed(0)}k`}
                            </span>

                            {/* % of Target badge */}
                            <span className={`mt-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap leading-tight ${
                              isTop1 
                                ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold' 
                                : completionPct >= 100 
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300' 
                                : 'bg-blue-50 text-blue-900 border-blue-200'
                            }`}>
                              {completionPct}%
                            </span>

                            {/* Orders count */}
                            <span className="text-[8px] sm:text-[9px] text-slate-500 font-medium whitespace-nowrap hidden sm:inline-block mt-0.5">
                              {rep.ordersCount || 0} บิล
                            </span>
                          </div>

                          {/* The Vertical Bar Graphic */}
                          <div 
                            className={`w-full max-w-[42px] sm:max-w-[48px] rounded-t-lg transition-all duration-300 relative flex flex-col justify-between items-center py-1.5 group-hover:brightness-105 group-hover:shadow-sm ${
                              isTop1
                                ? 'bg-gradient-to-t from-amber-500 via-amber-400 to-yellow-300 shadow-xs ring-1 ring-amber-300/80'
                                : isTop2
                                ? 'bg-gradient-to-t from-slate-500 via-slate-400 to-slate-300 ring-1 ring-slate-300'
                                : isTop3
                                ? 'bg-gradient-to-t from-amber-700 via-amber-600 to-amber-500 ring-1 ring-amber-400/50'
                                : 'bg-gradient-to-t from-[#0a2558] via-blue-700 to-blue-500'
                            }`}
                            style={{ height: `${heightPct}%` }}
                          >
                            {/* Medal / Rank Icon inside the top of bar */}
                            <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white/95 shadow-2xs flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-slate-800 shrink-0">
                              {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                            </div>

                            {/* Share of total sales label at bottom of bar */}
                            <span className="text-[8px] sm:text-[9px] font-bold text-white/95 drop-shadow-2xs z-10 hidden sm:block">
                              {rep.shareOfTotalSales}%
                            </span>
                          </div>
                        </div>

                        {/* 2. Unified Base Baseline Divider */}
                        <div className="w-full border-t-2 border-slate-300 my-1.5" />

                        {/* 3. Salesperson Name & Avatar Below the Baseline (Fixed uniform height) */}
                        <div className="h-16 flex flex-col items-center justify-start text-center w-full px-0.5">
                          <div className={`w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full text-[8px] sm:text-[9px] font-bold flex items-center justify-center mb-1 text-white shrink-0 ${
                            isTop1 ? 'bg-amber-600' : isTop2 ? 'bg-slate-600' : isTop3 ? 'bg-amber-800' : 'bg-[#0a2558]'
                          }`}>
                            {rep.initials || rep.name.charAt(0)}
                          </div>
                          <p 
                            className="text-[9px] sm:text-[10px] font-semibold text-slate-700 line-clamp-2 leading-tight break-words text-center"
                            title={rep.name}
                          >
                            {rep.name}
                          </p>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        ) : (
          /* ALTERNATIVE LIST/TABLE VIEW */
          <div className="space-y-3.5">
            {reactiveMetrics.top10Reps.map((rep, index) => {
              const rank = index + 1;
              const isTop1 = rank === 1;
              const isTop2 = rank === 2;
              const isTop3 = rank === 3;

              const rankBadge = isTop1 
                ? 'bg-amber-400 text-amber-950 font-black shadow-xs ring-2 ring-amber-200' 
                : isTop2 
                ? 'bg-slate-200 text-slate-800 font-extrabold' 
                : isTop3 
                ? 'bg-amber-600 text-white font-extrabold' 
                : 'bg-slate-100 text-slate-600 font-bold';

              const completionPct = rep.completionRate || 0;
              const targetBarWidth = Math.min(100, Math.max(3, completionPct));

              return (
                <div
                  key={`rep-row-item-${rep.id || rep.name}-${index}`}
                  onClick={() => setSelectedRepForModal(rep)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isTop1
                      ? 'border-amber-300 bg-amber-50/15 hover:border-amber-400 hover:shadow-2xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/40'
                  }`}
                  title={`คลิกเพื่อดูบิลทั้งหมดของ ${rep.name}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0 ${rankBadge}`}>
                        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                      </div>
                      <div className="w-7 h-7 rounded-full bg-[#0a2558] text-white flex items-center justify-center font-bold text-xs shrink-0">
                        {rep.initials || rep.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-slate-900 truncate">
                          {rep.name}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-4 sm:text-right shrink-0 pl-10 sm:pl-0 flex-wrap">
                      <div className="text-left sm:text-right">
                        <span className="text-xs text-slate-500 font-medium mr-1.5">ยอดขายสะสม:</span>
                        <span className="text-sm sm:text-base font-black text-[#0a2558]">
                          {rep.salesFormatted}
                        </span>
                      </div>
                      <div className="hidden sm:block text-slate-300">|</div>
                      <div className="text-left sm:text-right">
                        <span className="text-xs text-slate-500 font-medium mr-1">จำนวนบิล:</span>
                        <span className="text-xs font-black text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200">
                          {rep.ordersCount || 0} บิล
                        </span>
                      </div>
                      <div className="hidden sm:block text-slate-300">|</div>
                      <div className="text-left sm:text-right min-w-[120px]">
                        <span className="text-xs font-black px-2.5 py-0.5 rounded-md border bg-emerald-50 text-emerald-800 border-emerald-200">
                          {completionPct}% ของเป้าหมายบริษัท
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/50">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          completionPct >= 100
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-xs'
                            : isTop1 
                            ? 'bg-gradient-to-r from-amber-500 to-amber-400 shadow-xs' 
                            : isTop2
                            ? 'bg-gradient-to-r from-blue-600 to-blue-500'
                            : 'bg-gradient-to-r from-[#0a2558] to-blue-700'
                        }`}
                        style={{ width: `${targetBarWidth}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Sales Rep Ranking Summary Footer */}
        {reactiveMetrics.computedReps.length > 0 && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-600 font-semibold">
                ยอดขายเฉลี่ยต่อคน: <b className="text-[#0a2558] font-black">
                  {formatCurrency(reactiveMetrics.totalSalesRevenue / Math.max(1, reactiveMetrics.computedReps.length))}
                </b>
              </span>
            </div>
            <div className="flex items-center gap-3">
              {reactiveMetrics.topRep && (
                <span className="text-amber-900 font-extrabold bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 text-xs">
                  🥇 อันดับ 1: {reactiveMetrics.topRep.name} ({reactiveMetrics.topRep.salesFormatted} • {reactiveMetrics.topRep.ordersCount || 0} บิล • {reactiveMetrics.topRep.completionRate}% ของเป้าหมาย)
                </span>
              )}
              <button
                type="button"
                onClick={() => handleDirectExport('salesReps')}
                className="text-emerald-700 hover:text-emerald-900 font-bold underline cursor-pointer inline-flex items-center gap-1"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>ส่งออกรายงานพนักงานขายทั้งหมดเป็น Excel ({reactiveMetrics.computedReps.length} ท่าน)</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. ลูกค้าที่มียอดสั่งซื้อมากที่สุด 10 อันดับแรก (กราฟแท่งแนวตั้ง & ข้อมูลตัวเลขบนแท่งกราฟ) */}
      <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-200 shadow-2xs space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#0a2558]" />
              <span>ลูกค้าที่มียอดสั่งซื้อมากที่สุด 10 อันดับแรก</span>
            </h3>
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
              {Math.min(10, displayCustomers.length)} ราย
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setCustomerViewMode('chart')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  customerViewMode === 'chart'
                    ? 'bg-white text-[#0a2558] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>กราฟแท่งแนวตั้ง</span>
              </button>
              <button
                type="button"
                onClick={() => setCustomerViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  customerViewMode === 'list'
                    ? 'bg-white text-[#0a2558] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>ตารางสรุป</span>
              </button>
            </div>
          </div>
        </div>

        {/* Customer Internal Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหารายชื่อลูกค้า หรือพนักงานขายที่ดูแล..."
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            className="w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#0a2558] focus:bg-white transition-all text-slate-800 placeholder-slate-400"
          />
          {customerSearch && (
            <button
              onClick={() => setCustomerSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {displayCustomers.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-bold text-slate-600">
              ไม่พบข้อมูลลูกค้าที่มียอดสั่งซื้อ
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {customerSearch ? 'ลองค้นหาด้วยคำอื่น หรือกดล้างคำค้นหา' : 'ซิงค์ข้อมูล Google Sheet เพื่อวิเคราะห์รายชื่อ'}
            </p>
          </div>
        ) : customerViewMode === 'chart' ? (
          /* VERTICAL BAR CHART VIEW FOR TOP 10 CUSTOMERS */
          <div className="space-y-4">
            <div className="bg-gradient-to-b from-slate-50/90 to-slate-100/40 border border-slate-200/90 rounded-2xl p-4 sm:p-5 relative">
              {/* Reference Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs mb-2 pb-2.5 border-b border-slate-200/70">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-600 text-xs">ยอดสั่งซื้อรวม 10 อันดับแรก:</span>
                  <span className="font-bold text-[#0a2558] bg-white px-2.5 py-0.5 rounded-md border border-slate-200 shadow-2xs text-xs">
                    {computedCustomers.top10TotalAmountFormatted}
                  </span>
                  <span className="text-slate-500 font-medium text-[11px]">
                    (คิดเป็น {computedCustomers.top10SharePct}% ของยอดขายรวม)
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium hidden sm:inline-block">
                  * คลิกที่แท่งกราฟเพื่อดูรายละเอียดคำสั่งซื้อ
                </span>
              </div>

              {/* Top Spender Reference Line */}
              <div className="relative mb-2 flex items-center justify-between px-2 py-1 bg-blue-50/60 rounded-lg border border-blue-100/70 text-[10px] text-blue-900 font-medium">
                <span>อันดับ 1 สูงสุด: {computedCustomers.summary.topSpenderAmount}</span>
                <span>Top 10 Spenders</span>
              </div>

              {/* Vertical Bar Chart Container with Unified Baseline & Equal Column Distribution */}
              <div className="grid grid-cols-10 gap-1 sm:gap-2 items-end pt-4 pb-1">
                {(() => {
                  const maxAmount = Math.max(...displayCustomers.map(c => c.totalAmount), 1);
                  return displayCustomers.map((cust, index) => {
                    const rank = cust.rank || (index + 1);
                    const isTop1 = rank === 1;
                    const isTop2 = rank === 2;
                    const isTop3 = rank === 3;

                    // Relative height percentage between 18% and 88%
                    const heightPct = Math.max(18, Math.min(88, Math.round((cust.totalAmount / maxAmount) * 85)));

                    return (
                      <div
                        key={`cust-vbar-${cust.customerName}-${rank}-${index}`}
                        onClick={() => setSelectedCustomerForModal(cust)}
                        className="flex flex-col items-center justify-end group cursor-pointer relative select-none w-full"
                        title={`คลิกเพื่อดูบิลทั้งหมดของ ${cust.customerName}`}
                      >
                        {/* 1. Bar Height Stage (Fixed height container for alignment) */}
                        <div className="w-full h-56 sm:h-64 flex flex-col items-center justify-end relative">
                          {/* Upper Stats: Numbers directly on/above each bar */}
                          <div className="mb-1.5 flex flex-col items-center text-center transition-transform duration-200 group-hover:-translate-y-0.5 z-10 w-full">
                            {/* Purchase Amount */}
                            <span className={`text-[10px] sm:text-[11px] font-bold tracking-tight whitespace-nowrap ${
                              isTop1 ? 'text-amber-800 font-extrabold' : 'text-[#0a2558]'
                            }`}>
                              {cust.totalAmount >= 1_000_000 
                                ? `฿${(cust.totalAmount / 1_000_000).toFixed(2)}M` 
                                : `฿${(cust.totalAmount / 1_000).toFixed(0)}k`}
                            </span>

                            {/* Share of total sales badge */}
                            <span className={`mt-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap leading-tight ${
                              isTop1 
                                ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold' 
                                : 'bg-blue-50 text-blue-900 border-blue-200'
                            }`}>
                              {cust.percentageOfTotalSales}%
                            </span>

                            {/* Orders count */}
                            <span className="text-[8px] sm:text-[9px] text-slate-500 font-medium whitespace-nowrap hidden sm:inline-block mt-0.5">
                              {cust.ordersCount} บิล
                            </span>
                          </div>

                          {/* The Vertical Bar Graphic */}
                          <div 
                            className={`w-full max-w-[42px] sm:max-w-[48px] rounded-t-lg transition-all duration-300 relative flex flex-col justify-between items-center py-1.5 ${
                              isTop1
                                ? 'bg-gradient-to-t from-amber-500 via-amber-400 to-yellow-300 shadow-xs ring-1 ring-amber-300/80'
                                : isTop2
                                ? 'bg-gradient-to-t from-slate-500 via-slate-400 to-slate-300 ring-1 ring-slate-300'
                                : isTop3
                                ? 'bg-gradient-to-t from-amber-700 via-amber-600 to-amber-500 ring-1 ring-amber-400/50'
                                : 'bg-gradient-to-t from-[#0a2558] via-blue-700 to-blue-500'
                            } group-hover:brightness-105 group-hover:shadow-sm`}
                            style={{ height: `${heightPct}%` }}
                          >
                            {/* Medal / Rank Icon inside the top of bar */}
                            <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white/95 shadow-2xs flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-slate-800 shrink-0">
                              {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                            </div>

                            {/* Average ticket label at bottom of bar */}
                            <span className="text-[8px] sm:text-[9px] font-bold text-white/90 drop-shadow-2xs z-10 hidden sm:block">
                              ฿{(cust.avgTicket / 1000).toFixed(0)}k
                            </span>
                          </div>
                        </div>

                        {/* 2. Unified Base Baseline Divider */}
                        <div className="w-full border-t-2 border-slate-300 my-1.5" />

                        {/* 3. Customer Name & Salesperson Below the Baseline (Fixed uniform height) */}
                        <div className="h-16 flex flex-col items-center justify-start text-center w-full px-0.5">
                          <div className={`w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full text-[8px] sm:text-[9px] font-bold flex items-center justify-center mb-1 text-white shrink-0 ${
                            isTop1 ? 'bg-amber-600' : isTop2 ? 'bg-slate-600' : isTop3 ? 'bg-amber-800' : 'bg-[#0a2558]'
                          }`}>
                            {cust.customerName.charAt(0)}
                          </div>
                          <p 
                            className="text-[9px] sm:text-[10px] font-semibold text-slate-700 line-clamp-2 leading-tight break-words text-center"
                            title={cust.customerName}
                          >
                            {cust.customerName}
                          </p>
                          {cust.salesperson && cust.salesperson !== 'ฝ่ายขาย' && (
                            <span 
                              className="text-[8px] text-slate-400 font-medium truncate max-w-full mt-0.5 hidden sm:inline-block"
                              title={`ผู้ดูแล: ${cust.salesperson}`}
                            >
                              {cust.salesperson}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        ) : (
          /* FULL-WIDTH CUSTOMER TABLE (NO HORIZONTAL SCROLLBAR) */
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs table-auto">
              <thead className="bg-slate-50/90 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-2 sm:px-3.5 text-center w-12">อันดับ</th>
                  <th className="py-3 px-2 sm:px-3.5">ชื่อลูกค้า</th>
                  <th className="py-3 px-2 sm:px-3.5 hidden sm:table-cell w-36">พนักงานขาย</th>
                  <th className="py-3 px-2 sm:px-3.5 text-center w-28">จำนวนคำสั่งซื้อ</th>
                  <th className="py-3 px-2 sm:px-3.5 text-right hidden md:table-cell w-28">ยอดเฉลี่ย / บิล</th>
                  <th className="py-3 px-2 sm:px-3.5 text-right w-32">ยอดสั่งซื้อสะสม</th>
                  <th className="py-3 px-2 sm:px-3.5 text-right hidden lg:table-cell w-28">สัดส่วน</th>
                  <th className="py-3 px-2 sm:px-3.5 text-center w-14">ดูบิล</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {displayCustomers.map((cust, custIdx) => {
                  const isRank1 = cust.rank === 1;
                  const isRank2 = cust.rank === 2;
                  const isRank3 = cust.rank === 3;

                  const rankBadge = isRank1
                    ? 'bg-amber-400 text-amber-950 font-black shadow-xs ring-2 ring-amber-200'
                    : isRank2
                    ? 'bg-slate-200 text-slate-800 font-extrabold'
                    : isRank3
                    ? 'bg-amber-600 text-white font-extrabold'
                    : 'bg-slate-100 text-slate-600 font-bold';

                  return (
                    <tr
                      key={`cust-row-${cust.customerName}-${cust.rank || custIdx}-${custIdx}`}
                      onClick={() => setSelectedCustomerForModal(cust)}
                      className={`hover:bg-blue-50/50 transition-colors cursor-pointer ${
                        isRank1 ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="py-2.5 sm:py-3 px-2 sm:px-3.5 text-center">
                        <span className={`inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-lg text-xs shrink-0 ${rankBadge}`}>
                          {cust.rank === 1 ? '🥇' : cust.rank === 2 ? '🥈' : cust.rank === 3 ? '🥉' : `#${cust.rank}`}
                        </span>
                      </td>

                      <td className="py-2.5 sm:py-3 px-2 sm:px-3.5">
                        <div className="font-extrabold text-slate-900 text-xs sm:text-sm leading-snug break-words">
                          {cust.customerName}
                        </div>
                        {cust.lastOrderDate && (
                          <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium mt-0.5">
                            สั่งล่าสุด: {cust.lastOrderDate}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 sm:py-3 px-2 sm:px-3.5 font-semibold text-slate-700 hidden sm:table-cell">
                        {cust.salesperson && cust.salesperson !== 'ฝ่ายขาย' ? (
                          <span className="inline-flex items-center gap-1 text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md text-[11px] font-semibold truncate max-w-[130px]">
                            <User className="w-3 h-3 text-slate-500 shrink-0" />
                            <span className="truncate">{cust.salesperson}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>

                      <td className="py-2.5 sm:py-3 px-2 sm:px-3.5 text-center">
                        <span className="inline-flex items-center justify-center px-2.5 py-1 bg-blue-50 text-[#0a2558] font-black rounded-lg text-xs border border-blue-200/80 shadow-2xs whitespace-nowrap">
                          {cust.ordersCount} บิล
                        </span>
                      </td>

                      <td className="py-2.5 sm:py-3 px-2 sm:px-3.5 text-right font-semibold text-slate-700 hidden md:table-cell">
                        ฿{cust.avgTicket.toLocaleString()}
                      </td>

                      <td className="py-2.5 sm:py-3 px-2 sm:px-3.5 text-right font-black text-xs sm:text-sm text-[#0a2558] whitespace-nowrap">
                        {cust.totalAmountFormatted}
                      </td>

                      <td className="py-2.5 sm:py-3 px-2 sm:px-3.5 text-right hidden lg:table-cell">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
                            <div
                              className={`h-full rounded-full ${isRank1 ? 'bg-amber-500' : 'bg-[#0a2558]'}`}
                              style={{ width: `${Math.min(100, Math.max(6, cust.percentageOfTotalSales * 2.5))}%` }}
                            ></div>
                          </div>
                          <span className="font-extrabold text-slate-800 text-xs">
                            {cust.percentageOfTotalSales}%
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 sm:py-3 px-2 sm:px-3.5 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCustomerForModal(cust);
                          }}
                          className="p-1.5 rounded-lg text-blue-700 hover:bg-blue-100 transition-colors inline-flex items-center justify-center cursor-pointer"
                          title="ดูรายละเอียดบิลของลูกค้ารายนี้"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Customer Summary Footer */}
        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-slate-600 font-semibold">
              ยอดสั่งซื้อรวม 10 อันดับแรก: <b className="text-[#0a2558] font-black">{computedCustomers.top10TotalAmountFormatted}</b> ({computedCustomers.top10SharePct}% ของยอดขายรวม)
            </span>
          </div>
          <div className="flex items-center gap-3">
            {computedCustomers.summary.topSpenderName !== '-' && (
              <span className="text-amber-900 font-extrabold bg-amber-50 px-3 py-1 rounded-md border border-amber-200 text-xs truncate">
                🥇 อันดับ 1: {computedCustomers.summary.topSpenderName} ({computedCustomers.summary.topSpenderAmount})
              </span>
            )}
            <button
              type="button"
              onClick={() => handleDirectExport('customers')}
              className="text-emerald-700 hover:text-emerald-900 font-bold underline cursor-pointer inline-flex items-center gap-1"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>ส่งออกรายงานลูกค้าทั้งหมดเป็น Excel ({computedCustomers.allSpenders.length} ราย)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 6. สินค้าขายดี 10 อันดับ */}
      <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-200 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
              สินค้าขายดี 10 อันดับ
            </h3>
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
              10 รายการ
            </span>
          </div>
        </div>

        {reactiveMetrics.top10Products.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-bold">ยังไม่มีข้อมูลสินค้าขายดีในช่วงนี้</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3 w-14 text-center">อันดับ</th>
                  <th className="py-3 px-3 w-32 hidden sm:table-cell">รหัสสินค้า</th>
                  <th className="py-3 px-3">รายการสินค้า</th>
                  <th className="py-3 px-3 text-right">จำนวนที่ขายได้</th>
                  <th className="py-3 px-3 text-right">ยอดขายรวม (บาท)</th>
                  <th className="py-3 px-3 text-center hidden md:table-cell">จำนวนบิล</th>
                  <th className="py-3 px-3 w-28 text-right hidden lg:table-cell">สัดส่วน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reactiveMetrics.top10Products.map((product, pIdx) => {
                  const isTop1 = product.rank === 1;
                  const isTop2 = product.rank === 2;
                  const isTop3 = product.rank === 3;

                  return (
                    <tr 
                      key={`top-prod-${product.productCode || 'prod'}-${product.rank || pIdx}-${pIdx}`}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isTop1 ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-black ${
                          isTop1 ? 'bg-amber-400 text-amber-950 shadow-xs' :
                          isTop2 ? 'bg-slate-200 text-slate-800' :
                          isTop3 ? 'bg-amber-600 text-white' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {product.rank}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono font-bold text-slate-700 hidden sm:table-cell">
                        {product.productCode}
                      </td>

                      <td className="py-3 px-3 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <ShoppingBag className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:inline-block" />
                          <span className="break-words">{product.productName}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right font-black text-slate-900">
                        {product.totalQuantity.toLocaleString()} <span className="text-[11px] font-medium text-slate-500">{product.unit}</span>
                      </td>

                      <td className="py-3 px-3 text-right font-black text-[#0a2558]">
                        {product.totalAmountFormatted}
                      </td>

                      <td className="py-3 px-3 text-center font-bold text-slate-600 hidden md:table-cell">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md text-[11px]">
                          {product.ordersCount} บิล
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right hidden lg:table-cell">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${isTop1 ? 'bg-amber-500' : 'bg-blue-600'}`}
                              style={{ width: `${Math.min(100, product.percentageOfSales * 3.5)}%` }}
                            ></div>
                          </div>
                          <span className="font-extrabold text-slate-700 w-8 text-right text-xs">
                            {product.percentageOfSales}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="pt-3 border-t border-slate-100 flex justify-end text-xs">
          <button
            type="button"
            onClick={() => handleDirectExport('products')}
            className="text-emerald-700 hover:text-emerald-900 font-bold underline cursor-pointer inline-flex items-center gap-1"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>ส่งออกรายงานสินค้าทั้งหมดเป็น Excel ({reactiveMetrics.allProducts?.length || 0} รายการ)</span>
          </button>
        </div>
      </div>

      {/* 7. การติดตามสถานะใบสั่งขาย (SALES ORDER STATUS TRACKING - SEARCH ONLY) */}
      {false && (
      <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-200 shadow-2xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-[#0a2558] font-extrabold text-xs border border-blue-200">
                การติดตามสถานะใบสั่งขาย
              </span>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                การติดตามสถานะใบสั่งขาย
              </h3>
              {trackingSearchQuery.trim() && (
                <span className="bg-[#0a2558] text-white text-xs font-black px-2.5 py-0.5 rounded-full">
                  พบ {trackedOrdersToDisplay.length} ใบสั่งขาย
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              ค้นหาเลขที่ใบสั่งขายเพื่อตรวจสอบสถานะเชื่อมโยง 3 แผนก (ฝ่ายขาย ➜ คลังสินค้า ➜ ขนส่ง) พร้อมไทม์ไลน์และรายละเอียดสินค้า
            </p>
          </div>

          {/* Tracking Search & Status Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Status Filter Tabs */}
            {trackingSearchQuery.trim() && (
              <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setTrackingStatusFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    trackingStatusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => setTrackingStatusFilter('COMPLETED')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    trackingStatusFilter === 'COMPLETED' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  ส่งสำเร็จ
                </button>
                <button
                  type="button"
                  onClick={() => setTrackingStatusFilter('IN_PROGRESS')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    trackingStatusFilter === 'IN_PROGRESS' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-amber-700'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  กำลังดำเนินงาน
                </button>
                <button
                  type="button"
                  onClick={() => setTrackingStatusFilter('CLAIMS')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    trackingStatusFilter === 'CLAIMS' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-rose-700'
                  }`}
                >
                  <ShieldAlert className="w-3 h-3" />
                  บิลเคลม
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Dedicated Search Input Box for Tracking */}
        <div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="พิมพ์เลขที่ใบสั่งขาย (เช่น BK6907-001, BKET6907-001, BKR6907-001) หรือชื่อลูกค้าเพื่อค้นหา..."
              value={trackingSearchQuery}
              onChange={(e) => setTrackingSearchQuery(e.target.value)}
              className="w-full pl-10 pr-24 py-3 text-xs sm:text-sm font-medium border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-slate-50/80 hover:bg-white focus:bg-white transition-all text-slate-900 placeholder-slate-400"
            />
            {trackingSearchQuery && (
              <button
                type="button"
                onClick={() => setTrackingSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                ล้างคำค้น
              </button>
            )}
          </div>
        </div>

        {/* SEARCH-ONLY STATE: If no search query is entered, show a clean prompt */}
        {!trackingSearchQuery.trim() ? (
          <div className="py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0a2558] flex items-center justify-center mx-auto shadow-2xs border border-blue-100">
              <Search className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h4 className="text-sm sm:text-base font-extrabold text-slate-800">
                กรุณากรอกเลขที่ใบสั่งขายเพื่อค้นหาและติดตามสถานะ
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                ระบบจะแสดงรายละเอียดและสถานะเชื่อมโยง 3 แผนก (ฝ่ายขาย ➜ คลังสินค้า ➜ ขนส่ง) เฉพาะเลขที่ใบสั่งขายที่คุณค้นหาเท่านั้น โดยไม่ต้องแสดงข้อมูลทุกเลขที่บิล
              </p>
            </div>
          </div>
        ) : trackedOrdersToDisplay.length === 0 ? (
          <div className="py-12 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-slate-200">
            <Receipt className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-bold text-slate-600">ไม่พบใบสั่งขายที่ตรงกับคำค้นหา "{trackingSearchQuery}"</p>
            <p className="text-xs text-slate-400 mt-1">กรุณาตรวจสอบเลขที่ใบสั่งขายหรือชื่อลูกค้าอีกครั้ง หรือคลิกเลือกตัวอย่างด้านบน</p>
          </div>
        ) : (
          <div className="space-y-4">
            {trackedOrdersToDisplay.map((order, orderIdx) => {
              const isExpanded = expandedOrderNo === order.docNo || trackedOrdersToDisplay.length === 1;
              const journey = getDocumentJourney(order);
              const docType = order.docType || (order.docNo.startsWith('BKET') ? 'BKET' : (order.docNo.startsWith('BKR') ? 'BKR' : 'BK'));

              const isBK = docType === 'BK';
              const isBKET = docType === 'BKET';
              const isBKR = docType === 'BKR';

              const typeBadgeStyle = isBK
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : isBKET
                ? 'bg-purple-50 text-purple-700 border-purple-200'
                : 'bg-rose-50 text-rose-700 border-rose-200 font-black';

              return (
                <div 
                  key={`tracked-order-${order.docNo || 'doc'}-${orderIdx}`}
                  className={`rounded-2xl border transition-all overflow-hidden ${
                    isExpanded 
                      ? isBKR ? 'border-rose-300 bg-rose-50/10 shadow-xs' : 'border-blue-300 bg-blue-50/10 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  {/* Main Card Row */}
                  <div 
                    onClick={() => setExpandedOrderNo(isExpanded && trackedOrdersToDisplay.length > 1 ? null : order.docNo)}
                    className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer select-none"
                  >
                    {/* Left: Document Info & Customer */}
                    <div className="flex items-start gap-3.5 min-w-[280px]">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                        isBK ? 'bg-blue-100 text-blue-900' : isBKET ? 'bg-purple-100 text-purple-900' : 'bg-rose-100 text-rose-900'
                      }`}>
                        {docType}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-extrabold text-sm text-[#0a2558]">
                            {order.docNo}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${typeBadgeStyle}`}>
                            {order.docTypeLabel || docType}
                          </span>
                        </div>

                        <div className="text-xs font-bold text-slate-900 mt-1 truncate">
                          {order.customer}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                          <span>วันที่: <strong>{order.date}</strong></span>
                          <span>•</span>
                          <span>ผู้ขาย: <strong>{order.salesperson || '-'}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: 3-Department Visual Status Stepper */}
                    <div className="flex-1 max-w-xl py-2 px-3 bg-slate-50/80 rounded-xl border border-slate-100">
                      <div className="grid grid-cols-3 gap-2 text-center relative">
                        {/* Step 1: Sales */}
                        <div className="flex flex-col items-center">
                          <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-black">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[10px] font-extrabold text-slate-800 mt-1">1. ฝ่ายขาย</span>
                          <span className="text-[9px] text-emerald-700 font-bold truncate max-w-[90px]">{journey.salesStep.label}</span>
                        </div>

                        {/* Step 2: Warehouse */}
                        <div className="flex flex-col items-center">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                            journey.warehouseStep.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : journey.warehouseStep.status === 'in_progress'
                              ? 'bg-amber-100 text-amber-700 animate-pulse'
                              : 'bg-slate-200 text-slate-600'
                          }`}>
                            {journey.warehouseStep.status === 'completed' ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : journey.warehouseStep.status === 'in_progress' ? (
                              <Package className="w-3.5 h-3.5" />
                            ) : (
                              '2'
                            )}
                          </div>
                          <span className="text-[10px] font-extrabold text-slate-800 mt-1">2. คลังสินค้า</span>
                          <span className={`text-[9px] font-bold truncate max-w-[100px] ${
                            journey.warehouseStep.status === 'completed' ? 'text-emerald-700' : 'text-amber-700'
                          }`}>
                            {journey.warehouseStep.label}
                          </span>
                        </div>

                        {/* Step 3: Logistics */}
                        <div className="flex flex-col items-center">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                            journey.deliveryStep.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : journey.deliveryStep.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-700 animate-pulse'
                              : 'bg-slate-200 text-slate-600'
                          }`}>
                            {journey.deliveryStep.status === 'completed' ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : journey.deliveryStep.status === 'in_progress' ? (
                              <Truck className="w-3.5 h-3.5" />
                            ) : (
                              '3'
                            )}
                          </div>
                          <span className="text-[10px] font-extrabold text-slate-800 mt-1">3. ขนส่ง</span>
                          <span className={`text-[9px] font-bold truncate max-w-[100px] ${
                            journey.deliveryStep.status === 'completed' ? 'text-emerald-700' : 'text-blue-700'
                          }`}>
                            {journey.deliveryStep.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Amount & Actions */}
                    <div className="flex items-center justify-between lg:justify-end gap-5 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                      <div className="text-left lg:text-right">
                        <div className="text-xs text-slate-500 font-medium">
                          {order.items.length} รายการ ({order.totalQuantity} ชิ้น)
                        </div>
                        <div className={`text-base font-black ${isBKR ? 'text-rose-600' : 'text-[#0a2558]'}`}>
                          ฿{order.totalAmount.toLocaleString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDocForTimeline(order);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors cursor-pointer border border-blue-200 flex items-center gap-1"
                          title="ดูไทม์ไลน์และข้อมูลเชื่อมโยง 3 แผนก"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>ไทม์ไลน์</span>
                        </button>
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Itemized Table + 3-Department Details */}
                  {isExpanded && (
                    <div className="px-4 pb-5 sm:px-6 sm:pb-6 border-t border-slate-200/80 bg-white space-y-4">
                      {/* Department Summary Grid */}
                      <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Sales Detail */}
                        <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-100 text-xs space-y-1.5">
                          <div className="flex items-center justify-between font-extrabold text-blue-900">
                            <span className="flex items-center gap-1.5">
                              <Receipt className="w-4 h-4 text-blue-600" />
                              ฝ่ายขาย (Sales)
                            </span>
                            <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md font-bold">บันทึกแล้ว</span>
                          </div>
                          <p className="text-slate-600">ผู้เปิดบิล: <strong className="text-slate-900">{journey.salesStep.salesperson}</strong></p>
                          <p className="text-slate-600">วันที่เปิดใบจอง: <strong className="text-slate-900">{journey.salesStep.date}</strong></p>
                          <p className="text-slate-600">ยอดเงินรวม: <strong className="text-[#0a2558]">฿{order.totalAmount.toLocaleString()}</strong></p>
                        </div>

                        {/* Warehouse Detail */}
                        <div className="p-3.5 bg-purple-50/50 rounded-xl border border-purple-100 text-xs space-y-1.5">
                          <div className="flex items-center justify-between font-extrabold text-purple-900">
                            <span className="flex items-center gap-1.5">
                              <Package className="w-4 h-4 text-purple-600" />
                              คลังสินค้า (Warehouse)
                            </span>
                            <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md font-bold">
                              {journey.warehouseStep.label}
                            </span>
                          </div>
                          <p className="text-slate-600">สถานะจัดสินค้า: <strong className="text-slate-900">{journey.warehouseStep.label}</strong></p>
                          <p className="text-slate-600">ผู้จัดเตรียม: <strong className="text-slate-900">{journey.warehouseStep.picker}</strong></p>
                          <p className="text-slate-600">รับใบจอง / จัดเสร็จ: <strong className="text-slate-900">{journey.warehouseStep.receivedDate} / {journey.warehouseStep.completedDate}</strong></p>
                          <p className="text-slate-600">โซนจัดเก็บ: <strong className="text-slate-900">{journey.warehouseStep.zone}</strong></p>
                        </div>

                        {/* Logistics Detail */}
                        <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-100 text-xs space-y-1.5">
                          <div className="flex items-center justify-between font-extrabold text-emerald-900">
                            <span className="flex items-center gap-1.5">
                              <Truck className="w-4 h-4 text-emerald-600" />
                              ขนส่ง (Logistics)
                            </span>
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-bold">
                              {journey.deliveryStep.label}
                            </span>
                          </div>
                          <p className="text-slate-600">สถานะนำส่ง: <strong className="text-slate-900">{journey.deliveryStep.label}</strong></p>
                          <p className="text-slate-600">คนขับ / ทะเบียนรถ: <strong className="text-slate-900">{journey.deliveryStep.driver} ({journey.deliveryStep.plate})</strong></p>
                          <p className="text-slate-600">กำหนดส่ง / โหลดขึ้นรถ: <strong className="text-slate-900">{journey.deliveryStep.plannedDate} / {journey.deliveryStep.loadedDate}</strong></p>
                          <p className="text-slate-600">ปลายทางอ้างอิง / สถานะสิ้นสุด: <strong className="text-slate-900">{journey.deliveryStep.destination} / โหลดสินค้าแล้ว ({journey.deliveryStep.loadedDate})</strong></p>
                        </div>
                      </div>

                      {/* Items Table */}
                      <div className="pt-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                            <ShoppingBag className="w-3.5 h-3.5 text-slate-500" />
                            รายการสินค้าในเอกสาร ({order.items.length} รายการ)
                          </span>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                              <tr>
                                <th className="py-2.5 px-3 w-12 text-center">#</th>
                                <th className="py-2.5 px-3">รหัสสินค้า</th>
                                <th className="py-2.5 px-3">ชื่อสินค้า</th>
                                <th className="py-2.5 px-3 text-right">จำนวน</th>
                                <th className="py-2.5 px-3 text-right">ราคา/หน่วย</th>
                                <th className="py-2.5 px-3 text-right">รวมเงิน (บาท)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {order.items.map((it, itIdx) => (
                                <tr key={`doc-it-${order.docNo}-${it.productCode || itIdx}-${itIdx}`} className="hover:bg-slate-50/50">
                                  <td className="py-2 px-3 text-center text-slate-400 font-medium">{itIdx + 1}</td>
                                  <td className="py-2 px-3 font-mono font-bold text-slate-700">{it.productCode}</td>
                                  <td className="py-2 px-3 text-slate-900 font-medium">{it.productName}</td>
                                  <td className="py-2 px-3 text-right font-black text-slate-900">
                                    {it.quantity} <span className="text-[10px] font-normal text-slate-500">{it.unit}</span>
                                  </td>
                                  <td className="py-2 px-3 text-right text-slate-600">฿{it.unitPrice.toLocaleString()}</td>
                                  <td className="py-2 px-3 text-right font-black text-[#0a2558]">฿{it.totalPrice.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* 7. FULL 3-DEPARTMENT TIMELINE MODAL */}
      {selectedDocForTimeline && (() => {
        const journey = getDocumentJourney(selectedDocForTimeline);
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/70">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-black text-sm shrink-0">
                    {selectedDocForTimeline.docType}
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-slate-900">
                      ไทม์ไลน์ติดตามเอกสาร {selectedDocForTimeline.docNo}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      ลูกค้า: {selectedDocForTimeline.customer} • ยอดเงิน: ฿{selectedDocForTimeline.totalAmount.toLocaleString()}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDocForTimeline(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Timeline Steps */}
              <div className="p-6 overflow-y-auto space-y-6">
                <div className="relative pl-6 border-l-2 border-emerald-500 space-y-6">
                  {/* Step 1 */}
                  <div className="relative">
                    <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full bg-emerald-500 ring-4 ring-emerald-100"></div>
                    <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-extrabold text-blue-900">1. ฝ่ายขาย: บันทึกใบจองสำเร็จ</h4>
                        <span className="text-[10px] font-bold text-slate-500">{selectedDocForTimeline.date}</span>
                      </div>
                      <p className="text-xs text-slate-600">พนักงานขาย: <strong>{journey.salesStep.salesperson}</strong></p>
                      <p className="text-xs text-slate-600">จำนวนรายการ: <strong>{selectedDocForTimeline.items.length} รายการ ({selectedDocForTimeline.totalQuantity} ชิ้น)</strong></p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="relative">
                    <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full bg-emerald-500 ring-4 ring-emerald-100"></div>
                    <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-100 space-y-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-extrabold text-purple-900">2. คลังสินค้า: {journey.warehouseStep.label}</h4>
                          <span className="text-[10px] font-bold text-slate-500">รับใบจอง: {journey.warehouseStep.receivedDate}</span>
                      </div>
                        <p className="text-xs text-slate-600">ผู้จัดสินค้า: <strong>{journey.warehouseStep.picker}</strong> • เริ่มหยิบ: <strong>{journey.warehouseStep.startedDate}</strong></p>
                        <p className="text-xs text-slate-600">จัดเสร็จ: <strong>{journey.warehouseStep.completedDate}</strong> • ส่งต่อ: <strong>{journey.warehouseStep.handoffDate}</strong></p>
                        <p className="text-xs text-slate-600">ตำแหน่ง: <strong>{journey.warehouseStep.zone}</strong></p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="relative">
                    <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full bg-emerald-500 ring-4 ring-emerald-100"></div>
                    <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 space-y-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-extrabold text-emerald-900">3. การจัดส่ง: {journey.deliveryStep.label}</h4>
                          <span className="text-[10px] font-bold text-slate-500">กำหนดส่ง: {journey.deliveryStep.plannedDate}</span>
                      </div>
                        <p className="text-xs text-slate-600">ส่งต่อจากคลัง: <strong>{journey.deliveryStep.handoffDate}</strong> • โหลดขึ้นรถ: <strong>{journey.deliveryStep.loadedDate}</strong></p>
                        <p className="text-xs text-slate-600">พนักงานขับรถ: <strong>{journey.deliveryStep.driver}</strong> • ทะเบียนรถ: <strong>{journey.deliveryStep.plate}</strong></p>
                        <p className="text-xs text-slate-600">ปลายทางอ้างอิง: <strong>{journey.deliveryStep.destination || selectedDocForTimeline.customer}</strong> • สถานะสิ้นสุด: <strong>โหลดสินค้าแล้ว ({journey.deliveryStep.loadedDate})</strong></p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedDocForTimeline(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 8. CUSTOMER DETAIL MODAL */}
      {selectedCustomerForModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/70">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                  {selectedCustomerForModal.rank ? `#${selectedCustomerForModal.rank}` : '✨'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-black text-slate-900 truncate">
                      {selectedCustomerForModal.customerName}
                    </h3>
                    {selectedCustomerForModal.isNewCustomer && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        ลูกค้าใหม่
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    พนักงานขายที่ดูแล: {selectedCustomerForModal.salesperson || '-'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomerForModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Stats Grid */}
            <div className="grid grid-cols-3 gap-3 p-5 bg-white border-b border-slate-100">
              <div className="bg-indigo-50/60 p-3 rounded-xl border border-indigo-100">
                <p className="text-[11px] font-bold text-indigo-700 uppercase">ยอดซื้อรวม</p>
                <p className="text-base sm:text-lg font-black text-slate-900 mt-1">
                  {selectedCustomerForModal.totalAmountFormatted}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  ครองส่วนแบ่ง {selectedCustomerForModal.percentageOfTotalSales}%
                </p>
              </div>

              <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-100">
                <p className="text-[11px] font-bold text-blue-700 uppercase">จำนวนใบจอง / บิล</p>
                <p className="text-base sm:text-lg font-black text-slate-900 mt-1">
                  {selectedCustomerForModal.ordersCount} <span className="text-xs font-bold text-slate-500">บิล</span>
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  รวม {selectedCustomerForModal.totalQuantity} ชิ้น
                </p>
              </div>

              <div className="bg-purple-50/60 p-3 rounded-xl border border-purple-100">
                <p className="text-[11px] font-bold text-purple-700 uppercase">เฉลี่ยต่อบิล (Ticket)</p>
                <p className="text-base sm:text-lg font-black text-slate-900 mt-1">
                  {selectedCustomerForModal.avgTicketFormatted}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  ล่าสุด: {selectedCustomerForModal.lastOrderDate || '-'}
                </p>
              </div>
            </div>

            {/* Modal Orders List */}
            <div className="p-5 flex-1 overflow-y-auto space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  ประวัติใบสั่งซื้อ / ใบจอง ({customerOrdersForModal.length} รายการ)
                </h4>
              </div>

              {customerOrdersForModal.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">ไม่พบรายการใบสั่งซื้อของลูกค้ารายนี้</p>
              ) : (
                <div className="space-y-2.5">
                  {customerOrdersForModal.map((ord, ordIdx) => (
                    <div key={`modal-ord-${ord.docNo || 'doc'}-${ordIdx}`} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 font-mono font-bold text-slate-900">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            ord.docType === 'BKET' ? 'bg-purple-100 text-purple-800' :
                            ord.docType === 'BKR' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {ord.docType}
                          </span>
                          <span>{ord.docNo}</span>
                          <span className="text-slate-400 font-normal">({ord.date})</span>
                        </div>
                        <span className="font-extrabold text-[#0a2558] text-sm">
                          ฿{ord.totalAmount.toLocaleString()}
                        </span>
                      </div>

                      {/* Items */}
                      <div className="text-[11px] text-slate-600 bg-white p-2.5 rounded-lg border border-slate-100 space-y-1">
                        {ord.items.map((item, i) => (
                          <div key={`modal-item-${ord.docNo}-${item.seqNo || ''}-${item.productCode || ''}-${i}`} className="flex items-center justify-between">
                            <span className="truncate max-w-[280px]">
                              {item.seqNo}. {item.productName}
                            </span>
                            <span className="font-semibold text-slate-800 shrink-0 ml-2">
                              {item.quantity} {item.unit} (฿{(item.totalPrice || 0).toLocaleString()})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCustomerForModal(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. SALES REP DETAIL MODAL */}
      {selectedRepForModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/70">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#0a2558] text-white flex items-center justify-center font-black text-sm shrink-0">
                  {selectedRepForModal.initials || selectedRepForModal.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-black text-slate-900 truncate">
                      {selectedRepForModal.name}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-200">
                      {selectedRepForModal.role || 'พนักงานขาย'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    อันดับผลงานที่ #{reactiveMetrics.top10Reps.findIndex(r => r.name === selectedRepForModal.name) + 1 || '-'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRepForModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Stats Grid */}
            <div className="grid grid-cols-3 gap-3 p-5 bg-white border-b border-slate-100">
              <div className="bg-indigo-50/60 p-3 rounded-xl border border-indigo-100">
                <p className="text-[11px] font-bold text-indigo-700 uppercase">ยอดขายสะสม</p>
                <p className="text-base sm:text-lg font-black text-slate-900 mt-1">
                  {selectedRepForModal.salesFormatted}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  ครองสัดส่วน {selectedRepForModal.shareOfTotalSales || 0}% ของยอดรวม
                </p>
              </div>

              <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-100">
                <p className="text-[11px] font-bold text-blue-700 uppercase">% เป้าหมายบริษัท</p>
                <p className="text-base sm:text-lg font-black text-slate-900 mt-1">
                  {selectedRepForModal.completionRate}%
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  เป้าหมาย: {formatCurrency(reactiveMetrics.companyTargetInBaht)}
                </p>
              </div>

              <div className="bg-purple-50/60 p-3 rounded-xl border border-purple-100">
                <p className="text-[11px] font-bold text-purple-700 uppercase">จำนวนบิล / เฉลี่ยต่อบิล</p>
                <p className="text-base sm:text-lg font-black text-slate-900 mt-1">
                  {selectedRepForModal.ordersCount || 0} <span className="text-xs font-bold text-slate-500">บิล</span>
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  เฉลี่ย ฿{Math.round(selectedRepForModal.sales / Math.max(1, selectedRepForModal.ordersCount || 1)).toLocaleString()} / บิล
                </p>
              </div>
            </div>

            {/* Modal Orders List */}
            <div className="p-5 flex-1 overflow-y-auto space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  ประวัติใบสั่งซื้อ / ใบจองที่เปิดโดย {selectedRepForModal.name} ({repOrdersForModal.length} รายการ)
                </h4>
              </div>

              {repOrdersForModal.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">ไม่พบรายการใบสั่งซื้อของพนักงานขายท่านนี้</p>
              ) : (
                <div className="space-y-2.5">
                  {repOrdersForModal.map((ord, ordIdx) => (
                    <div key={`modal-rep-ord-${ord.docNo || 'doc'}-${ordIdx}`} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 font-mono font-bold text-slate-900">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            ord.docType === 'BKET' ? 'bg-purple-100 text-purple-800' :
                            ord.docType === 'BKR' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {ord.docType}
                          </span>
                          <span>{ord.docNo}</span>
                          <span className="text-slate-400 font-normal">({ord.date})</span>
                        </div>
                        <span className="font-extrabold text-[#0a2558] text-sm">
                          ฿{ord.totalAmount.toLocaleString()}
                        </span>
                      </div>

                      <div className="text-xs text-slate-700 font-semibold">
                        ลูกค้า: <span className="text-slate-900 font-bold">{ord.customer}</span>
                      </div>

                      {/* Items */}
                      <div className="text-[11px] text-slate-600 bg-white p-2.5 rounded-lg border border-slate-100 space-y-1">
                        {ord.items.map((item, i) => (
                          <div key={`modal-rep-item-${ord.docNo}-${item.seqNo || ''}-${item.productCode || ''}-${i}`} className="flex items-center justify-between">
                            <span className="truncate max-w-[280px]">
                              {item.seqNo}. {item.productName}
                            </span>
                            <span className="font-semibold text-slate-800 shrink-0 ml-2">
                              {item.quantity} {item.unit} (฿{(item.totalPrice || 0).toLocaleString()})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedRepForModal(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer"
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

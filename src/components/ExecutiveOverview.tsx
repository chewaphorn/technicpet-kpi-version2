import { BookingTrackingSection } from './BookingTrackingSection';
import { buildBookingTracking, filterBookingTracking, summarizeBookingLeadTime } from '../utils/bookingTracking';
import { aggregateWarehouseDocs, filterWarehouseDocs, calculateWarehouseMetrics, isWarehouseDocCompleted, aggregateDeliveryTrips, filterDeliveryTrips, calculateDeliveryMetrics, isCompletedTrip, getWarehouseReportDate, getDeliveryReportDate } from '../utils/logisticsReportMetrics';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { normalizeDateToISO, getMinMaxDates } from '../utils/dateUtils';
import { calculateDaysDiff } from '../utils/dataProcessor';
import { calculateSalesTotals, filterSalesOrders } from '../utils/salesReportMetrics';
import { buildDepartmentGoalGroups, formatGoalValue, type DepartmentGoalGroup, type GoalMetric } from '../utils/departmentGoals';
import { useReportTargets } from '../hooks/useReportTargets';
import { 
  KPIStats, 
  MonthlyDeliveryTrend, 
  WarehouseDoc, 
  DeliveryTrip, 
  SalesRepPerformance, 
  DetailedSalesOrder,
  ScreenId,
  AuthUser 
} from '../types';
import { 
  Calendar, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  ShoppingCart, 
  Receipt, 
  Percent, 
  ChevronDown,
  RotateCcw,
  SlidersHorizontal,
  ArrowRight,
  Truck,
  Inbox,
  Filter,
  Check,
  X,
  Eye,
  CalendarDays,
  FileText,
  Download,
  Boxes,
  Package,
  Timer,
  CalendarClock,
  Layers,
  Zap,
  FileSpreadsheet,
  Upload,
  RefreshCw
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

interface ExecutiveOverviewProps {
  kpis: KPIStats;
  trendData: MonthlyDeliveryTrend[];
  onSearchDoc: (docNo: string) => void;
  warehouseDocs?: WarehouseDoc[];
  deliveryTrips?: DeliveryTrip[];
  salesReps?: SalesRepPerformance[];
  detailedOrders?: DetailedSalesOrder[];
  salesSummary?: any;
  warehouseSummary?: any;
  deliverySummary?: any;
  onNavigateScreen?: (screen: ScreenId) => void;
  onExportPDF?: (dept?: 'overview' | 'sales' | 'warehouse' | 'delivery', startDate?: string, endDate?: string) => void;
  onOpenGoogleSheetsModal?: (dept?: 'all' | 'sales' | 'warehouse' | 'delivery') => void;
  currentUser?: AuthUser | null;
  onSyncAllDepartments?: () => Promise<void>;
  isSyncingAll?: boolean;
  syncErrors?: { sales?: string; warehouse?: string; delivery?: string };
}

type ExecutiveTrendPoint = MonthlyDeliveryTrend & {
  /** Revenue is plotted on the left currency axis. */
  salesAmount: number;
  salesOrderCount: number;
  /** Department KPI rates are plotted on the right percentage axis. */
  salesCompletionRate: number | null;
  warehouseCompletionRate: number | null;
  deliveryCompletionRate: number | null;
  /** Actual results and configured targets used by the executive KPI chart. */
  deliveryLeadTimeActual: number | null;
  deliveryLeadTimeTarget: number | null;
  deliveryOtdActual: number | null;
  deliveryOtdTarget: number | null;
  pickingLeadTimeActual: number | null;
  pickingLeadTimeTarget: number | null;
};

type ExecutiveKpiTargets = {
  deliveryLeadTimeDays: number;
  onTimeDeliveryPercent: number;
  pickingLeadTimeDays: number;
};

const GoalBulletChart: React.FC<{ metric: GoalMetric; color: string }> = ({ metric, color }) => {
  const { actual, target, unit, direction } = metric;
  const scale = unit === 'percent' ? 100 : Math.max(actual ?? 0, target, 1) * 1.1;
  const actualWidth = actual === null ? 0 : Math.max(0, Math.min(100, (actual / scale) * 100));
  const targetPosition = Math.max(0, Math.min(100, (target / scale) * 100));
  const met = actual !== null && (direction === 'higher' ? actual >= target : actual <= target);

  return (
    <div className="space-y-1.5" data-testid={`overview-goal-${metric.id}`}>
      <p className="text-xs font-bold text-slate-800">{metric.label}</p>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs">
        <span className="font-extrabold text-slate-900">ผลจริง {actual === null ? '—' : formatGoalValue(actual, unit)}</span>
        <span className="font-semibold text-slate-600">เป้าหมาย {direction === 'higher' ? '≥' : '≤'} {formatGoalValue(target, unit)}</span>
      </div>
      <div className="relative h-3 rounded-full bg-slate-100" role="img" aria-label={`${metric.label}: ผลจริง ${actual === null ? 'ไม่มีข้อมูล' : formatGoalValue(actual, unit)}, เป้าหมาย ${direction === 'higher' ? 'อย่างน้อย' : 'ไม่เกิน'} ${formatGoalValue(target, unit)}`}>
        <div className="h-full rounded-full" style={{ width: `${actualWidth}%`, backgroundColor: color }} />
        <div className="absolute top-[-3px] h-[18px] w-0.5 rounded-full bg-slate-800" style={{ left: `${targetPosition}%` }} title="เป้าหมาย" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 text-[11px]">
        <span className="text-slate-500">{metric.note}</span>
        <span className={actual === null ? 'text-slate-500' : met ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>
          {actual === null ? 'ไม่มีข้อมูล' : met ? 'ถึงเป้าหมาย' : direction === 'higher' ? 'ต่ำกว่าเป้าหมาย' : 'เกินเป้าหมาย'}
        </span>
      </div>
    </div>
  );
};

const formatTrendRevenue = (value: number): string => {
  if (!Number.isFinite(value) || value === 0) return '฿0';
  if (Math.abs(value) >= 1_000_000) return `฿${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `฿${(value / 1_000).toFixed(1)}K`;
  return `฿${Math.round(value).toLocaleString()}`;
};

const formatTrendKpi = (value: number | null): string =>
  value == null ? '—' : `${value}%`;

// Keep completion semantics identical to DeliveryReportView. A delivery is
// complete when its status or delivery timestamps confirm the handoff.
const isCompletedDeliveryTrip = isCompletedTrip;

// Reusable Department Section Header
interface DepartmentSectionHeaderProps {
  id?: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  iconBorder: string;
  title: string;
  badge: string;
  subtitle: string;
  screenId: ScreenId;
  onNavigateScreen?: (screen: ScreenId) => void;
}

const DepartmentSectionHeader: React.FC<DepartmentSectionHeaderProps> = ({
  id,
  icon,
  iconBg,
  iconColor,
  iconBorder,
  title,
  badge,
  subtitle,
  screenId,
  onNavigateScreen
}) => (
  <div id={id} className="flex flex-wrap items-center justify-between gap-3 pb-1 border-b border-slate-200/80">
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg} ${iconColor} border ${iconBorder} shadow-2xs shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight break-words">
            {title}
          </h3>
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            {badge}
          </span>
        </div>
        <p className="text-xs text-slate-500 font-medium mt-0.5">
          {subtitle}
        </p>
      </div>
    </div>

    {onNavigateScreen && (
      <button
        type="button"
        id={`btn-nav-detail-${screenId}`}
        onClick={() => onNavigateScreen(screenId)}
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-blue-700 hover:text-blue-900 bg-blue-50/90 hover:bg-blue-100 border border-blue-200/80 hover:border-blue-300 transition-all cursor-pointer shadow-2xs group"
      >
        <span>ดูรายงานละเอียด</span>
        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform text-blue-600" />
      </button>
    )}
  </div>
);

// Unified Executive KPI Card Design System
interface ExecutiveKPICardProps {
  id?: string;
  title: string;
  value: string | number;
  badge: {
    label: string;
    variant: 'emerald' | 'amber' | 'rose' | 'blue';
  };
  icon: React.ReactNode;
  iconBgClass: string;
  iconColorClass: string;
  note: string;
  noteIcon?: React.ReactNode;
  onClick?: () => void;
}

const ExecutiveKPICard: React.FC<ExecutiveKPICardProps> = ({
  id,
  title,
  value,
  badge,
  icon,
  iconBgClass,
  iconColorClass,
  note,
  noteIcon,
  onClick
}) => {
  const badgeStyles = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
  }[badge.variant];

  const dotStyles = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    blue: 'bg-blue-500',
  }[badge.variant];

  return (
    <div
      id={id}
      onClick={onClick}
      className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs hover:shadow-xs hover:border-slate-300 transition-all duration-200 flex flex-col justify-between group cursor-pointer"
    >
      <div>
        {/* Top Header: Icon + Title + Status Badge */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className={`w-8 h-8 rounded-xl ${iconBgClass} ${iconColorClass} flex items-center justify-center shrink-0`}>
              {icon}
            </div>
            <span className="text-xs font-semibold text-slate-700 break-words" title={title}>
              {title}
            </span>
          </div>

          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border max-w-full break-words ${badgeStyles}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotStyles}`} />
            {badge.label}
          </span>
        </div>

        {/* Big Bold Stat Value */}
        <div className="mt-3.5 mb-2">
          <div className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight tabular-nums break-words">
            {value}
          </div>
        </div>
      </div>

      {/* Footer / Context Line */}
      <div className="pt-2.5 mt-1 border-t border-slate-100 flex items-center justify-between gap-2 text-[11.5px] font-medium text-slate-500">
        <div className="flex items-start gap-1.5 min-w-0 flex-1">
          {noteIcon && <span className="shrink-0">{noteIcon}</span>}
          <span className="break-words">{note}</span>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
      </div>
    </div>
  );
};

export const ExecutiveOverview: React.FC<ExecutiveOverviewProps> = ({
  kpis,
  trendData,
  onSearchDoc,
  warehouseDocs = [],
  deliveryTrips = [],
  detailedOrders = [],
  salesSummary,
  warehouseSummary,
  deliverySummary,
  onNavigateScreen,
  onExportPDF,
  onOpenGoogleSheetsModal,
  currentUser,
  onSyncAllDepartments,
  isSyncingAll = false,
  syncErrors,
}) => {
  const reportTargets = useReportTargets();
  // Use the union of all department dates so the overview never limits the
  // warehouse or delivery reports to the sales department's date range.
  const overviewDateCandidates = useMemo(() => [
    ...detailedOrders.map((o) => o.date),
    ...warehouseDocs.map(getWarehouseReportDate),
    ...deliveryTrips.map(getDeliveryReportDate),
  ], [detailedOrders, warehouseDocs, deliveryTrips]);
  const { min: autoMinDate, max: autoMaxDate } = useMemo(() => {
    return getMinMaxDates(overviewDateCandidates, '', '');
  }, [overviewDateCandidates]);

  // Keep the default overview focused on the latest rolling year. Older
  // records remain reachable through the date picker.
  const defaultStartDate = useMemo(() => {
    if (!autoMinDate || !autoMaxDate) return '';
    const [year, month, day] = autoMaxDate.split('-').map(Number);
    const latest = new Date(Date.UTC(year, month - 1, day));
    latest.setUTCMonth(latest.getUTCMonth() - 11);
    latest.setUTCDate(Math.min(day, new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() + 1, 0)).getUTCDate()));
    const rollingYearStart = latest.toISOString().slice(0, 10);
    return rollingYearStart > autoMinDate ? rollingYearStart : autoMinDate;
  }, [autoMinDate, autoMaxDate]);

  // Real Date Filter States (ISO Strings YYYY-MM-DD)
  const [startDate, setStartDate] = useState(() => defaultStartDate);
  const [endDate, setEndDate] = useState(() => autoMaxDate);
  const [appliedStartDate, setAppliedStartDate] = useState(() => defaultStartDate);
  const [appliedEndDate, setAppliedEndDate] = useState(() => autoMaxDate);
  const hasAppliedFilter = useRef(false);

  // Department Filter (Default to 'ทั้งหมด' to view all departments together in Executive Dashboard)
  const [selectedDept, setSelectedDept] = useState('ทั้งหมด');
  const [appliedDept, setAppliedDept] = useState('ทั้งหมด');

  // Search & UI States
  const [searchInput, setSearchInput] = useState('');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(() => `${formatDisplayDate(defaultStartDate)} - ${formatDisplayDate(autoMaxDate)}`);
  const kpiTargets = useMemo<ExecutiveKpiTargets>(() => ({
    deliveryLeadTimeDays: reportTargets.salesToLoadedLeadTimeTargetDays,
    onTimeDeliveryPercent: reportTargets.deliveryCompletionTargetPercent,
    pickingLeadTimeDays: reportTargets.warehousePickingLeadTimeTarget,
  }), [reportTargets.salesToLoadedLeadTimeTargetDays, reportTargets.deliveryCompletionTargetPercent, reportTargets.warehousePickingLeadTimeTarget]);

  // Auto-sync when any department dataset updates
  useEffect(() => {
    const hasDepartmentData = detailedOrders.length > 0 || warehouseDocs.length > 0 || deliveryTrips.length > 0;
    if (hasDepartmentData && autoMinDate && autoMaxDate && !hasAppliedFilter.current) {
      setStartDate(defaultStartDate);
      setEndDate(autoMaxDate);
      setAppliedStartDate(defaultStartDate);
      setAppliedEndDate(autoMaxDate);
      setLastUpdated(`${formatDisplayDate(defaultStartDate)} - ${formatDisplayDate(autoMaxDate)}`);
    } else if (!hasDepartmentData) {
      hasAppliedFilter.current = false;
      setStartDate('');
      setEndDate('');
      setAppliedStartDate('');
      setAppliedEndDate('');
      setLastUpdated('');
    }
  }, [detailedOrders, warehouseDocs, deliveryTrips, defaultStartDate, autoMaxDate]);

  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsDatePickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Format Helper DD/MM/YYYY
  function formatDisplayDate(isoStr: string) {
    if (!isoStr) return '';
    const [y, m, d] = isoStr.split('-');
    return `${d}/${m}/${y}`;
  }

  // Apply Filter Action
  const handleApplyFilter = () => {
    hasAppliedFilter.current = true;
    setIsApplying(true);
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setAppliedDept(selectedDept);
    setIsDatePickerOpen(false);

    setTimeout(() => {
      setIsApplying(false);
      setLastUpdated(`${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`);
    }, 200);
  };

  // Reset Filters to default
  const handleResetFilter = () => {
    hasAppliedFilter.current = false;
    setStartDate(defaultStartDate);
    setEndDate(autoMaxDate);
    setSelectedDept('ทั้งหมด');
    setAppliedStartDate(defaultStartDate);
    setAppliedEndDate(autoMaxDate);
    setAppliedDept('ทั้งหมด');
    setLastUpdated(`${formatDisplayDate(defaultStartDate)} - ${formatDisplayDate(autoMaxDate)}`);
  };

  // Check if any filter is non-default
  const isFilterActive = 
    Boolean(appliedStartDate || appliedEndDate) ||
    appliedDept !== 'ทั้งหมด';

  const daySpan = useMemo(() => {
    if (!appliedStartDate || !appliedEndDate) return 0;
    const start = new Date(appliedStartDate).getTime();
    const end = new Date(appliedEndDate).getTime();
    const diffDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
    return isNaN(diffDays) ? 0 : diffDays;
  }, [appliedStartDate, appliedEndDate]);

  // Use the same date window as the detail reports before calculating cards.
  // This prevents the overview from mixing all-time summaries with filtered rows.
  const overviewOrders = useMemo(
    () => filterSalesOrders(detailedOrders, {
      fromDate: appliedStartDate,
      toDate: appliedEndDate,
    }),
    [detailedOrders, appliedStartDate, appliedEndDate]
  );
  const aggregatedWarehouseDocs = useMemo(() => aggregateWarehouseDocs(warehouseDocs, detailedOrders), [warehouseDocs, detailedOrders]);
  const overviewWarehouseDocs = useMemo(() => filterWarehouseDocs(aggregatedWarehouseDocs, {fromDate: appliedStartDate, toDate: appliedEndDate}), [aggregatedWarehouseDocs, appliedStartDate, appliedEndDate]);
  const groupedDeliveryTrips = useMemo(() => aggregateDeliveryTrips(deliveryTrips, detailedOrders), [deliveryTrips, detailedOrders]);
  const overviewDeliveryTrips = useMemo(() => filterDeliveryTrips(groupedDeliveryTrips, {fromDate: appliedStartDate, toDate: appliedEndDate}), [groupedDeliveryTrips, appliedStartDate, appliedEndDate]);
  const bookingRows = useMemo(() => buildBookingTracking(detailedOrders, warehouseDocs, deliveryTrips), [detailedOrders, warehouseDocs, deliveryTrips]);
  const overviewBookingRows = useMemo(() => filterBookingTracking(bookingRows, '', appliedStartDate, appliedEndDate), [bookingRows, appliedStartDate, appliedEndDate]);

  // Build the trend from the exact rows used by the department reports. The
  // old trendData prop is kept only as a backwards-compatible fallback for
  // cached/legacy datasets that do not contain detail rows.
  const computedTrendData = useMemo<ExecutiveTrendPoint[]>(() => {
    type TrendEvent = {
      key: string;
      date: string;
      completed: boolean;
      delayed: boolean;
      salesAmount: number;
      salesOrderCount: number;
      salesCompletedCount: number;
      warehouseCount: number;
      warehouseCompletedCount: number;
      deliveryCount: number;
      deliveryCompletedCount: number;
      deliveryLeadTimeDays: number | null;
      deliveryOnTime: boolean | null;
      pickingLeadTimeDays: number | null;
    };

    const normalizeStatus = (value: unknown) => String(value ?? '').trim().toLowerCase();
    const isCompletedSalesOrder = (order: DetailedSalesOrder) => {
      const status = normalizeStatus(order.status);
      return ['เสร็จ', 'สำเร็จ', 'completed', 'ส่งแล้ว', 'ส่งมอบ', 'อนุมัติ'].some((label) => status.includes(label));
    };
    const isCompletedWarehouseDoc = isWarehouseDocCompleted;
    const hasDepartment = (department: string) =>
      appliedDept === 'ทั้งหมด' || appliedDept === department;
    const events: TrendEvent[] = [];

    const addEvent = (
      source: string,
      rawKey: string | undefined,
      rawDate: string | undefined,
      completed: boolean,
      delayed: boolean,
      index: number,
      salesAmount = 0,
      metrics: {
        deliveryLeadTimeDays?: number | null;
        deliveryOnTime?: boolean | null;
        pickingLeadTimeDays?: number | null;
      } = {},
    ) => {
      const date = normalizeDateToISO(rawDate);
      if (!date) return;
      const key = rawKey?.trim().toUpperCase() || `${source}-${date}-${index}`;
      events.push({
        key,
        date,
        completed,
        delayed,
        salesAmount: source === 'sales' ? salesAmount : 0,
        salesOrderCount: source === 'sales' ? 1 : 0,
        salesCompletedCount: source === 'sales' && completed ? 1 : 0,
        warehouseCount: source === 'warehouse' ? 1 : 0,
        warehouseCompletedCount: source === 'warehouse' && completed ? 1 : 0,
        deliveryCount: source === 'delivery' ? 1 : 0,
        deliveryCompletedCount: source === 'delivery' && completed ? 1 : 0,
        deliveryLeadTimeDays: source === 'delivery' && completed && Number.isFinite(metrics.deliveryLeadTimeDays)
          ? Number(metrics.deliveryLeadTimeDays)
          : null,
        deliveryOnTime: source === 'delivery' && completed && metrics.deliveryOnTime !== undefined
          ? metrics.deliveryOnTime
          : null,
        pickingLeadTimeDays: source === 'warehouse' && completed && Number.isFinite(metrics.pickingLeadTimeDays)
          ? Number(metrics.pickingLeadTimeDays)
          : null,
      });
    };

    if (hasDepartment('ฝ่ายขาย')) {
      overviewOrders.forEach((order, index) => {
        const completed = isCompletedSalesOrder(order);
        addEvent('sales', order.docNo, order.date, completed, !completed, index, order.totalAmount || 0);
      });
    }
    if (hasDepartment('คลังสินค้า')) {
      overviewWarehouseDocs.forEach((doc, index) => {
        const completed = isCompletedWarehouseDoc(doc);
        const pickingLeadTimeDays = completed
          ? calculateDaysDiff(doc.salesOrderDate, doc.completedDate)
          : undefined;
        const validPickingLeadTimeDays = pickingLeadTimeDays !== undefined && pickingLeadTimeDays >= 0
          ? pickingLeadTimeDays
          : undefined;
        addEvent(
          'warehouse',
          doc.docNo,
          doc.date,
          completed,
          Number(doc.delayDays || 0) > 0 || !completed,
          index,
          0,
          { pickingLeadTimeDays: validPickingLeadTimeDays },
        );
      });
    }
    if (hasDepartment('การจัดส่ง')) {
      overviewDeliveryTrips.forEach((trip, index) => {
        const completed = isCompletedDeliveryTrip(trip);
        const handoffDate = trip.handoffDate || trip.handoverDate;
        const loadedDate = trip.loadedDate;
        const calculatedLeadTime = handoffDate && loadedDate
          ? calculateDaysDiff(handoffDate, loadedDate)
          : undefined;
        const measuredDeliveryLeadTime = calculatedLeadTime;
        const hasMeasuredDeliveryLeadTime = Number.isFinite(measuredDeliveryLeadTime) && Number(measuredDeliveryLeadTime) >= 0;
        // Exclude unmeasured lead times, matching the department report.
        const validDeliveryLeadTimeDays = hasMeasuredDeliveryLeadTime
          ? Number(measuredDeliveryLeadTime)
          : undefined;
        const deliveryOnTime = completed && hasMeasuredDeliveryLeadTime
          ? Number(measuredDeliveryLeadTime) <= kpiTargets.deliveryLeadTimeDays
          : undefined;
        addEvent(
          'delivery',
          trip.docNo || trip.salesOrderNo || trip.deliveryNo,
          trip.plannedDate || trip.orderDate || trip.handoffDate || trip.loadedDate,
          completed,
          trip.status === 'delayed' || Number(trip.pendingDeliveryDays || 0) > 0,
          index,
          0,
          { deliveryLeadTimeDays: validDeliveryLeadTimeDays, deliveryOnTime },
        );
      });
    }

    // A document in the combined view can exist in all three source sheets.
    // Merge those rows before counting so the overview cannot triple-count it.
    const uniqueEvents = new Map<string, TrendEvent>();
    events.forEach((event) => {
      const existing = uniqueEvents.get(event.key);
      if (!existing) {
        uniqueEvents.set(event.key, { ...event });
        return;
      }
      existing.completed = existing.completed && event.completed;
      existing.delayed = existing.delayed || event.delayed;
      existing.salesAmount += event.salesAmount;
      existing.salesOrderCount += event.salesOrderCount;
      existing.salesCompletedCount += event.salesCompletedCount;
      existing.warehouseCount += event.warehouseCount;
      existing.warehouseCompletedCount += event.warehouseCompletedCount;
      existing.deliveryCount += event.deliveryCount;
      existing.deliveryCompletedCount += event.deliveryCompletedCount;
      if (event.deliveryLeadTimeDays !== null) {
        existing.deliveryLeadTimeDays = existing.deliveryLeadTimeDays === null
          ? event.deliveryLeadTimeDays
          : existing.deliveryLeadTimeDays + event.deliveryLeadTimeDays;
      }
      if (event.deliveryOnTime !== null) {
        existing.deliveryOnTime = existing.deliveryOnTime === null
          ? event.deliveryOnTime
          : existing.deliveryOnTime && event.deliveryOnTime;
      }
      if (event.pickingLeadTimeDays !== null) {
        existing.pickingLeadTimeDays = existing.pickingLeadTimeDays === null
          ? event.pickingLeadTimeDays
          : existing.pickingLeadTimeDays + event.pickingLeadTimeDays;
      }
      if (event.date < existing.date) existing.date = event.date;
    });

    const useDailyBuckets = daySpan > 0 && daySpan <= 31;
    const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const buckets = new Map<string, {
      sortKey: string;
      label: string;
      onTime: number;
      needsFollowUp: number;
      salesAmount: number;
      salesOrderCount: number;
      salesCompletedCount: number;
      warehouseCount: number;
      warehouseCompletedCount: number;
      deliveryCount: number;
      deliveryCompletedCount: number;
      deliveryLeadTimeSum: number;
      deliveryLeadTimeCount: number;
      deliveryOnTimeCount: number;
      deliveryOnTimeCountDenominator: number;
      pickingLeadTimeSum: number;
      pickingLeadTimeCount: number;
    }>();

    uniqueEvents.forEach((event) => {
      const date = normalizeDateToISO(event.date);
      if (!date) return;
      const [year, month, day] = date.split('-').map(Number);
      if (!year || !month || !day) return;
      const sortKey = useDailyBuckets ? date : `${year}-${String(month).padStart(2, '0')}`;
      const label = useDailyBuckets
        ? `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`
        : `${monthNames[month - 1]} ${year}`;
      const current = buckets.get(sortKey) || {
        sortKey,
        label,
        onTime: 0,
        needsFollowUp: 0,
        salesAmount: 0,
        salesOrderCount: 0,
        salesCompletedCount: 0,
        warehouseCount: 0,
        warehouseCompletedCount: 0,
        deliveryCount: 0,
        deliveryCompletedCount: 0,
        deliveryLeadTimeSum: 0,
        deliveryLeadTimeCount: 0,
        deliveryOnTimeCount: 0,
        deliveryOnTimeCountDenominator: 0,
        pickingLeadTimeSum: 0,
        pickingLeadTimeCount: 0,
      };
      const onTime = event.completed && !event.delayed;
      if (onTime) current.onTime += 1;
      else current.needsFollowUp += 1;
      current.salesAmount += event.salesAmount;
      current.salesOrderCount += event.salesOrderCount;
      current.salesCompletedCount += event.salesCompletedCount;
      current.warehouseCount += event.warehouseCount;
      current.warehouseCompletedCount += event.warehouseCompletedCount;
      current.deliveryCount += event.deliveryCount;
      current.deliveryCompletedCount += event.deliveryCompletedCount;
      if (event.deliveryLeadTimeDays !== null) {
        current.deliveryLeadTimeSum += event.deliveryLeadTimeDays;
        current.deliveryLeadTimeCount += 1;
      }
      if (event.deliveryOnTime !== null) {
        current.deliveryOnTimeCountDenominator += 1;
        if (event.deliveryOnTime) current.deliveryOnTimeCount += 1;
      }
      if (event.pickingLeadTimeDays !== null) {
        current.pickingLeadTimeSum += event.pickingLeadTimeDays;
        current.pickingLeadTimeCount += 1;
      }
      buckets.set(sortKey, current);
    });

    return [...buckets.values()]
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map((bucket) => {
        const {
          label,
          onTime,
          needsFollowUp,
          salesAmount,
          salesOrderCount,
          salesCompletedCount,
          warehouseCount,
          warehouseCompletedCount,
          deliveryCount,
          deliveryCompletedCount,
          deliveryLeadTimeSum,
          deliveryLeadTimeCount,
          deliveryOnTimeCount,
          deliveryOnTimeCountDenominator,
          pickingLeadTimeSum,
          pickingLeadTimeCount,
        } = bucket;
        const total = onTime + needsFollowUp;
        return {
          month: label,
          deliveredWithin3Days: onTime,
          deliveredOver3Days: needsFollowUp,
          totalVolume: total,
          onTimePercent: total > 0 ? Number(((onTime / total) * 100).toFixed(1)) : 0,
          salesAmount,
          salesOrderCount,
          salesCompletionRate: salesOrderCount > 0 ? Number(((salesCompletedCount / salesOrderCount) * 100).toFixed(1)) : null,
          warehouseCompletionRate: warehouseCount > 0 ? Number(((warehouseCompletedCount / warehouseCount) * 100).toFixed(1)) : null,
          deliveryCompletionRate: deliveryCount > 0 ? Number(((deliveryCompletedCount / deliveryCount) * 100).toFixed(1)) : null,
          deliveryLeadTimeActual: deliveryLeadTimeCount > 0 ? Number((deliveryLeadTimeSum / deliveryLeadTimeCount).toFixed(1)) : null,
          deliveryLeadTimeTarget: deliveryLeadTimeCount > 0 ? kpiTargets.deliveryLeadTimeDays : null,
          deliveryOtdActual: deliveryOnTimeCountDenominator > 0 ? Number(((deliveryOnTimeCount / deliveryOnTimeCountDenominator) * 100).toFixed(1)) : null,
          deliveryOtdTarget: deliveryOnTimeCountDenominator > 0 ? kpiTargets.onTimeDeliveryPercent : null,
          pickingLeadTimeActual: pickingLeadTimeCount > 0 ? Number((pickingLeadTimeSum / pickingLeadTimeCount).toFixed(1)) : null,
          pickingLeadTimeTarget: pickingLeadTimeCount > 0 ? kpiTargets.pickingLeadTimeDays : null,
        };
      });
  }, [
    appliedDept,
    appliedStartDate,
    daySpan,
    overviewOrders,
    overviewWarehouseDocs,
    overviewDeliveryTrips,
    kpiTargets,
  ]);

  const legacyTrendData = useMemo<ExecutiveTrendPoint[]>(() => {
    const startDate = normalizeDateToISO(appliedStartDate);
    const endDate = normalizeDateToISO(appliedEndDate);
    const englishMonthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const thaiMonthNames = Array.from({ length: 12 }, (_, month) =>
      new Intl.DateTimeFormat('th-TH', { month: 'short', timeZone: 'UTC' })
        .format(new Date(Date.UTC(2026, month, 1)))
        .replace(/\s/g, '')
        .toLowerCase()
    );
    const filtered = trendData.filter((item) => {
      const label = String(item.month || '').trim();
      const datedLabel = normalizeDateToISO(label);
      if (datedLabel) return (!startDate || datedLabel >= startDate) && (!endDate || datedLabel <= endDate);

      const yearMatch = label.match(/(\d{4})\s*$/);
      const year = yearMatch ? Number(yearMatch[1]) : null;
      const monthLabel = label.replace(/\d{4}\s*$/, '').replace(/\s/g, '').toLowerCase();
      const monthIndex = englishMonthNames.findIndex((month) => monthLabel.startsWith(month)) >= 0
        ? englishMonthNames.findIndex((month) => monthLabel.startsWith(month))
        : thaiMonthNames.findIndex((month) => monthLabel.startsWith(month));
      if (monthIndex < 0 || (!startDate && !endDate)) return true;
      if (!startDate || !endDate) return false;

      const [endYear, endMonth] = endDate.split('-').map(Number);
      if (year === null) {
        // Legacy monthly points have no year. Place them in the latest matching
        // month inside the selected range so they cannot leak across years.
        let inferredYear = endYear;
        if (monthIndex > endMonth - 1) inferredYear -= 1;
        const bucketStart = `${inferredYear}-${String(monthIndex + 1).padStart(2, '0')}-01`;
        const bucketEnd = new Date(Date.UTC(inferredYear, monthIndex + 1, 0)).toISOString().slice(0, 10);
        return bucketEnd >= startDate && bucketStart <= endDate;
      }
      const bucketStart = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
      const bucketEnd = new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);
      return bucketEnd >= startDate && bucketStart <= endDate;
    });
    return filtered.map((item) => ({
      ...item,
      salesAmount: 0,
      salesOrderCount: 0,
      salesCompletionRate: null,
      warehouseCompletionRate: null,
      deliveryCompletionRate: null,
      deliveryLeadTimeActual: null,
      deliveryLeadTimeTarget: null,
      deliveryOtdActual: null,
      deliveryOtdTarget: null,
      pickingLeadTimeActual: null,
      pickingLeadTimeTarget: null,
    }));
  }, [trendData, appliedStartDate, appliedEndDate]);

  // A selected period with no rows must stay empty, not revive stale legacy trend data.
  const hasRawTrendRows = detailedOrders.length > 0 || warehouseDocs.length > 0 || deliveryTrips.length > 0;
  const filteredTrendData: ExecutiveTrendPoint[] = hasRawTrendRows ? computedTrendData : legacyTrendData;

  // One booking contributes once, only after all its trips have a valid load date.
  // Match the booking tracker and use the sales opening date for the period.
  const salesToLoadedAverage = useMemo(() => summarizeBookingLeadTime(overviewBookingRows), [overviewBookingRows]);

  // Departmental Metrics aggregated from real props and summary data
  const departmentMetrics = useMemo(() => {
    const hasData = overviewOrders.length > 0 || overviewWarehouseDocs.length > 0 || overviewDeliveryTrips.length > 0;

    // 1. Sales Metrics
    const salesTotals = calculateSalesTotals(overviewOrders);
    const totalOrdersCount = salesTotals.totalOrders;
    const totalSalesAmount = salesTotals.totalRevenue;
    const computedCompletedOrdersCount = overviewOrders.filter(
      (o) =>
        o.status.includes('เสร็จ') ||
        o.status.includes('สำเร็จ') ||
        o.status.includes('completed') ||
        o.status.includes('ส่งแล้ว') ||
        o.status.includes('ส่งมอบ') ||
        o.status.includes('อนุมัติ')
    ).length;
    const completedOrdersCount = computedCompletedOrdersCount;
    const completionRate = totalOrdersCount > 0 ? ((completedOrdersCount / totalOrdersCount) * 100).toFixed(1) : '0';
    const revenueAmount = totalSalesAmount;
    const revenueFormatted = revenueAmount !== 0
      ? (revenueAmount >= 1_000_000 ? `฿${(revenueAmount / 1_000_000).toFixed(2)}M` : `฿${Math.round(revenueAmount).toLocaleString()}`)
      : '฿0';
    const averageTicket = salesTotals.averageTicket;
    const onTimePercent = overviewDeliveryTrips.length > 0
      ? (deliverySummary?.otdPercent ?? kpis.deliveryOnTimeRate ?? 0)
      : 0;

    // 2. Warehouse Metrics
    const warehouseMetrics = calculateWarehouseMetrics(overviewWarehouseDocs);
    const totalDocs = warehouseMetrics.totalDocsCount;
    const completedWarehouseDocs = warehouseMetrics.completedDocsCount;
    const pendingDocs = warehouseMetrics.pendingDocsCount;
    const pickingSpeed = warehouseSummary?.avgPickingMinutes || '-';
    const stockReadyPercent = Number(warehouseMetrics.completionPercent);

    // 3. Delivery Metrics (การจัดส่ง: จำนวนบิลทั้งหมด, จำนวนบิลที่ส่งสำเร็จ, บิลที่ค้างส่ง / ส่งล่าช้า)
    const totalDeliveryBills = overviewDeliveryTrips.length;
    const completedDeliveryBills = overviewDeliveryTrips.filter(isCompletedDeliveryTrip).length;
    const completedDeliveryRate = totalDeliveryBills > 0 
      ? ((completedDeliveryBills / totalDeliveryBills) * 100).toFixed(1) 
      : '0';

    // บิลค้างส่ง / ส่งล่าช้า
    const pendingOrDelayedBills = calculateDeliveryMetrics(overviewDeliveryTrips).pendingDeliveriesCount;
    const delayedCount = calculateDeliveryMetrics(overviewDeliveryTrips).delayed;

    const uniquePlates = new Set(
      overviewDeliveryTrips
        .map(t => (t.licensePlate || t.vehicleNo || '').trim())
        .filter(plate => plate && plate !== '-' && plate !== 'รอระบุ')
    );
    const totalTrips = overviewDeliveryTrips.length;
    // The department report calculates vehicles after its date/status filters;
    // using the all-time summary here caused the Overview note to drift.
    const vehiclesCount = uniquePlates.size;
    const leadTimeDays = calculateDeliveryMetrics(overviewDeliveryTrips).leadTimeStats.mean;

    return {
      hasData,
      sales: {
        totalOrdersCount,
        completedOrdersCount,
        completionRate,
        revenueFormatted,
        averageTicket,
        targetRevenueM: salesSummary?.targetRevenueMillions != null ? String(salesSummary.targetRevenueMillions) : '0.0',
        targetPercent: salesSummary?.targetPercent != null ? String(salesSummary.targetPercent) : '0.0',
        onTimePercent,
      },
      warehouse: {
        totalDocs,
        completedWarehouseDocs,
        pendingDocs,
        pickingSpeed,
        stockReadyPercent,
      },
      delivery: {
        totalTrips,
        vehiclesCount,
        totalDeliveryBills,
        completedDeliveryBills,
        completedDeliveryRate,
        pendingOrDelayedBills,
        delayedCount,
        leadTimeDays,
      },
    };
  }, [
    overviewOrders,
    overviewWarehouseDocs,
    overviewDeliveryTrips,
    salesSummary,
    warehouseSummary,
    deliverySummary,
    kpis,
  ]);

  const departmentGoalGroups = useMemo<DepartmentGoalGroup[]>(() => buildDepartmentGoalGroups({
    orders: overviewOrders,
    warehouseDocs: overviewWarehouseDocs,
    deliveryTrips: overviewDeliveryTrips,
    bookingRows: overviewBookingRows,
    startDate: appliedStartDate,
    endDate: appliedEndDate,
    targets: reportTargets,
    department: appliedDept === 'ฝ่ายขาย' ? 'sales' : appliedDept === 'คลังสินค้า' ? 'warehouse' : appliedDept === 'การจัดส่ง' ? 'delivery' : 'all',
  }), [appliedDept, overviewOrders, overviewWarehouseDocs, overviewDeliveryTrips, overviewBookingRows, appliedStartDate, appliedEndDate, reportTargets]);
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      onSearchDoc(searchInput.trim());
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-300">
      {/* Title & Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Executive Overview
          </h2>
          
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
          <a href="#booking-tracking" className="px-4 py-2 rounded-xl bg-teal-700 text-white text-sm font-bold">ติดตามใบจอง</a>
          <div className="flex items-center gap-2 text-xs text-slate-600 font-semibold bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-2xs">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span>ช่วงข้อมูลที่แสดง: <strong className="text-slate-900">{lastUpdated}</strong></span>
          </div>

          {/* All-in-One Synchronous/Parallel Sync with Promise.all() */}
          {onSyncAllDepartments && (!currentUser || currentUser.role === 'admin') && (
            <button
              type="button"
              id="btn-overview-sync-all-promise"
              onClick={onSyncAllDepartments}
              disabled={isSyncingAll}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#0a2558] hover:bg-[#081b3f] active:bg-[#061533] disabled:opacity-60 shadow-xs transition-all cursor-pointer"
              title="ดึงข้อมูลและประมวลผลทั้ง 3 แผนกพร้อมกันด้วย Promise.all()"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
              <span>{isSyncingAll ? 'กำลังซิงค์ทุกแผนกพร้อมกัน...' : 'ซิงค์ข้อมูลทุกแผนกพร้อมกัน (All-in-One)'}</span>
            </button>
          )}

          {/* ปุ่มลิงก์รวมทุกแผนกเฉพาะหน้าสิทธิ์ผู้บริหาร และเมนูภาพรวมเท่านั้น */}
          {onOpenGoogleSheetsModal && (!currentUser || currentUser.role === 'admin') && (
            <button
              type="button"
              id="btn-overview-sync-sheets"
              onClick={() => onOpenGoogleSheetsModal('all')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-200 shadow-2xs transition-all cursor-pointer"
              title="กำหนดและอัปเดตลิงก์ Google Sheet รวมทุกแผนก (เฉพาะสิทธิ์ผู้บริหาร)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Google Sheet รวมทุกแผนก (ผู้บริหาร)</span>
            </button>
          )}

          {onExportPDF && (
            <button
              type="button"
              id="btn-overview-export-pdf"
              onClick={() => onExportPDF(appliedDept === 'ฝ่ายขาย' ? 'sales' : appliedDept === 'คลังสินค้า' ? 'warehouse' : appliedDept === 'การจัดส่ง' ? 'delivery' : 'overview', appliedStartDate, appliedEndDate)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-xs transition-all cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export PDF รายงาน</span>
            </button>
          )}
        </div>
      </div>

      {/* Sync Errors Banner if any department failed during All-in-One sync */}
      {syncErrors && Object.keys(syncErrors).length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in duration-200">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-rose-800">
              พบปัญหาในการซิงค์ข้อมูลบางแผนก (แผนกอื่นๆ ยังคงประมวลผลได้ตามปกติ):
            </p>
            {syncErrors.sales && (
              <p className="text-rose-700">• <strong>ฝ่ายขาย:</strong> {syncErrors.sales}</p>
            )}
            {syncErrors.warehouse && (
              <p className="text-rose-700">• <strong>คลังสินค้า:</strong> {syncErrors.warehouse}</p>
            )}
            {syncErrors.delivery && (
              <p className="text-rose-700">• <strong>การจัดส่ง:</strong> {syncErrors.delivery}</p>
            )}
            <p className="text-rose-500 font-medium pt-1">
              คำแนะนำ: ตรวจสอบการตั้งค่าสิทธิ์แชร์ใน Google Sheets ของแผนกที่พบปัญหาเป็น "ทุกคนที่มีลิงก์มีสิทธิ์ดู" (Anyone with the link can view)
            </p>
          </div>
        </div>
      )}

      {/* Empty Report Notice Banner when database has 0 records */}
      {!departmentMetrics.hasData && (
        <div className="bg-gradient-to-r from-blue-50/90 via-slate-50 to-sky-50/90 rounded-2xl p-5 border border-blue-200/80 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 border border-blue-200 shadow-2xs mt-0.5">
              <Boxes className="w-5 h-5 text-blue-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  หน้ารายงานเปล่า (BLANK REPORT)
                </span>
                <span className="text-xs text-slate-500 font-medium">พร้อมรับข้อมูลชุดใหม่</span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 mt-1">
                ระบบถูกรีเซ็ตเป็นหน้ารายงานเปล่าเรียบร้อยแล้ว
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ตัวเลขสถิติและตารางทั้งหมดอยู่ในสถานะเริ่มต้น คุณสามารถดึงไฟล์ Google Sheet แยกตามรายแผนก หรืออัปโหลดไฟล์ในหน้านำเข้าข้อมูล
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
            {onOpenGoogleSheetsModal && (!currentUser || currentUser.role === 'admin') && (
              <button
                type="button"
                onClick={() => onOpenGoogleSheetsModal('all')}
                className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-100/80 hover:bg-emerald-200/80 border border-emerald-300 shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                title="กำหนดและดึง Google Sheet รวมทุกแผนก"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>ดึง Google Sheet รวมทุกแผนก</span>
              </button>
            )}
            {onNavigateScreen && (
              <button
                type="button"
                onClick={() => onNavigateScreen('import')}
                className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>ไปหน้านำเข้าข้อมูล</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Filter & Document Search Bar */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-2xs relative">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Filters Form */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {/* Interactive Date Range Picker with Dropdown Popover */}
            <div className="relative" ref={popoverRef}>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                ช่วงวันที่ (วัน/เดือน/ปี)
              </label>
              
              <button
                type="button"
                id="btn-date-range-toggle"
                onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                className="flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl text-slate-800 bg-slate-50 hover:bg-white hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all cursor-pointer min-w-[210px] text-left shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    {formatDisplayDate(startDate)} - {formatDisplayDate(endDate)}
                  </span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isDatePickerOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Date Picker Popover Panel */}
              {isDatePickerOpen && (
                <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-2xl p-4 shadow-xl border border-slate-200 w-80 sm:w-88 animate-in fade-in zoom-in-95 duration-150 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <CalendarDays className="w-4 h-4 text-blue-600" />
                      <span>เลือกช่วงวันที่ต้องการกรองข้อมูล (ปี 2026)</span>
                    </span>
                    <button 
                      onClick={() => setIsDatePickerOpen(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Standard Date Range Inputs */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        จากวันที่ (Start Date)
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        ถึงวันที่ (End Date)
                      </label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Popover Action Buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setStartDate(defaultStartDate);
                        setEndDate(autoMaxDate);
                      }}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      รีเซ็ตวันที่
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyFilter}
                      className="px-4 py-1.5 bg-[#0a2558] hover:bg-[#0d3175] text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                    >
                      นำไปใช้ (Apply)
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Department Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                แผนก/ส่วนงาน
              </label>
              <div className="relative">
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="appearance-none pr-8 pl-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl text-slate-800 bg-slate-50 hover:bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer min-w-[140px] shadow-2xs"
                >
                  <option value="ทั้งหมด">ทั้งหมด (ทุกฝ่ายงาน)</option>
                  <option value="ฝ่ายขาย">ฝ่ายขาย (Sales)</option>
                  <option value="คลังสินค้า">คลังสินค้า (Warehouse)</option>
                  <option value="การจัดส่ง">การจัดส่ง (Delivery)</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Submit Filter Button (ตกลง) */}
            <div className="self-end">
              <button
                id="btn-overview-filter-submit"
                onClick={handleApplyFilter}
                className="bg-[#0a2558] hover:bg-[#0d3175] active:scale-95 text-white px-6 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                {isApplying ? (
                  <span>กำลังกรอง...</span>
                ) : (
                  <>
                    <Filter className="w-3.5 h-3.5" />
                    <span>ตกลง</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Track Sales Order Bar */}
          <div className="lg:border-l lg:border-slate-200 lg:pl-6 pt-3 lg:pt-0">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
              <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-[10px] font-bold">
                i
              </span>
              ติดตามสถานะใบสั่งขาย
            </label>
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="เช่น BK256907/02289"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-xl text-slate-800 bg-slate-50 hover:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 w-44 sm:w-52 font-medium"
                />
              </div>
              <button
                type="submit"
                id="btn-overview-track-order"
                className="bg-[#0a5c5c] hover:bg-[#074747] text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                ติดตาม
              </button>
            </form>
          </div>
        </div>

        {/* Active Filter Summary Bar */}
        {isFilterActive && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-600 flex items-center gap-1">
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
                <span>ตัวกรองที่ใช้งาน:</span>
              </span>
              
              <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 font-semibold border border-blue-200 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>{formatDisplayDate(appliedStartDate)} - {formatDisplayDate(appliedEndDate)} ({daySpan} วัน)</span>
              </span>

              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-semibold border border-slate-200">
                แผนก: {appliedDept}
              </span>
            </div>

            <button
              onClick={handleResetFilter}
              className="text-slate-500 hover:text-rose-600 font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>ล้างตัวกรองทั้งหมด</span>
            </button>
          </div>
        )}
      </div>

      {/* Executive Dashboard: Departmental Sections */}
      <div className="space-y-8">
        {/* 1. Sales Department Section (แสดงเมื่อเลือก 'ทั้งหมด' หรือ 'ฝ่ายขาย') */}
        {(appliedDept === 'ทั้งหมด' || appliedDept === 'ฝ่ายขาย') && (
          <div id="section-sales-department" className="space-y-3.5">
            <DepartmentSectionHeader
              id="sales-section-header"
              icon={<ShoppingCart className="w-4.5 h-4.5" />}
              iconBg="bg-blue-50"
              iconColor="text-blue-700"
              iconBorder="border-blue-200"
              title="ฝ่ายขาย"
              badge="Sales Dashboard"
              subtitle="สรุปยอดขายและข้อมูลที่เกี่ยวข้องกับใบสั่งขายทั้งหมด"
              screenId="sales"
              onNavigateScreen={onNavigateScreen}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <ExecutiveKPICard
                id="card-sales-total-orders"
                title="จำนวนบิลขายทั้งหมด"
                value={`${departmentMetrics.sales.totalOrdersCount} ใบ`}
                badge={{ label: 'ข้อมูลจาก Sales Report', variant: 'blue' }}
                icon={<CheckCircle2 className="w-4 h-4" />}
                iconBgClass="bg-emerald-50"
                iconColorClass="text-emerald-700"
                note={`ยอดเฉลี่ยต่อบิล ฿${departmentMetrics.sales.averageTicket.toLocaleString()} / เป้าหมาย ฿${reportTargets.averageSalesPerBillTargetBaht.toLocaleString()}`}
                noteIcon={<Receipt className="w-3.5 h-3.5 text-blue-600" />}
                onClick={() => onNavigateScreen?.('sales')}
              />

              <ExecutiveKPICard
                id="card-sales-total-revenue"
                title="ยอดขายรวม"
                value={departmentMetrics.sales.revenueFormatted}
                badge={{ label: 'ยอดขายตามช่วงวันที่', variant: 'blue' }}
                icon={<Receipt className="w-4 h-4" />}
                iconBgClass="bg-blue-50"
                iconColorClass="text-blue-700"
                note={`จาก ${departmentMetrics.sales.totalOrdersCount} บิลในช่วงที่เลือก · เป้าหมายรายเดือน ฿${reportTargets.monthlySalesTarget.toLocaleString()} ล้าน`}
                noteIcon={<Calendar className="w-3.5 h-3.5 text-blue-600" />}
                onClick={() => onNavigateScreen?.('sales')}
              />

              <ExecutiveKPICard
                id="card-sales-average-ticket"
                title="ยอดขายเฉลี่ยต่อบิล"
                value={`฿${departmentMetrics.sales.averageTicket.toLocaleString()}`}
                badge={{ label: 'คำนวณจาก Sales Report', variant: 'emerald' }}
                icon={<TrendingUp className="w-4 h-4" />}
                iconBgClass="bg-indigo-50"
                iconColorClass="text-indigo-700"
                note={`ยอดขายรวม ÷ จำนวนบิลขาย · เป้าหมาย ≥ ฿${reportTargets.averageSalesPerBillTargetBaht.toLocaleString()}`}
                noteIcon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                onClick={() => onNavigateScreen?.('sales')}
              />
            </div>
          </div>
        )}

        {/* 2. Warehouse Department Section (แสดงเมื่อเลือก 'ทั้งหมด' หรือ 'คลังสินค้า') */}
        {(appliedDept === 'ทั้งหมด' || appliedDept === 'คลังสินค้า') && (
          <div id="section-warehouse-department" className="space-y-3.5">
            <DepartmentSectionHeader
              id="warehouse-section-header"
              icon={<Boxes className="w-4.5 h-4.5" />}
              iconBg="bg-teal-50"
              iconColor="text-teal-700"
              iconBorder="border-teal-200"
              title="ฝ่ายคลังสินค้า"
              badge="Warehouse Dashboard"
              subtitle="การจัดสินค้า และสถานะการจัดสินค้าในคลัง"          
              screenId="warehouse"
              onNavigateScreen={onNavigateScreen}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <ExecutiveKPICard
                id="card-warehouse-inbound-total"
                title="จำนวนรับเข้าใบจองทั้งหมด"
                value={`${departmentMetrics.warehouse.totalDocs.toLocaleString()} ใบ`}
                badge={{ label: 'ตามช่วงวันที่เลือก', variant: 'blue' }}
                icon={<Inbox className="w-4 h-4" />}
                iconBgClass="bg-blue-50"
                iconColorClass="text-blue-700"
                note="จำนวนใบจองในรายงานคลัง"
                noteIcon={<Calendar className="w-3.5 h-3.5 text-blue-600" />}
                onClick={() => onNavigateScreen?.('warehouse')}
              />

              <ExecutiveKPICard
                id="card-warehouse-completed-total"
                title="จำนวนที่จัดได้ทั้งหมด"
                value={`${departmentMetrics.warehouse.completedWarehouseDocs.toLocaleString()} ใบ`}
                badge={{ label: `สำเร็จ ${departmentMetrics.warehouse.stockReadyPercent}%`, variant: 'emerald' }}
                icon={<CheckCircle2 className="w-4 h-4" />}
                iconBgClass="bg-emerald-50"
                iconColorClass="text-emerald-700"
                note={`จาก ${departmentMetrics.warehouse.totalDocs.toLocaleString()} ใบรับเข้า · เป้าหมาย ≥ ${reportTargets.warehouseCompletionTargetPercent}%`}
                noteIcon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                onClick={() => onNavigateScreen?.('warehouse')}
              />

              <ExecutiveKPICard
                id="card-warehouse-pending-total"
                title="เลขที่บิลที่ค้างจัดทั้งหมด"
                value={`${departmentMetrics.warehouse.pendingDocs.toLocaleString()} ใบ`}
                badge={{ label: 'รับเข้าลบจัดเสร็จ', variant: 'amber' }}
                icon={<Clock className="w-4 h-4" />}
                iconBgClass="bg-amber-50"
                iconColorClass="text-amber-700"
                note="ยังไม่จัดเสร็จตามช่วงวันที่เลือก"
                noteIcon={<Clock className="w-3.5 h-3.5 text-amber-600" />}
                onClick={() => onNavigateScreen?.('warehouse')}
              />
            </div>
          </div>
        )}

        {/* 3. Delivery Department Section (แสดงเมื่อเลือก 'ทั้งหมด' หรือ 'การจัดส่ง') */}
        {(appliedDept === 'ทั้งหมด' || appliedDept === 'การจัดส่ง') && (
          <div id="section-delivery-department" className="space-y-3.5">
            <DepartmentSectionHeader
              id="delivery-section-header"
              icon={<Truck className="w-4.5 h-4.5" />}
              iconBg="bg-purple-50"
              iconColor="text-purple-700"
              iconBorder="border-purple-200"
              title="ฝ่ายขนส่ง"
              badge="Transport Dashboard"
              subtitle="การติดตามเที่ยวรถ และความเร็วในการส่งมอบสินค้า"
              screenId="delivery"
              onNavigateScreen={onNavigateScreen}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <ExecutiveKPICard
                id="card-delivery-total-bills"
                title="จำนวนบิลทั้งหมด"
                value={`${departmentMetrics.delivery.totalDeliveryBills.toLocaleString()} ใบ`}
                badge={{ label: 'บิลจัดส่งทั้งหมด', variant: 'blue' }}
                icon={<FileText className="w-4 h-4" />}
                iconBgClass="bg-sky-50"
                iconColorClass="text-sky-700"
                note={`วิ่งงานจริง ${departmentMetrics.delivery.vehiclesCount} คัน • ${departmentMetrics.delivery.totalTrips} เที่ยวจัดส่ง`}
                noteIcon={<Truck className="w-3.5 h-3.5 text-sky-600" />}
                onClick={() => onNavigateScreen?.('delivery')}
              />

              <ExecutiveKPICard
                id="card-delivery-completed-bills"
                title="จำนวนบิลที่ส่งสำเร็จ"
                value={`${departmentMetrics.delivery.completedDeliveryBills.toLocaleString()} ใบ`}
                badge={{ label: `${departmentMetrics.delivery.completedDeliveryRate}%`, variant: 'emerald' }}
                icon={<CheckCircle2 className="w-4 h-4" />}
                iconBgClass="bg-emerald-50"
                iconColorClass="text-emerald-700"
                note={`โหลดสินค้าและส่งต่อฝ่ายขนส่งเรียบร้อยแล้ว · เป้าหมาย ≥ ${reportTargets.deliveryCompletionTargetPercent}%`}
                noteIcon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                onClick={() => onNavigateScreen?.('delivery')}
              />

              <ExecutiveKPICard
                id="card-delivery-pending-delayed"
                title="บิลที่ค้างส่ง / ส่งล่าช้า"
                value={`${departmentMetrics.delivery.pendingOrDelayedBills.toLocaleString()} ใบ`}
                badge={{ 
                  label: departmentMetrics.delivery.delayedCount > 0 ? `ล่าช้า ${departmentMetrics.delivery.delayedCount} ใบ` : 'สถานะปกติ', 
                  variant: departmentMetrics.delivery.delayedCount > 0 ? 'rose' : (departmentMetrics.delivery.pendingOrDelayedBills > 0 ? 'amber' : 'emerald') 
                }}
                icon={<AlertTriangle className="w-4 h-4" />}
                iconBgClass="bg-amber-50"
                iconColorClass="text-amber-700"
                note="อยู่ระหว่างการโหลดสินค้า หรือรอขึ้นรถ"
                noteIcon={<Clock className="w-3.5 h-3.5 text-amber-600" />}
                onClick={() => onNavigateScreen?.('delivery')}
              />
            </div>
          </div>
        )}
      </div>

      {/* Actual results and configured goals use independent scales per KPI. */}
      <div className="grid grid-cols-1 gap-5">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs" data-testid="overview-department-goals">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">ผลลัพธ์เทียบเป้าหมายรายแผนก ({appliedDept})</h3>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">แถบสีคือผลจริง ขีดสีเข้มคือเป้าหมาย · ระยะเวลานับจากวันที่เปิดบิลขายถึงขั้นตอนสุดท้ายของแต่ละฝ่าย</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-3 rounded-sm bg-blue-600" />ผลจริง</span>
              <span className="inline-flex items-center gap-1"><span className="h-4 w-0.5 bg-slate-800" />เป้าหมาย</span>
            </div>
          </div>
          <div className={departmentGoalGroups.length === 1 ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'}>
            {departmentGoalGroups.map((group) => (
              <section key={group.department} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4" aria-label={`เป้าหมาย${group.department}`}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: group.color }} />
                  <h4 className="text-sm font-extrabold text-slate-900">{group.department}</h4>
                </div>
                <div className="space-y-4">
                  {group.metrics.map((metric) => <GoalBulletChart key={metric.id} metric={metric} color={group.color} />)}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="hidden">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex flex-col gap-2 mb-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">แนวโน้ม KPI ตามเกณฑ์ ({appliedDept})</h3>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">เปรียบเทียบอัตราผลสำเร็จของฝ่ายขาย คลังสินค้า และขนส่งในช่วงเวลาที่เลือก</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 bg-blue-500" />Sales KPI</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-500" />Warehouse KPI</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 bg-purple-500" />Delivery KPI</span>
            </div>
          </div>
          <div className="h-72 w-full">
            {filteredTrendData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <TrendingUp className="w-8 h-8 text-slate-300" />
                <span className="text-xs font-semibold text-slate-500">ไม่มีข้อมูล KPI ตามช่วงเวลาที่เลือก</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={filteredTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: '#cbd5e1' }} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(val) => `${Number(val)}%`} domain={[0, 100]} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const data = payload[0].payload as ExecutiveTrendPoint;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-lg text-xs space-y-1 border border-slate-800">
                          <p className="font-bold text-slate-200 border-b border-slate-700 pb-1">ช่วงเวลา {label}</p>
                          <p className="text-blue-300">Sales KPI: {formatTrendKpi(data.salesCompletionRate)}</p>
                          <p className="text-emerald-300">Warehouse KPI: {formatTrendKpi(data.warehouseCompletionRate)}</p>
                          <p className="text-purple-300">Delivery KPI: {formatTrendKpi(data.deliveryCompletionRate)}</p>
                        </div>
                      );
                    }}
                  />
                  <Line type="monotone" dataKey="salesCompletionRate" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#fff', stroke: '#3b82f6', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="warehouseCompletionRate" stroke="#10b981" strokeWidth={2} dot={{ fill: '#fff', stroke: '#10b981', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="deliveryCompletionRate" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#fff', stroke: '#a855f7', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        </div>
        {(appliedDept === 'ทั้งหมด' || appliedDept === 'ฝ่ายขาย') && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex flex-col gap-2 mb-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">กราฟสถิติยอดขาย ({appliedDept})</h3>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">ยอดขายรวมเป็นแท่ง และจำนวนบิลขายเป็นเส้น แยกแกนเพื่อให้เห็นแนวโน้มชัดเจน</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#0a2558]" />ยอดขาย (บาท)</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 bg-sky-500" />จำนวนบิลขาย</span>
            </div>
          </div>
          <div className="h-72 w-full">
            {filteredTrendData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <Receipt className="w-8 h-8 text-slate-300" />
                <span className="text-xs font-semibold text-slate-500">ไม่มีข้อมูลยอดขายตามช่วงเวลาที่เลือก</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={filteredTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: '#cbd5e1' }} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} />
                  <YAxis yAxisId="revenue" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(val) => formatTrendRevenue(Number(val))} domain={[0, 'auto']} />
                  <YAxis yAxisId="orders" orientation="right" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(val) => Number(val).toLocaleString()} domain={[0, 'auto']} allowDecimals={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const data = payload[0].payload as ExecutiveTrendPoint;
                      const averageTicket = data.salesOrderCount > 0 ? data.salesAmount / data.salesOrderCount : 0;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-lg text-xs space-y-1 border border-slate-800">
                          <p className="font-bold text-slate-200 border-b border-slate-700 pb-1">ช่วงเวลา {label}</p>
                          <p className="text-sky-300 font-bold">ยอดขายรวม: {formatTrendRevenue(data.salesAmount)}</p>
                          <p className="text-blue-300">จำนวนบิลขาย: {data.salesOrderCount.toLocaleString()} บิล</p>
                          <p className="text-slate-300">ยอดเฉลี่ยต่อบิล: {formatTrendRevenue(averageTicket)}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar yAxisId="revenue" dataKey="salesAmount" fill="#0a2558" barSize={30} radius={[4, 4, 0, 0]} />
                  <Line type="monotone" yAxisId="orders" dataKey="salesOrderCount" stroke="#0ea5e9" strokeWidth={2} dot={{ fill: '#fff', stroke: '#0ea5e9', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Legacy combined chart kept hidden for backwards-compatible markup hooks. */}
      <div className="hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              แนวโน้มและผลการดำเนินงาน ({appliedDept})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              เปรียบเทียบยอดขาย (บาท) กับอัตรา KPI ของฝ่ายขาย คลังสินค้า และขนส่งในช่วงเวลาที่เลือก
            </p>
          </div>
          
          {/* Sales and KPI legend: revenue uses the left axis, KPI rates use the right axis. */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-[#0a2558]"></span>
              <span>ยอดขาย (บาท)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-blue-500"></span>
              <span>Sales KPI</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-emerald-500"></span>
              <span>Warehouse KPI</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-purple-500"></span>
              <span>Delivery KPI</span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-72 w-full">
          {filteredTrendData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <TrendingUp className="w-8 h-8 text-slate-300" />
              <span className="text-xs font-semibold text-slate-500">ไม่มีข้อมูลแนวโน้มตามช่วงเวลาที่เลือก</span>
              <span className="text-[11px] text-slate-400">กรุณานำเข้าข้อมูลของแผนกที่เลือกเพื่อดูแนวโน้ม</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={filteredTrendData}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="month" 
                  tickLine={false} 
                  axisLine={{ stroke: '#cbd5e1' }}
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                />
                <YAxis 
                  yAxisId="revenue"
                  tickLine={false} 
                  axisLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={(val) => formatTrendRevenue(Number(val))}
                  domain={[0, 'auto']}
                />
                <YAxis
                  yAxisId="kpi"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={(val) => `${Number(val)}%`}
                  domain={[0, 100]}
                />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as ExecutiveTrendPoint;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-lg text-xs space-y-1 border border-slate-800">
                          <p className="font-bold text-slate-200 border-b border-slate-700 pb-1">ช่วงเวลา {label}</p>
                          <p className="text-sky-300 font-bold">ยอดขาย: {formatTrendRevenue(data.salesAmount)}</p>
                          <p className="text-blue-300">Sales KPI: {formatTrendKpi(data.salesCompletionRate)} ({data.salesOrderCount.toLocaleString()} บิล)</p>
                          <p className="text-emerald-300">Warehouse KPI: {formatTrendKpi(data.warehouseCompletionRate)}</p>
                          <p className="text-purple-300">Delivery KPI: {formatTrendKpi(data.deliveryCompletionRate)}</p>
                          <p className="text-slate-400 pt-1">รายการรวม: {data.totalVolume.toLocaleString()} • On-Time: {data.onTimePercent}%</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar 
                  yAxisId="revenue"
                  dataKey="salesAmount" 
                  fill="#0a2558" 
                  barSize={30} 
                  radius={[4, 4, 0, 0]}
                />
                <Line 
                  type="monotone" 
                  yAxisId="kpi"
                  dataKey="salesCompletionRate" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={{ fill: '#ffffff', stroke: '#3b82f6', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  yAxisId="kpi"
                  dataKey="warehouseCompletionRate"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ fill: '#ffffff', stroke: '#10b981', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  yAxisId="kpi"
                  dataKey="deliveryCompletionRate"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={{ fill: '#ffffff', stroke: '#a855f7', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {false && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200 shadow-2xs">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  ทางลัดรายงานฉบับเต็มและสถานะข้ามฝ่ายงาน (Executive Quick Nav)
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  เข้าถึงรายงานการดำเนินงานเฉพาะด้านของแต่ละฝ่ายได้ทันที
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {onNavigateScreen && (
                <>
                  <button
                    type="button"
                    onClick={() => onNavigateScreen('sales')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all cursor-pointer shadow-2xs"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>รายงานฝ่ายขาย</span>
                    <ArrowRight className="w-3 h-3 text-blue-500" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigateScreen('warehouse')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-all cursor-pointer shadow-2xs"
                  >
                    <Boxes className="w-3.5 h-3.5" />
                    <span>รายงานคลังสินค้า</span>
                    <ArrowRight className="w-3 h-3 text-teal-500" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigateScreen('delivery')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-all cursor-pointer shadow-2xs"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>รายงานการจัดส่ง</span>
                    <ArrowRight className="w-3 h-3 text-purple-500" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Cross-Department Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div 
              onClick={() => onNavigateScreen?.('sales')} 
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-blue-300 transition-all shadow-2xs cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">
                    <Receipt className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">ฝ่ายขาย (Sales)</span>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  {departmentMetrics.sales.totalOrdersCount} ออเดอร์
                </span>
              </div>
              <p className="text-xs text-slate-600">
                ยอดขายรวม {departmentMetrics.sales.revenueFormatted} • จำนวนบิล {departmentMetrics.sales.totalOrdersCount} ใบ • เฉลี่ย ฿{departmentMetrics.sales.averageTicket.toLocaleString()}/บิล
              </p>
              <div className="mt-2.5 flex items-center text-xs font-bold text-blue-700 group-hover:text-blue-900 gap-1">
                <span>เปิดรายงานฝ่ายขายฉบับเต็ม</span>
                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            <div 
              onClick={() => onNavigateScreen?.('warehouse')} 
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-teal-300 transition-all shadow-2xs cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs">
                    <Inbox className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">คลังสินค้า (Warehouse)</span>
                </div>
                <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                  {departmentMetrics.warehouse.totalDocs} เอกสาร
                </span>
              </div>
              <p className="text-xs text-slate-600">
                ความเร็วในการจัด {departmentMetrics.warehouse.pickingSpeed} • ค้างจัดเตรียม {departmentMetrics.warehouse.pendingDocs} ใบ
              </p>
              <div className="mt-2.5 flex items-center text-xs font-bold text-teal-700 group-hover:text-teal-900 gap-1">
                <span>เปิดรายงานคลังสินค้าฉบับเต็ม</span>
                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            <div 
              onClick={() => onNavigateScreen?.('delivery')} 
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-purple-300 transition-all shadow-2xs cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs">
                    <Truck className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">การจัดส่ง (Delivery)</span>
                </div>
                <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                  {departmentMetrics.delivery.totalDeliveryBills} บิลจัดส่ง
                </span>
              </div>
              <p className="text-xs text-slate-600">
                ส่งสำเร็จ {departmentMetrics.delivery.completedDeliveryBills} ใบ ({departmentMetrics.delivery.completedDeliveryRate}%) • ค้างส่ง/ล่าช้า {departmentMetrics.delivery.pendingOrDelayedBills} ใบ
              </p>
              <div className="mt-2.5 flex items-center text-xs font-bold text-purple-700 group-hover:text-purple-900 gap-1">
                <span>เปิดรายงานการจัดส่งฉบับเต็ม</span>
                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </div>
        </div>
      )}

      <BookingTrackingSection rows={bookingRows} periodStart={appliedStartDate} periodEnd={appliedEndDate} />
    </div>
  );
};

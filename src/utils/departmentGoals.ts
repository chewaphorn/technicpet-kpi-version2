import type { DetailedSalesOrder, DeliveryTrip, WarehouseDoc } from '../types';
import type { KpiTargets } from './kpiTargets';
import { normalizeDateToISO } from './dateUtils';
import { calculateDeliveryMetrics, calculateWarehouseMetrics } from './logisticsReportMetrics';
import { calculateSalesTotals } from './salesReportMetrics';
import { summarizeBookingLeadTime } from './bookingTracking';

export type GoalMetric = {
  id: string;
  label: string;
  actual: number | null;
  target: number;
  unit: 'percent' | 'days' | 'baht' | 'million-baht';
  direction: 'higher' | 'lower';
  note: string;
};

export type DepartmentGoalGroup = {
  department: 'ฝ่ายขาย' | 'คลังสินค้า' | 'ขนส่ง';
  metrics: GoalMetric[];
  color: string;
};

export function formatGoalValue(value: number, unit: GoalMetric['unit']): string {
  const number = value.toLocaleString('th-TH', { maximumFractionDigits: 1 });
  if (unit === 'percent') return `${number}%`;
  if (unit === 'days') return `${number} วัน`;
  if (unit === 'million-baht') return `฿${(value / 1_000_000).toLocaleString('th-TH', { maximumFractionDigits: 3 })} ล้าน`;
  return `฿${number}`;
}

/** The dashboard and every PDF use the same filtered rows and KPI definitions. */
export function buildDepartmentGoalGroups({ orders, warehouseDocs, deliveryTrips, bookingRows, startDate, endDate, targets, department = 'all' }: {
  orders: DetailedSalesOrder[];
  warehouseDocs: WarehouseDoc[];
  deliveryTrips: DeliveryTrip[];
  bookingRows: Array<{ days: number | null }>;
  startDate: string;
  endDate: string;
  targets: KpiTargets;
  department?: 'all' | 'sales' | 'warehouse' | 'delivery';
}): DepartmentGoalGroup[] {
  const groups: DepartmentGoalGroup[] = [];
  if (department === 'all' || department === 'sales') {
    const sales = calculateSalesTotals(orders);
    const firstMonth = normalizeDateToISO(startDate);
    const lastMonth = normalizeDateToISO(endDate);
    const selectedMonths = firstMonth && lastMonth && lastMonth >= firstMonth
      ? (Number(lastMonth.slice(0, 4)) - Number(firstMonth.slice(0, 4))) * 12 + Number(lastMonth.slice(5, 7)) - Number(firstMonth.slice(5, 7)) + 1
      : new Set(orders.map(order => normalizeDateToISO(order.date).slice(0, 7)).filter(Boolean)).size;
    groups.push({ department: 'ฝ่ายขาย', color: '#2563eb', metrics: [
      { id: 'sales-monthly', label: 'ยอดขายเฉลี่ยต่อเดือน', actual: orders.length && selectedMonths ? sales.totalRevenue / selectedMonths : null,
        target: targets.monthlySalesTarget * 1_000_000, unit: 'million-baht', direction: 'higher',
        note: `ยอดขายรวม ÷ ${selectedMonths.toLocaleString()} เดือนปฏิทินในช่วงที่เลือก` },
      { id: 'sales-average-bill', label: 'ยอดขายเฉลี่ยต่อบิล', actual: sales.totalOrders ? sales.averageTicket : null,
        target: targets.averageSalesPerBillTargetBaht, unit: 'baht', direction: 'higher',
        note: `ยอดขายรวม ÷ ${sales.totalOrders.toLocaleString()} บิล` },
    ] });
  }
  if (department === 'all' || department === 'warehouse') {
    const metrics = calculateWarehouseMetrics(warehouseDocs, targets.warehousePickingLeadTimeTarget);
    groups.push({ department: 'คลังสินค้า', color: '#059669', metrics: [
      { id: 'warehouse-completion', label: 'อัตราการจัดสำเร็จ', actual: metrics.totalDocsCount ? Number(metrics.completionPercent) : null,
        target: targets.warehouseCompletionTargetPercent, unit: 'percent', direction: 'higher',
        note: `${metrics.completedDocsCount.toLocaleString()}/${metrics.totalDocsCount.toLocaleString()} บิล` },
      { id: 'warehouse-picking-days', label: 'Picking Lead Time', actual: metrics.leadTimeStats.count ? metrics.leadTimeStats.mean : null,
        target: targets.warehousePickingLeadTimeTarget, unit: 'days', direction: 'lower',
        note: `เปิดบิลขาย → จัดเสร็จ · ${metrics.leadTimeStats.count.toLocaleString()} บิล` },
    ] });
  }
  if (department === 'all' || department === 'delivery') {
    const metrics = calculateDeliveryMetrics(deliveryTrips);
    const leadTime = summarizeBookingLeadTime(bookingRows);
    groups.push({ department: 'ขนส่ง', color: '#9333ea', metrics: [
      { id: 'delivery-completion', label: 'อัตราส่งสำเร็จ', actual: metrics.totalBillsCount ? Number(metrics.completedBillsRate) : null,
        target: targets.deliveryCompletionTargetPercent, unit: 'percent', direction: 'higher',
        note: `${metrics.completedBillsCount.toLocaleString()}/${metrics.totalBillsCount.toLocaleString()} บิล` },
      { id: 'delivery-sales-to-loaded-days', label: 'ระยะเวลาจัดส่ง', actual: leadTime.days,
        target: targets.salesToLoadedLeadTimeTargetDays, unit: 'days', direction: 'lower',
        note: `เปิดบิลขาย → โหลดเสร็จ · ${leadTime.count.toLocaleString()} บิล` },
    ] });
  }
  return groups;
}

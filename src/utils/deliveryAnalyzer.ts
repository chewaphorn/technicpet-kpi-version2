import {
  DeliveryTrip,
  DeliveryDepartmentAnalytics,
  ParsedFileData
} from '../types';
import {
  parseNumberSafe,
  parseDateFlexible,
  calculateDaysDiff,
} from './dataProcessor';
import { normalizeDateToISO } from './dateUtils';
import { warehouseField } from './warehouseDates';
import { aggregateDeliveryTrips, filterDeliveryTrips, calculateDeliveryMetrics, isCompletedTrip } from './logisticsReportMetrics';

const findValue = (row: Record<string, unknown>, keys: string[], fallback: any = '') => {
  const value = warehouseField(row, keys);
  return value === '' ? fallback : value;
};

/**
 * Returns empty/zeroed delivery department analytics.
 * Used when data is absent or when date filters yield 0 records.
 */
export function getEmptyDeliveryAnalytics(): DeliveryDepartmentAnalytics {
  return {
    totalTrips: 0,
    otdPercent: 0,
    avgDeliveryDays: 0,
    minLeadTimeDays: 0,
    maxLeadTimeDays: 0,
    totalWeightTon: 0,
    inTransitCount: 0,
    delayedCount: 0,
    uniqueVehiclesCount: 0,
    pendingDeliveriesCount: 0,
    dailyTripsDispatched: 0,
    speedDistribution: [
      { range: '1 วัน', trips: 0 },
      { range: '2 วัน', trips: 0 },
      { range: '3 วัน', trips: 0 },
      { range: '> 3 วัน', trips: 0 },
    ],
    deliverySummary: {
      totalTrips: 0,
      otdPercent: 0,
      avgDeliveryDays: 0,
      minLeadTimeDays: 0,
      maxLeadTimeDays: 0,
      dailyTripsDispatched: 0,
      totalWeightTon: 0,
      inTransitCount: 0,
      delayedCount: 0,
      uniqueVehiclesCount: 0,
      pendingDeliveriesCount: 0,
      speedDistribution: [
        { range: '1 วัน', trips: 0 },
        { range: '2 วัน', trips: 0 },
        { range: '3 วัน', trips: 0 },
        { range: '> 3 วัน', trips: 0 },
      ],
    },
    deliveryTrips: [],
  };
}

/**
 * Isolated Delivery Data Analytics Engine
 * Calculates strictly Delivery KPIs, On-Time Delivery (OTD SLA %), Min/Mean/Max lead time,
 * vehicle dispatch counts, delayed statuses, and speed distribution
 * without referencing or relying on Sales or Warehouse data.
 */
export function analyzeDeliveryData(
  input?: Record<string, any>[] | ParsedFileData | null,
  dateFilter?: { fromDate?: string; toDate?: string }
): DeliveryDepartmentAnalytics {
  let rows: Record<string, any>[] = Array.isArray(input)
    ? input
    : (input?.rawRows || []);

  if (!rows || rows.length === 0) {
    return getEmptyDeliveryAnalytics();
  }

  rows = rows.filter((row) =>
    String(findValue(row, [
      'เลขที่ใบส่งของ', 'เลขที่จัดส่ง', 'เลขที่ใบส่งสินค้า', 'deliveryNo', 'tripNo', 'trackingNo',
      'เลขที่ใบสั่งขาย', 'เลขที่ใบสั่งซื้อ', 'เลขที่คำสั่งซื้อ', 'เลขที่ใบจอง', 'เลขที่เอกสาร', 'รหัสเอกสาร',
      'เลขที่ออเดอร์', 'orderNo', 'Order No', 'salesOrderNo', 'soNo', 'booking_no', 'docNo', 'record_id'
    ], '')).trim() !== ''
  );
  if (rows.length === 0) {
    return getEmptyDeliveryAnalytics();
  }

  let calculatedDeliveryTrips: DeliveryTrip[] = [];
  if (rows.length > 0) {
    calculatedDeliveryTrips = rows.map((row, idx) => {
      const deliveryNo = String(findValue(row, ['เลขที่ใบส่งของ', 'เลขที่จัดส่ง', 'เลขที่ใบส่งสินค้า', 'deliveryNo', 'tripNo', 'trackingNo', 'record_id'], '')).trim();
      const salesOrderNo = String(findValue(row, ['เลขที่ใบสั่งขาย', 'เลขที่ใบสั่งซื้อ', 'เลขที่คำสั่งซื้อ', 'เลขที่ใบจอง', 'เลขที่เอกสาร', 'รหัสเอกสาร', 'เลขที่ออเดอร์', 'orderNo', 'Order No', 'salesOrderNo', 'soNo', 'booking_no', 'docNo'], '')).trim();
      const licensePlate = String(findValue(row, ['ทะเบียนรถ', 'licensePlate', 'truckNo', 'plate', 'ทะเบียน', 'vehicle_raw'], '')).trim();
      const driverName = String(findValue(row, ['พนักงานขับรถ', 'คนขับ', 'driverName', 'driver', 'driver_raw'], '')).trim();
      const driverPhone = String(findValue(row, ['เบอร์โทรศัพท์', 'เบอร์โทร', 'phone', 'driverPhone', 'tel'], '')).trim();
      const departureTime = String(findValue(row, ['เวลาออก', 'departureTime', 'departedAt', 'เวลาปล่อยรถ'], '')).trim();
      const estimatedArrival = String(findValue(row, ['เวลาถึงเป้าหมาย', 'estimatedArrival', 'eta', 'เวลาส่งมอบ'], '')).trim();
      const actualArrival = findValue(row, ['เวลาถึงจริง', 'actualArrival', 'เวลาส่งจริง'], undefined);
      const destination = String(findValue(row, ['ปลายทาง', 'สถานที่ส่ง', 'destination', 'location', 'ที่อยู่'], '')).trim();
      const weightRaw = findValue(row, ['น้ำหนัก(ตัน)', 'น้ำหนัก (ตัน)', 'น้ำหนัก', 'weight', 'weightTon'], '0');
      const weightTon = parseNumberSafe(weightRaw, 0);
      const rawStatus = String(findValue(row, ['สถานะ', 'status', 'transport_status'], '')).toLowerCase();

      const customer = String(findValue(row, ['ชื่อลูกค้า', 'ลูกค้า', 'customer', 'customer_name', 'client'], '')).trim();
      const itemsCount = parseNumberSafe(findValue(row, ['จำนวนรายการ', 'itemsCount', 'รายการ', 'package_count_calculated', 'package_total_source'], '0'), 0);

      const rawRoute = String(findValue(row, ['สายส่ง', 'เส้นทาง', 'route', 'deliveryRoute', 'สาย', 'โซนขนส่ง'], '')).trim();
      const route = rawRoute;



      const rawLoaded = findValue(row, ['วันที่โหลดสินค้าจริง', 'วันที่โหลดจริง', 'วันที่โหลด', 'loadedDate', 'loadDate', 'load_date', 'loaded_date', 'วันที่ส่งมอบจริง', 'actualDeliveryDate']);
      let loadedDate: string | undefined = normalizeDateToISO(rawLoaded) || undefined;
      let status: DeliveryTrip['status'] = 'unknown';
      let statusLabel = 'ไม่ระบุสถานะ';

      if (rawStatus.includes('ช้า') || rawStatus.includes('delay') || rawStatus.includes('late')) {
        status = 'delayed';
        statusLabel = 'ล่าช้า';

      } else if (rawStatus.includes('สำเร็จ') || rawStatus.includes('เสร็จ') || rawStatus.includes('ส่งแล้ว') || rawStatus.includes('delivered') || rawStatus.includes('completed') || Boolean(loadedDate)) {
        status = 'completed';
        statusLabel = 'จัดส่งสำเร็จ';
      } else if (rawStatus.includes('เดินทาง') || rawStatus.includes('transit') || rawStatus.includes('กำลัง') || rawStatus.includes('รอส่ง')) {
        status = 'in_transit';
        statusLabel = 'กำลังเดินทาง';

      }

      const rawOrderDate = findValue(row, ['วันที่ออกใบจอง', 'วันที่รับใบจอง', 'วันที่ใบจอง', 'received_work_date', 'orderDate', 'order_date', 'วันที่สั่งขาย', 'วันที่สั่งซื้อ'], '');
      const orderDate = rawOrderDate ? String(rawOrderDate).trim() : '';

      const rawHandover = findValue(row, ['รับจากคลัง', 'วันที่รับจากคลัง', 'received_total_date', 'วันที่รับไม้ต่อจากคลัง', 'วันที่รับไม้ต่อ', 'วันที่รับมอบ', 'handoffDate', 'handoverDate', 'วันที่เบิกเสร็จ', 'วันที่รับของ'], '');
      const handoffDate = rawHandover ? String(rawHandover).trim() : '';
      const handoverDate = handoffDate;

      const rawPlanned = findValue(row, ['วันที่วางแผน', 'วันที่แผน', 'plannedDate', 'planDate', 'plan_date', 'กำหนดส่งตามแผน', 'วันที่กำหนดส่ง']);
      const plannedDate = rawPlanned ? String(rawPlanned).trim() : '';

      const parsedHandover = parseDateFlexible(handoffDate);
      const parsedPlanned = parseDateFlexible(plannedDate);

      let actualDeliveryDate: string | undefined = undefined;
      let pendingDeliveryDays: number | undefined = undefined;
      let deliveryLeadTimeDays: number | undefined = undefined;

      if (status === 'completed') {
        actualDeliveryDate = loadedDate;
        if (handoffDate && loadedDate) {
          deliveryLeadTimeDays = calculateDaysDiff(handoffDate, loadedDate);
        }

      } else if (status === 'in_transit' || status === 'delayed') {
        if (loadedDate) {

          actualDeliveryDate = loadedDate;
          if (handoffDate && loadedDate) {
            deliveryLeadTimeDays = calculateDaysDiff(handoffDate, loadedDate);
          }
        } else {
          loadedDate = undefined;
          actualDeliveryDate = undefined;
        }

        if (parsedHandover) {
          const today = new Date();
          const refDate = today;
          const diffMs = refDate.getTime() - parsedHandover.getTime();
          pendingDeliveryDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        } else {
          pendingDeliveryDays = undefined;
        }

      }

      return {
        id: `dlv-${idx + 1}`,
        deliveryNo,
        salesOrderNo,
        docNo: salesOrderNo,
        orderDate,
        plannedDate,
        handoffDate,
        loadedDate,
        licensePlate,
        driverName,
        driverPhone,
        departureTime,
        estimatedArrival,
        actualArrival: actualArrival ? String(actualArrival).trim() : undefined,
        status,
        statusLabel,
        destination,
        weightTon,
        itemsCount,
        customer,
        route,
        handoverDate,
        actualDeliveryDate,
        pendingDeliveryDays,
        deliveryLeadTimeDays,
      };
    });
  }

  // Aggregate first: one bill contributes once to every KPI and distribution.
  calculatedDeliveryTrips = filterDeliveryTrips(aggregateDeliveryTrips(calculatedDeliveryTrips), dateFilter);
  const metrics = calculateDeliveryMetrics(calculatedDeliveryTrips);
  const deliveryTotal = metrics.totalBillsCount;
  const leadTimes = calculatedDeliveryTrips.filter(isCompletedTrip)
    .map(t => calculateDaysDiff(t.handoffDate || t.handoverDate, t.loadedDate))
    .filter((days): days is number => days !== undefined && Number.isFinite(days));
  const avgDeliveryLeadTime = metrics.leadTimeStats.mean;
  const minLeadTimeDays = metrics.leadTimeStats.min;
  const maxLeadTimeDays = metrics.leadTimeStats.max;
  const otdPercent = leadTimes.length ? +(100 * leadTimes.filter(d => d <= 3).length / leadTimes.length).toFixed(1) : 0;
  const totalWeight = metrics.totalWeight;
  const inTransitCount = metrics.inTransit;
  const delayedCount = metrics.delayed;
  const uniqueVehiclesCount = metrics.uniqueVehiclesCount;
  const pendingDeliveriesCount = metrics.pendingDeliveriesCount;
  const [speed1Day, speed2Days, speed3Days, speedOver3Days] = metrics.leadTimeStats.distribution.map(d => d.count);
  const datesSet = new Set(calculatedDeliveryTrips.map(t => normalizeDateToISO(t.plannedDate || t.orderDate || t.handoffDate || t.loadedDate)).filter(Boolean));
  const dailyTripsDispatched = datesSet.size ? Math.round(deliveryTotal / datesSet.size) : 0;

  const deliverySummary = {
    totalTrips: deliveryTotal,
    otdPercent,
    avgDeliveryDays: avgDeliveryLeadTime,
    minLeadTimeDays,
    maxLeadTimeDays,
    dailyTripsDispatched,
    totalWeightTon: +(totalWeight).toFixed(1),
    inTransitCount,
    delayedCount,
    uniqueVehiclesCount,
    pendingDeliveriesCount,
    speedDistribution: [
      { range: '1 วัน', trips: speed1Day },
      { range: '2 วัน', trips: speed2Days },
      { range: '3 วัน', trips: speed3Days },
      { range: '> 3 วัน', trips: speedOver3Days },
    ],
  };

  return {
    totalTrips: deliveryTotal,
    otdPercent,
    avgDeliveryDays: avgDeliveryLeadTime,
    minLeadTimeDays,
    maxLeadTimeDays,
    totalWeightTon: deliverySummary.totalWeightTon,
    inTransitCount,
    delayedCount,
    uniqueVehiclesCount,
    pendingDeliveriesCount,
    dailyTripsDispatched,
    speedDistribution: deliverySummary.speedDistribution,
    deliverySummary,
    deliveryTrips: calculatedDeliveryTrips,
  };
}

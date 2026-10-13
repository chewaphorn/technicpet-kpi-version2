import { warehouseDate, warehouseDays } from './warehouseDates';
import { 
  KPIStats, 
  MonthlyDeliveryTrend, 
  SalesRepPerformance, 
  WarehouseDoc, 
  DeliveryTrip, 
  UploadedFileState, 
  DetailedSalesOrder, 
  SalesOrderItem, 
  DocTypeBreakdown, 
  TopProductItem, 
  CustomerSpender, 
  CustomerSummary, 
  SalesDocType,
  SalesDepartmentAnalytics,
  WarehouseDepartmentAnalytics,
  DeliveryDepartmentAnalytics,
  ParsedFileData
} from '../types';

export interface ProcessedDepartmentReports {
  kpis: KPIStats;
  trendData: MonthlyDeliveryTrend[];
  salesReps: SalesRepPerformance[];
  detailedSalesOrders: DetailedSalesOrder[];
  docTypeBreakdowns: DocTypeBreakdown[];
  topProducts: TopProductItem[];
  topSpenders: CustomerSpender[];
  newCustomers: CustomerSpender[];
  customerSummary: CustomerSummary;
  salesWeeklyTrend: { name: string; sales: number; target: number; orders: number }[];
  salesCategoryMix: { name: string; value: number; color: string }[];
  salesSummary: {
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
  warehouseDocs: WarehouseDoc[];
  warehouseSummary: {
    totalDocs: number;
    completedDocs: number;
    completionPercent: number;
    avgItemsPerDoc: string;
    avgPickingMinutes: string;
    dailyInboundBookings?: number;
    dailyPickedOrders?: number;
    transferredToDeliveryCount?: number;
    transferredPercent?: number;
    pendingDocsCount?: number;
    avgLeadTimeDays?: number;
    delayedDocsCount?: number; // จำนวนบิลที่ล่าช้ากว่าเป้าหมาย 3 วัน
  };
  deliveryTrips: DeliveryTrip[];
  deliverySummary: {
    totalTrips: number;
    otdPercent: number;
    avgDeliveryDays: number;
    totalWeightTon: number;
    inTransitCount: number;
    delayedCount: number;
    uniqueVehiclesCount?: number; // จำนวนรถที่จัดเส้นทาง (นับทะเบียนรถไม่ซ้ำ)
    pendingDeliveriesCount?: number; // จำนวนบิลที่ค้างส่ง (บิลที่ยังส่งไม่สำเร็จ)
    speedDistribution: { range: string; trips: number }[];
  };
}

/**
 * Robust helper to extract value by multiple possible header keys and variations
 */
export function findValue(row: Record<string, any>, possibleKeys: string[], defaultValue: any = ''): any {
  if (!row || typeof row !== 'object') return defaultValue;

  // 1. Exact match
  for (const key of possibleKeys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return row[key];
    }
  }

  // 2. Normalized lowercase alphanumeric match
  const rowKeys = Object.keys(row);
  for (const key of possibleKeys) {
    const normKey = key.toLowerCase().replace(/[^a-z0-9ก-๙]/g, '');
    const foundKey = rowKeys.find((k) => k.toLowerCase().replace(/[^a-z0-9ก-๙]/g, '') === normKey);
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
      return row[foundKey];
    }
  }

  // 3. Partial substring match
  for (const key of possibleKeys) {
    const normKey = key.toLowerCase().replace(/[^a-z0-9ก-๙]/g, '');
    if (normKey.length < 3) continue;
    const foundKey = rowKeys.find((k) => {
      const normK = k.toLowerCase().replace(/[^a-z0-9ก-๙]/g, '');
      return normK.includes(normKey) || normKey.includes(normK);
    });
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
      return row[foundKey];
    }
  }

  return defaultValue;
}

/**
 * Safely parse numeric amount from strings with commas, currency symbols, and units
 */
export function parseNumberSafe(val: any, fallback: number = 0): number {
  if (val === undefined || val === null) return fallback;
  if (typeof val === 'number') return Number.isFinite(val) ? val : fallback;
  const str = String(val).trim();
  if (!str) return fallback;

  // Check for negative in parentheses e.g. (1,250.00)
  const isNegative = str.startsWith('(') && str.endsWith(')');
  const cleaned = str.replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return fallback;
  return isNegative ? -Math.abs(parsed) : parsed;
}

export function parseDateFlexible(value?: string | number | Date): Date | null {
  const iso = warehouseDate(value);
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Calendar days, excluding invalid dates and reversed event sequences. */
export function calculateDaysDiff(start?: string, end?: string): number | undefined {
  return warehouseDays(start, end);
}

/**
 * Formats a Date object to DD/MM/YYYY Buddhist Era format
 */
export function formatDateToBE(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const beYear = d.getFullYear() + 543;
  return `${day}/${month}/${beYear}`;
}

// Export isolated analyzer engines
import { analyzeSalesData, getEmptySalesAnalytics } from './salesAnalyzer';
import { analyzeWarehouseData, getEmptyWarehouseAnalytics } from './warehouseAnalyzer';
import { analyzeDeliveryData, getEmptyDeliveryAnalytics } from './deliveryAnalyzer';

export {
  analyzeSalesData,
  getEmptySalesAnalytics,
  analyzeWarehouseData,
  getEmptyWarehouseAnalytics,
  analyzeDeliveryData,
  getEmptyDeliveryAnalytics
};

/**
 * Processes the imported files and computes synchronized departmental reports.
 * Respects strict department isolation: if a department's file is not provided,
 * it returns empty state for that department without synthesizing fake records.
 */
export function processImportedFiles(filesState: UploadedFileState): ProcessedDepartmentReports {
  // 1. Compute isolated department analytics
  const salesAnalytics = analyzeSalesData(filesState.salesOrderParsed);
  const warehouseAnalytics = analyzeWarehouseData(filesState.pickingListParsed);
  const deliveryAnalytics = analyzeDeliveryData(filesState.deliveryTagParsed);

  // Synthesize Overview KPIs
  const totalOrdersCalculated = salesAnalytics.totalOrders;
  const completedOrdersCalculated = salesAnalytics.completedOrders;
  const pendingOrdersCalculated = Math.max(0, totalOrdersCalculated - completedOrdersCalculated);
  const totalSalesAmount = salesAnalytics.totalSalesAmount;
  const displayTotalRevenue = salesAnalytics.totalRevenueFormatted;

  const kpis: KPIStats = {
    totalSalesYTD: displayTotalRevenue,
    totalSalesGrowth: 'ไม่มีข้อมูลเปรียบเทียบ',
    totalOrders: totalOrdersCalculated,
    totalOrdersGrowth: 'ไม่มีข้อมูลเปรียบเทียบ',
    deliveryOnTimeRate: deliveryAnalytics.otdPercent,
    deliveryOnTimeGrowth: 'ไม่มีข้อมูลเปรียบเทียบ',
    avgDeliveryDays: deliveryAnalytics.avgDeliveryDays,
    avgDeliveryChange: 'ไม่มีข้อมูลเปรียบเทียบ',
    completedOrders: completedOrdersCalculated,
    completedOrdersPercent: totalOrdersCalculated > 0 ? +((completedOrdersCalculated / totalOrdersCalculated) * 100).toFixed(1) : 0,
    pendingOrders: pendingOrdersCalculated,
    pendingOrdersNote: pendingOrdersCalculated > 0 ? `${pendingOrdersCalculated} รายการรอดำเนินการ` : 'ไม่มีรายการค้าง',
  };

  const trendData: MonthlyDeliveryTrend[] = [];

  return {
    kpis,
    trendData,
    salesReps: salesAnalytics.salesReps,
    detailedSalesOrders: salesAnalytics.detailedSalesOrders,
    docTypeBreakdowns: salesAnalytics.docTypeBreakdowns,
    topProducts: salesAnalytics.topProducts,
    topSpenders: salesAnalytics.topSpenders,
    newCustomers: salesAnalytics.newCustomers,
    customerSummary: salesAnalytics.customerSummary,
    salesWeeklyTrend: salesAnalytics.salesWeeklyTrend,
    salesCategoryMix: salesAnalytics.salesCategoryMix,
    salesSummary: salesAnalytics.salesSummary,
    warehouseDocs: warehouseAnalytics.warehouseDocs,
    warehouseSummary: warehouseAnalytics.warehouseSummary,
    deliveryTrips: deliveryAnalytics.deliveryTrips,
    deliverySummary: deliveryAnalytics.deliverySummary,
  };
}

/**
 * Returns the default rich processed reports for TechnicPet covering all 3 departments:
 * Sales, Warehouse, and Delivery.
 */
/**
 * Returns clean, empty processed reports with 0 records and neutral placeholders.
 * Used when the user requests an empty report screen or after resetting data.
 */
export function getEmptyProcessedReports(): ProcessedDepartmentReports {
  const emptyKpis: KPIStats = {
    totalSalesYTD: '฿0',
    totalSalesGrowth: 'ไม่มีข้อมูลเปรียบเทียบ',
    totalOrders: 0,
    totalOrdersGrowth: 'ไม่มีข้อมูลเปรียบเทียบ',
    deliveryOnTimeRate: 0,
    deliveryOnTimeGrowth: 'ไม่มีข้อมูลเปรียบเทียบ',
    avgDeliveryDays: 0,
    avgDeliveryChange: '0 วัน',
    completedOrders: 0,
    completedOrdersPercent: 0,
    pendingOrders: 0,
    pendingOrdersNote: 'ไม่มีข้อมูลคำสั่งซื้อ',
  };

  return {
    kpis: emptyKpis,
    trendData: [],
    salesReps: [],
    detailedSalesOrders: [],
    docTypeBreakdowns: [],
    topProducts: [],
    topSpenders: [],
    newCustomers: [],
    customerSummary: {
      totalCustomers: 0,
      newCustomersCount: 0,
      topSpenderName: '-',
      topSpenderAmount: '฿0',
      topSpenderAmountRaw: 0,
      topSpenderSharePct: 0,
    },
    salesWeeklyTrend: [],
    salesCategoryMix: [],
    salesSummary: {
      totalRevenueFormatted: '฿0',
      totalRevenueAmount: 0,
      totalRevenueMillions: 0,
      totalBookingCount: 0,
      avgTicketFormatted: '฿0',
      avgTicket: 0,
      hitRatePercent: 0,
      totalOrdersCount: 0,
      totalLineItemsCount: 0,
      completedOrdersCount: 0,
      normalBillsCount: 0,
      normalBillsAmount: 0,
      normalBillsAmountFormatted: '฿0',
      specialBillsCount: 0,
      specialBillsAmount: 0,
      specialBillsAmountFormatted: '฿0',
      claimBillsCount: 0,
      claimBillsAmount: 0,
      claimBillsAmountFormatted: '฿0',
      topPerformerName: '-',
      topPerformerSales: '฿0',
    },
    warehouseDocs: [],
    warehouseSummary: {
      totalDocs: 0,
      completedDocs: 0,
      completionPercent: 0,
      avgItemsPerDoc: '0',
      avgPickingMinutes: '—',
      dailyInboundBookings: 0,
      dailyPickedOrders: 0,
      transferredToDeliveryCount: 0,
      transferredPercent: 0,
      pendingDocsCount: 0,
      avgLeadTimeDays: 0,
      delayedDocsCount: 0,
    },
    deliveryTrips: [],
    deliverySummary: {
      totalTrips: 0,
      otdPercent: 0,
      avgDeliveryDays: 0,
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
  };
}

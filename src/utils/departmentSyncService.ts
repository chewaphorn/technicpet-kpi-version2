import { 
  ParsedFileData, 
  UploadedFileState, 
  KPIStats,
  SalesRepPerformance,
  DetailedSalesOrder,
  DocTypeBreakdown,
  TopProductItem,
  CustomerSpender,
  CustomerSummary,
  WarehouseDoc,
  DeliveryTrip
} from '../types';
import { 
  sanitizeGoogleSheetUrl, 
  fetchSingleDepartmentSheet 
} from './googleSheets';
import { 
  processImportedFiles, 
  ProcessedDepartmentReports,
  analyzeSalesData,
  analyzeWarehouseData,
  analyzeDeliveryData
} from './dataProcessor';

export const STORAGE_KEY_SALES_URL = 'sales_sheet_url';
export const STORAGE_KEY_WAREHOUSE_URL = 'warehouse_sheet_url';
export const STORAGE_KEY_DELIVERY_URL = 'delivery_sheet_url';

export const CACHE_KEY_SALES = 'cache_sales';
export const CACHE_KEY_WAREHOUSE = 'cache_warehouse';
export const CACHE_KEY_DELIVERY = 'cache_delivery';

export const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface DepartmentCacheEntry<T> {
  timestamp: number;
  url: string;
  parsed: ParsedFileData;
  data: T;
}

export interface SalesDepartmentData {
  totalSalesAmount: number;
  totalRevenueFormatted: string;
  totalOrders: number;
  completedOrders: number;
  hitRatePercent: number; // อัตรา SLA / Hit Rate
  salesSummary: ProcessedDepartmentReports['salesSummary'];
  salesReps: SalesRepPerformance[];
  detailedSalesOrders: DetailedSalesOrder[];
  docTypeBreakdowns: DocTypeBreakdown[];
  topProducts: TopProductItem[];
  topSpenders: CustomerSpender[];
  newCustomers: CustomerSpender[];
  customerSummary: CustomerSummary;
  salesWeeklyTrend: { name: string; sales: number; target: number; orders: number }[];
  salesCategoryMix: { name: string; value: number; color: string }[];
}

export interface WarehouseDepartmentData {
  totalDocs: number;
  completedDocs: number;
  pendingDocs: number; // สินค้าค้างส่ง / ค้างจัด
  avgPickingMinutes: string; // Picking Time เฉลี่ย
  readyStockCount: number; // สต็อกพร้อมส่ง (ส่งต่อให้ขนส่งแล้ว)
  delayedDocsCount: number; // บิลล่าช้ากว่าเป้าหมาย 3 วัน
  avgLeadTimeDays: number;
  stockAccuracyPercent?: number; // ความถูกต้องของสต็อก
  warehouseSummary: ProcessedDepartmentReports['warehouseSummary'];
  warehouseDocs: WarehouseDoc[];
}

export interface DeliveryDepartmentData {
  totalTrips: number; // จำนวนเที่ยวรถ
  uniqueVehiclesCount: number; // จำนวนรถที่จัดสายส่ง
  completedTrips: number; // บิลส่งสำเร็จ
  delayedTrips: number; // บิลล่าช้า
  inTransitTrips: number; // กำลังจัดส่ง
  pendingDeliveriesCount: number; // บิลค้างส่ง
  otdPercent: number; // อัตราส่งมอบตรงเวลา SLA
  avgDeliveryDays: number;
  deliverySummary: ProcessedDepartmentReports['deliverySummary'];
  deliveryTrips: DeliveryTrip[];
}

export interface DepartmentSyncResult<T> {
  success: boolean;
  department: 'sales' | 'warehouse' | 'delivery';
  data?: T;
  parsed?: ParsedFileData;
  isCached?: boolean;
  timestamp?: number;
  error?: string;
}

// -------------------------------------------------------------
// 1. Link Management (การจัดการลิงก์แยกตามแผนก)
// -------------------------------------------------------------

export function getDepartmentUrls(): { salesSheetUrl: string; warehouseSheetUrl: string; deliverySheetUrl: string } {
  try {
    const sales = localStorage.getItem(STORAGE_KEY_SALES_URL) || localStorage.getItem('technicpet_sheet_sales_url') || '';
    const warehouse = localStorage.getItem(STORAGE_KEY_WAREHOUSE_URL) || localStorage.getItem('technicpet_sheet_warehouse_url') || '';
    const delivery = localStorage.getItem(STORAGE_KEY_DELIVERY_URL) || localStorage.getItem('technicpet_sheet_delivery_url') || '';
    return {
      salesSheetUrl: sanitizeGoogleSheetUrl(sales),
      warehouseSheetUrl: sanitizeGoogleSheetUrl(warehouse),
      deliverySheetUrl: sanitizeGoogleSheetUrl(delivery),
    };
  } catch {
    return { salesSheetUrl: '', warehouseSheetUrl: '', deliverySheetUrl: '' };
  }
}

export function saveDepartmentUrl(dept: 'sales' | 'warehouse' | 'delivery', rawUrl: string): string {
  const sanitized = sanitizeGoogleSheetUrl(rawUrl);
  try {
    if (dept === 'sales') {
      localStorage.setItem(STORAGE_KEY_SALES_URL, sanitized);
      localStorage.setItem('technicpet_sheet_sales_url', sanitized);
    } else if (dept === 'warehouse') {
      localStorage.setItem(STORAGE_KEY_WAREHOUSE_URL, sanitized);
      localStorage.setItem('technicpet_sheet_warehouse_url', sanitized);
    } else {
      localStorage.setItem(STORAGE_KEY_DELIVERY_URL, sanitized);
      localStorage.setItem('technicpet_sheet_delivery_url', sanitized);
    }
  } catch (e) {
    console.warn('LocalStorage save error:', e);
  }
  return sanitized;
}

// -------------------------------------------------------------
// 2. Caching แยก Key ชัดเจน (cache_sales, cache_warehouse, cache_delivery)
// -------------------------------------------------------------

export function getDepartmentCache<T>(
  dept: 'sales' | 'warehouse' | 'delivery',
  expectedUrl?: string,
  maxAgeMs = DEFAULT_CACHE_TTL_MS
): DepartmentCacheEntry<T> | null {
  try {
    const key = dept === 'sales' ? CACHE_KEY_SALES : dept === 'warehouse' ? CACHE_KEY_WAREHOUSE : CACHE_KEY_DELIVERY;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: DepartmentCacheEntry<T> = JSON.parse(raw);
    if (!entry || !entry.timestamp || !entry.data) return null;
    
    // Validate matching URL if provided
    if (expectedUrl) {
      const cleanExpected = sanitizeGoogleSheetUrl(expectedUrl);
      const cleanCached = sanitizeGoogleSheetUrl(entry.url);
      if (!cleanExpected || !cleanCached || cleanExpected !== cleanCached) {
        return null;
      }
    }

    // Validate TTL
    if (Date.now() - entry.timestamp > maxAgeMs) {
      localStorage.removeItem(key);
      return null;
    }

    if (dept === 'warehouse' && entry.parsed?.rawRows) {
      const analytics = analyzeWarehouseData(entry.parsed);
      entry.data = {
        ...entry.data,
        ...analytics,
        pendingDocs: analytics.pendingDocsCount,
        readyStockCount: analytics.transferredToDeliveryCount,
      } as T;
    }
    if (dept === 'sales' && entry.parsed?.rawRows) entry.data = analyzeSalesData(entry.parsed) as T;
    if (dept === 'delivery' && entry.parsed?.rawRows) entry.data = analyzeDeliveryData(entry.parsed) as T;
    return entry;
  } catch {
    return null;
  }
}

/** Restore the raw input alongside its reports, so a single-sheet update cannot erase other departments. */
export function restoreDepartmentFiles(): UploadedFileState {
  const urls = getDepartmentUrls();
  return {
    salesOrderFile: null, pickingListFile: null, deliveryTagFile: null,
    ...urls,
    salesOrderParsed: urls.salesSheetUrl ? getDepartmentCache('sales', urls.salesSheetUrl, Infinity)?.parsed : undefined,
    pickingListParsed: urls.warehouseSheetUrl ? getDepartmentCache('warehouse', urls.warehouseSheetUrl, Infinity)?.parsed : undefined,
    deliveryTagParsed: urls.deliverySheetUrl ? getDepartmentCache('delivery', urls.deliverySheetUrl, Infinity)?.parsed : undefined,
  };
}

export function setDepartmentCache<T>(
  dept: 'sales' | 'warehouse' | 'delivery',
  url: string,
  parsed: ParsedFileData,
  data: T
): void {
  try {
    const key = dept === 'sales' ? CACHE_KEY_SALES : dept === 'warehouse' ? CACHE_KEY_WAREHOUSE : CACHE_KEY_DELIVERY;
    const entry: DepartmentCacheEntry<T> = {
      timestamp: Date.now(),
      url: sanitizeGoogleSheetUrl(url),
      parsed,
      data,
    };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (e) {
    console.warn(`Failed to write ${dept} cache:`, e);
  }
}

export function clearDepartmentCache(dept?: 'sales' | 'warehouse' | 'delivery'): void {
  try {
    if (dept) {
      const key = dept === 'sales' ? CACHE_KEY_SALES : dept === 'warehouse' ? CACHE_KEY_WAREHOUSE : CACHE_KEY_DELIVERY;
      localStorage.removeItem(key);
    } else {
      localStorage.removeItem(CACHE_KEY_SALES);
      localStorage.removeItem(CACHE_KEY_WAREHOUSE);
      localStorage.removeItem(CACHE_KEY_DELIVERY);
    }
  } catch (e) {
    console.warn('Failed to clear cache:', e);
  }
}

// -------------------------------------------------------------
// 3. Data Fetching & Processing (3 บริการย่อยแยกขาดจากกัน)
// -------------------------------------------------------------

/**
 * 1. syncSalesData(): ดึงข้อมูล Sheet ฝ่ายขาย -> คำนวณยอดขายรวม, ออเดอร์ปิดการขาย, อัตรา SLA
 */
export async function syncSalesData(
  urlOverride?: string,
  options: { forceRefresh?: boolean; fallbackTab?: string } = {}
): Promise<DepartmentSyncResult<SalesDepartmentData>> {
  const urls = getDepartmentUrls();
  const rawUrl = urlOverride || urls.salesSheetUrl;
  const targetUrl = sanitizeGoogleSheetUrl(rawUrl);

  if (!targetUrl) {
    return {
      success: false,
      department: 'sales',
      error: 'ยังไม่ได้ระบุลิงก์ Google Sheet ของฝ่ายขาย กรุณาระบุลิงก์ในหน้าฝ่ายขาย',
    };
  }

  // 1. Check separate cache (cache_sales)
  if (!options.forceRefresh) {
    const cached = getDepartmentCache<SalesDepartmentData>('sales', targetUrl);
    if (cached) {
      return {
        success: true,
        department: 'sales',
        data: cached.data,
        parsed: cached.parsed,
        isCached: true,
        timestamp: cached.timestamp,
      };
    }
  }

  try {
    // 2. Fetch single sheet for Sales
    const parsed = await fetchSingleDepartmentSheet(targetUrl, 'sales', {
      fallbackTabName: options.fallbackTab || 'ใบสั่งซื้อ_SalesOrder',
      forceRefresh: options.forceRefresh,
    });

    if (!parsed || parsed.rowCount === 0) {
      throw new Error('ไม่พบข้อมูลใน Google Sheet ฝ่ายขาย หรือตารางไม่มีข้อมูล');
    }

    // 3. Transform & Calculate isolated Sales metrics
    const salesData = analyzeSalesData(parsed);

    // 4. Save to separate Cache (cache_sales) & save URL
    saveDepartmentUrl('sales', targetUrl);
    setDepartmentCache('sales', targetUrl, parsed, salesData);

    return {
      success: true,
      department: 'sales',
      data: salesData,
      parsed,
      isCached: false,
      timestamp: Date.now(),
    };
  } catch (err: any) {
    const errorMsg = err?.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลฝ่ายขาย';
    return {
      success: false,
      department: 'sales',
      error: `[ฝ่ายขาย] ${errorMsg}`,
    };
  }
}

/**
 * 2. syncWarehouseData(): ดึงข้อมูล Sheet คลังสินค้า -> คำนวณ Picking Time, สต็อกพร้อมส่ง, สินค้าค้างส่ง
 */
export async function syncWarehouseData(
  urlOverride?: string,
  options: { forceRefresh?: boolean; fallbackTab?: string } = {}
): Promise<DepartmentSyncResult<WarehouseDepartmentData>> {
  const urls = getDepartmentUrls();
  const rawUrl = urlOverride || urls.warehouseSheetUrl;
  const targetUrl = sanitizeGoogleSheetUrl(rawUrl);

  if (!targetUrl) {
    return {
      success: false,
      department: 'warehouse',
      error: 'ยังไม่ได้ระบุลิงก์ Google Sheet ของคลังสินค้า กรุณาระบุลิงก์ในหน้าคลังสินค้า',
    };
  }

  // 1. Check separate cache (cache_warehouse)
  if (!options.forceRefresh) {
    const cached = getDepartmentCache<WarehouseDepartmentData>('warehouse', targetUrl);
    if (cached) {
      return {
        success: true,
        department: 'warehouse',
        data: cached.data,
        parsed: cached.parsed,
        isCached: true,
        timestamp: cached.timestamp,
      };
    }
  }

  try {
    // 2. Fetch single sheet for Warehouse / Picking
    const parsed = await fetchSingleDepartmentSheet(targetUrl, 'picking', {
      fallbackTabName: options.fallbackTab || 'ใบจัดสินค้า_PickingList',
      forceRefresh: options.forceRefresh,
    });

    if (!parsed || parsed.rowCount === 0) {
      throw new Error('ไม่พบข้อมูลใน Google Sheet คลังสินค้า หรือตารางไม่มีข้อมูล');
    }

    // 3. Transform & Calculate isolated Warehouse metrics
    const warehouseAnalytics = analyzeWarehouseData(parsed);

    const readyStock = warehouseAnalytics.transferredToDeliveryCount;

    const warehouseData: WarehouseDepartmentData = {
      totalDocs: warehouseAnalytics.totalDocs,
      completedDocs: warehouseAnalytics.completedDocs,
      pendingDocs: warehouseAnalytics.pendingDocsCount, // สินค้าค้างจัด/ค้างส่ง
      avgPickingMinutes: warehouseAnalytics.avgPickingMinutes, // Picking Time
      readyStockCount: readyStock, // สต็อกพร้อมส่ง
      delayedDocsCount: warehouseAnalytics.delayedDocsCount,
      avgLeadTimeDays: warehouseAnalytics.avgLeadTimeDays,
      stockAccuracyPercent: warehouseAnalytics.stockAccuracyPercent,
      warehouseSummary: warehouseAnalytics.warehouseSummary,
      warehouseDocs: warehouseAnalytics.warehouseDocs,
    };

    // 4. Save to separate Cache (cache_warehouse) & save URL
    saveDepartmentUrl('warehouse', targetUrl);
    setDepartmentCache('warehouse', targetUrl, parsed, warehouseData);

    return {
      success: true,
      department: 'warehouse',
      data: warehouseData,
      parsed,
      isCached: false,
      timestamp: Date.now(),
    };
  } catch (err: any) {
    const errorMsg = err?.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลคลังสินค้า';
    return {
      success: false,
      department: 'warehouse',
      error: `[คลังสินค้า] ${errorMsg}`,
    };
  }
}

/**
 * 3. syncDeliveryData(): ดึงข้อมูล Sheet การจัดส่ง -> คำนวณจำนวนเที่ยวรถ, บิลส่งสำเร็จ, บิลล่าช้า
 */
export async function syncDeliveryData(
  urlOverride?: string,
  options: { forceRefresh?: boolean; fallbackTab?: string } = {}
): Promise<DepartmentSyncResult<DeliveryDepartmentData>> {
  const urls = getDepartmentUrls();
  const rawUrl = urlOverride || urls.deliverySheetUrl;
  const targetUrl = sanitizeGoogleSheetUrl(rawUrl);

  if (!targetUrl) {
    return {
      success: false,
      department: 'delivery',
      error: 'ยังไม่ได้ระบุลิงก์ Google Sheet ของการจัดส่ง กรุณาระบุลิงก์ในหน้าการจัดส่ง',
    };
  }

  // 1. Check separate cache (cache_delivery)
  if (!options.forceRefresh) {
    const cached = getDepartmentCache<DeliveryDepartmentData>('delivery', targetUrl);
    if (cached) {
      return {
        success: true,
        department: 'delivery',
        data: cached.data,
        parsed: cached.parsed,
        isCached: true,
        timestamp: cached.timestamp,
      };
    }
  }

  try {
    // 2. Fetch single sheet for Delivery
    const parsed = await fetchSingleDepartmentSheet(targetUrl, 'delivery', {
      fallbackTabName: options.fallbackTab || 'ป้ายจัดส่ง_DeliveryTag',
      forceRefresh: options.forceRefresh,
    });

    if (!parsed || parsed.rowCount === 0) {
      throw new Error('ไม่พบข้อมูลใน Google Sheet การจัดส่ง หรือตารางไม่มีข้อมูล');
    }

    // 3. Transform & Calculate isolated Delivery metrics
    const deliveryAnalytics = analyzeDeliveryData(parsed);

    const completedTrips = deliveryAnalytics.deliveryTrips.filter(t => t.status === 'completed').length;
    const delayedTrips = deliveryAnalytics.delayedCount;
    const inTransitTrips = deliveryAnalytics.inTransitCount;

    const deliveryData: DeliveryDepartmentData = {
      totalTrips: deliveryAnalytics.totalTrips, // จำนวนเที่ยวรถ
      uniqueVehiclesCount: deliveryAnalytics.uniqueVehiclesCount,
      completedTrips, // บิลส่งสำเร็จ
      delayedTrips, // บิลล่าช้า
      inTransitTrips,
      pendingDeliveriesCount: deliveryAnalytics.pendingDeliveriesCount,
      otdPercent: deliveryAnalytics.otdPercent,
      avgDeliveryDays: deliveryAnalytics.avgDeliveryDays,
      deliverySummary: deliveryAnalytics.deliverySummary,
      deliveryTrips: deliveryAnalytics.deliveryTrips,
    };

    // 4. Save to separate Cache (cache_delivery) & save URL
    saveDepartmentUrl('delivery', targetUrl);
    setDepartmentCache('delivery', targetUrl, parsed, deliveryData);

    return {
      success: true,
      department: 'delivery',
      data: deliveryData,
      parsed,
      isCached: false,
      timestamp: Date.now(),
    };
  } catch (err: any) {
    const errorMsg = err?.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลการจัดส่ง';
    return {
      success: false,
      department: 'delivery',
      error: `[การจัดส่ง] ${errorMsg}`,
    };
  }
}

// -------------------------------------------------------------
// 4. Executive All-in-One Synchronization (Promise.all)
// -------------------------------------------------------------

export interface ExecutiveSyncReport {
  salesResult: DepartmentSyncResult<SalesDepartmentData>;
  warehouseResult: DepartmentSyncResult<WarehouseDepartmentData>;
  deliveryResult: DepartmentSyncResult<DeliveryDepartmentData>;
  combinedKPIs: KPIStats;
  trendData: ProcessedDepartmentReports['trendData'];
  errors: { sales?: string; warehouse?: string; delivery?: string };
  allSucceeded: boolean;
}

/**
 * สำหรับผู้บริหาร (Executive Overview): ดึงข้อมูลและวิเคราะห์ภาพรวมพร้อมกันโดยใช้ Promise.all()
 * หากแผนกใดแผนกหนึ่งเกิด Error จะไม่หยุดการทำงานของแผนกอื่น
 */
export async function syncAllDepartments(
  options: { forceRefresh?: boolean } = {}
): Promise<ExecutiveSyncReport> {
  // Execute all 3 department syncs concurrently using Promise.allSettled
  const [salesSettled, warehouseSettled, deliverySettled] = await Promise.allSettled([
    syncSalesData(undefined, options),
    syncWarehouseData(undefined, options),
    syncDeliveryData(undefined, options),
  ]);

  const salesResult: DepartmentSyncResult<SalesDepartmentData> = 
    salesSettled.status === 'fulfilled' 
      ? salesSettled.value 
      : { success: false, department: 'sales', error: String(salesSettled.reason) };

  const warehouseResult: DepartmentSyncResult<WarehouseDepartmentData> = 
    warehouseSettled.status === 'fulfilled' 
      ? warehouseSettled.value 
      : { success: false, department: 'warehouse', error: String(warehouseSettled.reason) };

  const deliveryResult: DepartmentSyncResult<DeliveryDepartmentData> = 
    deliverySettled.status === 'fulfilled' 
      ? deliverySettled.value 
      : { success: false, department: 'delivery', error: String(deliverySettled.reason) };

  const errors: { sales?: string; warehouse?: string; delivery?: string } = {};
  if (!salesResult.success && salesResult.error) errors.sales = salesResult.error;
  if (!warehouseResult.success && warehouseResult.error) errors.warehouse = warehouseResult.error;
  if (!deliveryResult.success && deliveryResult.error) errors.delivery = deliveryResult.error;

  // Synthesize unified KPIs
  const filesState: UploadedFileState = {
    salesOrderFile: null,
    salesOrderParsed: salesResult.parsed,
    pickingListFile: null,
    pickingListParsed: warehouseResult.parsed,
    deliveryTagFile: null,
    deliveryTagParsed: deliveryResult.parsed,
  };

  const processed = processImportedFiles(filesState);

  return {
    salesResult,
    warehouseResult,
    deliveryResult,
    combinedKPIs: processed.kpis,
    trendData: processed.trendData,
    errors,
    allSucceeded: salesResult.success && warehouseResult.success && deliveryResult.success,
  };
}

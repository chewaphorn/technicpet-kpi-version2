export type ScreenId = 'overview' | 'sales' | 'warehouse' | 'delivery';

export interface KPIStats {
  totalSalesYTD: string;
  totalSalesGrowth: string;
  totalOrders: number;
  totalOrdersGrowth: string;
  deliveryOnTimeRate: number;
  deliveryOnTimeGrowth: string;
  avgDeliveryDays: number;
  avgDeliveryChange: string;
  completedOrders: number;
  completedOrdersPercent: number;
  pendingOrders: number;
  pendingOrdersNote: string;
}

export interface MonthlyDeliveryTrend {
  month: string;
  deliveredWithin3Days: number; // in Millions THB or orders count
  deliveredOver3Days: number; // trend line
  totalVolume: number;
  onTimePercent: number;
}

export interface SalesRepPerformance {
  id: string;
  name: string;
  initials: string;
  role: string;
  sales: number; // in THB millions e.g. 1.2
  salesFormatted: string; // ฿1.2M
  target: number; // 1.5
  deliveryTurnaround: string; // "จัดส่งเสร็จใน 2 วัน"
  completionRate: number; // %
  ordersCount?: number;
}

export interface WarehouseDoc {
  id: string;
  docNo: string;
  customer: string;
  salesOrderDate?: string; // วันที่เปิดบิลจากข้อมูลฝ่ายขาย
  date?: string; // วันที่ของเอกสารใบจอง/เบิก
  completedDate?: string; // วันที่จัดของเสร็จสมบูรณ์
  receivedBookingDate?: string;
  receivedFromWarehouseDate?: string;
  plannedDate?: string;
  loadedDate?: string;
  leadTimeDays?: number; // จำนวนวันที่ใช้จัดของ (วันที่จัดของเสร็จ - วันที่ใบจอง)
  pendingDays?: number; // จำนวนวันที่ค้างจัด (นับจากวันที่รับใบจอง)
  delayDays?: number; // จำนวนวันที่ล่าช้ากว่าเป้าหมาย 3 วัน (เกินกว่า 3 วัน)
  delayDate?: string; // วันที่เริ่มล่าช้า หรือ วันครบกำหนดเป้าหมาย
  startTime: string;
  itemsCount: number;
  items?: SalesOrderItem[]; // รายละเอียดรายการสินค้าในเอกสาร
  status: 'completed' | 'picking' | 'pending' | 'verified' | 'unknown';
  statusLabel: string;
  pickerName: string;
  priority: 'normal' | 'urgent' | 'high' | 'unknown';
  transferredToDelivery?: boolean; // ส่งต่อให้ฝ่ายขนส่งแล้วหรือไม่
  transferTime?: string; // เวลาที่ส่งต่อฝ่ายขนส่ง
  notes?: string;
}

export interface DeliveryTrip {
  id: string;
  deliveryNo: string;
  salesOrderNo: string;
  docNo?: string; // เลขที่เอกสาร
  orderDate?: string; // วันที่รับใบจอง
  plannedDate?: string; // วันที่วางแผน
  handoffDate?: string; // วันที่รับจากคลัง
  loadedDate?: string; // วันที่โหลดสินค้าจริง
  licensePlate: string;
  driverName: string;
  driverPhone: string;
  departureTime: string;
  estimatedArrival: string;
  actualArrival?: string;
  status: 'completed' | 'in_transit' | 'delayed' | 'unknown';
  statusLabel: string;
  destination: string;
  weightTon: number;
  itemsCount: number;
  customer?: string;
  customerName?: string;
  vehicleNo?: string;
  route?: string; // สายส่ง เช่น 'สาย กทม.-ปริมณฑล', 'สาย บางนา-สมุทรปราการ'
  handoverDate?: string; // วันที่รับจากคลัง (alias)
  actualDeliveryDate?: string; // วันที่ส่งมอบจริง (alias)
  pendingDeliveryDays?: number; // จำนวนวันค้างส่ง
  deliveryLeadTimeDays?: number; // Delivery Lead Time
  items?: SalesOrderItem[]; // รายการสินค้าในบิลสำหรับ Popup
}

export interface ParsedFileData {
  fileName: string;
  fileSize: string;
  rowCount: number;
  columns: string[];
  sampleRows: Record<string, any>[];
  rawRows: any[];
  _fromCache?: boolean;
  _cachedAt?: number;
}

export interface SalesOrderItem {
  seqNo: number;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  sku?: string;
  unitPrice?: number;
  totalPrice?: number;
}

export type SalesDocType = 'BK' | 'BKET' | 'BKR' | 'OTHER';

export interface DetailedSalesOrder {
  docNo: string;
  docType: SalesDocType;
  docTypeLabel: string;
  date: string;
  customer: string;
  salesperson: string;
  totalItemsCount: number;
  totalQuantity: number;
  totalAmount: number;
  status: string;
  items: SalesOrderItem[];
  claimReason?: string;
}

export interface DocTypeBreakdown {
  type: SalesDocType;
  code: string;
  label: string;
  badgeColor: string;
  billCount: number;
  totalAmount: number;
  totalAmountFormatted: string;
  totalQuantity: number;
  percentOfBills: number;
  percentOfAmount: number;
}

export interface TopProductItem {
  rank: number;
  productCode: string;
  productName: string;
  totalQuantity: number;
  unit: string;
  totalAmount: number;
  totalAmountFormatted: string;
  ordersCount: number;
  percentageOfSales: number;
}

export interface CustomerSpender {
  rank: number;
  customerName: string;
  totalAmount: number;
  totalAmountFormatted: string;
  ordersCount: number;
  totalQuantity: number;
  avgTicket: number;
  avgTicketFormatted: string;
  isNewCustomer: boolean;
  category?: string;
  lastOrderDate?: string;
  salesperson?: string;
  docTypes: string[];
  percentageOfTotalSales: number;
}

export interface CustomerSummary {
  totalCustomers: number;
  newCustomersCount: number;
  topSpenderName: string;
  topSpenderAmount: string;
  topSpenderAmountRaw: number;
  topSpenderSharePct: number;
}

export interface UploadedFileState {
  importSource?: 'googlesheet' | 'file';
  salesOrderFile: File | null;
  salesOrderFileName?: string;
  salesOrderSize?: string;
  salesOrderParsed?: ParsedFileData;
  pickingListFile: File | null;
  pickingListFileName?: string;
  pickingListSize?: string;
  pickingListParsed?: ParsedFileData;
  deliveryTagFile: File | null;
  deliveryTagFileName?: string;
  deliveryTagSize?: string;
  deliveryTagParsed?: ParsedFileData;
  lastProcessedAt?: string;
  googleSheetUrl?: string;
  googleSheetConnected?: boolean;
  salesSheetUrl?: string;
  warehouseSheetUrl?: string;
  deliverySheetUrl?: string;
  salesSheetStatus?: 'connected' | 'invalid' | 'unlinked';
  warehouseSheetStatus?: 'connected' | 'invalid' | 'unlinked';
  deliverySheetStatus?: 'connected' | 'invalid' | 'unlinked';
  salesLastSync?: string;
  warehouseLastSync?: string;
  deliveryLastSync?: string;
}

export type UserRole = 'admin' | 'sales_manager' | 'warehouse_supervisor' | 'logistics_coordinator' | 'viewer';

export interface AuthUser {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  role: UserRole;
  roleLabel: string;
  department: string;
  initials: string;
  avatarUrl?: string;
  lastLoginAt?: string;
  allowedScreens?: ScreenId[];
  isAuthorized?: boolean;
}

export interface AuthorizedUserRecord {
  id: string;
  email: string;
  username: string;
  name: string;
  role: UserRole;
  roleLabel: string;
  department: string;
  status: 'active' | 'inactive';
  allowedScreens: ScreenId[];
  lastLoginAt?: string;
  addedAt: string;
  addedBy?: string;
  notes?: string;
}

export interface SalesDepartmentAnalytics {
  totalSalesAmount: number;
  totalRevenueFormatted: string;
  totalOrders: number;
  completedOrders: number;
  hitRatePercent: number;
  avgTicket: number;
  avgTicketFormatted: string;
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

export interface WarehouseDepartmentAnalytics {
  totalDocs: number;
  completedDocs: number;
  pendingDocsCount: number;
  delayedDocsCount: number;
  avgLeadTimeDays: number;
  avgPickingMinutes: string;
  dailyInboundBookings: number;
  dailyPickedOrders: number;
  transferredToDeliveryCount: number;
  transferredPercent: number;
  stockAccuracyPercent?: number;
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
    delayedDocsCount?: number;
    stockAccuracyPercent?: number;
  };
  warehouseDocs: WarehouseDoc[];
}

export interface DeliveryDepartmentAnalytics {
  totalTrips: number;
  otdPercent: number;
  avgDeliveryDays: number;
  minLeadTimeDays: number;
  maxLeadTimeDays: number;
  totalWeightTon: number;
  inTransitCount: number;
  delayedCount: number;
  uniqueVehiclesCount: number;
  pendingDeliveriesCount: number;
  dailyTripsDispatched: number;
  speedDistribution: { range: string; trips: number }[];
  deliverySummary: {
    totalTrips: number;
    otdPercent: number;
    avgDeliveryDays: number;
    minLeadTimeDays?: number;
    maxLeadTimeDays?: number;
    dailyTripsDispatched?: number;
    totalWeightTon: number;
    inTransitCount: number;
    delayedCount: number;
    uniqueVehiclesCount?: number;
    pendingDeliveriesCount?: number;
    speedDistribution: { range: string; trips: number }[];
  };
  deliveryTrips: DeliveryTrip[];
}

import { KPIStats, MonthlyDeliveryTrend, SalesRepPerformance, WarehouseDoc, DeliveryTrip } from '../types';

export const initialOverviewKPIs: KPIStats = {
  totalSalesYTD: '฿0',
  totalSalesGrowth: 'รอการอัปเดตข้อมูล',
  totalOrders: 0,
  totalOrdersGrowth: 'รอการอัปเดตข้อมูล',
  deliveryOnTimeRate: 0,
  deliveryOnTimeGrowth: 'รอการอัปเดตข้อมูล',
  avgDeliveryDays: 0,
  avgDeliveryChange: 'รอการอัปเดตข้อมูล',
  completedOrders: 0,
  completedOrdersPercent: 0,
  pendingOrders: 0,
  pendingOrdersNote: 'ยังไม่มีข้อมูล',
};

export const monthlyDeliveryTrendData: MonthlyDeliveryTrend[] = [];

export const salesRepsData: SalesRepPerformance[] = [];

export const salesTrendWeekly: { name: string; sales: number; target: number; orders: number }[] = [];

export const productCategorySales: { name: string; value: number; color: string }[] = [];

export const warehouseDocsData: WarehouseDoc[] = [];

export const deliveryTripsData: DeliveryTrip[] = [];

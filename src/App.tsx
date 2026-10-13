/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ScreenId, 
  KPIStats, 
  UploadedFileState, 
  AuthUser,
  WarehouseDoc,
  DeliveryTrip,
  SalesRepPerformance,
  DetailedSalesOrder,
  DocTypeBreakdown,
  TopProductItem,
  CustomerSpender,
  CustomerSummary
} from './types';
import { 
  initAuth, 
  subscribeToImportBatches, 
  getStoredUser, 
  logOutUser
} from './lib/firebase';
import { canAccessScreen, canAccessReport, canConfigureDepartmentSheet, subscribeToUserAuthorization } from './lib/authControl';
import { subscribeToKpiTargets } from './lib/kpiSettings';
import { ProcessedDepartmentReports, getEmptyProcessedReports, processImportedFiles } from './utils/dataProcessor';
import { 
  syncSalesData, 
  syncWarehouseData, 
  syncDeliveryData, 
  syncAllDepartments,
  getDepartmentCache,
  getDepartmentUrls,
  restoreDepartmentFiles,
  SalesDepartmentData,
  WarehouseDepartmentData,
  DeliveryDepartmentData,
} from './utils/departmentSyncService';
import { LoginView } from './components/LoginView';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ExecutiveOverview } from './components/ExecutiveOverview';
import { SalesReportView } from './components/SalesReportView';
import { WarehouseReportView } from './components/WarehouseReportView';
import { DeliveryReportView } from './components/DeliveryReportView';
import { DocumentTrackingModal } from './components/DocumentTrackingModal';
import { NewReportModal } from './components/NewReportModal';
import { PDFReportPreviewModal } from './components/PDFReportPreviewModal';
import { createReportRequest, ReportFilters, ReportFilterValues } from './utils/reportRequest';
import { SettingsModal } from './components/SettingsModal';
import { HelpModal } from './components/HelpModal';
import { ProfileModal } from './components/ProfileModal';
import { GoogleSheetIntegrationModal } from './components/GoogleSheetIntegrationModal';
import { Menu, X } from 'lucide-react';

const getInitialReportsData = (): ProcessedDepartmentReports => {
  try {
    // Rebuild reports only from source rows cached for the currently linked
    // Google Sheets. Never hydrate derived values from legacy report snapshots.
    localStorage.removeItem('technicpet_processed_reports_v2');
    localStorage.removeItem('technicpet_processed_reports_v3');
    const urls = getDepartmentUrls();
    const sales = urls.salesSheetUrl
      ? getDepartmentCache<SalesDepartmentData>('sales', urls.salesSheetUrl, Infinity)
      : null;
    const warehouse = urls.warehouseSheetUrl
      ? getDepartmentCache<WarehouseDepartmentData>('warehouse', urls.warehouseSheetUrl, Infinity)
      : null;
    const delivery = urls.deliverySheetUrl
      ? getDepartmentCache<DeliveryDepartmentData>('delivery', urls.deliverySheetUrl, Infinity)
      : null;

    return processImportedFiles({
      salesOrderFile: null,
      salesOrderParsed: sales?.parsed,
      pickingListFile: null,
      pickingListParsed: warehouse?.parsed,
      deliveryTagFile: null,
      deliveryTagParsed: delivery?.parsed,
    });
  } catch (e) {
    console.warn('Failed to parse cached reports data:', e);
  }
  return getEmptyProcessedReports();
};

const initialReports = getInitialReportsData();

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isRestoringAuth, setIsRestoringAuth] = useState(true);
  const [kpiSettingsError, setKpiSettingsError] = useState<string | null>(null);
  useEffect(() => {
    if (!currentUser) return;
    return subscribeToKpiTargets(setKpiSettingsError);
  }, [currentUser?.uid]);
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('overview');
  
  // Dashboard Metrics & Department Reports (Clean empty baseline by default)
  const [kpis, setKpis] = useState<KPIStats>(initialReports.kpis);
  const [trendData, setTrendData] = useState(initialReports.trendData || []);
  
  // Sales Department State
  const [salesReps, setSalesReps] = useState<SalesRepPerformance[]>(initialReports.salesReps || []);
  const [salesWeeklyTrend, setSalesWeeklyTrend] = useState(initialReports.salesWeeklyTrend || []);
  const [salesCategoryMix, setSalesCategoryMix] = useState(initialReports.salesCategoryMix || []);
  const [detailedSalesOrders, setDetailedSalesOrders] = useState<DetailedSalesOrder[]>(initialReports.detailedSalesOrders || []);
  const [docTypeBreakdowns, setDocTypeBreakdowns] = useState<DocTypeBreakdown[]>(initialReports.docTypeBreakdowns || []);
  const [topProducts, setTopProducts] = useState<TopProductItem[]>(initialReports.topProducts || []);
  const [topSpenders, setTopSpenders] = useState<CustomerSpender[]>(initialReports.topSpenders || []);
  const [newCustomers, setNewCustomers] = useState<CustomerSpender[]>(initialReports.newCustomers || []);
  const [customerSummary, setCustomerSummary] = useState<CustomerSummary | undefined>(initialReports.customerSummary);
  const [salesSummary, setSalesSummary] = useState<any>(initialReports.salesSummary || {
    totalRevenueFormatted: '฿0',
    totalRevenueMillions: 0,
    totalBookingCount: 0,
    avgTicketFormatted: '฿0',
    avgTicket: 0,
    hitRatePercent: 0,
    totalOrdersCount: 0,
    completedOrdersCount: 0,
    normalBillsCount: 0,
    specialBillsCount: 0,
    claimBillsCount: 0,
  });

  // Warehouse Department State
  const [warehouseDocs, setWarehouseDocs] = useState<WarehouseDoc[]>(initialReports.warehouseDocs || []);
  const [warehouseSummary, setWarehouseSummary] = useState<any>(initialReports.warehouseSummary || {
    totalDocs: 0,
    completedDocs: 0,
    completionPercent: 0,
    avgItemsPerDoc: '0',
    avgPickingMinutes: '—',
  });

  // Delivery Department State
  const [deliveryTrips, setDeliveryTrips] = useState<DeliveryTrip[]>(initialReports.deliveryTrips || []);
  const [deliverySummary, setDeliverySummary] = useState<any>(initialReports.deliverySummary || {
    totalTrips: 0,
    otdPercent: 0,
    avgDeliveryDays: 0,
    totalWeightTon: 0,
    inTransitCount: 0,
    delayedCount: 0,
    speedDistribution: [],
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // File upload state for Data Import
  const [filesState, setFilesState] = useState<UploadedFileState>(restoreDepartmentFiles);

  // Modals state
  const [selectedDocForTracking, setSelectedDocForTracking] = useState<string | null>(null);
  const [isNewReportOpen, setIsNewReportOpen] = useState(false);
  const [isPDFPreviewOpen, setIsPDFPreviewOpen] = useState(false);
  const [selectedDeptForPDF, setSelectedDeptForPDF] = useState<'overview' | 'sales' | 'warehouse' | 'delivery' | 'all'>('overview');
  const [reportDateRange, setReportDateRange] = useState<{ start?: string; end?: string }>({
    start: undefined,
    end: undefined,
  });
  const [reportFilters, setReportFilters] = useState<ReportFilters | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isGoogleSheetsModalOpen, setIsGoogleSheetsModalOpen] = useState(false);
  const [googleSheetTargetDept, setGoogleSheetTargetDept] = useState<'all' | 'sales' | 'warehouse' | 'delivery'>('all');

  const permitted = (screen: ScreenId) => !!currentUser && canAccessScreen(currentUser.role, screen, currentUser.allowedScreens);
  const navigate = (screen: ScreenId) => { if (permitted(screen)) setCurrentScreen(screen); };
  useEffect(() => {
    setSelectedDocForTracking(null);
    setIsNewReportOpen(false);
    setIsPDFPreviewOpen(false);
    setIsGoogleSheetsModalOpen(false);
  }, [currentUser?.uid, currentUser?.role, JSON.stringify(currentUser?.allowedScreens)]);

  const handleOpenGoogleSheetsModal = (dept?: 'all' | 'sales' | 'warehouse' | 'delivery') => {
    if (!currentUser || currentUser.role === 'viewer') return;
    if (dept && dept !== 'all' && !permitted(dept)) return;
    if (currentUser?.role === 'sales_manager') {
      setGoogleSheetTargetDept('sales');
    } else if (currentUser?.role === 'warehouse_supervisor') {
      setGoogleSheetTargetDept('warehouse');
    } else if (currentUser?.role === 'logistics_coordinator') {
      setGoogleSheetTargetDept('delivery');
    } else {
      setGoogleSheetTargetDept(dept || 'all');
    }
    setIsGoogleSheetsModalOpen(true);
  };

  const handleOpenPDFReport = (
    dept: 'overview' | 'sales' | 'warehouse' | 'delivery' | 'all' = 'overview',
    startDate?: string,
    endDate?: string,
    filters?: ReportFilterValues
  ) => {
    if (!canAccessReport(currentUser, dept)) return;
    const request = createReportRequest(dept, startDate, endDate, filters);
    setSelectedDeptForPDF(request.department);
    setReportDateRange(request.dateRange);
    setReportFilters(request.filters);
    setIsPDFPreviewOpen(true);
  };

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      try {
        await initAuth();
        const stored = await getStoredUser();
        if (isMounted && stored) {
          setCurrentUser(stored);
          if (stored.role === 'sales_manager') setCurrentScreen('sales');
          else if (stored.role === 'warehouse_supervisor') setCurrentScreen('warehouse');
          else if (stored.role === 'logistics_coordinator') setCurrentScreen('delivery');
        }
      } catch (error) {
        console.error('Unable to restore the signed-in user:', error);
      } finally {
        if (isMounted) setIsRestoringAuth(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    return subscribeToImportBatches((batches) => {
      if (batches.length > 0) {
        console.log('Synchronized batches from Firestore:', batches.length);
      }
    });
  }, [currentUser?.uid, currentUser?.role]);

  useEffect(() => {
    if (!currentUser?.email) return;

    return subscribeToUserAuthorization(
      currentUser.email,
      (record) => {
        if (!record || record.status !== 'active') {
          void logOutUser().then(() => setCurrentUser(null));
          return;
        }

        const updatedUser: AuthUser = {
          ...currentUser,
          displayName: record.name,
          role: record.role,
          roleLabel: record.roleLabel,
          department: record.department,
          initials: (record.name.split(' ').map((part) => part[0]).join('') || record.email.slice(0, 2)).slice(0, 2).toUpperCase(),
          allowedScreens: record.allowedScreens,
          isAuthorized: true,
        };
        setCurrentUser(updatedUser);
        try {
          localStorage.setItem('technicpet_auth_user', JSON.stringify(updatedUser));
        } catch (error) {
          console.error('Unable to update the cached authorization profile:', error);
        }
        if (record.role === 'sales_manager') setCurrentScreen('sales');
        else if (record.role === 'warehouse_supervisor') setCurrentScreen('warehouse');
        else if (record.role === 'logistics_coordinator') setCurrentScreen('delivery');
        else setCurrentScreen('overview');
      },
      (error) => {
        console.error('Unable to watch authorization changes:', error);
        // Access must stop when the server can no longer confirm permission.
        setCurrentUser(null);
        void logOutUser();
      }
    );
  }, [currentUser?.email]);

  const handleLoginSuccess = (user: AuthUser) => {
    setCurrentUser(user);
    if (user.role === 'sales_manager') {
      setCurrentScreen('sales');
    } else if (user.role === 'warehouse_supervisor') {
      setCurrentScreen('warehouse');
    } else if (user.role === 'logistics_coordinator') {
      setCurrentScreen('delivery');
    } else {
      setCurrentScreen('overview');
    }
  };

  const handleLogout = async () => {
    await logOutUser();
    setCurrentUser(null);
  };

  const handleUpdateUser = (updatedUser: AuthUser) => {
    setCurrentUser(updatedUser);
    localStorage.setItem('technicpet_auth_user', JSON.stringify(updatedUser));
  };

  const handleUpdateFiles = (newState: Partial<UploadedFileState>) => {
    setFilesState((prev) => ({ ...prev, ...newState }));
  };

  const handleProcessComplete = (processed: ProcessedDepartmentReports) => {
    // 1. Update Executive KPIs & Trend Data
    setKpis(processed.kpis);
    setTrendData(processed.trendData);

    // 2. Update Sales Department Data
    setSalesReps(processed.salesReps);
    setSalesWeeklyTrend(processed.salesWeeklyTrend);
    setSalesCategoryMix(processed.salesCategoryMix);
    setDetailedSalesOrders(processed.detailedSalesOrders || []);
    setDocTypeBreakdowns(processed.docTypeBreakdowns || []);
    setTopProducts(processed.topProducts || []);
    setTopSpenders(processed.topSpenders || []);
    setNewCustomers(processed.newCustomers || []);
    setCustomerSummary(processed.customerSummary);
    setSalesSummary(processed.salesSummary);

    // 3. Update Warehouse Department Data
    setWarehouseDocs(processed.warehouseDocs);
    setWarehouseSummary(processed.warehouseSummary);

    // 4. Update Delivery Department Data
    setDeliveryTrips(processed.deliveryTrips);
    setDeliverySummary(processed.deliverySummary);

    // Save to localStorage for instant hydration on page reload
    try {
      localStorage.setItem('technicpet_processed_reports_v3', JSON.stringify({
        ...processed,
        _source: 'google_sheet_real',
      }));
    } catch (e) {
      console.warn('Could not cache processed reports:', e);
    }

  };

  const handleClearCacheAndReset = () => {
    try {
      localStorage.removeItem('technicpet_processed_reports_v2');
      localStorage.removeItem('technicpet_processed_reports_v3');
      localStorage.removeItem('technicpet_sheet_cache_sales');
      localStorage.removeItem('technicpet_sheet_cache_picking');
      localStorage.removeItem('technicpet_sheet_cache_delivery');
      localStorage.removeItem('cache_sales');
      localStorage.removeItem('cache_warehouse');
      localStorage.removeItem('cache_delivery');
    } catch (e) {
      console.warn('LocalStorage clear error:', e);
    }
    const emptyDefaults = getEmptyProcessedReports();
    // 1. Update Executive KPIs & Trend Data
    setKpis(emptyDefaults.kpis);
    setTrendData(emptyDefaults.trendData);

    // 2. Update Sales Department Data
    setSalesReps(emptyDefaults.salesReps);
    setSalesWeeklyTrend(emptyDefaults.salesWeeklyTrend);
    setSalesCategoryMix(emptyDefaults.salesCategoryMix);
    setDetailedSalesOrders(emptyDefaults.detailedSalesOrders || []);
    setDocTypeBreakdowns(emptyDefaults.docTypeBreakdowns || []);
    setTopProducts(emptyDefaults.topProducts || []);
    setTopSpenders(emptyDefaults.topSpenders || []);
    setNewCustomers(emptyDefaults.newCustomers || []);
    setCustomerSummary(emptyDefaults.customerSummary);
    setSalesSummary(emptyDefaults.salesSummary);

    // 3. Update Warehouse Department Data
    setWarehouseDocs(emptyDefaults.warehouseDocs);
    setWarehouseSummary(emptyDefaults.warehouseSummary);

    // 4. Update Delivery Department Data
    setDeliveryTrips(emptyDefaults.deliveryTrips);
    setDeliverySummary(emptyDefaults.deliverySummary);

    setFilesState({
      salesOrderFile: null,
      salesOrderFileName: undefined,
      pickingListFile: null,
      pickingListFileName: undefined,
      deliveryTagFile: null,
      deliveryTagFileName: undefined,
      lastProcessedAt: undefined,
      googleSheetConnected: false,
    });

  };

  // Department-Specific Sync Loading and Error States
  const [syncingState, setSyncingState] = useState<{
    sales: boolean;
    warehouse: boolean;
    delivery: boolean;
    all: boolean;
  }>({ sales: false, warehouse: false, delivery: false, all: false });

  const [syncErrors, setSyncErrors] = useState<{
    sales?: string;
    warehouse?: string;
    delivery?: string;
  }>({});

  // 1. Sync Sales Department Only
  const handleSyncSales = async (urlOverride?: string) => {
    if (!permitted('sales')) return;
    setSyncingState((prev) => ({ ...prev, sales: true }));
    setSyncErrors((prev) => ({ ...prev, sales: undefined }));
    try {
      const res = await syncSalesData(urlOverride, { forceRefresh: true });
      if (!res.success || !res.data) {
        const errMsg = res.error || 'ไม่สามารถดึงข้อมูลฝ่ายขายได้';
        setSyncErrors((prev) => ({ ...prev, sales: errMsg }));
        return;
      }

      setSalesReps(res.data.salesReps);
      setSalesWeeklyTrend(res.data.salesWeeklyTrend);
      setSalesCategoryMix(res.data.salesCategoryMix);
      setDetailedSalesOrders(res.data.detailedSalesOrders);
      setDocTypeBreakdowns(res.data.docTypeBreakdowns);
      setTopProducts(res.data.topProducts);
      setTopSpenders(res.data.topSpenders);
      setNewCustomers(res.data.newCustomers);
      setCustomerSummary(res.data.customerSummary);
      setSalesSummary(res.data.salesSummary);

      setKpis((prev) => ({
        ...prev,
        totalSalesYTD: res.data.totalRevenueFormatted,
        totalOrders: res.data.totalOrders,
        completedOrders: res.data.completedOrders,
        salesHitRate: res.data.hitRatePercent,
      }));

      const nowTimeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      setFilesState((prev) => ({
        ...prev,
        salesOrderParsed: res.parsed,
        salesLastSync: nowTimeStr,
        salesSheetStatus: 'connected',
        lastProcessedAt: nowTimeStr,
      }));

    } catch (err: any) {
      setSyncErrors((prev) => ({ ...prev, sales: err?.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลฝ่ายขาย' }));
    } finally {
      setSyncingState((prev) => ({ ...prev, sales: false }));
    }
  };

  // 2. Sync Warehouse Department Only
  const handleSyncWarehouse = async (urlOverride?: string) => {
    if (!permitted('warehouse')) return;
    setSyncingState((prev) => ({ ...prev, warehouse: true }));
    setSyncErrors((prev) => ({ ...prev, warehouse: undefined }));
    try {
      const res = await syncWarehouseData(urlOverride, { forceRefresh: true });
      if (!res.success || !res.data) {
        const errMsg = res.error || 'ไม่สามารถดึงข้อมูลคลังสินค้าได้';
        setSyncErrors((prev) => ({ ...prev, warehouse: errMsg }));
        return;
      }

      setWarehouseDocs(res.data.warehouseDocs);
      setWarehouseSummary(res.data.warehouseSummary);

      setKpis((prev) => ({
        ...prev,
        avgPickingMinutes: res.data.avgPickingMinutes,
        warehouseAccuracy: prev.warehouseAccuracy,
      }));

      const nowTimeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      setFilesState((prev) => ({
        ...prev,
        pickingListParsed: res.parsed,
        warehouseLastSync: nowTimeStr,
        warehouseSheetStatus: 'connected',
        lastProcessedAt: nowTimeStr,
      }));

    } catch (err: any) {
      setSyncErrors((prev) => ({ ...prev, warehouse: err?.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลคลังสินค้า' }));
    } finally {
      setSyncingState((prev) => ({ ...prev, warehouse: false }));
    }
  };

  // 3. Sync Delivery Department Only
  const handleSyncDelivery = async (urlOverride?: string) => {
    if (!permitted('delivery')) return;
    setSyncingState((prev) => ({ ...prev, delivery: true }));
    setSyncErrors((prev) => ({ ...prev, delivery: undefined }));
    try {
      const res = await syncDeliveryData(urlOverride, { forceRefresh: true });
      if (!res.success || !res.data) {
        const errMsg = res.error || 'ไม่สามารถดึงข้อมูลการจัดส่งได้';
        setSyncErrors((prev) => ({ ...prev, delivery: errMsg }));
        return;
      }

      setDeliveryTrips(res.data.deliveryTrips);
      setDeliverySummary(res.data.deliverySummary);

      setKpis((prev) => ({
        ...prev,
        deliveryOnTimeRate: res.data.otdPercent,
        avgDeliveryDays: res.data.avgDeliveryDays,
      }));

      const nowTimeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      setFilesState((prev) => ({
        ...prev,
        deliveryTagParsed: res.parsed,
        deliveryLastSync: nowTimeStr,
        deliverySheetStatus: 'connected',
        lastProcessedAt: nowTimeStr,
      }));

    } catch (err: any) {
      setSyncErrors((prev) => ({ ...prev, delivery: err?.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลการจัดส่ง' }));
    } finally {
      setSyncingState((prev) => ({ ...prev, delivery: false }));
    }
  };

  // 4. All-in-One Synchronous/Parallel Sync using Promise.all() for Executive
  const handleSyncAllDepartments = async () => {
    if (currentUser?.role !== 'admin') return;
    setSyncingState({ sales: true, warehouse: true, delivery: true, all: true });
    setSyncErrors({});
    try {
      const report = await syncAllDepartments({ forceRefresh: true });
      const emptyReports = getEmptyProcessedReports();
      const salesData = report.salesResult.success ? report.salesResult.data : undefined;
      const warehouseData = report.warehouseResult.success ? report.warehouseResult.data : undefined;
      const deliveryData = report.deliveryResult.success ? report.deliveryResult.data : undefined;

      // Apply the same successful/empty state to every screen. Keeping an old
      // failed department in memory makes Executive Overview disagree with its
      // department report after a partial sync.
      setSalesReps(salesData?.salesReps || emptyReports.salesReps);
      setSalesWeeklyTrend(salesData?.salesWeeklyTrend || emptyReports.salesWeeklyTrend);
      setSalesCategoryMix(salesData?.salesCategoryMix || emptyReports.salesCategoryMix);
      setDetailedSalesOrders(salesData?.detailedSalesOrders || emptyReports.detailedSalesOrders);
      setDocTypeBreakdowns(salesData?.docTypeBreakdowns || emptyReports.docTypeBreakdowns);
      setTopProducts(salesData?.topProducts || emptyReports.topProducts);
      setTopSpenders(salesData?.topSpenders || emptyReports.topSpenders);
      setNewCustomers(salesData?.newCustomers || emptyReports.newCustomers);
      setCustomerSummary(salesData?.customerSummary || emptyReports.customerSummary);
      setSalesSummary(salesData?.salesSummary || emptyReports.salesSummary);

      setWarehouseDocs(warehouseData?.warehouseDocs || emptyReports.warehouseDocs);
      setWarehouseSummary(warehouseData?.warehouseSummary || emptyReports.warehouseSummary);

      setDeliveryTrips(deliveryData?.deliveryTrips || emptyReports.deliveryTrips);
      setDeliverySummary(deliveryData?.deliverySummary || emptyReports.deliverySummary);

      // Apply Combined KPIs & Trends
      setKpis(report.combinedKPIs);
      setTrendData(report.trendData);

      const nowTimeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      setFilesState((prev) => ({
        ...prev,
        salesOrderParsed: report.salesResult.success ? report.salesResult.parsed : undefined,
        pickingListParsed: report.warehouseResult.success ? report.warehouseResult.parsed : undefined,
        deliveryTagParsed: report.deliveryResult.success ? report.deliveryResult.parsed : undefined,
        salesSheetStatus: report.salesResult.success ? 'connected' : 'invalid',
        warehouseSheetStatus: report.warehouseResult.success ? 'connected' : 'invalid',
        deliverySheetStatus: report.deliveryResult.success ? 'connected' : 'invalid',
        salesLastSync: report.salesResult.success ? nowTimeStr : prev.salesLastSync,
        warehouseLastSync: report.warehouseResult.success ? nowTimeStr : prev.warehouseLastSync,
        deliveryLastSync: report.deliveryResult.success ? nowTimeStr : prev.deliveryLastSync,
        lastProcessedAt: nowTimeStr,
      }));

      // Persist exactly what is displayed so a reload cannot restore an older
      // cross-department snapshot after the latest sync.
      try {
        localStorage.setItem('technicpet_processed_reports_v3', JSON.stringify({
          kpis: report.combinedKPIs,
          trendData: report.trendData,
          salesReps: salesData?.salesReps || emptyReports.salesReps,
          detailedSalesOrders: salesData?.detailedSalesOrders || emptyReports.detailedSalesOrders,
          docTypeBreakdowns: salesData?.docTypeBreakdowns || emptyReports.docTypeBreakdowns,
          topProducts: salesData?.topProducts || emptyReports.topProducts,
          topSpenders: salesData?.topSpenders || emptyReports.topSpenders,
          newCustomers: salesData?.newCustomers || emptyReports.newCustomers,
          customerSummary: salesData?.customerSummary || emptyReports.customerSummary,
          salesWeeklyTrend: salesData?.salesWeeklyTrend || emptyReports.salesWeeklyTrend,
          salesCategoryMix: salesData?.salesCategoryMix || emptyReports.salesCategoryMix,
          salesSummary: salesData?.salesSummary || emptyReports.salesSummary,
          warehouseDocs: warehouseData?.warehouseDocs || emptyReports.warehouseDocs,
          warehouseSummary: warehouseData?.warehouseSummary || emptyReports.warehouseSummary,
          deliveryTrips: deliveryData?.deliveryTrips || emptyReports.deliveryTrips,
          deliverySummary: deliveryData?.deliverySummary || emptyReports.deliverySummary,
          _source: 'google_sheet_real',
        }));
      } catch (e) {
        console.warn('Could not persist synchronized reports:', e);
      }

      if (!report.allSucceeded) {
        setSyncErrors(report.errors);
      }
    } catch (err: any) {
      console.error('Sync all error:', err);
    } finally {
      setSyncingState({ sales: false, warehouse: false, delivery: false, all: false });
    }
  };

  const handleSearchDoc = (docNo: string) => {
    setSelectedDocForTracking(docNo);
  };

  // If user is not logged in, render Login View
  if (!currentUser) {
    if (isRestoringAuth) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-sm">
          กำลังตรวจสอบสิทธิ์การเข้าใช้งาน...
        </div>
      );
    }
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col md:flex-row text-slate-800 font-['Prompt','Plus_Jakarta_Sans',sans-serif]">
      {/* Mobile Top Bar */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="font-bold text-slate-900 text-base">Technic Pet</span>
        </div>
        <span className="text-xs text-slate-500 font-semibold bg-slate-100 px-2 py-0.5 rounded">
          KPI Management
        </span>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar for Desktop & Mobile Drawer */}
      <div className={`
        fixed inset-y-0 left-0 z-40 transform md:transform-none md:relative transition-transform duration-200 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <Sidebar
          currentScreen={currentScreen}
          currentUser={currentUser}
          onSelectScreen={(screen) => {
            navigate(screen);
            setMobileMenuOpen(false);
          }}
          onOpenNewReport={() => {
            setIsNewReportOpen(true);
            setMobileMenuOpen(false);
          }}
          onOpenSettings={() => {
            setIsSettingsOpen(true);
            setMobileMenuOpen(false);
          }}
          onLogout={handleLogout}
          onOpenGoogleSheetsModal={() => {
            handleOpenGoogleSheetsModal('all');
            setMobileMenuOpen(false);
          }}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header */}
        <Header
          currentScreen={currentScreen}
          currentUser={currentUser}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenHelp={() => setIsHelpOpen(true)}
          onOpenProfile={() => setIsProfileOpen(true)}
        />

        {/* Screen Content */}
        <main className="flex-1 pb-16">
          {kpiSettingsError && <div role="alert" className="m-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{kpiSettingsError}</div>}
          {!permitted(currentScreen) && <p role="alert" className="p-8 text-rose-700">คุณไม่มีสิทธิ์ดูรายงานนี้ กรุณาเลือกเมนูของแผนกที่ได้รับอนุญาต</p>}
          {currentScreen === 'overview' && permitted('overview') && (
            <ExecutiveOverview
              kpis={kpis}
              trendData={trendData}
              onSearchDoc={handleSearchDoc}
              warehouseDocs={permitted('warehouse') ? warehouseDocs : []}
              deliveryTrips={permitted('delivery') ? deliveryTrips : []}
              salesReps={permitted('sales') ? salesReps : []}
              detailedOrders={permitted('sales') ? detailedSalesOrders : []}
              salesSummary={permitted('sales') ? salesSummary : undefined}
              warehouseSummary={permitted('warehouse') ? warehouseSummary : undefined}
              deliverySummary={permitted('delivery') ? deliverySummary : undefined}
              onNavigateScreen={navigate}
              onExportPDF={(dept, startDate, endDate) => handleOpenPDFReport(dept || 'overview', startDate, endDate)}
              onOpenGoogleSheetsModal={() => handleOpenGoogleSheetsModal('all')}
              currentUser={currentUser}
              onSyncAllDepartments={handleSyncAllDepartments}
              isSyncingAll={syncingState.all}
              syncErrors={syncErrors}
            />
          )}

          {currentScreen === 'sales' && permitted('sales') && (
            <SalesReportView
              salesReps={permitted('sales') ? salesReps : []}
              weeklyTrend={salesWeeklyTrend}
              categoryMix={salesCategoryMix}
              topSpenders={permitted('sales') ? topSpenders : []}
              newCustomers={newCustomers}
              customerSummary={customerSummary}
              summary={salesSummary}
              docTypeBreakdowns={docTypeBreakdowns}
              topProducts={permitted('sales') ? topProducts : []}
              detailedOrders={permitted('sales') ? detailedSalesOrders : []}
              warehouseDocs={permitted('warehouse') ? warehouseDocs : []}
              deliveryTrips={permitted('delivery') ? deliveryTrips : []}
              onSelectDoc={handleSearchDoc}
              onOpenExportModal={() => setIsNewReportOpen(true)}
              onOpenPDFReport={(startDate, endDate, filters) => handleOpenPDFReport('sales', startDate, endDate, filters)}
              onOpenGoogleSheetsModal={() => handleOpenGoogleSheetsModal('sales')}
              currentUser={currentUser}
              onSyncSales={() => handleSyncSales()}
              isSyncingSales={syncingState.sales}
              syncErrorSales={syncErrors.sales}
              lastSyncSales={filesState.salesLastSync}
            />
          )}

          {currentScreen === 'warehouse' && permitted('warehouse') && (
            <WarehouseReportView
              docs={warehouseDocs}
              detailedOrders={permitted('sales') ? detailedSalesOrders : []}
              onSelectDoc={handleSearchDoc}
              summary={warehouseSummary}
              onOpenPDFReport={(startDate, endDate, filters) => handleOpenPDFReport('warehouse', startDate, endDate, filters)}
              onOpenGoogleSheetsModal={() => handleOpenGoogleSheetsModal('warehouse')}
              currentUser={currentUser}
              onSyncWarehouse={() => handleSyncWarehouse()}
              isSyncingWarehouse={syncingState.warehouse}
              syncErrorWarehouse={syncErrors.warehouse}
              lastSyncWarehouse={filesState.warehouseLastSync}
            />
          )}

          {currentScreen === 'delivery' && permitted('delivery') && (
            <DeliveryReportView
              trips={deliveryTrips}
              detailedSalesOrders={permitted('sales') ? detailedSalesOrders : []}
              onSelectDoc={handleSearchDoc}
              summary={deliverySummary}
              onOpenPDFReport={(startDate, endDate, filters) => handleOpenPDFReport('delivery', startDate, endDate, filters)}
              onOpenGoogleSheetsModal={() => handleOpenGoogleSheetsModal('delivery')}
              currentUser={currentUser}
              onSyncDelivery={() => handleSyncDelivery()}
              isSyncingDelivery={syncingState.delivery}
              syncErrorDelivery={syncErrors.delivery}
              lastSyncDelivery={filesState.deliveryLastSync}
            />
          )}
        </main>
      </div>

      {/* Modals & Dialogs */}
      <DocumentTrackingModal
        docNo={selectedDocForTracking}
        warehouseDocs={permitted('warehouse') ? warehouseDocs : []}
        deliveryTrips={permitted('delivery') ? deliveryTrips : []}
        detailedSalesOrders={permitted('sales') ? detailedSalesOrders : []}
        onClose={() => setSelectedDocForTracking(null)}
      />

      <NewReportModal
        isOpen={isNewReportOpen}
        onClose={() => setIsNewReportOpen(false)}
        detailedSalesOrders={permitted('sales') ? detailedSalesOrders : []}
        salesReps={permitted('sales') ? salesReps : []}
        warehouseDocs={permitted('warehouse') ? warehouseDocs : []}
        deliveryTrips={permitted('delivery') ? deliveryTrips : []}
        topProducts={permitted('sales') ? topProducts : []}
        topSpenders={permitted('sales') ? topSpenders : []}
        kpis={kpis}
        currentUser={currentUser}
        onOpenPDFPreview={(dept, sDate, eDate) => handleOpenPDFReport(dept, sDate, eDate)}
      />

      <PDFReportPreviewModal
        isOpen={isPDFPreviewOpen && canAccessReport(currentUser, selectedDeptForPDF)}
        onClose={() => setIsPDFPreviewOpen(false)}
        department={selectedDeptForPDF}
        startDate={reportDateRange.start}
        endDate={reportDateRange.end}
        reportFilters={reportFilters}
        detailedSalesOrders={permitted('sales') ? detailedSalesOrders : []}
        salesReps={permitted('sales') ? salesReps : []}
        warehouseDocs={permitted('warehouse') ? warehouseDocs : []}
        deliveryTrips={permitted('delivery') ? deliveryTrips : []}
        topProducts={permitted('sales') ? topProducts : []}
        topSpenders={permitted('sales') ? topSpenders : []}
        salesSummary={permitted('sales') ? salesSummary : undefined}
        warehouseSummary={permitted('warehouse') ? warehouseSummary : undefined}
        deliverySummary={permitted('delivery') ? deliverySummary : undefined}
        kpis={kpis}
        currentUser={currentUser}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentUser={currentUser}
        onUpdateUser={handleUpdateUser}
        onClearCacheAndReset={handleClearCacheAndReset}
      />

      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        currentUser={currentUser}
        onClose={() => setIsProfileOpen(false)}
        onLogout={handleLogout}
        onUpdateUser={handleUpdateUser}
      />

      {/* Google Sheets Integration Modal per Department */}
      <GoogleSheetIntegrationModal
        isOpen={isGoogleSheetsModalOpen && canConfigureDepartmentSheet(currentUser.role, googleSheetTargetDept) && (googleSheetTargetDept === 'all' || permitted(googleSheetTargetDept))}
        onClose={() => setIsGoogleSheetsModalOpen(false)}
        filesState={filesState}
        onUpdateFiles={handleUpdateFiles}
        onProcessComplete={handleProcessComplete}
        targetDepartment={googleSheetTargetDept}
        currentUser={currentUser}
      />
    </div>
  );
}

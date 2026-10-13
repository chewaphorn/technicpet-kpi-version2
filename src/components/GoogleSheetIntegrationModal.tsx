import React, { useState, useEffect } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  TrendingUp, 
  Warehouse, 
  Truck, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  HelpCircle, 
  Database, 
  Check,
  Link as LinkIcon,
  Zap,
  Clock
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { UploadedFileState, AuthUser } from '../types';
import { 
  fetchSingleDepartmentSheet, 
  extractSpreadsheetInfo, 
  sanitizeGoogleSheetUrl,
  SHEET_CACHE_TTL_MS
} from '../utils/googleSheets';
import { processImportedFiles, ProcessedDepartmentReports } from '../utils/dataProcessor';
import { saveImportBatchToFirestore, saveKPISummaryToFirestore } from '../lib/firebase';
import { canConfigureDepartmentSheet, canAccessScreen } from '../lib/authControl';
import { syncSalesData, syncWarehouseData, syncDeliveryData, saveDepartmentUrl, clearDepartmentCache } from '../utils/departmentSyncService';

interface GoogleSheetIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  filesState: UploadedFileState;
  onUpdateFiles: (newState: Partial<UploadedFileState>) => void;
  onProcessComplete: (processed: ProcessedDepartmentReports) => void;
  targetDepartment?: 'all' | 'sales' | 'warehouse' | 'delivery';
  currentUser?: AuthUser | null;
}

export const GoogleSheetIntegrationModal: React.FC<GoogleSheetIntegrationModalProps> = ({
  isOpen,
  onClose,
  filesState,
  onUpdateFiles,
  onProcessComplete,
  targetDepartment = 'all',
  currentUser,
}) => {
  const isAdmin = currentUser?.role === 'admin';

  // Resolve permitted department based on user role and targetDepartment
  const resolveInitialDept = (): 'all' | 'sales' | 'warehouse' | 'delivery' => {
    if (!isAdmin) {
      if (currentUser?.role === 'sales_manager') return 'sales';
      if (currentUser?.role === 'warehouse_supervisor') return 'warehouse';
      if (currentUser?.role === 'logistics_coordinator') return 'delivery';
      if (targetDepartment === 'warehouse') return 'warehouse';
      if (targetDepartment === 'delivery') return 'delivery';
      return 'sales';
    }
    if (targetDepartment === 'sales' || targetDepartment === 'warehouse' || targetDepartment === 'delivery') {
      return targetDepartment;
    }
    return 'all';
  };

  const [activeTab, setActiveTab] = useState<'all' | 'sales' | 'warehouse' | 'delivery'>('all');

  // Department Sheet URLs
  const [salesUrl, setSalesUrl] = useState('');
  const [warehouseUrl, setWarehouseUrl] = useState('');
  const [deliveryUrl, setDeliveryUrl] = useState('');

  // Status Indicators: 'connected' | 'invalid' | 'unlinked'
  const [salesStatus, setSalesStatus] = useState<'connected' | 'invalid' | 'unlinked'>('unlinked');
  const [warehouseStatus, setWarehouseStatus] = useState<'connected' | 'invalid' | 'unlinked'>('unlinked');
  const [deliveryStatus, setDeliveryStatus] = useState<'connected' | 'invalid' | 'unlinked'>('unlinked');

  // Performance & Caching Settings: Default to true so user always gets the latest fresh data when syncing
  const [forceRefresh, setForceRefresh] = useState(true);

  // Sync state & progress
  const [isSyncing, setIsSyncing] = useState(false);
  const [singleSyncingDept, setSingleSyncingDept] = useState<'sales' | 'warehouse' | 'delivery' | null>(null);
  const [syncStep, setSyncStep] = useState<string>('');
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [inaccessibleAlert, setInaccessibleAlert] = useState<{
    departments: string[];
    message: string;
  } | null>(null);

  const [syncResult, setSyncResult] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
    details?: string;
  } | null>(null);

  // Load saved links from localStorage or filesState on open
  useEffect(() => {
    if (isOpen) {
      setActiveTab(resolveInitialDept());
      const savedSales = localStorage.getItem('sales_sheet_url') || localStorage.getItem('technicpet_sheet_sales_url') || filesState.salesSheetUrl || '';
      const savedWarehouse = localStorage.getItem('warehouse_sheet_url') || localStorage.getItem('technicpet_sheet_warehouse_url') || filesState.warehouseSheetUrl || '';
      const savedDelivery = localStorage.getItem('delivery_sheet_url') || localStorage.getItem('technicpet_sheet_delivery_url') || filesState.deliverySheetUrl || '';

      // Auto-sanitize on load
      const cleanSavedSales = sanitizeGoogleSheetUrl(savedSales);
      const cleanSavedWarehouse = sanitizeGoogleSheetUrl(savedWarehouse);
      const cleanSavedDelivery = sanitizeGoogleSheetUrl(savedDelivery);

      setSalesUrl(cleanSavedSales);
      setWarehouseUrl(cleanSavedWarehouse);
      setDeliveryUrl(cleanSavedDelivery);

      setSalesStatus(cleanSavedSales.trim() ? (filesState.salesSheetStatus || 'connected') : 'unlinked');
      setWarehouseStatus(cleanSavedWarehouse.trim() ? (filesState.warehouseSheetStatus || 'connected') : 'unlinked');
      setDeliveryStatus(cleanSavedDelivery.trim() ? (filesState.deliverySheetStatus || 'connected') : 'unlinked');

      setSyncResult(null);
      setInaccessibleAlert(null);
      setSyncProgress(0);
    }
  }, [isOpen, filesState, targetDepartment, currentUser]);

  if (!isOpen) return null;

  // Validate URL format helper with regex sanitization check
  const checkUrlFormat = (url: string): 'connected' | 'invalid' | 'unlinked' => {
    const trimmed = url.trim();
    if (!trimmed) return 'unlinked';
    const sanitized = sanitizeGoogleSheetUrl(trimmed);
    const info = extractSpreadsheetInfo(sanitized);
    return (info.id && info.id.length >= 10) || trimmed.startsWith('http') ? 'connected' : 'invalid';
  };

  const handleSalesUrlChange = (val: string) => {
    const sanitized = sanitizeGoogleSheetUrl(val);
    setSalesUrl(sanitized || val);
    setSalesStatus(checkUrlFormat(sanitized || val));
  };

  const handleWarehouseUrlChange = (val: string) => {
    const sanitized = sanitizeGoogleSheetUrl(val);
    setWarehouseUrl(sanitized || val);
    setWarehouseStatus(checkUrlFormat(sanitized || val));
  };

  const handleDeliveryUrlChange = (val: string) => {
    const sanitized = sanitizeGoogleSheetUrl(val);
    setDeliveryUrl(sanitized || val);
    setDeliveryStatus(checkUrlFormat(sanitized || val));
  };

  /**
   * Sync a single department independently without fetching other departments simultaneously
   */
  const handleSyncSingleDepartment = async (dept: 'sales' | 'warehouse' | 'delivery') => {
    if (!currentUser || !canConfigureDepartmentSheet(currentUser.role, dept) || !canAccessScreen(currentUser.role, dept, currentUser.allowedScreens)) return;
    const rawUrl = dept === 'sales' ? salesUrl : dept === 'warehouse' ? warehouseUrl : deliveryUrl;
    const cleanUrl = sanitizeGoogleSheetUrl(rawUrl.trim());
    const deptThaiName = dept === 'sales' ? 'ฝ่ายขาย' : dept === 'warehouse' ? 'ฝ่ายคลังสินค้า' : 'ฝ่ายขนส่ง';

    if (!cleanUrl) {
      setSyncResult({
        type: 'error',
        message: `กรุณาวางลิงก์ Google Sheet ของ${deptThaiName}`,
        details: 'กรุณาระบุ URL Google Sheet ที่ต้องการดึงข้อมูล',
      });
      return;
    }

    setSingleSyncingDept(dept);
    setIsSyncing(true);
    setSyncProgress(30);
    setSyncStep(`กำลังเชื่อมต่อและดึงข้อมูลของ${deptThaiName}...`);
    setSyncResult(null);
    setInaccessibleAlert(null);

    try {
      const tabType = dept === 'warehouse' ? 'picking' : dept;
      const fallbackTab = dept === 'sales' ? 'ใบสั่งซื้อ_SalesOrder' : dept === 'warehouse' ? 'ใบจัดสินค้า_PickingList' : 'ป้ายจัดส่ง_DeliveryTag';

      setSyncProgress(60);
      const sync = dept === 'sales' ? syncSalesData : dept === 'warehouse' ? syncWarehouseData : syncDeliveryData;
      const result = await sync(cleanUrl, { forceRefresh, fallbackTab: fallbackTab });
      if (!result.success) throw new Error(result.error);
      const parsed = result.parsed;

      if (!parsed || parsed.rowCount === 0) {
        throw new Error(`ไม่พบข้อมูลใน Google Sheet ของ${deptThaiName} หรือชีตว่างเปล่า`);
      }

      if (dept === 'sales') setSalesStatus('connected');
      if (dept === 'warehouse') setWarehouseStatus('connected');
      if (dept === 'delivery') setDeliveryStatus('connected');

      const nowTimeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // Invalidate localStorage reports cache
      try {
        localStorage.removeItem('technicpet_processed_reports_v2');
      } catch (e) {
        console.warn('Cache clear error:', e);
      }

      const updatedFilesState: UploadedFileState = {
        ...filesState,
        importSource: 'googlesheet',
        googleSheetConnected: true,
        salesSheetUrl: dept === 'sales' ? cleanUrl : (filesState.salesSheetUrl || salesUrl),
        warehouseSheetUrl: dept === 'warehouse' ? cleanUrl : (filesState.warehouseSheetUrl || warehouseUrl),
        deliverySheetUrl: dept === 'delivery' ? cleanUrl : (filesState.deliverySheetUrl || deliveryUrl),
        salesLastSync: dept === 'sales' ? nowTimeStr : filesState.salesLastSync,
        warehouseLastSync: dept === 'warehouse' ? nowTimeStr : filesState.warehouseLastSync,
        deliveryLastSync: dept === 'delivery' ? nowTimeStr : filesState.deliveryLastSync,
        lastProcessedAt: nowTimeStr,
        ...(dept === 'sales' ? {
          salesOrderFile: null,
          salesOrderFileName: parsed.fileName || 'GoogleSheet_SalesOrder.csv',
          salesOrderSize: parsed.fileSize,
          salesOrderParsed: parsed,
          salesSheetStatus: 'connected' as const,
        } : {}),
        ...(dept === 'warehouse' ? {
          pickingListFile: null,
          pickingListFileName: parsed.fileName || 'GoogleSheet_PickingList.csv',
          pickingListSize: parsed.fileSize,
          pickingListParsed: parsed,
          warehouseSheetStatus: 'connected' as const,
        } : {}),
        ...(dept === 'delivery' ? {
          deliveryTagFile: null,
          deliveryTagFileName: parsed.fileName || 'GoogleSheet_DeliveryTag.csv',
          deliveryTagSize: parsed.fileSize,
          deliveryTagParsed: parsed,
          deliverySheetStatus: 'connected' as const,
        } : {}),
      };

      setSyncProgress(85);
      const computedReports = processImportedFiles(updatedFilesState);
      onUpdateFiles(updatedFilesState);
      onProcessComplete(computedReports);
      setSyncProgress(100);

      const cacheNote = parsed._fromCache ? ' [⚡ แคชความเร็วสูง]' : '';

      setSyncResult({
        type: 'success',
        message: `ดึงข้อมูล${deptThaiName}สำเร็จเรียบร้อย! (${parsed.rowCount.toLocaleString()} รายการ)${cacheNote}`,
        details: `อัปเดตรายงานและคำนวณแดชบอร์ดให้ทันที โดยไม่ต้องดึงแผนกอื่นพร้อมกัน (เวลา ${nowTimeStr})`,
      });

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 }
      });
    } catch (err: any) {
      console.error(`Fetch single dept ${dept} error:`, err);
      if (dept === 'sales') setSalesStatus('invalid');
      if (dept === 'warehouse') setWarehouseStatus('invalid');
      if (dept === 'delivery') setDeliveryStatus('invalid');

      setInaccessibleAlert({
        departments: [deptThaiName],
        message: `โปรดเปิดสิทธิ์แชร์ใน Google Sheets เป็น 'ทุกคนที่มีลิงก์มีสิทธิ์ดู' (Anyone with the link can view)`,
      });

      setSyncResult({
        type: 'error',
        message: `เกิดข้อผิดพลาดในการดึงข้อมูล${deptThaiName}: ${err?.message || 'ไม่สามารถเชื่อมต่อได้'}`,
        details: 'กรุณาตรวจสอบว่าได้ตั้งค่าแชร์ใน Google Sheet เป็น "ทุกคนที่มีลิงก์มีสิทธิ์ดู" (Anyone with link - Viewer)',
      });
    } finally {
      setIsSyncing(false);
      setSingleSyncingDept(null);
      setSyncStep('');
    }
  };

  /**
   * Sync and Process Data from Google Sheets using Parallel Fetching and Caching
   */
  const handleSyncAndProcess = async () => {
    if (currentUser?.role !== 'admin') return;
    // 1. Sanitize input URLs: clean duplicate URLs and extract proper Sheet ID and gid
    const cleanSales = sanitizeGoogleSheetUrl(salesUrl.trim());
    const cleanWarehouse = sanitizeGoogleSheetUrl(warehouseUrl.trim());
    const cleanDelivery = sanitizeGoogleSheetUrl(deliveryUrl.trim());

    // Update input fields with cleaned URLs
    if (cleanSales !== salesUrl) setSalesUrl(cleanSales);
    if (cleanWarehouse !== warehouseUrl) setWarehouseUrl(cleanWarehouse);
    if (cleanDelivery !== deliveryUrl) setDeliveryUrl(cleanDelivery);

    if (!cleanSales && !cleanWarehouse && !cleanDelivery) {
      setSyncResult({
        type: 'error',
        message: 'กรุณาระบุ URL ของ Google Sheet ประจำแผนกอย่างน้อย 1 แผนก',
        details: 'ระบุ URL ของ Google Sheet สำหรับฝ่ายขาย คลังสินค้า หรือการจัดส่งอย่างน้อย 1 แผนก',
      });
      return;
    }

    setIsSyncing(true);
    setSyncProgress(15);
    setSyncStep('1/3 ตรวจสอบและจัดระเบียบ URL (Sanitization & Validation)...');
    setSyncResult(null);
    setInaccessibleAlert(null);

    try {
      // A failed or unlinked sheet must not fall back to the previous
      // department snapshot; that stale data is what makes Overview disagree
      // with the current department reports.
      let salesParsed = cleanSales ? filesState.salesOrderParsed : undefined;
      let pickingParsed = cleanWarehouse ? filesState.pickingListParsed : undefined;
      let deliveryParsed = cleanDelivery ? filesState.deliveryTagParsed : undefined;

      let salesOk = false;
      let warehouseOk = false;
      let deliveryOk = false;

      setSyncProgress(35);
      setSyncStep('2/3 กำลังดึงข้อมูลทั้ง 3 แผนกพร้อมกันแบบขนาน (Parallel Fetching)...');

      // 2. Parallel Fetching with Promise.all
      const [salesRes, warehouseRes, deliveryRes] = await Promise.all([
        cleanSales
          ? syncSalesData(cleanSales, { forceRefresh })
              .then((result) => ({ ok: result.success, data: result.parsed, error: result.error }))
              .catch((err) => ({ ok: false, data: null, error: err }))
          : Promise.resolve({ ok: false, data: null, error: null, unlinked: true }),

        cleanWarehouse
          ? syncWarehouseData(cleanWarehouse, { forceRefresh })
              .then((result) => ({ ok: result.success, data: result.parsed, error: result.error }))
              .catch((err) => ({ ok: false, data: null, error: err }))
          : Promise.resolve({ ok: false, data: null, error: null, unlinked: true }),

        cleanDelivery
          ? syncDeliveryData(cleanDelivery, { forceRefresh })
              .then((result) => ({ ok: result.success, data: result.parsed, error: result.error }))
              .catch((err) => ({ ok: false, data: null, error: err }))
          : Promise.resolve({ ok: false, data: null, error: null, unlinked: true }),
      ]);

      const failedDepartments: string[] = [];
      let cachedCount = 0;

      // Handle Sales Result
      if (cleanSales) {
        if (salesRes.ok && salesRes.data && salesRes.data.rowCount > 0) {
          salesParsed = salesRes.data;
          salesOk = true;
          setSalesStatus('connected');
          if (salesRes.data._fromCache) cachedCount++;
        } else {
          setSalesStatus('invalid');
          salesParsed = undefined;
          failedDepartments.push('ฝ่ายขาย (Sales)');
        }
      } else {
        setSalesStatus('unlinked');
      }

      // Handle Warehouse Result
      if (cleanWarehouse) {
        if (warehouseRes.ok && warehouseRes.data && warehouseRes.data.rowCount > 0) {
          pickingParsed = warehouseRes.data;
          warehouseOk = true;
          setWarehouseStatus('connected');
          if (warehouseRes.data._fromCache) cachedCount++;
        } else {
          setWarehouseStatus('invalid');
          pickingParsed = undefined;
          failedDepartments.push('คลังสินค้า (Warehouse)');
        }
      } else {
        setWarehouseStatus('unlinked');
      }

      // Handle Delivery Result
      if (cleanDelivery) {
        if (deliveryRes.ok && deliveryRes.data && deliveryRes.data.rowCount > 0) {
          deliveryParsed = deliveryRes.data;
          deliveryOk = true;
          setDeliveryStatus('connected');
          if (deliveryRes.data._fromCache) cachedCount++;
        } else {
          setDeliveryStatus('invalid');
          deliveryParsed = undefined;
          failedDepartments.push('การจัดส่ง (Delivery)');
        }
      } else {
        setDeliveryStatus('unlinked');
      }

      // If any department failed to access, show clear alert as requested
      if (failedDepartments.length > 0) {
        setInaccessibleAlert({
          departments: failedDepartments,
          message: `โปรดเปิดสิทธิ์แชร์ใน Google Sheets เป็น 'ทุกคนที่มีลิงก์มีสิทธิ์ดู' (Anyone with the link can view)`,
        });
      }

      const hasRealSales = Boolean(salesParsed && salesParsed.rowCount > 0);
      const hasRealPicking = Boolean(pickingParsed && pickingParsed.rowCount > 0);
      const hasRealDelivery = Boolean(deliveryParsed && deliveryParsed.rowCount > 0);

      if (!hasRealSales && !hasRealPicking && !hasRealDelivery) {
        throw new Error('ไม่พบข้อมูลจริงจาก Google Sheet ที่ระบุ กรุณาตรวจสอบลิงก์และสิทธิ์การเข้าถึง');
      } else {
        // If we have real sales orders but no dedicated picking sheet was uploaded/linked,
        // clear pickingParsed so dataProcessor will automatically derive warehouse docs from the real sales orders
        if (hasRealSales && (!pickingParsed || pickingParsed.rowCount === 0)) {
          pickingParsed = undefined;
        }
        // If we have real sales orders but no dedicated delivery sheet was uploaded/linked,
        // clear deliveryParsed so dataProcessor will automatically derive delivery trips from the real sales orders
        if (hasRealSales && (!deliveryParsed || deliveryParsed.rowCount === 0)) {
          deliveryParsed = undefined;
        }
      }

      // Invalidate the old processed reports cache to ensure freshly calculated data is stored and displayed
      try {
        localStorage.removeItem('technicpet_processed_reports_v2');
      } catch (e) {
        console.warn('Cache clear error:', e);
      }

      setSyncProgress(80);
      setSyncStep('3/3 กำลังคำนวณและอัปเดต Executive Overview Dashboard...');

      const nowTimeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const updatedFilesState: UploadedFileState = {
        ...filesState,
        importSource: 'googlesheet',
        salesSheetUrl: cleanSales,
        warehouseSheetUrl: cleanWarehouse,
        deliverySheetUrl: cleanDelivery,
        salesSheetStatus: cleanSales ? (salesOk ? 'connected' : 'invalid') : 'unlinked',
        warehouseSheetStatus: cleanWarehouse ? (warehouseOk ? 'connected' : 'invalid') : 'unlinked',
        deliverySheetStatus: cleanDelivery ? (deliveryOk ? 'connected' : 'invalid') : 'unlinked',
        googleSheetConnected: salesOk || warehouseOk || deliveryOk,
        salesOrderParsed: salesParsed,
        salesOrderFileName: salesParsed?.fileName || 'GoogleSheet_SalesOrder.csv',
        pickingListParsed: pickingParsed,
        pickingListFileName: pickingParsed ? (pickingParsed.fileName || 'GoogleSheet_PickingList.csv') : undefined,
        deliveryTagParsed: deliveryParsed,
        deliveryTagFileName: deliveryParsed ? (deliveryParsed.fileName || 'GoogleSheet_DeliveryTag.csv') : undefined,
        lastProcessedAt: nowTimeStr,
      };

      // Process reports
      const computedReports = processImportedFiles(updatedFilesState);

      // Pass updated state to App
      onUpdateFiles(updatedFilesState);
      onProcessComplete(computedReports);

      // Background save to Firestore
      try {
        await saveImportBatchToFirestore({
          importedBy: 'google_sheets_sync',
          salesFileName: salesParsed?.fileName || null,
          salesRowCount: salesParsed?.rowCount || 0,
          pickingFileName: pickingParsed?.fileName || null,
          pickingRowCount: computedReports.warehouseDocs.length,
          deliveryFileName: deliveryParsed?.fileName || null,
          deliveryRowCount: computedReports.deliveryTrips.length,
          status: 'PROCESSED_SUCCESS',
          kpiSnapshot: {
            onTimeRate: computedReports.deliverySummary.otdPercent,
            totalOrders: computedReports.kpis.totalOrders,
            completedOrders: computedReports.kpis.completedOrders,
            pendingOrders: computedReports.kpis.pendingOrders,
          }
        });
        await saveKPISummaryToFirestore(new Date().toISOString().slice(0, 10), {
          onTimePercentage: computedReports.deliverySummary.otdPercent,
          averageDeliveryDays: computedReports.deliverySummary.avgDeliveryDays,
          totalOrders: computedReports.kpis.totalOrders,
          completedOrders: computedReports.kpis.completedOrders,
          totalSalesRevenue: computedReports.salesSummary.totalRevenueMillions,
        });
      } catch (e) {
        console.warn('Firestore background sync:', e);
      }

      setSyncProgress(100);

      const cacheNote = cachedCount > 0 ? ` [⚡ ใช้แคชความเร็วสูง ${cachedCount} แผนก]` : '';

      setSyncResult({
        type: failedDepartments.length > 0 ? 'warning' : 'success',
        message: failedDepartments.length > 0 
          ? `ประมวลผลข้อมูลเรียบร้อยแล้ว (บางแผนกใช้ข้อมูลสำรองเนื่องจากสิทธิ์แชร์)`
          : `ดึงข้อมูลและประมวลผลสำเร็จเรียบร้อยแล้ว!${cacheNote}`,
        details: `อัปเดต Executive Overview Dashboard ทันที: ${computedReports.salesSummary.totalOrdersCount.toLocaleString()} บิลขาย, ${computedReports.warehouseDocs.length} ใบจัดสินค้า, ${computedReports.deliveryTrips.length} เที่ยวจัดส่ง (เวลา ${nowTimeStr})`,
      });

      if (failedDepartments.length === 0) {
        confetti({
          particleCount: 75,
          spread: 70,
          origin: { y: 0.6 }
        });
      }

    } catch (err: any) {
      console.error('Sync error:', err);
      setSyncResult({
        type: 'error',
        message: err?.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลจาก Google Sheets',
        details: 'กรุณาตรวจสอบว่าได้ตั้งค่าแชร์ใน Google Sheet เป็น "ทุกคนที่มีลิงก์มีสิทธิ์ดู" (Anyone with link - Viewer)',
      });
    } finally {
      setIsSyncing(false);
      setSyncStep('');
    }
  };

  const handlePrimarySync = () => {
    if (activeTab === 'all') {
      handleSyncAndProcess();
    } else {
      handleSyncSingleDepartment(activeTab);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        id="modal-google-sheet-integration"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs ${
              activeTab === 'sales' ? 'bg-blue-100 text-blue-700' :
              activeTab === 'warehouse' ? 'bg-amber-100 text-amber-700' :
              activeTab === 'delivery' ? 'bg-purple-100 text-purple-700' :
              'bg-emerald-100 text-emerald-700'
            }`}>
              {activeTab === 'sales' && <TrendingUp className="w-5 h-5" />}
              {activeTab === 'warehouse' && <Warehouse className="w-5 h-5" />}
              {activeTab === 'delivery' && <Truck className="w-5 h-5" />}
              {activeTab === 'all' && <FileSpreadsheet className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>
                  {activeTab === 'sales' ? 'กำหนดลิงก์ Google Sheet ฝ่ายขาย' :
                   activeTab === 'warehouse' ? 'กำหนดลิงก์ Google Sheet แผนกคลังสินค้า' :
                   activeTab === 'delivery' ? 'กำหนดลิงก์ Google Sheet แผนกขนส่ง' :
                   'กำหนดลิงก์ Google Sheet รวมทุกแผนก (Executive All-in-One)'}
                </span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  activeTab === 'sales' ? 'bg-blue-100 text-blue-800' :
                  activeTab === 'warehouse' ? 'bg-amber-100 text-amber-800' :
                  activeTab === 'delivery' ? 'bg-purple-100 text-purple-800' :
                  'bg-emerald-100 text-emerald-800'
                }`}>
                  <Zap className="w-3 h-3" />
                  {activeTab === 'sales' ? 'แผนกฝ่ายขาย' :
                   activeTab === 'warehouse' ? 'แผนกคลังสินค้า' :
                   activeTab === 'delivery' ? 'แผนกขนส่ง' :
                   'สิทธิ์เฉพาะผู้บริหาร'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {activeTab === 'sales' ? 'เชื่อมต่อลิงก์ Google Sheet สำหรับดึงข้อมูลคำสั่งซื้อ, ยอดขายของฝ่ายขาย' :
                 activeTab === 'warehouse' ? 'เชื่อมต่อลิงก์ Google Sheet สำหรับดึงข้อมูลใบจัดสินค้า, Picking Time และบิลค้างจัด' :
                 activeTab === 'delivery' ? 'เชื่อมต่อลิงก์ Google Sheet สำหรับดึงข้อมูลจัดส่งและเที่ยวรถ' :
                 'จัดการลิงก์และดึงข้อมูลของทั้ง 3 แผนกพร้อมกันผ่าน Promise.all พร้อมระบบแคชความเร็วสูง'}
              </p>
            </div>
          </div>
          <button
            type="button"
            id="btn-close-sheet-modal"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher - Only visible for Admin */}
        {isAdmin && (
          <div className="flex items-center gap-1.5 px-6 py-2.5 bg-slate-100/90 border-b border-slate-200 overflow-x-auto text-xs font-semibold">
            <button
              type="button"
              id="tab-sheet-all"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-white text-emerald-800 shadow-2xs font-bold'
                  : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>รวมทุกแผนก (ผู้บริหาร)</span>
            </button>

            <button
              type="button"
              id="tab-sheet-sales"
              onClick={() => setActiveTab('sales')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'sales'
                  ? 'bg-white text-blue-800 shadow-2xs font-bold'
                  : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
              <span>ฝ่ายขาย</span>
            </button>

            <button
              type="button"
              id="tab-sheet-warehouse"
              onClick={() => setActiveTab('warehouse')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'warehouse'
                  ? 'bg-white text-amber-800 shadow-2xs font-bold'
                  : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
              }`}
            >
              <Warehouse className="w-3.5 h-3.5 text-amber-600" />
              <span>คลังสินค้า</span>
            </button>

            <button
              type="button"
              id="tab-sheet-delivery"
              onClick={() => setActiveTab('delivery')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'delivery'
                  ? 'bg-white text-purple-800 shadow-2xs font-bold'
                  : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
              }`}
            >
              <Truck className="w-3.5 h-3.5 text-purple-600" />
              <span>การจัดส่ง</span>
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Notice Banner */}
          <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200 flex items-start gap-3 text-xs text-blue-900">
            <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="font-semibold">ระบบตรวจจับ URL &amp; Caching:</strong> วางลิงก์ Google Sheet  
            </div>
          </div>

          {/* Inaccessible Permission Alert Warning */}
          {inaccessibleAlert && (
            <div className="p-4 bg-amber-50/90 border-2 border-amber-300 rounded-xl text-amber-950 flex items-start gap-3 shadow-xs animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5 text-xs">
                <p className="font-bold text-sm text-amber-950 flex items-center gap-2">
                  <span>โปรดเปิดสิทธิ์แชร์ใน Google Sheets เป็น 'ทุกคนที่มีลิงก์มีสิทธิ์ดู'</span>
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-amber-900 font-medium">
                  <span>แผนกที่พบปัญหา:</span>
                  {inaccessibleAlert.departments.map((dept, idx) => (
                    <span key={idx} className="bg-amber-200 text-amber-900 px-2 py-0.5 rounded-md font-bold">
                      {dept}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-amber-800 opacity-90 leading-relaxed">
                  <strong>ขั้นตอนแก้ไข:</strong> เปิดไฟล์ Google Sheet &gt; กดปุ่ม <strong>"แชร์ (Share)"</strong> มุมขวาบน &gt; เปลี่ยนการเข้าถึงทั่วไปเป็น <strong>"ทุกคนที่มีลิงก์ (Anyone with the link)"</strong> สิทธิ์: <strong>"ผู้มีสิทธิ์ดู (Viewer)"</strong> แล้วกดปุ่มดึงข้อมูลใหม่อีกครั้ง
                </p>
              </div>
            </div>
          )}

          {/* Department Input 1: Sales */}
          {(activeTab === 'all' || activeTab === 'sales') && (
            <div className="space-y-1.5 p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center">
                    <TrendingUp className="w-3 h-3" />
                  </div>
                  <span>ฝ่ายขาย (Sales Sheet URL)</span>
                </label>
                {/* Status Badge */}
                {salesStatus === 'connected' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Connected
                  </span>
                )}
                {salesStatus === 'invalid' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    Invalid Link
                  </span>
                )}
                {salesStatus === 'unlinked' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                    Unlinked
                  </span>
                )}
              </div>
               
              <div className="relative mt-1">
                <input
                  id="input-sales-sheet-url"
                  type="text"
                  value={salesUrl}
                  onChange={(e) => handleSalesUrlChange(e.target.value)}
                  onBlur={() => {
                    const cleaned = sanitizeGoogleSheetUrl(salesUrl);
                    if (cleaned && cleaned !== salesUrl) setSalesUrl(cleaned);
                  }}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0"
                  className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg pl-3 pr-8 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800"
                />
                <LinkIcon className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="btn-sync-dept-sales"
                    disabled={isSyncing || !salesUrl.trim()}
                    onClick={() => handleSyncSingleDepartment('sales')}
                    className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-lg font-bold text-xs shadow-xs transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${singleSyncingDept === 'sales' ? 'animate-spin' : ''}`} />
                    <span>{singleSyncingDept === 'sales' ? 'กำลังดึง...' : 'ดึงเฉพาะข้อมูลฝ่ายขาย'}</span>
                  </button>
                  {salesUrl.trim() && (
                    <a
                      href={salesUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-blue-700 hover:text-blue-900 font-semibold inline-flex items-center gap-1 hover:underline px-2 py-1 rounded bg-blue-50"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>เปิดชีตจริง</span>
                    </a>
                  )}
                </div>
                {filesState.salesOrderParsed?.rowCount ? (
                  <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-600" />
                    โหลดแล้ว {filesState.salesOrderParsed.rowCount} รายการ {filesState.salesLastSync ? `(${filesState.salesLastSync})` : ''}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">ยังไม่ได้ดึงข้อมูล</span>
                )}
              </div>
            </div>
          )}

          {/* Department Input 2: Warehouse */}
          {(activeTab === 'all' || activeTab === 'warehouse') && (
            <div className="space-y-1.5 p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
                    <Warehouse className="w-3 h-3" />
                  </div>
                  <span>คลังสินค้า (Warehouse Sheet URL)</span>
                </label>
                {/* Status Badge */}
                {warehouseStatus === 'connected' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Connected
                  </span>
                )}
                {warehouseStatus === 'invalid' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    Invalid Link
                  </span>
                )}
                {warehouseStatus === 'unlinked' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                    Unlinked
                  </span>
                )}
              </div>
              
              <div className="relative mt-1">
                <input
                  id="input-warehouse-sheet-url"
                  type="text"
                  value={warehouseUrl}
                  onChange={(e) => handleWarehouseUrlChange(e.target.value)}
                  onBlur={() => {
                    const cleaned = sanitizeGoogleSheetUrl(warehouseUrl);
                    if (cleaned && cleaned !== warehouseUrl) setWarehouseUrl(cleaned);
                  }}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=1"
                  className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg pl-3 pr-8 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800"
                />
                <LinkIcon className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="btn-sync-dept-warehouse"
                    disabled={isSyncing || !warehouseUrl.trim()}
                    onClick={() => handleSyncSingleDepartment('warehouse')}
                    className="py-1.5 px-3 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-lg font-bold text-xs shadow-xs transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${singleSyncingDept === 'warehouse' ? 'animate-spin' : ''}`} />
                    <span>{singleSyncingDept === 'warehouse' ? 'กำลังดึง...' : 'ดึงเฉพาะข้อมูลคลังสินค้า'}</span>
                  </button>
                  {warehouseUrl.trim() && (
                    <a
                      href={warehouseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-amber-700 hover:text-amber-900 font-semibold inline-flex items-center gap-1 hover:underline px-2 py-1 rounded bg-amber-50"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>เปิดชีตจริง</span>
                    </a>
                  )}
                </div>
                {filesState.pickingListParsed?.rowCount ? (
                  <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-600" />
                    โหลดแล้ว {filesState.pickingListParsed.rowCount} รายการ {filesState.warehouseLastSync ? `(${filesState.warehouseLastSync})` : ''}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">ยังไม่ได้ดึงข้อมูล</span>
                )}
              </div>
            </div>
          )}

          {/* Department Input 3: Delivery */}
          {(activeTab === 'all' || activeTab === 'delivery') && (
            <div className="space-y-1.5 p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center">
                    <Truck className="w-3 h-3" />
                  </div>
                  <span>การจัดส่ง (Delivery Sheet URL)</span>
                </label>
                {/* Status Badge */}
                {deliveryStatus === 'connected' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Connected
                  </span>
                )}
                {deliveryStatus === 'invalid' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    Invalid Link
                  </span>
                )}
                {deliveryStatus === 'unlinked' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                    Unlinked
                  </span>
                )}
              </div>
              
              <div className="relative mt-1">
                <input
                  id="input-delivery-sheet-url"
                  type="text"
                  value={deliveryUrl}
                  onChange={(e) => handleDeliveryUrlChange(e.target.value)}
                  onBlur={() => {
                    const cleaned = sanitizeGoogleSheetUrl(deliveryUrl);
                    if (cleaned && cleaned !== deliveryUrl) setDeliveryUrl(cleaned);
                  }}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=2"
                  className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg pl-3 pr-8 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800"
                />
                <LinkIcon className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="btn-sync-dept-delivery"
                    disabled={isSyncing || !deliveryUrl.trim()}
                    onClick={() => handleSyncSingleDepartment('delivery')}
                    className="py-1.5 px-3 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-lg font-bold text-xs shadow-xs transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${singleSyncingDept === 'delivery' ? 'animate-spin' : ''}`} />
                    <span>{singleSyncingDept === 'delivery' ? 'กำลังดึง...' : 'ดึงเฉพาะข้อมูลการจัดส่ง'}</span>
                  </button>
                  {deliveryUrl.trim() && (
                    <a
                      href={deliveryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-purple-700 hover:text-purple-900 font-semibold inline-flex items-center gap-1 hover:underline px-2 py-1 rounded bg-purple-50"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>เปิดชีตจริง</span>
                    </a>
                  )}
                </div>
                {filesState.deliveryTagParsed?.rowCount ? (
                  <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-600" />
                    โหลดแล้ว {filesState.deliveryTagParsed.rowCount} รายการ {filesState.deliveryLastSync ? `(${filesState.deliveryLastSync})` : ''}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">ยังไม่ได้ดึงข้อมูล</span>
                )}
              </div>
            </div>
          )}

          {/* Caching Control Box */}
          <div className="flex items-center justify-between p-3 bg-slate-50/80 rounded-xl border border-slate-200 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span className="font-semibold text-slate-800 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                แคชข้อมูล 15 นาที:
              </span>
              <span className="text-slate-500 text-[11px] hidden sm:inline">
                ช่วยให้โหลดได้รวดเร็วทันที
              </span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input 
                type="checkbox"
                checked={forceRefresh}
                onChange={(e) => setForceRefresh(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span className={`text-[11px] font-medium ${forceRefresh ? 'text-amber-700 font-bold' : 'text-slate-600'}`}>
                {forceRefresh ? '⚡ บังคับดึงสดจาก Google Sheet' : 'ใช้แคชเพื่อความเร็วสูงสุด'}
              </span>
            </label>
          </div>

          {/* Sync Progress Bar & Indicator */}
          {isSyncing && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin shrink-0" />
                  <span>{syncStep || 'กำลังประมวลผลข้อมูล...'}</span>
                </div>
                <span className="text-emerald-700 font-mono font-bold">{syncProgress}%</span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-600 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${syncProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Sync Results Box */}
          {syncResult && (
            <div className={`p-4 rounded-xl border flex items-start gap-3 text-xs animate-in fade-in duration-200 ${
              syncResult.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
              syncResult.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-900' :
              'bg-amber-50 border-amber-200 text-amber-900'
            }`}>
              {syncResult.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : syncResult.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <p className="font-bold text-sm">{syncResult.message}</p>
                {syncResult.details && (
                  <p className="text-xs opacity-90 leading-relaxed">{syncResult.details}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div />

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="btn-cancel-sync"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-xl transition-colors cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>

            <button
              type="button"
              id="btn-sync-process-sheets"
              onClick={handlePrimarySync}
              disabled={isSyncing}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-xs transition-all cursor-pointer"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>กำลังดึงข้อมูล...</span>
                </>
              ) : activeTab === 'sales' ? (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>บันทึกและซิงค์ข้อมูลฝ่ายขาย (Sync Sales Data)</span>
                </>
              ) : activeTab === 'warehouse' ? (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>บันทึกและซิงค์ข้อมูลคลังสินค้า (Sync Warehouse Data)</span>
                </>
              ) : activeTab === 'delivery' ? (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>บันทึกและซิงค์ข้อมูลการจัดส่ง (Sync Delivery Data)</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>ดึงข้อมูลและประมวลผลทุกแผนก (Sync & Process All Data)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

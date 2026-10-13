import { canAccessReport } from '../lib/authControl';
import { getWarehouseReportDate, getDeliveryReportDate } from '../utils/logisticsReportMetrics';
import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  FileText, 
  TrendingUp,
  Warehouse,
  Truck,
  CheckCircle2
} from 'lucide-react';
import { 
  DetailedSalesOrder, 
  SalesRepPerformance, 
  WarehouseDoc, 
  DeliveryTrip, 
  TopProductItem, 
  CustomerSpender,
  KPIStats,
  AuthUser
} from '../types';
import { getMinMaxDates } from '../utils/dateUtils';

export interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  detailedSalesOrders?: DetailedSalesOrder[];
  salesReps?: SalesRepPerformance[];
  warehouseDocs?: WarehouseDoc[];
  deliveryTrips?: DeliveryTrip[];
  topProducts?: TopProductItem[];
  topSpenders?: CustomerSpender[];
  kpis?: KPIStats;
  currentUser?: AuthUser | null;
  onOpenPDFPreview?: (
    dept: 'overview' | 'sales' | 'warehouse' | 'delivery' | 'all',
    startDate?: string,
    endDate?: string
  ) => void;
}

export const NewReportModal: React.FC<ExportReportModalProps> = ({
  isOpen,
  onClose,
  detailedSalesOrders = [],
  warehouseDocs = [],
  deliveryTrips = [],
  currentUser,
  onOpenPDFPreview
}) => {
  // Department / Report Scope
  const [selectedDept, setSelectedDept] = useState<'all' | 'sales' | 'warehouse' | 'delivery'>('sales');

  const canExport = (dept: 'all' | 'sales' | 'warehouse' | 'delivery') => canAccessReport(currentUser, dept);
  useEffect(() => {
    if (!canExport(selectedDept)) {
      const first = (['sales', 'warehouse', 'delivery', 'all'] as const).find(canExport);
      if (first) setSelectedDept(first);
    }
  }, [isOpen, currentUser?.role, JSON.stringify(currentUser?.allowedScreens)]);

  const safeSalesOrders = useMemo(() => detailedSalesOrders, [detailedSalesOrders]);
  const safeWarehouseDocs = useMemo(() => warehouseDocs, [warehouseDocs]);
  const safeDeliveryTrips = useMemo(() => deliveryTrips, [deliveryTrips]);
  // Each department has its own date column and available period.
  const datasetRange = useMemo(() => {
    const sales = safeSalesOrders.map(o => o.date);
    const warehouse = safeWarehouseDocs.map(getWarehouseReportDate);
    const delivery = safeDeliveryTrips.map(getDeliveryReportDate);
    return getMinMaxDates(selectedDept === 'sales' ? sales : selectedDept === 'warehouse' ? warehouse : selectedDept === 'delivery' ? delivery : [...sales, ...warehouse, ...delivery], '', '');
  }, [selectedDept, safeSalesOrders, safeWarehouseDocs, safeDeliveryTrips]);

  // Date Range (Dynamic to match available orders)
  const [startDate, setStartDate] = useState(datasetRange.min);
  const [endDate, setEndDate] = useState(datasetRange.max);

  useEffect(() => {
    setStartDate(datasetRange.min);
    setEndDate(datasetRange.max);
  }, [isOpen, selectedDept, datasetRange.min, datasetRange.max]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs bg-rose-100 text-rose-800">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 leading-tight">
                ส่งออกรายงาน (Export Dashboard Report)
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                เลือกฝ่ายและช่วงวันที่สำหรับรายงาน PDF
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* PDF export format */}
          <div>
            <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-2.5">
              1. รูปแบบไฟล์รายงาน (Export Format)
            </label>
            <div className="grid grid-cols-1 gap-3">
              <div
                className="p-3.5 rounded-2xl border border-rose-500 bg-rose-50/60 text-rose-950 ring-2 ring-rose-500/30 shadow-xs flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                    เอกสาร PDF รายงาน (PDF Report)
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    ฟอร์แมต A4 สวยงาม พร้อม KPI, ตาราง, ลายเซ็น
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Department Selection */}
          <div>
            <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-2.5">
              2. เลือกฝ่าย / ข้อมูลที่ต้องการส่งออก
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                { 
                  id: 'sales', 
                  title: 'ฝ่ายขาย (Sales Department)', 
                  desc: 'คำสั่งซื้อทุกบิล, ผลงานพนักงานขายทุกคน, ข้อมูลลูกค้าทั้งหมด, รายการสินค้าทั้งหมด',
                  icon: <TrendingUp className="w-4 h-4 text-blue-600" />,
                  color: 'border-blue-500 bg-blue-50/50 text-blue-950'
                },
                { 
                  id: 'warehouse', 
                  title: 'ฝ่ายคลังสินค้า (Warehouse)', 
                  desc: 'รายการใบเบิกสินค้าทั้งหมด, เวลาจัดเตรียม, ผู้จัดเตรียม, สถานะสต็อก',
                  icon: <Warehouse className="w-4 h-4 text-amber-600" />,
                  color: 'border-amber-500 bg-amber-50/50 text-amber-950'
                },
                { 
                  id: 'delivery', 
                  title: 'ฝ่ายจัดส่ง (Logistics & Fleet)', 
                  desc: 'รายการเที่ยวรถทั้งหมด, ใบนำส่ง, ทะเบียนรถ, พนักงานขับรถ, สถานะ OTD',
                  icon: <Truck className="w-4 h-4 text-emerald-600" />,
                  color: 'border-emerald-500 bg-emerald-50/50 text-emerald-950'
                },
              ].map((item) => {
                const isSelected = selectedDept === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!canExport(item.id as any)}
                    onClick={() => { if (canExport(item.id as any)) setSelectedDept(item.id as any); }}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      isSelected
                        ? `${item.color} ring-2 ring-emerald-600/30 shadow-xs`
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">{item.icon}</div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Date Range Picker (Only Start Date & End Date as requested) */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                3. กำหนดช่วงเวลาที่ต้องการ Export
              </label>
              <span className="text-[11px] text-slate-500 font-medium">
                ระบุวันเริ่มต้น และสิ้นสุด
              </span>
            </div>

            {/* Date Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50/80 p-4 rounded-2xl border border-slate-200">
              <div>
                <span className="block text-[11px] font-bold text-slate-700 mb-1.5">
                  วันที่เริ่มต้น (Start Date):
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-semibold bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>

              <div>
                <span className="block text-[11px] font-bold text-slate-700 mb-1.5">
                  วันที่สิ้นสุด (End Date):
                </span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-semibold bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>
            </div>
          </div>

        </div>

        {/* Modal Actions Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>
              สร้างเอกสาร PDF มาตรฐานรายงาน A4 สรุปข้อมูลตัวชี้วัดและตาราง
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>

            <button
              type="button"
              id="btn-open-pdf-preview"
              onClick={() => {
                if (onOpenPDFPreview) {
                  if (canExport(selectedDept)) onOpenPDFPreview(selectedDept === 'all' ? 'overview' : selectedDept, startDate, endDate);
                }
                onClose();
              }}
              className="w-1/2 sm:w-auto px-6 py-2.5 rounded-xl text-xs font-extrabold text-white flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer bg-rose-600 hover:bg-rose-700 active:bg-rose-800"
            >
              <FileText className="w-4 h-4" />
              <span>เปิดดู & ดาวน์โหลด PDF รายงาน</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

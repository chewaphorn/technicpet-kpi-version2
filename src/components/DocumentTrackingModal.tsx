import React from 'react';
import { 
  X, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileQuestion
} from 'lucide-react';
import { WarehouseDoc, DeliveryTrip, DetailedSalesOrder } from '../types';
import { normalizeDateToISO } from '../utils/dateUtils';
import { isCompletedTrip } from '../utils/logisticsReportMetrics';

interface DocumentTrackingModalProps {
  docNo: string | null;
  warehouseDocs?: WarehouseDoc[];
  deliveryTrips?: DeliveryTrip[];
  detailedSalesOrders?: DetailedSalesOrder[];
  onClose: () => void;
}

export const DocumentTrackingModal: React.FC<DocumentTrackingModalProps> = ({
  docNo,
  warehouseDocs = [],
  deliveryTrips = [],
  detailedSalesOrders = [],
  onClose,
}) => {
  if (!docNo) return null;

  const normalizeDocKey = (value?: string) => (value || '').trim().toUpperCase().replace(/[\s\-_/.\\]+/g, '');
  const normalizedDoc = normalizeDocKey(docNo);
  const recordKeys = (...values: (string | undefined)[]) => values.map(normalizeDocKey).filter(Boolean);

  // Link every source by the booking number and all known aliases. This also
  // handles searches made with a delivery number instead of the booking number.
  const linkedKeys = new Set<string>([normalizedDoc]);
  deliveryTrips
    .filter((trip) => recordKeys(trip.docNo, trip.salesOrderNo, trip.deliveryNo).includes(normalizedDoc))
    .forEach((trip) => recordKeys(trip.docNo, trip.salesOrderNo, trip.deliveryNo).forEach((key) => linkedKeys.add(key)));

  const matchingSalesOrders = detailedSalesOrders.filter((order) => linkedKeys.has(normalizeDocKey(order.docNo)));
  const matchingWarehouseDocs = warehouseDocs.filter((warehouseDoc) => linkedKeys.has(normalizeDocKey(warehouseDoc.docNo)));
  const matchingDeliveryTrips = deliveryTrips.filter((trip) =>
    recordKeys(trip.docNo, trip.salesOrderNo, trip.deliveryNo).some((key) => linkedKeys.has(key))
  );

  const salesOrder = matchingSalesOrders[0];
  const statusRank = (status?: string) => ({ completed: 4, verified: 4, delayed: 3, in_transit: 2, picking: 2, pending: 1 }[status || ''] || 0);
  const whDoc = [...matchingWarehouseDocs].sort((a, b) => statusRank(b.status) - statusRank(a.status))[0];
  const delivery = [...matchingDeliveryTrips].sort((a, b) => statusRank(b.status) - statusRank(a.status))[0];
  const firstValue = (...values: (string | undefined)[]) => values.find((value) => Boolean(value && value.trim())) || '-';

  const salesItemsCount = salesOrder?.totalItemsCount || salesOrder?.items?.length || 0;
  const warehouseReceivedAt = firstValue(...matchingWarehouseDocs.map((doc) => doc.receivedBookingDate || doc.date));
  const warehouseStartedAt = firstValue(...matchingWarehouseDocs.map((doc) => doc.startTime));
  const warehouseCompletedAt = matchingWarehouseDocs.map(doc => normalizeDateToISO(doc.completedDate)).filter(Boolean).sort().at(-1) || '-';
  const handoffAt = firstValue(
    ...matchingWarehouseDocs.map((doc) => doc.transferTime),
    ...matchingDeliveryTrips.map((trip) => trip.handoffDate || trip.handoverDate)
  );
  const deliveryPlannedAt = firstValue(...matchingDeliveryTrips.map((trip) => trip.plannedDate || trip.orderDate));
  const deliveryLoadedAt = matchingDeliveryTrips.map(trip => normalizeDateToISO(trip.loadedDate)).filter(Boolean).sort().at(-1) || '-';

  const hasWarehouse = matchingWarehouseDocs.length > 0;
  const warehouseStarted = matchingWarehouseDocs.some((doc) => doc.status === 'picking' || Boolean(doc.startTime));
  const warehouseCompleted = matchingWarehouseDocs.some((doc) => doc.status === 'completed' || doc.status === 'verified' || Boolean(normalizeDateToISO(doc.completedDate)));
  const hasHandoff = handoffAt !== '-';
  const deliveryHasLoaded = matchingDeliveryTrips.length > 0 && matchingDeliveryTrips.every(isCompletedTrip);
  const deliveryIsDelayed = matchingDeliveryTrips.some((trip) => !isCompletedTrip(trip) && trip.status === 'delayed');
  const isFound = Boolean(salesOrder || hasWarehouse || matchingDeliveryTrips.length > 0);

  const currentStatus = deliveryIsDelayed
    ? { label: 'การจัดส่งล่าช้า', detail: 'ต้องติดตามการจัดส่ง (Delayed)', department: 'ฝ่ายขนส่ง', tone: 'rose' }
    : deliveryHasLoaded
    ? { label: 'โหลดสินค้าแล้ว (Loaded)', detail: 'กระบวนการติดตามสิ้นสุดที่การโหลดสินค้า', department: 'ฝ่ายขนส่ง', tone: 'emerald' }
    : matchingDeliveryTrips.length > 0
    ? { label: 'รอเริ่มจัดส่ง', detail: 'มีข้อมูลส่งต่อให้ฝ่ายขนส่งแล้ว', department: 'ฝ่ายขนส่ง', tone: 'blue' }
    : hasHandoff || warehouseCompleted
    ? { label: 'รอส่งต่อให้ฝ่ายขนส่ง', detail: 'คลังจัดสินค้าเสร็จแล้ว', department: 'ฝ่ายคลังสินค้า', tone: 'amber' }
    : warehouseStarted || hasWarehouse
    ? { label: 'กำลังจัดเตรียมสินค้า', detail: 'อยู่ระหว่างดำเนินการที่คลังสินค้า', department: 'ฝ่ายคลังสินค้า', tone: 'amber' }
    : { label: 'รอคลังรับใบจอง', detail: 'ฝ่ายขายเปิดใบสั่งขายแล้ว', department: 'ฝ่ายขาย → ฝ่ายคลังสินค้า', tone: 'blue' };

  type TrackingStep = {
    title: string;
    department: string;
    date: string;
    detail: string;
    state: 'completed' | 'current' | 'pending' | 'delayed';
  };
  const timelineSteps: TrackingStep[] = [
    {
      title: 'ฝ่ายขายเปิดใบสั่งขาย (Sales Order)',
      department: 'ฝ่ายขาย',
      date: salesOrder?.date || '-',
      detail: salesOrder ? `มูลค่า ฿${salesOrder.totalAmount?.toLocaleString() || '0'} • ผู้ขาย: ${salesOrder.salesperson || '-'} • ${salesOrder.status || '-'}` : 'ยังไม่พบข้อมูลใบสั่งขาย',
      state: salesOrder ? 'completed' : 'pending',
    },
    {
      title: 'คลังสินค้ารับใบจอง',
      department: 'ฝ่ายคลังสินค้า',
      date: warehouseReceivedAt,
      detail: hasWarehouse ? `เลขที่ใบจองตรงกัน • จำนวน ${salesItemsCount || whDoc?.itemsCount || 0} รายการ` : 'ยังไม่พบรายการในข้อมูลคลังสินค้า',
      state: hasWarehouse ? 'completed' : salesOrder ? 'current' : 'pending',
    },
    {
      title: 'คลังสินค้าหยิบและแพ็คสินค้า (Warehouse Picked)',
      department: 'ฝ่ายคลังสินค้า',
      date: warehouseStartedAt !== '-' ? warehouseStartedAt : warehouseCompletedAt,
      detail: hasWarehouse
        ? `${whDoc?.statusLabel || 'อยู่ระหว่างดำเนินการที่คลังสินค้า'}${warehouseCompletedAt !== '-' ? ` • จัดเสร็จ: ${warehouseCompletedAt}` : ''}`
        : 'รอคลังเริ่มดำเนินการ',
      state: warehouseCompleted ? 'completed' : warehouseStarted ? 'current' : hasWarehouse ? 'current' : 'pending',
    },
    {
      title: 'ส่งต่อเอกสารให้ฝ่ายขนส่ง (Handover)',
      department: 'ฝ่ายคลังสินค้า → ฝ่ายขนส่ง',
      date: handoffAt,
      detail: hasHandoff ? `ส่งต่อเมื่อ ${handoffAt}` : warehouseCompleted ? 'จัดเสร็จแล้ว รอบันทึกการส่งต่อ' : 'รอคลังจัดสินค้าเสร็จ',
      state: hasHandoff ? 'completed' : warehouseCompleted ? 'current' : 'pending',
    },
    {
      title: 'โหลดขึ้นรถและจัดส่ง (Loaded / In Transit)',
      department: 'ฝ่ายขนส่ง',
      date: deliveryLoadedAt !== '-' ? deliveryLoadedAt : deliveryPlannedAt,
      detail: matchingDeliveryTrips.length > 0 ? `ทะเบียน ${delivery?.licensePlate || '-'} • แผนส่ง: ${deliveryPlannedAt} • โหลดสินค้า: ${deliveryLoadedAt}` : 'ยังไม่พบข้อมูลฝ่ายขนส่ง',
      state: deliveryIsDelayed ? 'delayed' : deliveryHasLoaded ? 'completed' : matchingDeliveryTrips.length > 0 ? 'current' : 'pending',
    },
  ];
  const timelineStateLabels: Record<TrackingStep['state'], string> = {
    completed: 'เสร็จแล้ว',
    current: 'กำลังดำเนินการ',
    pending: 'รอดำเนินการ',
    delayed: 'ล่าช้า',
  };
  const timelineStateClasses: Record<TrackingStep['state'], string> = {
    completed: 'bg-emerald-600 text-white',
    current: 'bg-blue-600 text-white animate-pulse',
    pending: 'bg-slate-200 text-slate-500',
    delayed: 'bg-rose-600 text-white',
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#0a2558] text-white">
                TRACKING
              </span>
              <h3 className="text-lg font-bold text-slate-900">
                สถานะติดตามเอกสาร: {docNo}
              </h3>
            </div>
            {isFound && (
              <p className="text-xs text-slate-500 mt-1">
                ลูกค้า: <strong className="text-slate-800">{salesOrder?.customer || whDoc?.customer || '-'}</strong> • เลขที่จัดส่ง: {delivery?.deliveryNo || '-'} • อยู่ที่: <strong className="text-slate-800">{currentStatus.department}</strong>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {!isFound ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <FileQuestion className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                ไม่พบข้อมูลเอกสาร "{docNo}" ในระบบ
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                ยังไม่มีข้อมูลเอกสารนี้ในระบบ หรือยังไม่ได้ทำการซิงค์ข้อมูลจริงจาก Google Sheet
              </p>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Status highlight banner */}
            <div className={`p-4 rounded-xl flex items-center justify-between ${
              currentStatus.tone === 'emerald'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                : currentStatus.tone === 'rose'
                ? 'bg-rose-50 border border-rose-200 text-rose-900'
                : currentStatus.tone === 'amber'
                ? 'bg-amber-50 border border-amber-200 text-amber-900'
                : 'bg-blue-50 border border-blue-200 text-blue-900'
            }`}>
              <div className="flex items-center gap-3">
                {currentStatus.tone === 'emerald' ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                ) : currentStatus.tone === 'rose' ? (
                  <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
                ) : (
                  <Clock className="w-6 h-6 text-blue-600 shrink-0 animate-pulse" />
                )}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider">
                    สถานะการดำเนินงานปัจจุบัน
                  </p>
                  <p className="text-sm font-extrabold mt-0.5">
                    {currentStatus.label}
                  </p>
                  <p className="text-[11px] font-medium mt-0.5 opacity-80">{currentStatus.detail}</p>
                  <p className="text-[11px] font-bold mt-1">หน่วยงานปัจจุบัน: {currentStatus.department}</p>
                </div>
              </div>
            </div>

            {/* Stepper Timeline */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">
                ไทม์ไลน์กระบวนการโลจิสติกส์ (End-to-End Flow)
              </h4>
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {timelineSteps.map((step, index) => (
                  <div className="relative" key={step.title}>
                    <span className={`absolute -left-6 top-0 w-5 h-5 rounded-full flex items-center justify-center ring-4 ring-white text-[10px] ${timelineStateClasses[step.state]}`}>
                      {step.state === 'completed' ? '✓' : step.state === 'delayed' ? '!' : index + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-bold text-slate-900">{index + 1}. {step.title}</p>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${step.state === 'completed' ? 'bg-emerald-50 text-emerald-700' : step.state === 'delayed' ? 'bg-rose-50 text-rose-700' : step.state === 'current' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                          {timelineStateLabels[step.state]}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">{step.department} • วันที่/เวลา: {step.date}</p>
                      <p className="text-[11px] text-slate-500">{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Details */}
            {salesOrder && salesOrder.items && salesOrder.items.length > 0 && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-2">
                <h5 className="font-bold text-slate-800">
                  รายการสินค้า ({salesItemsCount || salesOrder.items.length} รายการ)
                </h5>
                <p className="text-slate-600">
                  {salesOrder.items.map(it => `${it.productName} (${it.quantity} ${it.unit})`).join(', ')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="bg-[#0a2558] hover:bg-[#0d3175] text-white px-5 py-2 rounded-lg text-xs font-semibold cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};

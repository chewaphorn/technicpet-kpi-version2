import {
  WarehouseDoc,
  WarehouseDepartmentAnalytics,
  ParsedFileData
} from '../types';
import {
  findValue,
  parseNumberSafe,
  parseDateFlexible,
  formatDateToBE
} from './dataProcessor';
import { warehouseField, warehouseDate, warehouseDays, warehouseReceivedAliases, warehouseDocDateAliases } from './warehouseDates';

/**
 * Returns empty/zeroed warehouse department analytics.
 * Used when data is absent or when date filters yield 0 records.
 */
export function getEmptyWarehouseAnalytics(): WarehouseDepartmentAnalytics {
  return {
    totalDocs: 0,
    completedDocs: 0,
    pendingDocsCount: 0,
    delayedDocsCount: 0,
    avgLeadTimeDays: 0,
    avgPickingMinutes: '—',
    dailyInboundBookings: 0,
    dailyPickedOrders: 0,
    transferredToDeliveryCount: 0,
    transferredPercent: 0,
    stockAccuracyPercent: undefined,
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
      stockAccuracyPercent: undefined,
    },
    warehouseDocs: [],
  };
}

/**
 * Isolated Warehouse Data Analytics Engine
 * Calculates strictly Warehouse KPIs, picking lead times, pending items, completion rate,
 * transferred volume, and stock accuracy without referencing or relying on Sales or Delivery data.
 */
export function analyzeWarehouseData(
  input?: Record<string, any>[] | ParsedFileData | null,
  dateFilter?: { fromDate?: string; toDate?: string }
): WarehouseDepartmentAnalytics {
  let rows: Record<string, any>[] = Array.isArray(input)
    ? input
    : (input?.rawRows || []);

  if (!rows || rows.length === 0) {
    return getEmptyWarehouseAnalytics();
  }

  rows = rows.filter((row) =>
    String(findValue(row, ['เลขที่ใบสั่งขาย', 'เลขที่ใบสั่งซื้อ', 'เลขที่คำสั่งซื้อ', 'เลขที่ใบจอง', 'เลขที่เอกสาร', 'รหัสเอกสาร', 'เลขที่ออเดอร์', 'SO No', 'Order No', 'docNo', 'orderNo', 'booking_no', 'record_id'], '')).trim() !== ''
  );
  if (rows.length === 0) {
    return getEmptyWarehouseAnalytics();
  }

  // Filter rows by date if dateFilter is provided
  if (dateFilter && (dateFilter.fromDate || dateFilter.toDate)) {
    rows = rows.filter((row) => {
      const iso = warehouseDate(warehouseField(row, [...warehouseReceivedAliases, ...warehouseDocDateAliases]));
      if (!iso) return false;
      if (dateFilter.fromDate && iso < dateFilter.fromDate) return false;
      if (dateFilter.toDate && iso > dateFilter.toDate) return false;
      return true;
    });

    if (rows.length === 0) {
      return getEmptyWarehouseAnalytics();
    }
  }

  let calculatedWarehouseDocs: WarehouseDoc[] = [];
  let totalPickedItems = 0;
  let transferredToDeliveryCount = 0;

  if (rows.length > 0) {
    calculatedWarehouseDocs = rows.map((row, idx) => {
      const docNo = String(findValue(row, ['เลขที่ใบสั่งขาย', 'เลขที่ใบสั่งซื้อ', 'เลขที่คำสั่งซื้อ', 'เลขที่ใบจอง', 'เลขที่เอกสาร', 'รหัสเอกสาร', 'เลขที่ออเดอร์', 'SO No', 'Order No', 'docNo', 'orderNo', 'booking_no', 'record_id'], '')).trim();
      const pickerName = String(findValue(row, ['ผู้หยิบสินค้า', 'ผู้จัดสินค้า', 'พนักงานหยิบ', 'pickerName', 'picker', 'driver_raw'], '')).trim();
      const itemsCountRaw = findValue(row, ['จำนวนรายการ', 'จำนวนชิ้น', 'itemsCount', 'quantity', 'qty'], '0');
      const itemsCount = parseNumberSafe(itemsCountRaw, 0);
      const customer = String(findValue(row, ['ชื่อลูกค้า', 'ลูกค้า', 'customer', 'customer_name', 'client'], '')).trim();
      const startTime = String(findValue(row, ['เวลาเริ่ม', 'เวลาเริ่มจัด', 'startTime', 'start'], '')).trim();
      const receivedBookingDate = warehouseDate(warehouseField(row, warehouseReceivedAliases));
      const receivedFromWarehouseDate = String(findValue(row, ['รับจากคลัง', 'วันที่รับจากคลัง', 'received_total_date', 'receivedFromWarehouseDate'], '')).trim();
      const plannedDate = String(findValue(row, ['วันที่วางแผน', 'วันวางแผน', 'plannedDate', 'plan_date'], '')).trim();
      const loadedDate = String(findValue(row, ['โหลดสินค้าจริง', 'วันที่โหลดสินค้าจริง', 'loadedDate', 'actual_load_date'], '')).trim();
      const docDate = warehouseDate(warehouseField(row, warehouseDocDateAliases));
      const effectiveDocDate = receivedBookingDate || docDate;
      const rawCompletedDate = warehouseDate(warehouseField(row, ['วันที่จัดของเสร็จ', 'วันที่จัดเสร็จ', 'วันที่สำเร็จ', 'completedDate', 'finishedDate', 'วันที่จัดสินค้าเสร็จ', 'วันที่จัดเสร็จจริง', 'completed_date', 'picking_completed_date']));
      const transferDate = warehouseDate(warehouseField(row, ['วันที่ส่งมอบ', 'วันที่ส่งต่อขนส่ง', 'transferTime', 'handoffDate']));
      const rawStatus = String(findValue(row, ['สถานะ', 'status', 'transport_status'], '')).toLowerCase();
      const rawPriority = String(findValue(row, ['ระดับความสำคัญ', 'priority', 'urgency'], '')).trim().toLowerCase();
      const priority: WarehouseDoc['priority'] = rawPriority.includes('urgent') || rawPriority.includes('ด่วนพิเศษ')
        ? 'urgent'
        : rawPriority.includes('high') || rawPriority.includes('ด่วน')
          ? 'high'
          : rawPriority.includes('normal') || rawPriority.includes('ปกติ')
            ? 'normal'
            : 'unknown';
      const notes = String(findValue(row, ['หมายเหตุ', 'notes', 'โซนคลังสินค้า', 'zone', 'remark'], '')).trim();

      let status: WarehouseDoc['status'] = 'unknown';
      let statusLabel = 'ไม่ระบุสถานะ';
      let isTransferred = false;

      if (rawCompletedDate) {
        status = 'completed';
        statusLabel = 'จัดเสร็จแล้ว';
      } else if (rawStatus.includes('หยิบ') || rawStatus.includes('picking') || rawStatus.includes('กำลัง') || rawStatus.trim() === 'pack') {
        status = 'picking';
        statusLabel = 'กำลังหยิบสินค้า';
      } else if (rawStatus.includes('รอ') || rawStatus.includes('pending')) {
        status = 'pending';
        statusLabel = 'รอจัดสินค้า';
      } else if (rawStatus.includes('ตรวจ') || rawStatus.includes('verified')) {
        status = 'verified';
        statusLabel = 'ตรวจสอบแล้ว';
      } else if (rawStatus.includes('เสร็จ') || rawStatus.includes('สำเร็จ') || rawStatus.includes('completed')) {
        status = 'completed';
        statusLabel = 'จัดเสร็จแล้ว';
      }

      // A completion status alone is not evidence of an actual handover date.
      isTransferred = Boolean(transferDate);
      totalPickedItems += itemsCount;

      let completedDate: string | undefined = undefined;
      let leadTimeDays: number | undefined = undefined;
      let pendingDays: number | undefined = undefined;
      let delayDays: number = 0;
      let delayDate: string | undefined = undefined;

      const parsedDocDate = parseDateFlexible(effectiveDocDate);

      // วันครบกำหนดเป้าหมาย (วันที่รับใบจอง + 3 วัน)
      if (parsedDocDate) {
        const targetD = new Date(parsedDocDate);
        targetD.setDate(targetD.getDate() + 3);
        delayDate = formatDateToBE(targetD);
      }

      if (status === 'completed' || status === 'verified') {
        if (rawCompletedDate) {
          completedDate = String(rawCompletedDate);
          leadTimeDays = warehouseDays(effectiveDocDate, completedDate);
        } else {
          completedDate = undefined;
          leadTimeDays = undefined;
        }

        if (leadTimeDays !== undefined && leadTimeDays > 3) {
          delayDays = leadTimeDays - 3;
        } else {
          delayDays = 0;
        }
      } else if (status === 'pending' || status === 'picking') {
        if (parsedDocDate) {
          const today = new Date();
          const refDate = today;
          const diffMs = refDate.getTime() - parsedDocDate.getTime();
          pendingDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        } else {
          pendingDays = undefined;
        }

        if (pendingDays > 3) {
          delayDays = pendingDays - 3;
        } else {
          delayDays = 0;
        }
      }

      // Check for SKU/product items in picking list
      const productCode = String(findValue(row, ['รหัสสินค้า', 'รหัส', 'productCode', 'itemCode', 'sku'], ''));
      const productName = String(findValue(row, ['ชื่อสินค้า', 'รายการสินค้า', 'productName', 'itemName', 'description'], ''));
      const docItems = [];
      if (productCode || productName) {
        const quantity = parseNumberSafe(findValue(row, ['จำนวน', 'จำนวนสั่ง', 'quantity', 'qty'], '0'), 0);
        const unit = String(findValue(row, ['หน่วย', 'หน่วยนับ', 'unit'], ''));
        const unitPrice = parseNumberSafe(findValue(row, ['ราคา', 'ราคาต่อหน่วย', 'unitPrice', 'price'], '0'), 0);
        const amount = parseNumberSafe(findValue(row, ['จำนวนเงิน', 'มูลค่า', 'amount', 'total'], '0'), quantity * unitPrice);
        docItems.push({
          seqNo: 1,
          productCode,
          productName,
          quantity,
          unit,
          unitPrice,
          totalPrice: amount || (quantity * unitPrice)
        });
      }

      return {
        id: `wh-${idx + 1}`,
        docNo,
        customer,
        date: effectiveDocDate,
        completedDate,
        receivedBookingDate,
        receivedFromWarehouseDate,
        plannedDate,
        loadedDate,
        leadTimeDays,
        pendingDays,
        delayDays,
        delayDate,
        startTime,
        itemsCount: docItems.length > 0 ? docItems.length : itemsCount,
        items: docItems,
        status,
        statusLabel,
        pickerName,
        priority,
        transferredToDelivery: isTransferred,
        transferTime: transferDate || undefined,
        notes,
      };
    });
  }

  // Aggregate by docNo to eliminate duplicate item lines and merge items
  const aggregatedWarehouseMap = new Map<string, WarehouseDoc>();
  for (const doc of calculatedWarehouseDocs) {
    const key = doc.docNo.trim().toUpperCase();
    if (!aggregatedWarehouseMap.has(key)) {
      aggregatedWarehouseMap.set(key, {
        ...doc,
        items: [...(doc.items || [])],
        itemsCount: (doc.items && doc.items.length > 0) ? doc.items.length : doc.itemsCount,
      });
    } else {
      const existing = aggregatedWarehouseMap.get(key)!;
      const existingItems = existing.items || [];
      const newItems = doc.items || [];
      const mergedItems = [...existingItems];
      for (const it of newItems) {
        if (!mergedItems.some(m => (m.productCode && it.productCode && m.productCode.trim().toUpperCase() === it.productCode.trim().toUpperCase()) || (m.seqNo !== undefined && m.seqNo === it.seqNo && m.productName === it.productName))) {
          mergedItems.push({
            ...it,
            seqNo: mergedItems.length + 1
          });
        }
      }

      const isDone = existing.status === 'completed' || doc.status === 'completed' || existing.status === 'verified' || doc.status === 'verified';
      const finalStatus: WarehouseDoc['status'] = isDone
        ? 'completed'
        : existing.status === 'picking' || doc.status === 'picking'
          ? 'picking'
          : existing.status === 'pending' || doc.status === 'pending'
            ? 'pending'
            : 'unknown';
      const finalStatusLabel = finalStatus === 'completed'
        ? 'จัดเสร็จแล้ว'
        : finalStatus === 'picking'
          ? 'กำลังหยิบสินค้า'
          : finalStatus === 'pending'
            ? 'รอจัดสินค้า'
            : 'ไม่ระบุสถานะ';

      existing.status = finalStatus;
      existing.statusLabel = finalStatusLabel;
      if (doc.completedDate && (!existing.completedDate || doc.completedDate > existing.completedDate)) existing.completedDate = doc.completedDate;
      if (doc.date && (!existing.date || doc.date < existing.date)) existing.date = doc.date;
      if (doc.receivedBookingDate && (!existing.receivedBookingDate || doc.receivedBookingDate < existing.receivedBookingDate)) existing.receivedBookingDate = doc.receivedBookingDate;
      existing.transferredToDelivery = Boolean(existing.transferredToDelivery || doc.transferredToDelivery);
      if (doc.transferTime && (!existing.transferTime || doc.transferTime > existing.transferTime)) existing.transferTime = doc.transferTime;
      if (doc.leadTimeDays !== undefined && existing.leadTimeDays === undefined) existing.leadTimeDays = doc.leadTimeDays;
      if (doc.pendingDays !== undefined && existing.pendingDays === undefined) existing.pendingDays = doc.pendingDays;
      if (doc.customer && (!existing.customer || existing.customer === 'ลูกค้าทั่วไป')) existing.customer = doc.customer;
      
      existing.items = mergedItems;
      existing.itemsCount = mergedItems.length > 0 ? mergedItems.length : (existing.itemsCount + doc.itemsCount);
      aggregatedWarehouseMap.set(key, existing);
    }
  }

  calculatedWarehouseDocs = Array.from(aggregatedWarehouseMap.values());
  // Recompute from the merged dates; never retain stale pending/delay values
  // from an earlier duplicate row once the booking has completed.
  for (const doc of calculatedWarehouseDocs) {
    doc.leadTimeDays = warehouseDays(doc.receivedBookingDate || doc.date, doc.completedDate);
    if (doc.status === 'completed' || doc.status === 'verified') {
      doc.pendingDays = undefined;
      doc.delayDays = Math.max(0, (doc.leadTimeDays ?? 0) - 3);
    } else if (doc.status === 'pending' || doc.status === 'picking') {
      const elapsed = warehouseDays(doc.receivedBookingDate || doc.date, new Date());
      doc.pendingDays = elapsed === undefined ? undefined : Math.max(0, elapsed);
      doc.delayDays = Math.max(0, (doc.pendingDays ?? 0) - 3);
    } else {
      doc.pendingDays = undefined;
      doc.delayDays = 0;
    }
  }
  transferredToDeliveryCount = calculatedWarehouseDocs.filter(doc => doc.transferredToDelivery).length;

  const warehouseTotalDocs = calculatedWarehouseDocs.length;
  const warehouseCompleted = calculatedWarehouseDocs.filter(d => d.status === 'completed' || d.status === 'verified').length;
  const warehousePendingCount = calculatedWarehouseDocs.filter(d => d.status === 'pending' || d.status === 'picking').length;
  const avgItemsPerDoc = warehouseTotalDocs > 0 ? (totalPickedItems / warehouseTotalDocs).toFixed(1) : '0';

  const docsWithLeadTime = calculatedWarehouseDocs.filter(d => d.leadTimeDays !== undefined);
  const avgLeadTimeDays = docsWithLeadTime.length > 0 
    ? +(docsWithLeadTime.reduce((sum, d) => sum + (d.leadTimeDays || 0), 0) / docsWithLeadTime.length).toFixed(1)
    : 0;
  const delayedDocsCount = calculatedWarehouseDocs.filter(d => (d.delayDays || 0) > 0).length;

  const warehouseDateSet = new Set(calculatedWarehouseDocs.map(d => d.date).filter(Boolean));
  const warehouseDaysCount = warehouseDateSet.size;
  const dailyInboundBookings = warehouseTotalDocs > 0 && warehouseDaysCount > 0 ? Math.round(warehouseTotalDocs / warehouseDaysCount) : 0;
  const dailyPickedOrders = warehouseCompleted > 0 && warehouseDaysCount > 0 ? Math.round(warehouseCompleted / warehouseDaysCount) : 0;
  const transferredPercent = warehouseTotalDocs > 0 ? +((transferredToDeliveryCount / warehouseTotalDocs) * 100).toFixed(1) : 0;
  
  // Picking time and stock accuracy are not derivable from the imported
  // booking rows; leave them unavailable until source measurements exist.
  const stockAccuracyPercent = undefined;

  const warehouseSummary = {
    totalDocs: warehouseTotalDocs,
    completedDocs: warehouseCompleted,
    completionPercent: warehouseTotalDocs > 0 ? +((warehouseCompleted / warehouseTotalDocs) * 100).toFixed(1) : 0,
    avgItemsPerDoc,
    avgPickingMinutes: '—',
    dailyInboundBookings,
    dailyPickedOrders,
    transferredToDeliveryCount,
    transferredPercent,
    pendingDocsCount: warehousePendingCount,
    avgLeadTimeDays,
    delayedDocsCount,
    stockAccuracyPercent,
  };

  return {
    totalDocs: warehouseTotalDocs,
    completedDocs: warehouseCompleted,
    pendingDocsCount: warehousePendingCount,
    delayedDocsCount,
    avgLeadTimeDays,
    avgPickingMinutes: warehouseSummary.avgPickingMinutes,
    dailyInboundBookings,
    dailyPickedOrders,
    transferredToDeliveryCount,
    transferredPercent,
    stockAccuracyPercent,
    warehouseSummary,
    warehouseDocs: calculatedWarehouseDocs,
  };
}

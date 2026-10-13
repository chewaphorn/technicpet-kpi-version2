import {
  SalesRepPerformance,
  DetailedSalesOrder,
  SalesOrderItem,
  DocTypeBreakdown,
  TopProductItem,
  CustomerSpender,
  CustomerSummary,
  SalesDocType,
  SalesDepartmentAnalytics,
  ParsedFileData
} from '../types';
import { findValue, parseNumberSafe } from './dataProcessor';
import { normalizeDateToISO } from './dateUtils';

/**
 * Empty/Zeroed sales analytics baseline for when data is absent or filtered out completely
 */
export function getEmptySalesAnalytics(): SalesDepartmentAnalytics {
  return {
    totalSalesAmount: 0,
    totalRevenueFormatted: '฿0',
    totalOrders: 0,
    completedOrders: 0,
    hitRatePercent: 0,
    avgTicket: 0,
    avgTicketFormatted: '฿0',
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
    salesReps: [],
    detailedSalesOrders: [],
    docTypeBreakdowns: [
      {
        type: 'BK',
        code: 'BK',
        label: 'บิลปกติ (Normal Order)',
        badgeColor: 'blue',
        billCount: 0,
        totalAmount: 0,
        totalAmountFormatted: '฿0',
        totalQuantity: 0,
        percentOfBills: 0,
        percentOfAmount: 0,
      },
      {
        type: 'BKET',
        code: 'BKET',
        label: 'บิลพิเศษ / อีเวนต์ (Special Order)',
        badgeColor: 'purple',
        billCount: 0,
        totalAmount: 0,
        totalAmountFormatted: '฿0',
        totalQuantity: 0,
        percentOfBills: 0,
        percentOfAmount: 0,
      },
      {
        type: 'BKR',
        code: 'BKR',
        label: 'บิลเคลมสินค้า / รับคืน (Claims & Returns)',
        badgeColor: 'rose',
        billCount: 0,
        totalAmount: 0,
        totalAmountFormatted: '฿0',
        totalQuantity: 0,
        percentOfBills: 0,
        percentOfAmount: 0,
      },
    ],
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
  };
}

/**
 * Isolated Sales Data Analytics Engine
 * Calculates strictly Sales KPIs, revenue, hit rate, ticket size, doc breakdowns, and reps performance
 * without referencing or relying on Warehouse or Delivery data.
 *
 * @param input Raw rows array, DetailedSalesOrder array, or ParsedFileData
 * @param companyMonthlyTargetMillion Target in millions of THB (default 15.0)
 * @param dateFilter Optional date filter with fromDate and toDate (ISO YYYY-MM-DD)
 */
export function analyzeSalesData(
  input?: Record<string, any>[] | DetailedSalesOrder[] | ParsedFileData | null,
  companyMonthlyTargetMillion: number = 15.0,
  dateFilter?: { fromDate?: string; toDate?: string }
): SalesDepartmentAnalytics {
  const rawRows: Record<string, any>[] = Array.isArray(input)
    ? input
    : (input?.rawRows || []);

  if (!rawRows || rawRows.length === 0) {
    return getEmptySalesAnalytics();
  }

  const rowsWithDocumentNumber = rawRows.filter((row) =>
    String(findValue(row, [
      'เลขที่เอกสาร', 'เลขที่ใบสั่งซื้อ', 'เลขที่คำสั่งซื้อ', 'เลขที่ใบจอง', 'เลขที่ใบสั่งขาย', 'เลขที่บิล', 'เลขที่บิลขาย',
      'เลขที่ออเดอร์', 'รหัสเอกสาร', 'รหัสคำสั่งซื้อ', 'เลขที่ SO', 'SO No', 'SO Number', 'Order No', 'Order Number',
      'docNo', 'orderNo', 'Document No', 'Document Number', 'Order ID', 'booking_no', 'bookingNo', 'record_id', 'No.'
    ], '')).trim() !== ''
  );
  if (rowsWithDocumentNumber.length === 0) {
    return getEmptySalesAnalytics();
  }

  // Apply Date Filter if provided
  let rows = rowsWithDocumentNumber;
  if (dateFilter && (dateFilter.fromDate || dateFilter.toDate)) {
    rows = rowsWithDocumentNumber.filter((row) => {
      const dateStr = String(
        row.date ||
        findValue(row, ['วันที่', 'วันที่เอกสาร', 'วันที่สั่งซื้อ', 'date', 'orderDate', 'docDate'], '')
      ).trim();
      const iso = normalizeDateToISO(dateStr);
      if (!iso) return false;
      if (dateFilter.fromDate && iso < dateFilter.fromDate) return false;
      if (dateFilter.toDate && iso > dateFilter.toDate) return false;
      return true;
    });
  }

  if (rows.length === 0) {
    return getEmptySalesAnalytics();
  }

  const calculatedSalesReps: SalesRepPerformance[] = [];
  let totalSalesAmount = 0;
  let completedSalesOrders = 0;
  let totalLineItemsCount = 0;
  const repSalesMap = new Map<string, { count: number; totalAmount: number; name: string; orders: Set<string> }>();
  const ordersMap = new Map<string, DetailedSalesOrder>();
  const productsMap = new Map<string, { productCode: string; productName: string; totalQuantity: number; unit: string; totalAmount: number; ordersSet: Set<string> }>();

  rows.forEach((row, idx) => {
    // Check if row is already an assembled DetailedSalesOrder
    if ((row as any).items && Array.isArray((row as any).items)) {
      const order = row as DetailedSalesOrder;
      const docNo = (order.docNo || '').trim().toUpperCase();
      // Assembled orders already represent complete bills, not additional lines.
      if (!docNo || ordersMap.has(docNo)) return;
      const customer = order.customer || '';
      const repName = order.salesperson || '';
      const rawStatus = order.status || '';
      const totalAmount = order.totalAmount || 0;

      totalSalesAmount += totalAmount;
      totalLineItemsCount += order.items.length;

      ordersMap.set(docNo, { ...order, docNo });

      if (repName) {
        const existingRep = repSalesMap.get(repName) || { count: 0, totalAmount: 0, name: repName, orders: new Set<string>() };
        existingRep.count += 1;
        existingRep.totalAmount += totalAmount;
        existingRep.orders.add(docNo);
        repSalesMap.set(repName, existingRep);
      }

      order.items.forEach((item) => {
        const prodKey = item.productCode || item.productName;
        const existingProd = productsMap.get(prodKey) || {
          productCode: item.productCode || '-',
          productName: item.productName || 'สินค้า',
          totalQuantity: 0,
          unit: item.unit || 'ชิ้น',
          totalAmount: 0,
          ordersSet: new Set<string>(),
        };
        existingProd.totalQuantity += item.quantity || 0;
        existingProd.totalAmount += item.totalPrice ?? ((item.unitPrice || 0) * (item.quantity || 0));
        existingProd.ordersSet.add(docNo);
        productsMap.set(prodKey, existingProd);
      });
      return;
    }

    // Process raw sheet row
    const docNoRaw = findValue(row, [
      'เลขที่เอกสาร', 'เลขที่ใบสั่งซื้อ', 'เลขที่คำสั่งซื้อ', 'เลขที่ใบจอง', 'เลขที่ใบสั่งขาย', 'เลขที่บิล', 'เลขที่บิลขาย',
      'เลขที่ออเดอร์', 'รหัสเอกสาร', 'รหัสคำสั่งซื้อ', 'เลขที่ SO', 'SO No', 'SO Number', 'Order No', 'Order Number',
      'docNo', 'orderNo', 'Document No', 'Document Number', 'Order ID', 'booking_no', 'bookingNo', 'record_id', 'No.'
    ], '');
    const docNo = String(docNoRaw).trim().toUpperCase();
    if (!docNo) return;

    const dateRaw = findValue(row, ['วันที่', 'วันที่เอกสาร', 'วันที่สั่งซื้อ', 'date', 'orderDate', 'docDate', 'snapshot_date', 'order_date'], '');
    const date = String(dateRaw).trim();

    const customerRaw = findValue(row, ['ชื่อลูกค้า', 'ลูกค้า', 'รหัสลูกค้า', 'customer', 'customerName', 'customer_name', 'client', 'ชื่อร้าน'], '');
    const customer = String(customerRaw).trim();

    const repNameRaw = findValue(row, ['พนักงานขาย', 'เซลล์', 'ผู้ขาย', 'salesperson', 'salesRep', 'seller', 'sales', 'ชื่อพนักงานขาย'], '');
    const repName = String(repNameRaw).trim();
    
    const seqRaw = findValue(row, ['ลำดับ', 'ลำดับที่', 'seq', 'itemNo', 'no', 'lineNo'], 0);
    const seqNo = parseNumberSafe(seqRaw, 0);

    const productCodeRaw = findValue(row, ['รหัสสินค้า', 'บาร์โค้ด', 'barcode', 'productCode', 'itemCode', 'sku', 'code'], '');
    const productCode = String(productCodeRaw).trim();

    const productNameRaw = findValue(row, ['รายการสินค้า', 'ชื่อสินค้า', 'สินค้า', 'รายละเอียด', 'productName', 'itemName', 'description', 'product'], '');
    const productName = String(productNameRaw).trim();
    
    const qtyRaw = findValue(row, ['จำนวน', 'ปริมาณ', 'quantity', 'qty', 'จำนวนรายการ'], 0);
    const quantity = parseNumberSafe(qtyRaw, 0);

    const unitRaw = findValue(row, ['หน่วยนับ', 'หน่วย', 'unit', 'uom'], '');
    const unit = String(unitRaw).trim();
    
    const unitPriceRaw = findValue(row, ['ราคาต่อหน่วย', 'ราคา', 'unitPrice', 'price', 'ราคา/หน่วย'], 0);
    let unitPrice = parseNumberSafe(unitPriceRaw, 0);

    const totalLinePriceRaw = findValue(row, ['ยอดรวม(บาท)', 'ยอดรวม', 'มูลค่า', 'totalPrice', 'amount', 'ยอดขาย', 'total', 'จำนวนเงิน'], null);
    const lineTotalPrice = totalLinePriceRaw == null
      ? unitPrice * quantity : parseNumberSafe(totalLinePriceRaw, 0);

    const rawStatus = String(findValue(row, ['สถานะ', 'status', 'สถานะเอกสาร', 'สถานะบิล', 'transport_status'], '')).trim();
    const claimReasonRaw = String(findValue(row, ['สาเหตุเคลม', 'หมายเหตุเคลม', 'claimReason', 'เหตุผลการคืน', 'หมายเหตุ', 'notes', 'remark'], '')).trim();

    // Classify document type: BK (Normal), BKET (Special / Event), BKR (Claim / Return)
    const docUpper = docNo.toUpperCase();
    let docType: SalesDocType = 'BK';
    let docTypeLabel = 'ปกติ (BK)';

    if (docUpper.startsWith('BKET') || rawStatus.includes('พิเศษ') || rawStatus.includes('อีเวนต์')) {
      docType = 'BKET';
      docTypeLabel = 'พิเศษ (BKET)';
    } else if (docUpper.startsWith('BKR') || rawStatus.includes('เคลม') || rawStatus.includes('คืน')) {
      docType = 'BKR';
      docTypeLabel = 'เคลม/คืน (BKR)';
    } else if (docUpper.startsWith('BK') || docUpper.includes('SO') || docUpper.includes('ORD')) {
      docType = 'BK';
      docTypeLabel = 'ปกติ (BK)';
    } else {
      docType = 'OTHER';
      docTypeLabel = 'ทั่วไป';
    }

    const claimReason = docType === 'BKR' 
      ? claimReasonRaw
      : (claimReasonRaw || undefined);

    totalSalesAmount += lineTotalPrice;
    totalLineItemsCount += 1;

    // Group products for Best Sellers
    const prodKey = productCode || productName;
    const existingProd = productsMap.get(prodKey) || {
      productCode: productCode || '-',
      productName: productName,
      totalQuantity: 0,
      unit: unit,
      totalAmount: 0,
      ordersSet: new Set<string>(),
    };
    existingProd.totalQuantity += quantity;
    existingProd.totalAmount += lineTotalPrice;
    existingProd.ordersSet.add(docNo);
    productsMap.set(prodKey, existingProd);

    // Group into Orders
    const item: SalesOrderItem = {
      seqNo: Math.max(1, seqNo),
      productCode: productCode || '-',
      productName: productName,
      quantity,
      unit,
      unitPrice,
      totalPrice: lineTotalPrice,
    };

    if (!ordersMap.has(docNo)) {
      ordersMap.set(docNo, {
        docNo,
        docType,
        docTypeLabel,
        date,
        customer,
        salesperson: repName,
        totalItemsCount: 1,
        totalQuantity: quantity,
        totalAmount: lineTotalPrice,
        status: rawStatus,
        items: [item],
        claimReason,
      });
    } else {
      const order = ordersMap.get(docNo)!;
      order.totalItemsCount += 1;
      order.totalQuantity += quantity;
      order.totalAmount += lineTotalPrice;
      order.items.push(item);
      if (claimReason && !order.claimReason) {
        order.claimReason = claimReason;
      }
    }

    if (repName) {
      const existingRep = repSalesMap.get(repName) || { count: 0, totalAmount: 0, name: repName, orders: new Set<string>() };
      existingRep.count += 1;
      existingRep.totalAmount += lineTotalPrice;
      existingRep.orders.add(docNo);
      repSalesMap.set(repName, existingRep);
    }
  });

  const detailedSalesOrders = Array.from(ordersMap.values());
  const uniqueOrdersCount = detailedSalesOrders.length;

  if (uniqueOrdersCount === 0) {
    return getEmptySalesAnalytics();
  }

  // Check completed count from grouped orders
  detailedSalesOrders.forEach((ord) => {
    const st = ord.status.toLowerCase();
    if (st.includes('เสร็จ') || st.includes('สำเร็จ') || st.includes('completed') || st.includes('ส่งแล้ว') || st.includes('ส่งมอบ') || st.includes('อนุมัติ')) {
      completedSalesOrders++;
    }
  });

  // Build sales reps list
  const companyTargetInBaht = companyMonthlyTargetMillion * 1_000_000;

  repSalesMap.forEach((data, repName) => {
    const repOrdersCount = data.orders.size || data.count;
    const completionRate = companyTargetInBaht > 0 
      ? +((data.totalAmount / companyTargetInBaht) * 100).toFixed(1) 
      : 0;
    const initial = repName.charAt(0);

    calculatedSalesReps.push({
      id: `rep-${calculatedSalesReps.length + 1}`,
      name: repName,
      initials: initial,
      role: '-',
      sales: data.totalAmount,
      salesFormatted: data.totalAmount >= 1_000_000 ? `฿${(data.totalAmount / 1_000_000).toFixed(2)}M` : `฿${Math.round(data.totalAmount).toLocaleString()}`,
      target: companyMonthlyTargetMillion,
      deliveryTurnaround: '-',
      completionRate: completionRate,
      ordersCount: repOrdersCount,
    });
  });

  calculatedSalesReps.sort((a, b) => b.sales - a.sales);

  const totalRevenueMillions = +(totalSalesAmount / 1_000_000).toFixed(2);
  const avgTicket = uniqueOrdersCount > 0 ? Math.round(totalSalesAmount / uniqueOrdersCount) : 0;
  const avgHitRate = calculatedSalesReps.length > 0 
    ? +(calculatedSalesReps.reduce((acc, r) => acc + r.completionRate, 0) / calculatedSalesReps.length).toFixed(1)
    : 0;

  // Calculate Document Breakdown (BK, BKET, BKR)
  let bkBillsCount = 0;
  let bkAmount = 0;
  let bkQty = 0;
  let bketBillsCount = 0;
  let bketAmount = 0;
  let bketQty = 0;
  let bkrBillsCount = 0;
  let bkrAmount = 0;
  let bkrQty = 0;

  detailedSalesOrders.forEach((ord) => {
    if (ord.docType === 'BKET') {
      bketBillsCount++;
      bketAmount += ord.totalAmount;
      bketQty += ord.totalQuantity;
    } else if (ord.docType === 'BKR') {
      bkrBillsCount++;
      bkrAmount += ord.totalAmount;
      bkrQty += ord.totalQuantity;
    } else {
      bkBillsCount++;
      bkAmount += ord.totalAmount;
      bkQty += ord.totalQuantity;
    }
  });

  const docTypeBreakdowns: DocTypeBreakdown[] = [
    {
      type: 'BK',
      code: 'BK',
      label: 'บิลปกติ (Normal Order)',
      badgeColor: 'blue',
      billCount: bkBillsCount,
      totalAmount: bkAmount,
      totalAmountFormatted: bkAmount >= 1_000_000 ? `฿${(bkAmount / 1_000_000).toFixed(2)}M` : `฿${Math.round(bkAmount).toLocaleString()}`,
      totalQuantity: bkQty,
      percentOfBills: uniqueOrdersCount > 0 ? +((bkBillsCount / uniqueOrdersCount) * 100).toFixed(1) : 0,
      percentOfAmount: totalSalesAmount > 0 ? +((bkAmount / totalSalesAmount) * 100).toFixed(1) : 0,
    },
    {
      type: 'BKET',
      code: 'BKET',
      label: 'บิลพิเศษ / อีเวนต์ (Special Order)',
      badgeColor: 'purple',
      billCount: bketBillsCount,
      totalAmount: bketAmount,
      totalAmountFormatted: bketAmount >= 1_000_000 ? `฿${(bketAmount / 1_000_000).toFixed(2)}M` : `฿${Math.round(bketAmount).toLocaleString()}`,
      totalQuantity: bketQty,
      percentOfBills: uniqueOrdersCount > 0 ? +((bketBillsCount / uniqueOrdersCount) * 100).toFixed(1) : 0,
      percentOfAmount: totalSalesAmount > 0 ? +((bketAmount / totalSalesAmount) * 100).toFixed(1) : 0,
    },
    {
      type: 'BKR',
      code: 'BKR',
      label: 'บิลเคลมสินค้า / รับคืน (Claims & Returns)',
      badgeColor: 'rose',
      billCount: bkrBillsCount,
      totalAmount: bkrAmount,
      totalAmountFormatted: bkrAmount >= 1_000_000 ? `฿${(bkrAmount / 1_000_000).toFixed(2)}M` : `฿${Math.round(bkrAmount).toLocaleString()}`,
      totalQuantity: bkrQty,
      percentOfBills: uniqueOrdersCount > 0 ? +((bkrBillsCount / uniqueOrdersCount) * 100).toFixed(1) : 0,
      percentOfAmount: totalSalesAmount > 0 ? +((bkrAmount / totalSalesAmount) * 100).toFixed(1) : 0,
    },
  ];

  // Best-Selling Products (Ranked)
  const rawProductList = Array.from(productsMap.values());
  rawProductList.sort((a, b) => b.totalAmount - a.totalAmount || b.totalQuantity - a.totalQuantity);

  const topProducts: TopProductItem[] = rawProductList.map((prod, index) => {
    const totalProdAmount = prod.totalAmount;
    return {
      rank: index + 1,
      productCode: prod.productCode,
      productName: prod.productName,
      totalQuantity: prod.totalQuantity,
      unit: prod.unit,
      totalAmount: totalProdAmount,
      totalAmountFormatted: totalProdAmount >= 1_000_000 ? `฿${(totalProdAmount / 1_000_000).toFixed(2)}M` : `฿${Math.round(totalProdAmount).toLocaleString()}`,
      ordersCount: prod.ordersSet.size,
      percentageOfSales: totalSalesAmount > 0 ? +((totalProdAmount / totalSalesAmount) * 100).toFixed(1) : 0,
    };
  });

  // Top Spenders & Customers
  const customersMap = new Map<string, {
    customerName: string;
    totalAmount: number;
    ordersCount: number;
    totalQuantity: number;
    docTypes: Set<string>;
    lastOrderDate: string;
    salesperson: string;
    isNewCustomer: boolean;
    category: string;
  }>();

  detailedSalesOrders.forEach((order) => {
    const custName = order.customer.trim() || '-';
    const existingCust = customersMap.get(custName) || {
      customerName: custName,
      totalAmount: 0,
      ordersCount: 0,
      totalQuantity: 0,
      docTypes: new Set<string>(),
      lastOrderDate: order.date,
      salesperson: order.salesperson,
      isNewCustomer: false,
      category: 'เพ็ทช็อป & รีเทล',
    };

    existingCust.totalAmount += order.totalAmount;
    existingCust.ordersCount += 1;
    existingCust.totalQuantity += order.totalQuantity;
    existingCust.docTypes.add(order.docType);
    if (normalizeDateToISO(order.date) > normalizeDateToISO(existingCust.lastOrderDate)) existingCust.lastOrderDate = order.date;
    if (order.salesperson && order.salesperson !== 'ฝ่ายขาย') {
      existingCust.salesperson = order.salesperson;
    }

    const upperCust = custName.toLowerCase();
    if (upperCust.includes('โรงพยาบาล') || upperCust.includes('รพ.') || upperCust.includes('คลินิก') || upperCust.includes('clinic') || upperCust.includes('hospital')) {
      existingCust.category = 'รพ.สัตว์ & คลินิก';
    } else if (upperCust.includes('เอกซ์โป') || upperCust.includes('อีเวนต์') || upperCust.includes('บูธ') || upperCust.includes('แฟร์') || upperCust.includes('expo') || upperCust.includes('event')) {
      existingCust.category = 'อีเวนต์ & โครงการพิเศษ';
    } else if (upperCust.includes('เพ็ทช้อป') || upperCust.includes('เพ็ทช็อป') || upperCust.includes('แลนด์') || upperCust.includes('ช้อป') || upperCust.includes('รักสัตว์') || upperCust.includes('pet')) {
      existingCust.category = 'เพ็ทช็อป & รีเทล';
    } else {
      existingCust.category = 'ตัวแทน & ร้านค้าส่ง';
    }

    if (upperCust.includes('ใหม่') || upperCust.includes('new') || upperCust.includes('บูธ') || upperCust.includes('เอกซ์โป') || order.docType === 'BKET') {
      existingCust.isNewCustomer = true;
    }

    customersMap.set(custName, existingCust);
  });

  const rawCustomerList = Array.from(customersMap.values());
  rawCustomerList.sort((a, b) => b.totalAmount - a.totalAmount);

  const topSpenders: CustomerSpender[] = rawCustomerList.map((cust, index) => {
    const avgOrder = cust.ordersCount > 0 ? Math.round(cust.totalAmount / cust.ordersCount) : 0;
    return {
      rank: index + 1,
      customerName: cust.customerName,
      totalAmount: cust.totalAmount,
      totalAmountFormatted: cust.totalAmount >= 1_000_000 
        ? `฿${(cust.totalAmount / 1_000_000).toFixed(2)}M` 
        : `฿${Math.round(cust.totalAmount).toLocaleString()}`,
      ordersCount: cust.ordersCount,
      totalQuantity: cust.totalQuantity,
      avgTicket: avgOrder,
      avgTicketFormatted: `฿${avgOrder.toLocaleString()}`,
      isNewCustomer: cust.isNewCustomer,
      category: cust.category,
      lastOrderDate: cust.lastOrderDate,
      salesperson: cust.salesperson,
      docTypes: Array.from(cust.docTypes),
      percentageOfTotalSales: totalSalesAmount > 0 ? +((cust.totalAmount / totalSalesAmount) * 100).toFixed(1) : 0,
    };
  });

  const newCustomers: CustomerSpender[] = topSpenders.filter(c => c.isNewCustomer);
  const topSpenderLeader = topSpenders[0];
  const customerSummary: CustomerSummary = {
    totalCustomers: topSpenders.length,
    newCustomersCount: newCustomers.length,
    topSpenderName: topSpenderLeader ? topSpenderLeader.customerName : '-',
    topSpenderAmount: topSpenderLeader ? topSpenderLeader.totalAmountFormatted : '฿0',
    topSpenderAmountRaw: topSpenderLeader ? topSpenderLeader.totalAmount : 0,
    topSpenderSharePct: topSpenderLeader ? topSpenderLeader.percentageOfTotalSales : 0,
  };

  const topPerformer = calculatedSalesReps[0];
  const totalRevenueFormatted = totalSalesAmount !== 0 
    ? (totalSalesAmount >= 1_000_000 ? `฿${(totalSalesAmount / 1_000_000).toFixed(2)}M` : `฿${Math.round(totalSalesAmount).toLocaleString()}`)
    : '฿0';

  const salesSummary = {
    totalRevenueFormatted,
    totalRevenueAmount: totalSalesAmount,
    totalRevenueMillions,
    totalBookingCount: uniqueOrdersCount,
    avgTicketFormatted: `฿${avgTicket.toLocaleString()}`,
    avgTicket,
    hitRatePercent: avgHitRate,
    totalOrdersCount: uniqueOrdersCount,
    totalLineItemsCount: totalLineItemsCount,
    completedOrdersCount: completedSalesOrders,
    normalBillsCount: bkBillsCount,
    normalBillsAmount: bkAmount,
    normalBillsAmountFormatted: bkAmount >= 1_000_000 ? `฿${(bkAmount / 1_000_000).toFixed(2)}M` : `฿${Math.round(bkAmount).toLocaleString()}`,
    specialBillsCount: bketBillsCount,
    specialBillsAmount: bketAmount,
    specialBillsAmountFormatted: bketAmount >= 1_000_000 ? `฿${(bketAmount / 1_000_000).toFixed(2)}M` : `฿${Math.round(bketAmount).toLocaleString()}`,
    claimBillsCount: bkrBillsCount,
    claimBillsAmount: bkrAmount,
    claimBillsAmountFormatted: bkrAmount >= 1_000_000 ? `฿${(bkrAmount / 1_000_000).toFixed(2)}M` : `฿${Math.round(bkrAmount).toLocaleString()}`,
    topPerformerName: topPerformer ? topPerformer.name : '-',
    topPerformerSales: topPerformer ? topPerformer.salesFormatted : '฿0',
  };

  // These summaries are omitted unless source rows contain those facts.
  const salesCategoryMix: SalesDepartmentAnalytics['salesCategoryMix'] = [];

  const salesWeeklyTrend: SalesDepartmentAnalytics['salesWeeklyTrend'] = [];

  return {
    totalSalesAmount,
    totalRevenueFormatted,
    totalOrders: uniqueOrdersCount,
    completedOrders: completedSalesOrders,
    hitRatePercent: avgHitRate,
    avgTicket,
    avgTicketFormatted: `฿${avgTicket.toLocaleString()}`,
    salesSummary,
    salesReps: calculatedSalesReps,
    detailedSalesOrders,
    docTypeBreakdowns,
    topProducts,
    topSpenders,
    newCustomers,
    customerSummary,
    salesWeeklyTrend,
    salesCategoryMix,
  };
}

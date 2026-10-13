import { DetailedSalesOrder, SalesDocType, SalesRepPerformance, DocTypeBreakdown, TopProductItem, CustomerSpender } from '../types';
import { normalizeDateToISO } from './dateUtils';

export type SalesOrderDateFilter = {
  fromDate?: string;
  toDate?: string;
  docType?: 'ALL' | SalesDocType;
  searchQuery?: string;
};

/** Resolve a bill type using the same rule in every sales report surface. */
export function getSalesDocumentType(order: DetailedSalesOrder): SalesDocType {
  if (order.docType) return order.docType;
  const docNo = order.docNo.trim().toUpperCase();
  if (docNo.startsWith('BKET')) return 'BKET';
  if (docNo.startsWith('BKR')) return 'BKR';
  return 'BK';
}

/**
 * Apply the canonical Sales Report filters. Keeping this in one place prevents
 * Executive Overview cards and Sales Report cards from selecting different
 * orders when dates contain Thai, ISO, or slash-separated values.
 */
export function filterSalesOrders(
  orders: DetailedSalesOrder[],
  { fromDate = '', toDate = '', docType = 'ALL', searchQuery = '' }: SalesOrderDateFilter = {},
): DetailedSalesOrder[] {
  const query = searchQuery.trim().toLowerCase();

  return orders.filter((order) => {
    if (docType !== 'ALL' && getSalesDocumentType(order) !== docType) return false;

    const date = normalizeDateToISO(order.date);
    if ((fromDate || toDate) && !date) return false;
    if (fromDate && date && date < fromDate) return false;
    if (toDate && date && date > toDate) return false;

    if (!query) return true;
    return (
      order.docNo.toLowerCase().includes(query) ||
      order.customer.toLowerCase().includes(query) ||
      order.salesperson.toLowerCase().includes(query) ||
      Boolean(order.claimReason?.toLowerCase().includes(query)) ||
      order.items.some((item) =>
        item.productName.toLowerCase().includes(query) ||
        item.productCode.toLowerCase().includes(query)
      )
    );
  });
}

export function calculateSalesTotals(orders: DetailedSalesOrder[]) {
  const totalRevenue = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
  return {
    totalOrders: orders.length,
    totalRevenue,
    averageTicket: orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0,
  };
}

export const formatCurrency = (amount: number) => amount >= 1_000_000 ? `฿${(amount / 1_000_000).toFixed(2)}M` : `฿${Math.round(amount).toLocaleString()}`;

export function calculateSalesReportMetrics(filteredOrders: DetailedSalesOrder[], salesReps: SalesRepPerformance[] = [], companyMonthlySalesTarget = 15) {
    const salesTotals = calculateSalesTotals(filteredOrders);
    const totalCount = salesTotals.totalOrders;
    const companyTargetInBaht = (companyMonthlySalesTarget || 15.0) * 1_000_000;

    // Strict isolation: if filtered orders count is 0, completely clear and reset state
    if (totalCount === 0) {
      return {
        totalRevenueFormatted: '฿0',
        totalRevenueAmount: 0,
        totalSalesRevenue: 0,
        totalBookingsCount: 0,
        avgTicketFormatted: '฿0',
        topPerformerName: '-',
        topPerformerSales: '฿0',
        computedReps: [],
        top10Reps: [],
        breakdowns: [
          {
            type: 'BK' as SalesDocType,
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
            type: 'BKET' as SalesDocType,
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
            type: 'BKR' as SalesDocType,
            code: 'BKR',
            label: 'บิลเคลมสินค้า / รับคืน (Claims & Returns)',
            badgeColor: 'rose',
            billCount: 0,
            totalAmount: 0,
            totalAmountFormatted: '฿0',
            totalQuantity: 0,
            percentOfBills: 0,
            percentOfAmount: 0,
          }
        ],
        allProducts: [],
        top10Products: [],
        companyTargetInBaht
      };
    }

    const totalRev = salesTotals.totalRevenue;
    const avgTicket = salesTotals.averageTicket;

    let bkCount = 0;
    let bkAmount = 0;
    let bkQty = 0;

    let bketCount = 0;
    let bketAmount = 0;
    let bketQty = 0;

    let bkrCount = 0;
    let bkrAmount = 0;
    let bkrQty = 0;

    // Reps aggregation
    const repSalesMap = new Map<string, { name: string; sales: number; count: number }>();

    // Products aggregation
    const productMap = new Map<string, {
      productCode: string;
      productName: string;
      totalQuantity: number;
      unit: string;
      totalAmount: number;
      ordersCount: number;
    }>();

    filteredOrders.forEach((order) => {
      const type = getSalesDocumentType(order);
      const amt = order.totalAmount || 0;
      const qty = order.totalQuantity || 0;

      if (type === 'BK') {
        bkCount++;
        bkAmount += amt;
        bkQty += qty;
      } else if (type === 'BKET') {
        bketCount++;
        bketAmount += amt;
        bketQty += qty;
      } else if (type === 'BKR') {
        bkrCount++;
        bkrAmount += amt;
        bkrQty += qty;
      }

      // Reps
      const repName = order.salesperson?.trim() || '-';
      const curRep = repSalesMap.get(repName) || { name: repName, sales: 0, count: 0 };
      curRep.sales += amt;
      curRep.count += 1;
      repSalesMap.set(repName, curRep);

      // Line items
      order.items.forEach((item) => {
        const pKey = item.productCode || item.productName;
        const curProd = productMap.get(pKey) || {
          productCode: item.productCode || '-',
          productName: item.productName || 'สินค้า',
          totalQuantity: 0,
          unit: item.unit || 'ชิ้น',
          totalAmount: 0,
          ordersCount: 0
        };
        curProd.totalQuantity += item.quantity || 0;
        curProd.totalAmount += item.totalPrice ?? ((item.unitPrice || 0) * (item.quantity || 0));
        curProd.ordersCount += 1;
        productMap.set(pKey, curProd);
      });
    });

    const computedReps: SalesRepPerformance[] = Array.from(repSalesMap.values()).map((r, i) => {
      const matchedInit = salesReps.find(s => s.name === r.name);
      const completionRate = companyTargetInBaht > 0 ? +((r.sales / companyTargetInBaht) * 100).toFixed(1) : 0;
      const shareOfTotalSales = totalRev > 0 ? +((r.sales / totalRev) * 100).toFixed(1) : 0;
      return {
        id: matchedInit?.id || `rep-${i}`,
        name: r.name,
        initials: matchedInit?.initials || r.name.charAt(0),
        role: matchedInit?.role || '-',
        sales: r.sales,
        salesFormatted: formatCurrency(r.sales),
        target: companyMonthlySalesTarget || 15.0,
        deliveryTurnaround: matchedInit?.deliveryTurnaround || '-',
        completionRate: completionRate,
        ordersCount: r.count,
        shareOfTotalSales: shareOfTotalSales
      };
    }).sort((a, b) => (b.sales || 0) - (a.sales || 0));

    // Top Sale Performer - never fallback to stale prop if empty
    const topRep = computedReps[0] || null;

    // Recomputed Breakdowns
    const breakdowns: DocTypeBreakdown[] = [
      {
        type: 'BK',
        code: 'BK',
        label: 'บิลปกติ (Normal Order)',
        badgeColor: 'blue',
        billCount: bkCount,
        totalAmount: bkAmount,
        totalAmountFormatted: formatCurrency(bkAmount),
        totalQuantity: bkQty,
        percentOfBills: totalCount > 0 ? +((bkCount / totalCount) * 100).toFixed(1) : 0,
        percentOfAmount: totalRev > 0 ? +((bkAmount / totalRev) * 100).toFixed(1) : 0,
      },
      {
        type: 'BKET',
        code: 'BKET',
        label: 'บิลพิเศษ / อีเวนต์ (Special Order)',
        badgeColor: 'purple',
        billCount: bketCount,
        totalAmount: bketAmount,
        totalAmountFormatted: formatCurrency(bketAmount),
        totalQuantity: bketQty,
        percentOfBills: totalCount > 0 ? +((bketCount / totalCount) * 100).toFixed(1) : 0,
        percentOfAmount: totalRev > 0 ? +((bketAmount / totalRev) * 100).toFixed(1) : 0,
      },
      {
        type: 'BKR',
        code: 'BKR',
        label: 'บิลเคลมสินค้า / รับคืน (Claims & Returns)',
        badgeColor: 'rose',
        billCount: bkrCount,
        totalAmount: bkrAmount,
        totalAmountFormatted: formatCurrency(bkrAmount),
        totalQuantity: bkrQty,
        percentOfBills: totalCount > 0 ? +((bkrCount / totalCount) * 100).toFixed(1) : 0,
        percentOfAmount: totalRev > 0 ? +((bkrAmount / totalRev) * 100).toFixed(1) : 0,
      }
    ];

    // Recomputed Top Products (All & Top 10)
    const sortedProducts = Array.from(productMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
    const allProds: TopProductItem[] = sortedProducts.map((p, idx) => ({
      rank: idx + 1,
      productCode: p.productCode,
      productName: p.productName,
      totalQuantity: p.totalQuantity,
      unit: p.unit,
      totalAmount: p.totalAmount,
      totalAmountFormatted: formatCurrency(p.totalAmount),
      ordersCount: p.ordersCount,
      percentageOfSales: totalRev > 0 ? +((p.totalAmount / totalRev) * 100).toFixed(1) : 0,
    }));

    return {
      totalRevenueFormatted: formatCurrency(totalRev),
      totalRevenueAmount: totalRev,
      totalSalesRevenue: totalRev,
      totalBookingsCount: totalCount,
      avgTicketFormatted: formatCurrency(avgTicket),
      topPerformerName: topRep ? topRep.name : '-',
      topPerformerSales: topRep ? topRep.salesFormatted : '฿0',
      computedReps,
      top10Reps: computedReps.slice(0, 10),
      breakdowns,
      allProducts: allProds,
      top10Products: allProds.slice(0, 10),
      companyTargetInBaht
    };

}

export function calculateSalesCustomers(filteredOrders: DetailedSalesOrder[]) {
    // Strictly isolate to filtered orders - never fall back to all detailedOrders when filter produces 0
    const baseOrders = filteredOrders;

    if (baseOrders.length === 0) {
      return {
        top10Spenders: [],
        allSpenders: [],
        top10TotalAmount: 0,
        top10TotalAmountFormatted: '฿0',
        top10SharePct: 0,
        summary: {
          totalCustomers: 0,
          top10CustomersCount: 0,
          topSpenderName: '-',
          topSpenderAmount: '฿0',
          topSpenderAmountRaw: 0,
          topSpenderSharePct: 0,
        }
      };
    }

    const custMap = new Map<string, {
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

    let totalSalesSum = 0;

    baseOrders.forEach((order) => {
      const custName = order.customer?.trim() || '-';
      totalSalesSum += order.totalAmount || 0;

      const existing = custMap.get(custName) || {
        customerName: custName,
        totalAmount: 0,
        ordersCount: 0,
        totalQuantity: 0,
        docTypes: new Set<string>(),
        lastOrderDate: order.date,
        salesperson: order.salesperson || '-',
        isNewCustomer: false,
        category: '',
      };

      existing.totalAmount += order.totalAmount || 0;
      existing.ordersCount += 1;
      existing.totalQuantity += order.totalQuantity || 0;
      existing.docTypes.add(order.docType || 'BK');
      if (normalizeDateToISO(order.date) > normalizeDateToISO(existing.lastOrderDate)) existing.lastOrderDate = order.date;
      if (order.salesperson && order.salesperson !== 'ฝ่ายขาย') {
        existing.salesperson = order.salesperson;
      }

      custMap.set(custName, existing);
    });

    const rawList = Array.from(custMap.values());
    rawList.sort((a, b) => b.totalAmount - a.totalAmount);

    const spenders: CustomerSpender[] = rawList.map((c, index) => {
      const avg = c.ordersCount > 0 ? Math.round(c.totalAmount / c.ordersCount) : 0;
      return {
        rank: index + 1,
        customerName: c.customerName,
        totalAmount: c.totalAmount,
        totalAmountFormatted: formatCurrency(c.totalAmount),
        ordersCount: c.ordersCount,
        totalQuantity: c.totalQuantity,
        avgTicket: avg,
        avgTicketFormatted: formatCurrency(avg),
        isNewCustomer: false,
        category: '',
        lastOrderDate: c.lastOrderDate,
        salesperson: c.salesperson,
        docTypes: Array.from(c.docTypes),
        percentageOfTotalSales: totalSalesSum > 0 ? +((c.totalAmount / totalSalesSum) * 100).toFixed(1) : 0,
      };
    });

    // Top 10 Customers by total purchases
    const top10Spenders = spenders.slice(0, 10);
    const topLeader = top10Spenders[0];
    const top10TotalAmount = top10Spenders.reduce((sum, c) => sum + c.totalAmount, 0);

    return {
      top10Spenders,
      allSpenders: spenders,
      top10TotalAmount,
      top10TotalAmountFormatted: formatCurrency(top10TotalAmount),
      top10SharePct: totalSalesSum > 0 ? +((top10TotalAmount / totalSalesSum) * 100).toFixed(1) : 0,
      summary: {
        totalCustomers: spenders.length,
        top10CustomersCount: top10Spenders.length,
        topSpenderName: topLeader ? topLeader.customerName : '-',
        topSpenderAmount: topLeader ? topLeader.totalAmountFormatted : '฿0',
        topSpenderAmountRaw: topLeader ? topLeader.totalAmount : 0,
        topSpenderSharePct: topLeader ? topLeader.percentageOfTotalSales : 0,
      }
    };

}

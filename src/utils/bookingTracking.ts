import type { DetailedSalesOrder, WarehouseDoc, DeliveryTrip } from '../types';
import { normalizeDateToISO } from './dateUtils';

export const bookingKey = (value: string = '') => value.trim().toUpperCase().replace(/[\s\-_/.\\]+/g, '');
export function bookingDate(value?: string): string {
  const iso = normalizeDateToISO(value);
  const time = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === iso ? iso : '';
}
const dates = (values: (string | undefined)[]) => values.map(bookingDate).filter(Boolean).sort();
export function buildBookingTracking(orders: DetailedSalesOrder[], warehouse: WarehouseDoc[], trips: DeliveryTrip[]) {
  const groups = new Map<string, { docNo: string; sales: DetailedSalesOrder[]; warehouse: WarehouseDoc[]; trips: DeliveryTrip[] }>();
  const group = (docNo: string) => {
    const key = bookingKey(docNo);
    if (!key || key === '-') return undefined;
    if (!groups.has(key)) groups.set(key, { docNo, sales: [], warehouse: [], trips: [] });
    return groups.get(key)!;
  };
  orders.forEach(order => group(order.docNo)?.sales.push(order));
  warehouse.forEach(doc => group(doc.docNo)?.warehouse.push(doc));
  trips.forEach(trip => group(trip.salesOrderNo || trip.docNo || '')?.trips.push(trip));
  return [...groups.values()].map(row => {
    const salesDates = dates(row.sales.map(order => order.date));
    const createdDate = salesDates[0] || '';
    const loadedDates = dates(row.trips.map(trip => trip.loadedDate));
    const complete = row.trips.length > 0 && loadedDates.length === row.trips.length;
    const loadedDate = complete ? loadedDates[loadedDates.length - 1] : '';
    const invalidSequence = Boolean(createdDate && loadedDates.some(date => date < createdDate));
    const issue = salesDates.length !== row.sales.length || !createdDate ? 'ไม่พบวันที่สร้างจากฝ่ายขาย'
      : new Set(salesDates).size > 1 ? 'วันที่สร้างใบจองไม่ตรงกัน'
      : invalidSequence ? 'วันที่โหลดก่อนวันที่สร้างใบจอง' : '';
    const days = complete && createdDate && !issue
      ? Math.round((Date.parse(loadedDate) - Date.parse(createdDate)) / 86400000) : null;
    return {
      ...row, createdDate, loadedDate, complete, issue, days,
      receivedDate: dates(row.warehouse.map(doc => doc.receivedBookingDate || doc.date))[0] || '',
      pickedDate: dates(row.warehouse.map(doc => doc.completedDate)).at(-1) || '',
      handoffDate: dates(row.trips.map(trip => trip.handoffDate || trip.handoverDate))[0] || '',
      loadedCount: loadedDates.length,
      customer: row.sales[0]?.customer || row.warehouse[0]?.customer || row.trips[0]?.customer || '—',
      status: complete ? 'โหลดครบแล้ว' : loadedDates.length ? 'โหลดบางส่วน' : row.trips.length ? 'รอโหลดสินค้า' : row.warehouse.length ? 'อยู่ฝ่ายคลัง' : 'รอคลังรับใบจอง',
    };
  }).sort((a, b) => b.createdDate.localeCompare(a.createdDate) || a.docNo.localeCompare(b.docNo));
}

export function filterBookingTracking<T extends { docNo: string; createdDate: string }>(rows: T[], query: string, start: string, end: string) {
  return rows.filter(row => bookingKey(row.docNo).includes(bookingKey(query))
    && (!start || Boolean(row.createdDate && row.createdDate >= start))
    && (!end || Boolean(row.createdDate && row.createdDate <= end)));
}

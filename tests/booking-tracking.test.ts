import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bookingDate, buildBookingTracking, filterBookingTracking, summarizeBookingLeadTime } from '../src/utils/bookingTracking';
import type { DetailedSalesOrder, DeliveryTrip, WarehouseDoc } from '../src/types';

const sale = (docNo = 'BK-001', date = '01/10/2569') => ({ docNo, date } as DetailedSalesOrder);
const trip = (loadedDate?: string, salesOrderNo = 'bk/001') => ({ salesOrderNo, loadedDate } as DeliveryTrip);

test('joins booking formats and measures through the last loading date', () => {
  const [row] = buildBookingTracking([sale(), sale()], [{ docNo: 'BK001', receivedBookingDate: '02/10/2569' } as WarehouseDoc], [trip('2026-10-02'), trip('2026-10-04')]);
  assert.equal(row.days, 3);
  assert.equal(row.receivedDate, '2026-10-02');
  assert.equal(row.warehouse.length, 1);
  assert.equal(row.complete, true);
});
test('partial loading and missing dates do not produce completed durations', () => {
  const [partial] = buildBookingTracking([sale()], [], [trip('2026-10-02'), trip()]);
  assert.equal(partial.complete, false);
  assert.equal(partial.days, null);
  const [missingSale] = buildBookingTracking([], [], [trip('2026-10-02')]);
  assert.equal(missingSale.days, null);
  assert.ok(missingSale.issue);
});
test('same-day duration is zero; invalid and reversed dates are excluded', () => {
  assert.equal(buildBookingTracking([sale()], [], [trip('2026-10-01')])[0].days, 0);
  assert.equal(buildBookingTracking([sale()], [], [trip('2026-09-30')])[0].days, null);
  assert.equal(bookingDate('31/02/2569'), '');
  assert.equal(bookingDate('08:30'), '');
  assert.equal(buildBookingTracking([sale(), sale('BK001', '2026-10-02')], [], [trip('2026-10-03')])[0].days, null);
});
test('search uses the sales creation date inclusively, not the load date', () => {
  const rows = buildBookingTracking([sale(), sale('BK002', '2026-10-05')], [], [trip('2026-10-06')]);
  assert.equal(filterBookingTracking(rows, 'bk/001', '2026-10-01', '2026-10-01').length, 1);
  assert.equal(filterBookingTracking(rows, '', '2026-10-06', '').length, 0);
  assert.equal(filterBookingTracking(rows, '', '', '').length, 2);
});

test('delivery target and booking tracker average the same completed bookings in the sales-date period', () => {
  const rows = buildBookingTracking(
    [sale('BK1', '2026-10-01'), sale('BK2', '2026-10-02'), sale('BK3', '2026-10-03'), sale('OLD', '2026-09-01')],
    [],
    [
      trip('2026-10-02', 'BK1'), trip('2026-10-05', 'BK1'),
      trip('2026-10-04', 'BK2'), trip(undefined, 'BK2'),
      trip('2026-10-07', 'BK3'), trip('2026-09-10', 'OLD'),
    ]
  );
  assert.deepEqual(summarizeBookingLeadTime(filterBookingTracking(rows, '', '2026-10-01', '2026-10-03')), { days: 4, count: 2 });
  assert.deepEqual(summarizeBookingLeadTime(rows), { days: 5.7, count: 3 });
});

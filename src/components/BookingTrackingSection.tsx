import React, { useMemo, useState } from 'react';
import { bookingDate, buildBookingTracking, filterBookingTracking, summarizeBookingLeadTime } from '../utils/bookingTracking';

export function BookingTrackingSection({ rows, periodStart = '', periodEnd = '' }: {
  rows: ReturnType<typeof buildBookingTracking>; periodStart?: string; periodEnd?: string;
}) {
  const [query, setQuery] = useState('');
  const [startOverride, setStartOverride] = useState<string | null>(null);
  const [endOverride, setEndOverride] = useState<string | null>(null);
  const start = startOverride ?? periodStart;
  const end = endOverride ?? periodEnd;
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const invalidRange = Boolean(start && end && start > end);
  const filtered = useMemo(() => filterBookingTracking(rows, query, start, end), [rows, query, start, end]);
  const leadTime = useMemo(() => summarizeBookingLeadTime(filtered), [filtered]);
  const completed = filtered.filter(row => row.complete).length;
  const average = leadTime.days === null ? '—' : leadTime.days.toFixed(1);
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages);
  const displayDate = (date: string) => date ? date.split('-').reverse().join('/') : '—';
  const inputClass = 'block w-full rounded-lg border border-slate-300 p-2 mt-1 text-sm';
  return <section id="booking-tracking" className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 scroll-mt-4">
    <h3 className="text-lg font-bold text-slate-900">ติดตามใบจอง: ฝ่ายขาย → คลัง → ขนส่ง</h3>
    <p className="text-sm text-slate-500">ใช้ช่วงวันที่เดียวกับรายงานภาพรวมเป็นค่าเริ่มต้น โดยกรองตามวันที่ออกใบจองจากฝ่ายขาย และปรับตัวกรองส่วนนี้แยกได้</p>
    <div className="grid sm:grid-cols-4 gap-3 items-end">
      <label className="text-sm">เลขที่ใบจอง<input className={inputClass} placeholder="เช่น BK256907/02289" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label>
      <label className="text-sm">วันที่สร้างใบจอง ตั้งแต่<input className={inputClass} type="date" value={start} onChange={e => { setStartOverride(e.target.value); setPage(1); }} /></label>
      <label className="text-sm">ถึงวันที่<input className={inputClass} type="date" value={end} onChange={e => { setEndOverride(e.target.value); setPage(1); }} /></label>
      <button type="button" className="border rounded-lg p-2 text-sm" onClick={() => { setQuery(''); setStartOverride(null); setEndOverride(null); setPage(1); }}>กลับช่วงภาพรวม</button>
    </div>
    {invalidRange ? <p role="alert" className="text-red-600">วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด</p> : <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['ใบจองที่ค้นพบ', filtered.length], ['โหลดครบแล้ว', completed], ['ยังโหลดไม่ครบ', filtered.length - completed], ['เฉลี่ยสร้างใบจองถึงโหลดครบ (วัน)', average]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 border border-slate-100 p-4"><p className="text-xs text-slate-600">{label}</p><p className="text-2xl font-bold text-blue-900 mt-1">{value}</p></div>)}
      </div>
      <p className="text-xs text-slate-500">นับวันปฏิทิน: โหลดวันเดียวกับวันสร้าง = 0 วัน ใช้วันที่โหลดล่าสุดเมื่อครบทุกรายการขนส่งที่พบ ค่าเฉลี่ยคำนวณจาก {leadTime.count} ใบจองที่วันที่ครบและถูกต้อง</p>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left whitespace-nowrap">
        <thead className="bg-slate-50"><tr>{['เลขที่ใบจอง', 'วันที่ฝ่ายขายสร้าง', 'คลังรับใบจอง', 'คลังจัดเสร็จ', 'ขนส่งรับจากคลัง', 'โหลดครบวันที่', 'รวม (วัน)', 'สถานะ'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
        <tbody>{filtered.slice((currentPage - 1) * 20, currentPage * 20).map(row => <React.Fragment key={row.docNo}>
          <tr className="border-t border-slate-100"><td className="p-3"><button type="button" className="text-blue-700 underline font-semibold" aria-expanded={selected === row.docNo} onClick={() => setSelected(selected === row.docNo ? null : row.docNo)}>{row.docNo}</button></td>
            {[row.createdDate, row.receivedDate, row.pickedDate, row.handoffDate, row.loadedDate].map((date, index) => <td key={index} className="p-3">{displayDate(date)}</td>)}
            <td className="p-3 font-bold">{row.days ?? '—'}</td><td className="p-3"><span className={row.complete ? 'text-emerald-700' : 'text-amber-700'}>{row.status}</span>{row.issue && <p className="text-xs text-red-600">{row.issue}</p>}</td></tr>
          {selected === row.docNo && <tr className="bg-blue-50"><td colSpan={8} className="p-4 whitespace-normal space-y-2"><p>ลูกค้า: {row.customer}</p><p>ฝ่ายขาย: {row.sales.map(order => order.docNo).join(', ') || 'ไม่พบข้อมูล'} · ฝ่ายคลัง: {row.warehouse.map(doc => doc.docNo).join(', ') || 'ไม่พบข้อมูล'}</p><p>ฝ่ายขนส่ง: {row.trips.map(trip => `${trip.deliveryNo} (ใบจอง ${trip.salesOrderNo || trip.docNo} / โหลด ${displayDate(bookingDate(trip.loadedDate))})`).join(', ') || 'ไม่พบข้อมูล'}</p><p>พบวันที่โหลด {row.loadedCount} / {row.trips.length} รายการขนส่ง</p></td></tr>}
        </React.Fragment>)}</tbody>
      </table></div>
      {!filtered.length && <p className="text-center py-6 text-slate-500">ไม่พบใบจองตามเงื่อนไข หรือยังไม่มีข้อมูลที่คุณมีสิทธิ์ดู</p>}
      <div className="flex items-center justify-end gap-3 text-sm"><button type="button" disabled={currentPage === 1} className="disabled:opacity-40" onClick={() => setPage(currentPage - 1)}>ก่อนหน้า</button><span>หน้า {currentPage} / {pages}</span><button type="button" disabled={currentPage === pages} className="disabled:opacity-40" onClick={() => setPage(currentPage + 1)}>ถัดไป</button></div>
    </>}
  </section>;
}

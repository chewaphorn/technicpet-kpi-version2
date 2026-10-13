// Match only complete normalized headers: a generic "วันที่" must never
// accidentally select a completion, planned, or handover date.
export function warehouseField(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9ก-๙]/g, '');
  for (const alias of aliases) {
    for (const key of Object.keys(row)) {
      const value = row[key];
      if (normalize(key) === normalize(alias) && value != null && String(value).trim() && !['-', '—', 'null', 'n/a'].includes(String(value).trim().toLowerCase())) return value;
    }
  }
  return '';
}

export function warehouseDate(value: unknown): string {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const text = String(value ?? '').trim();
  // Unformatted Excel/Sheets serial dates (including fractional time).
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(text)) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const match = text.match(/^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})(?:[ T].*)?$/);
  if (!match) return '';
  const ymd = match[1].length === 4;
  let year = Number(ymd ? match[1] : match[3]);
  if (year < 100) return ''; // Ambiguous century must not be invented.
  if (year > 2400) year -= 543;
  const month = Number(match[2]);
  const day = Number(ymd ? match[3] : match[1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : '';
}

export function warehouseDays(start: unknown, end: unknown): number | undefined {
  const a = warehouseDate(start), b = warehouseDate(end);
  return a && b && b >= a ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) : undefined;
}

export const warehouseReceivedAliases = ['รับใบจอง', 'วันที่รับใบจอง', 'วันที่รับเอกสาร', 'received_work_date', 'receivedBookingDate', 'received_date'];
export const warehouseDocDateAliases = ['วันที่', 'วันที่เอกสาร', 'วันที่ใบจอง', 'date', 'docDate', 'snapshot_date', 'order_date'];

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { ParsedFileData } from '../types';

export interface GoogleSheetConfig {
  spreadsheetUrl: string;
  spreadsheetId: string;
  mode: 'master' | 'individual';
  salesTabName: string;
  pickingTabName: string;
  deliveryTabName: string;
  salesUrl?: string;
  pickingUrl?: string;
  deliveryUrl?: string;
  autoSync: boolean;
  lastSyncedAt?: string;
  sheetTitle?: string;
  availableTabs?: string[];
}

export const DEFAULT_GOOGLE_SHEET_CONFIG: GoogleSheetConfig = {
  spreadsheetUrl: '',
  spreadsheetId: '',
  mode: 'master',
  salesTabName: 'ใบสั่งซื้อ_SalesOrder',
  pickingTabName: 'ใบจัดสินค้า_PickingList',
  deliveryTabName: 'ป้ายจัดส่ง_DeliveryTag',
  autoSync: false,
  sheetTitle: '',
  availableTabs: ['ใบสั่งซื้อ_SalesOrder', 'ใบจัดสินค้า_PickingList', 'ป้ายจัดส่ง_DeliveryTag'],
};

export interface ExtractedSheetInfo {
  isPublishedWeb: boolean;
  id: string;
  gid: string | null;
  rawUrl: string;
  sanitizedUrl: string;
}

/**
 * 1. Sanitizes pasted URLs to clean duplicate URLs, duplicate https://, or surrounding text.
 * Uses regex `/spreadsheets\/d\/([a-zA-Z0-9-_]+)/` to cleanly extract Sheet ID and gid.
 */
export function sanitizeGoogleSheetUrl(rawInput: string): string {
  if (!rawInput) return '';
  let text = rawInput.trim();

  // If text contains multiple https:// or http:// prefixes (e.g. repeated paste)
  // or user copied a second link right next to the first link
  const httpMatches = text.match(/https?:\/\//gi);
  if (httpMatches && httpMatches.length > 1) {
    // If multiple http(s) found, split and take the first token that contains spreadsheets or docs.google.com
    const tokens = text.split(/(?=https?:\/\/)/gi).filter(t => t.trim().length > 0);
    const validToken = tokens.find(t => t.includes('docs.google.com') || t.includes('spreadsheets'));
    if (validToken) {
      text = validToken.trim();
    }
  }

  // Remove duplicate leading protocol like https://https://
  text = text.replace(/^(?:https?:\/\/)+/i, 'https://');

  // Extract gid (tab identifier) if present
  const gidMatch = text.match(/(?:[?&#]gid=|^gid=)(\d+)/i);
  const gid = gidMatch ? gidMatch[1] : null;

  // 1. Published to web format: /spreadsheets/d/e/2PACX-.../pubhtml or /pub
  const pubMatch = text.match(/\/spreadsheets(?:\/u\/\d+)?\/d\/e\/([a-zA-Z0-9-_]+)/i);
  if (pubMatch && pubMatch[1]) {
    return `https://docs.google.com/spreadsheets/d/e/${pubMatch[1]}/pubhtml${gid !== null ? `?gid=${gid}` : ''}`;
  }

  // 2. Standard spreadsheet format using the requested regex: /spreadsheets/d/([a-zA-Z0-9-_]+)/
  const standardMatch = text.match(/\/spreadsheets(?:\/u\/\d+)?\/d\/([a-zA-Z0-9-_]+)/i);
  if (standardMatch && standardMatch[1] && standardMatch[1] !== 'e') {
    const sheetId = standardMatch[1];
    return `https://docs.google.com/spreadsheets/d/${sheetId}/edit${gid !== null ? `?gid=${gid}` : ''}`;
  }

  // 3. Drive file format: /file/d/([a-zA-Z0-9-_]+)/
  const driveMatch = text.match(/\/file\/d\/([a-zA-Z0-9-_]+)/i);
  if (driveMatch && driveMatch[1]) {
    const fileId = driveMatch[1];
    return `https://docs.google.com/spreadsheets/d/${fileId}/edit${gid !== null ? `?gid=${gid}` : ''}`;
  }

  // 4. If raw ID string (15+ alphanumeric chars)
  const rawIdMatch = text.match(/^[a-zA-Z0-9-_]{15,}$/);
  if (rawIdMatch) {
    return `https://docs.google.com/spreadsheets/d/${text}/edit`;
  }

  return text;
}

/**
 * Extracts Google Spreadsheet ID and properties from various URL formats
 */
export function extractSpreadsheetInfo(input: string): ExtractedSheetInfo {
  if (!input) {
    return { isPublishedWeb: false, id: '', gid: null, rawUrl: '', sanitizedUrl: '' };
  }
  const sanitized = sanitizeGoogleSheetUrl(input);
  const trimmed = sanitized.trim();
  const gidMatch = trimmed.match(/[#&?]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : null;

  // Published to web link: /spreadsheets/d/e/2PACX-.../pubhtml or /pub?output=csv
  const pubMatch = trimmed.match(/\/spreadsheets(?:\/u\/\d+)?\/d\/e\/([a-zA-Z0-9-_]+)/);
  if (pubMatch && pubMatch[1]) {
    return {
      isPublishedWeb: true,
      id: pubMatch[1],
      gid,
      rawUrl: input,
      sanitizedUrl: sanitized,
    };
  }

  // Standard sheet link: /spreadsheets/d/SPREADSHEET_ID/...
  const standardMatch = trimmed.match(/\/spreadsheets(?:\/u\/\d+)?\/d\/([a-zA-Z0-9-_]+)/);
  if (standardMatch && standardMatch[1] && standardMatch[1] !== 'e') {
    return {
      isPublishedWeb: false,
      id: standardMatch[1],
      gid,
      rawUrl: input,
      sanitizedUrl: sanitized,
    };
  }

  // Drive file link: /file/d/FILE_ID/...
  const driveMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
  if (driveMatch && driveMatch[1]) {
    return {
      isPublishedWeb: false,
      id: driveMatch[1],
      gid,
      rawUrl: input,
      sanitizedUrl: sanitized,
    };
  }

  // If already a raw ID string
  if (/^[a-zA-Z0-9-_]{15,}$/.test(trimmed)) {
    return {
      isPublishedWeb: trimmed.startsWith('2PACX'),
      id: trimmed,
      gid,
      rawUrl: input,
      sanitizedUrl: sanitized,
    };
  }

  return {
    isPublishedWeb: false,
    id: trimmed,
    gid,
    rawUrl: input,
    sanitizedUrl: sanitized,
  };
}

export function extractSpreadsheetId(input: string): string {
  return extractSpreadsheetInfo(input).id;
}

export function extractGidFromUrl(url: string): string | null {
  return extractSpreadsheetInfo(url).gid;
}

/**
 * Parses raw CSV text returned from Google Sheets or web endpoints
 */
export function parseGoogleSheetCsvText(csvText: string, tabName: string): ParsedFileData {
  const cleanText = csvText.replace(/^\uFEFF/, '').trim(); // Remove UTF-8 BOM
  const results = Papa.parse(cleanText, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
  });

  const headers = (results.meta.fields || []).map((h) => h.trim()).filter(Boolean);
  const rows = (results.data as Record<string, any>[]).filter((row) =>
    Object.values(row).some((val) => val !== null && val !== undefined && String(val).trim() !== '')
  );

  const calculatedSize = `${Math.max(1, Math.round(csvText.length / 1024)).toFixed(1)} KB`;

  return {
    fileName: `GoogleSheet_${tabName}.csv`,
    fileSize: calculatedSize,
    rowCount: rows.length,
    columns: headers,
    sampleRows: rows.slice(0, 5),
    rawRows: rows,
  };
}

/**
 * Converts a SheetJS Worksheet object into ParsedFileData
 */
export function parseXlsxWorksheet(sheet: XLSX.WorkSheet, tabName: string): ParsedFileData {
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd',
  });

  const validRows = jsonRows.filter((row) =>
    Object.values(row).some((val) => val !== null && val !== undefined && String(val).trim() !== '')
  );

  const headers = validRows.length > 0 ? Object.keys(validRows[0]) : [];

  return {
    fileName: `GoogleSheet_${tabName}.csv`,
    fileSize: `${Math.max(1, (JSON.stringify(validRows).length / 1024)).toFixed(1)} KB`,
    rowCount: validRows.length,
    columns: headers,
    sampleRows: validRows.slice(0, 5),
    rawRows: validRows,
  };
}

function findDepartmentSheetName(
  workbook: XLSX.WorkBook,
  tabType: 'sales' | 'picking' | 'delivery',
  preferredTab: string
): string | undefined {
  const preferred = preferredTab.trim().toLowerCase();
  const keywords = tabType === 'sales'
    ? ['เลขที่เอกสาร', 'เลขที่ใบสั่งซื้อ', 'เลขที่ใบสั่งขาย', 'docno', 'orderno', 'booking_no', 'record_type', 'ยอดขาย', 'sales']
    : tabType === 'picking'
      ? ['เลขที่ใบจัดสินค้า', 'เลขที่ใบสั่งขาย', 'ผู้หยิบสินค้า', 'itemsCount', 'booking_no', 'record_type', 'picking', 'จัดสินค้า']
      : ['เลขที่ใบส่งของ', 'เลขที่จัดส่ง', 'เลขที่ใบสั่งขาย', 'ทะเบียนรถ', 'booking_no', 'record_type', 'delivery', 'ขนส่ง'];

  let best: { name: string; score: number } | undefined;
  for (const name of workbook.SheetNames || []) {
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[name], {
      header: 1,
      raw: false,
      defval: '',
    }) as unknown as any[][];
    const headers = (rows[0] || []).map((value) => String(value).trim().toLowerCase());
    const lowerName = name.toLowerCase();
    let score = lowerName === preferred ? 100 : 0;
    for (const keyword of keywords) {
      if (lowerName.includes(keyword.toLowerCase())) score += 10;
      if (headers.some((header) => header === keyword.toLowerCase() || header.includes(keyword.toLowerCase()))) score += 5;
    }
    if (!best || score > best.score) best = { name, score };
  }
  return best && best.score > 0 ? best.name : undefined;
}

export interface MultiSheetFetchResult {
  salesParsed: ParsedFileData;
  pickingParsed: ParsedFileData;
  deliveryParsed: ParsedFileData;
  allTabsFound: string[];
  sourceFormat: 'xlsx_workbook' | 'gviz_csv' | 'direct_csv' | 'published_csv';
}

/**
 * Fetches and extracts all 3 departmental datasets from any Google Sheet URL or XLSX/CSV endpoint
 * Automatically tries XLSX multi-tab download, GViz endpoints, export CSV, and published links
 */
export async function fetchAllSheetsFromGoogleUrl(
  inputUrlOrId: string,
  preferredTabs?: {
    salesTab?: string;
    pickingTab?: string;
    deliveryTab?: string;
  }
): Promise<MultiSheetFetchResult> {
  const info = extractSpreadsheetInfo(inputUrlOrId);
  const targetId = info.id;
  const rawUrl = info.rawUrl;

  if (!targetId && !rawUrl.startsWith('http')) {
    throw new Error('กรุณาระบุลิงก์ Google Sheets หรือ Spreadsheet ID ที่ถูกต้อง');
  }

  const salesTabPref = (preferredTabs?.salesTab || 'ใบสั่งซื้อ_SalesOrder').trim().toLowerCase();
  const pickingTabPref = (preferredTabs?.pickingTab || 'ใบจัดสินค้า_PickingList').trim().toLowerCase();
  const deliveryTabPref = (preferredTabs?.deliveryTab || 'ป้ายจัดส่ง_DeliveryTag').trim().toLowerCase();

  // 1. If it's a published web link: /spreadsheets/d/e/2PACX-.../
  if (info.isPublishedWeb) {
    const pubCsvUrl = `https://docs.google.com/spreadsheets/d/e/${targetId}/pub?output=csv${info.gid ? `&gid=${info.gid}` : ''}`;
    try {
      const resp = await fetch(pubCsvUrl);
      if (resp.ok) {
        const text = await resp.text();
        if (!text.includes('<!DOCTYPE html>') && text.length > 20) {
          const parsed = parseGoogleSheetCsvText(text, 'PublishedSheet');
          return {
            salesParsed: parsed,
            pickingParsed: createEmptyParsedFile('ใบจัดสินค้า_PickingList'),
            deliveryParsed: createEmptyParsedFile('ป้ายจัดส่ง_DeliveryTag'),
            allTabsFound: ['PublishedSheet'],
            sourceFormat: 'published_csv',
          };
        }
      }
    } catch (e) {
      console.warn('Published CSV fetch fallback:', e);
    }
  }

  // 2. Try Google Visualization API (GViz CSV) with CORS support (highest reliability for public Google Sheets)
  if (targetId) {
    let salesParsed: ParsedFileData | null = null;
    let pickingParsed: ParsedFileData | null = null;
    let deliveryParsed: ParsedFileData | null = null;

    try {
      salesParsed = await fetchPublicGoogleSheet(targetId, preferredTabs?.salesTab, info.gid);
    } catch {
      salesParsed = null;
    }

    if (salesParsed && salesParsed.rowCount > 0) {
      // Fetch Picking tab
      try {
        pickingParsed = await fetchPublicGoogleSheet(targetId, preferredTabs?.pickingTab || 'ใบจัดสินค้า_PickingList');
      } catch {
        pickingParsed = createEmptyParsedFile(preferredTabs?.pickingTab || 'ใบจัดสินค้า_PickingList');
      }

      // Fetch Delivery tab
      try {
        deliveryParsed = await fetchPublicGoogleSheet(targetId, preferredTabs?.deliveryTab || 'ป้ายจัดส่ง_DeliveryTag');
      } catch {
        deliveryParsed = createEmptyParsedFile(preferredTabs?.deliveryTab || 'ป้ายจัดส่ง_DeliveryTag');
      }

      return {
        salesParsed,
        pickingParsed: pickingParsed || createEmptyParsedFile('ใบจัดสินค้า_PickingList'),
        deliveryParsed: deliveryParsed || createEmptyParsedFile('ป้ายจัดส่ง_DeliveryTag'),
        allTabsFound: [preferredTabs?.salesTab || 'ใบสั่งซื้อ_SalesOrder'],
        sourceFormat: 'gviz_csv',
      };
    }
  }

  // 3. Try XLSX Workbook Export (fetches ALL worksheets simultaneously if allowed)
  if (!info.isPublishedWeb && targetId) {
    const xlsxExportUrl = `https://docs.google.com/spreadsheets/d/${targetId}/export?format=xlsx`;
    try {
      const resp = await fetch(xlsxExportUrl);
      if (resp.ok) {
        const arrayBuf = await resp.arrayBuffer();
        if (arrayBuf.byteLength > 100) {
          const workbook = XLSX.read(arrayBuf, { type: 'array' });
          const sheetNames = workbook.SheetNames || [];

          if (sheetNames.length > 0) {
            // Find best matching sheet for Sales
            const salesSheetName = sheetNames.find((name) => {
              const lower = name.toLowerCase();
              return lower === salesTabPref || lower.includes('สั่งซื้อ') || lower.includes('sale') || lower.includes('order') || lower.includes('บิล');
            });

            if (!salesSheetName) {
              throw new Error(`ไม่พบแท็บฝ่ายขาย "${salesTabPref}" ใน Google Sheet`);
            }

            // Find best matching sheet for Picking
            const pickingSheetName = sheetNames.find((name) => {
              const lower = name.toLowerCase();
              return (lower === pickingTabPref || lower.includes('จัด') || lower.includes('หยิบ') || lower.includes('pick') || lower.includes('คลัง')) && name !== salesSheetName;
            });

            // Find best matching sheet for Delivery
            const deliverySheetName = sheetNames.find((name) => {
              const lower = name.toLowerCase();
              return (lower === deliveryTabPref || lower.includes('ส่ง') || lower.includes('เที่ยว') || lower.includes('deliver') || lower.includes('trip') || lower.includes('ป้าย')) && name !== salesSheetName && name !== pickingSheetName;
            });

            const salesParsed = parseXlsxWorksheet(workbook.Sheets[salesSheetName], salesSheetName);
            const pickingParsed = pickingSheetName 
              ? parseXlsxWorksheet(workbook.Sheets[pickingSheetName], pickingSheetName)
              : createEmptyParsedFile(preferredTabs?.pickingTab || 'ใบจัดสินค้า_PickingList');
            const deliveryParsed = deliverySheetName
              ? parseXlsxWorksheet(workbook.Sheets[deliverySheetName], deliverySheetName)
              : createEmptyParsedFile(preferredTabs?.deliveryTab || 'ป้ายจัดส่ง_DeliveryTag');

            return {
              salesParsed,
              pickingParsed,
              deliveryParsed,
              allTabsFound: sheetNames,
              sourceFormat: 'xlsx_workbook',
            };
          }
        }
      }
    } catch (e) {
      console.warn('XLSX export fetch fallback:', e);
    }
  }

  // 4. Try direct fetch if rawUrl is a direct HTTP CSV URL
  if (rawUrl.startsWith('http')) {
    try {
      const resp = await fetch(rawUrl);
      if (resp.ok) {
        const text = await resp.text();
        if (!text.includes('<!DOCTYPE html>') && text.length > 20) {
          const parsed = parseGoogleSheetCsvText(text, 'SheetData');
          return {
            salesParsed: parsed,
            pickingParsed: createEmptyParsedFile('ใบจัดสินค้า_PickingList'),
            deliveryParsed: createEmptyParsedFile('ป้ายจัดส่ง_DeliveryTag'),
            allTabsFound: ['SheetData'],
            sourceFormat: 'direct_csv',
          };
        }
      }
    } catch (e) {
      console.warn('Direct URL fetch fallback:', e);
    }
  }

  // If all fetch attempts failed, explain clearly
  throw new Error(
    'ไม่สามารถเข้าถึง Google Sheet จากลิงก์ที่ระบุได้ กรุณาตรวจสอบว่า:\n' +
    '1. ได้เปิดสิทธิ์แชร์เป็น "ทุกคนที่มีลิงก์มีสิทธิ์ดู" (Anyone with the link can view)\n' +
    '2. ลิงก์ Google Sheet ถูกต้องและไม่เป็นเอกสารส่วนตัว (Private)\n' +
    '3. ชื่อแท็บใน Google Sheet ตรงกับที่กำหนดไว้ (หรือปรับแต่งที่ปุ่ม "ตั้งชื่อแท็บ")'
  );
}

function createEmptyParsedFile(name: string): ParsedFileData {
  return {
    fileName: `GoogleSheet_${name}.csv`,
    fileSize: '0 KB',
    rowCount: 0,
    columns: [],
    sampleRows: [],
    rawRows: [],
  };
}

/**
 * Helper to fetch with timeout (3-5 seconds) to prevent hanging requests
 */
export async function fetchWithTimeout(url: string, timeoutMs = 4000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Caching interfaces and helpers (15 minutes TTL)
 */
export interface SheetCacheEntry {
  version: 2;
  timestamp: number;
  sheetId: string;
  data: ParsedFileData;
}

export const SHEET_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function getDepartmentSheetCache(
  dept: 'sales' | 'picking' | 'delivery' | 'warehouse',
  sheetId: string,
  maxAgeMs = SHEET_CACHE_TTL_MS
): { data: ParsedFileData; timestamp: number } | null {
  try {
    const key = dept === 'warehouse' ? 'picking' : dept;
    const raw = localStorage.getItem(`technicpet_sheet_cache_${key}`);
    if (!raw) return null;
    const entry: SheetCacheEntry = JSON.parse(raw);
    if (!entry || entry.version !== 2 || !entry.timestamp || !entry.data) return null;
    if (entry.sheetId !== sheetId) return null;
    if (Date.now() - entry.timestamp > maxAgeMs) {
      localStorage.removeItem(`technicpet_sheet_cache_${key}`);
      return null;
    }
    return { data: entry.data, timestamp: entry.timestamp };
  } catch {
    return null;
  }
}

export function setDepartmentSheetCache(
  dept: 'sales' | 'picking' | 'delivery' | 'warehouse',
  sheetId: string,
  data: ParsedFileData
): void {
  try {
    const key = dept === 'warehouse' ? 'picking' : dept;
    const entry: SheetCacheEntry = {
      version: 2,
      timestamp: Date.now(),
      sheetId,
      data,
    };
    localStorage.setItem(`technicpet_sheet_cache_${key}`, JSON.stringify(entry));
  } catch (e) {
    console.warn('LocalStorage cache write error:', e);
  }
}

export function clearDepartmentSheetCache(dept?: 'sales' | 'picking' | 'delivery' | 'warehouse'): void {
  try {
    if (dept) {
      const key = dept === 'warehouse' ? 'picking' : dept;
      localStorage.removeItem(`technicpet_sheet_cache_${key}`);
    } else {
      localStorage.removeItem('technicpet_sheet_cache_sales');
      localStorage.removeItem('technicpet_sheet_cache_picking');
      localStorage.removeItem('technicpet_sheet_cache_delivery');
    }
  } catch (e) {
    // ignore
  }
}

export function getDepartmentSheetCacheTimestamp(dept: 'sales' | 'picking' | 'delivery' | 'warehouse'): number | null {
  try {
    const key = dept === 'warehouse' ? 'picking' : dept;
    const raw = localStorage.getItem(`technicpet_sheet_cache_${key}`);
    if (!raw) return null;
    const entry: SheetCacheEntry = JSON.parse(raw);
    return entry?.timestamp || null;
  } catch {
    return null;
  }
}

/**
 * Fetches Google Sheet as CSV via public export or Google Visualization API endpoint
 */
export async function fetchPublicGoogleSheet(
  spreadsheetIdOrUrl: string,
  sheetTabName?: string,
  gid?: string | null
): Promise<ParsedFileData> {
  const cleanId = extractSpreadsheetId(spreadsheetIdOrUrl);
  if (!cleanId) {
    throw new Error('ไม่พบ Google Spreadsheet ID ที่ถูกต้อง');
  }

  // Determine possible URLs to query
  const candidateUrls: string[] = [];

  // Explicit gid identifies the user's tab; do not replace it with a default name.
  // Direct CSV export preserves mixed-type date cells which GViz may treat as null.
  if (gid != null) {
    candidateUrls.push(`https://docs.google.com/spreadsheets/d/${cleanId}/export?format=csv&gid=${gid}`);
  }
  if (sheetTabName && gid == null) {
    candidateUrls.push(`https://docs.google.com/spreadsheets/d/${cleanId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetTabName)}`);
  }
  if (gid) {
    candidateUrls.push(`https://docs.google.com/spreadsheets/d/${cleanId}/gviz/tq?tqx=out:csv&gid=${gid}`);
  }
  // Do not silently fall back to the first tab when a department tab was requested.
  if (!sheetTabName && !gid) {
    candidateUrls.push(`https://docs.google.com/spreadsheets/d/${cleanId}/gviz/tq?tqx=out:csv`);
  }

  // 2. Direct CSV export endpoint when no tab was specified
  if (!sheetTabName && !gid) {
    candidateUrls.push(`https://docs.google.com/spreadsheets/d/${cleanId}/export?format=csv`);
  }

  // 3. Published web CSV format
  if (gid) {
    candidateUrls.push(`https://docs.google.com/spreadsheets/d/${cleanId}/pub?output=csv&gid=${gid}`);
  }
  if (!sheetTabName && !gid) {
    candidateUrls.push(`https://docs.google.com/spreadsheets/d/${cleanId}/pub?output=csv`);
  }

  let lastStatus = 0;

  for (const url of candidateUrls) {
    try {
      const response = await fetchWithTimeout(url, 3500);
      lastStatus = response.status;
      if (response.ok) {
        const csvText = await response.text();
        if (csvText && !csvText.includes('<!DOCTYPE html>') && !csvText.includes('<html') && csvText.length > 10) {
          return parseGoogleSheetCsvText(csvText, sheetTabName || 'Google_Sheet_Data');
        }
      }
    } catch {
      // Timeout or network error: continue immediately to next candidate URL
    }
  }

  // 4. Try XLSX export with timeout as a final automated attempt before throwing
  try {
    const xlsxUrl = `https://docs.google.com/spreadsheets/d/${cleanId}/export?format=xlsx`;
    if (gid != null) throw new Error('Cannot resolve an explicit gid by worksheet name');
    const resp = await fetchWithTimeout(xlsxUrl, 4000);
    if (resp.ok) {
      const arrayBuf = await resp.arrayBuffer();
      if (arrayBuf.byteLength > 100) {
        const workbook = XLSX.read(arrayBuf, { type: 'array' });
        const sheetNames = workbook.SheetNames || [];
        if (sheetNames.length > 0) {
          const targetSheet = sheetTabName
            ? sheetNames.find(s => s.toLowerCase() === sheetTabName.toLowerCase())
            : undefined;
          if (!targetSheet) {
            throw new Error(`ไม่พบแท็บ "${sheetTabName}" ใน Google Sheet`);
          }
          return parseXlsxWorksheet(workbook.Sheets[targetSheet], targetSheet);
        }
      }
    }
  } catch {
    // Ignore and proceed to user friendly error
  }

  throw new Error(
    `ไม่สามารถเข้าถึง Google Sheet ได้ (Status: ${lastStatus || 404}) กรุณาตรวจสอบว่าได้ตั้งค่าสิทธิ์แชร์ใน Google Sheet เป็น "ทุกคนที่มีลิงก์มีสิทธิ์ดู (Anyone with the link can view)"`
  );
}

/**
 * Fetches Google Sheet data using Google Sheets REST API v4 with OAuth token
 */
export async function fetchGoogleSheetWithOAuth(
  spreadsheetId: string,
  rangeOrTabName: string,
  accessToken: string
): Promise<ParsedFileData> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const range = rangeOrTabName.includes('!') ? rangeOrTabName : `${rangeOrTabName}!A1:ZZ5000`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(range)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    const message = errJson?.error?.message || response.statusText;
    throw new Error(`Google Sheets API Error (${response.status}): ${message}`);
  }

  const data = await response.json();
  const values: any[][] = data.values || [];

  if (values.length === 0) {
    return {
      fileName: `GoogleSheet_${rangeOrTabName}.csv`,
      fileSize: '0 KB',
      rowCount: 0,
      columns: [],
      sampleRows: [],
      rawRows: [],
    };
  }

  const headers: string[] = (values[0] || []).map((h: any) => String(h).trim());
  const rowObjects = values.slice(1).map((row: any[]) => {
    const obj: Record<string, any> = {};
    headers.forEach((h, index) => {
      obj[h] = row[index] !== undefined ? row[index] : '';
    });
    return obj;
  }).filter((r) => Object.values(r).some((v) => String(v).trim() !== ''));

  const calculatedSize = `${Math.max(1, (JSON.stringify(rowObjects).length / 1024)).toFixed(1)} KB`;

  return {
    fileName: `GoogleSheet_${rangeOrTabName}.csv`,
    fileSize: calculatedSize,
    rowCount: rowObjects.length,
    columns: headers,
    sampleRows: rowObjects.slice(0, 5),
    rawRows: rowObjects,
  };
}

/**
 * Fetches metadata and sheet tabs list using OAuth
 */
export async function fetchGoogleSheetMetadata(
  spreadsheetId: string,
  accessToken: string
): Promise<{ title: string; sheets: string[] }> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}?fields=properties.title,sheets.properties.title`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`ไม่สามารถดึงข้อมูลแผ่นงานได้ (Status: ${response.status})`);
  }

  const data = await response.json();
  const title = data.properties?.title || 'Google Spreadsheet';
  const sheets = (data.sheets || []).map((s: any) => s.properties?.title as string).filter(Boolean);

  return { title, sheets };
}

/**
 * Fetches and parses a single department Google Sheet or CSV URL with caching and fallback
 */
export async function fetchSingleDepartmentSheet(
  urlOrId: string,
  tabType: 'sales' | 'picking' | 'delivery',
  optionsOrFallback?: string | { fallbackTabName?: string; forceRefresh?: boolean }
): Promise<ParsedFileData & { _fromCache?: boolean; _cachedAt?: number }> {
  const trimmed = (urlOrId || '').trim();
  if (!trimmed) {
    throw new Error('กรุณาระบุลิงก์ Google Sheet');
  }

  const fallbackTab = typeof optionsOrFallback === 'string' 
    ? optionsOrFallback 
    : optionsOrFallback?.fallbackTabName;
  const forceRefresh = typeof optionsOrFallback === 'object' 
    ? Boolean(optionsOrFallback.forceRefresh) 
    : false;

  const defaultTab = fallbackTab || (
    tabType === 'sales' ? 'ใบสั่งซื้อ_SalesOrder' :
    tabType === 'picking' ? 'ใบจัดสินค้า_PickingList' :
    'ป้ายจัดส่ง_DeliveryTag'
  );

  const info = extractSpreadsheetInfo(trimmed);
  const targetId = info.id;

  const cacheIdentity = `${targetId}|${info.gid != null ? `gid=${info.gid}` : `tab=${defaultTab}`}`;

  // 0. Check Local Cache (15 min TTL) if not forcing refresh
  if (!forceRefresh && targetId) {
    const cached = getDepartmentSheetCache(tabType, cacheIdentity);
    if (cached && cached.data && cached.data.rowCount > 0) {
      return {
        ...cached.data,
        _fromCache: true,
        _cachedAt: cached.timestamp,
      };
    }
  }

  // 1. If published web CSV
  if (info.isPublishedWeb) {
    const pubCsvUrl = `https://docs.google.com/spreadsheets/d/e/${targetId}/pub?output=csv${info.gid ? `&gid=${info.gid}` : ''}`;
    try {
      const resp = await fetchWithTimeout(pubCsvUrl, 3500);
      if (resp.ok) {
        const text = await resp.text();
        if (!text.includes('<!DOCTYPE html>') && text.length > 20) {
          const parsed = parseGoogleSheetCsvText(text, defaultTab);
          if (targetId && parsed.rowCount > 0) {
            setDepartmentSheetCache(tabType, cacheIdentity, parsed);
          }
          return { ...parsed, _fromCache: false };
        }
      }
    } catch (e) {
      console.warn('Published CSV fetch failed:', e);
    }
  }

  // 2. Try Google Visualization API (GViz CSV)
  if (targetId) {
    try {
      const parsed = await fetchPublicGoogleSheet(targetId, defaultTab, info.gid);
      if (parsed && parsed.rowCount > 0) {
        setDepartmentSheetCache(tabType, cacheIdentity, parsed);
        return { ...parsed, _fromCache: false };
      }
    } catch (e) {
      console.warn(`Google Sheet tab "${defaultTab}" fetch failed:`, e);
    }

    // 3. Try XLSX export for matching sheet
    try {
      if (info.gid != null) throw new Error('ไม่สามารถเลือกแท็บจาก gid ได้ จึงไม่ใช้แท็บอื่นแทน');
      const xlsxExportUrl = `https://docs.google.com/spreadsheets/d/${targetId}/export?format=xlsx`;
      const resp = await fetchWithTimeout(xlsxExportUrl, 4000);
      if (resp.ok) {
        const arrayBuf = await resp.arrayBuffer();
        if (arrayBuf.byteLength > 100) {
          const workbook = XLSX.read(arrayBuf, { type: 'array' });
          const sheetNames = workbook.SheetNames || [];
          if (sheetNames.length > 0) {
            // Find matched or first sheet
            const matchedName = findDepartmentSheetName(workbook, tabType, defaultTab);

            if (!matchedName) {
              throw new Error(`ไม่พบแท็บสำหรับแผนก ${tabType} ใน Google Sheet`);
            }

            const parsed = parseXlsxWorksheet(workbook.Sheets[matchedName], matchedName);
            if (parsed.rowCount > 0) {
              setDepartmentSheetCache(tabType, cacheIdentity, parsed);
            }
            return { ...parsed, _fromCache: false };
          }
        }
      }
    } catch (e) {
      console.warn('XLSX export failed:', e);
    }
  }

  // 4. Direct CSV HTTP
  if (trimmed.startsWith('http') && !targetId) {
    try {
      const resp = await fetchWithTimeout(trimmed, 3500);
      if (resp.ok) {
        const text = await resp.text();
        if (!text.includes('<!DOCTYPE html>') && text.length > 20) {
          const parsed = parseGoogleSheetCsvText(text, defaultTab);
          if (targetId && parsed.rowCount > 0) {
            setDepartmentSheetCache(tabType, cacheIdentity, parsed);
          }
          return { ...parsed, _fromCache: false };
        }
      }
    } catch (e) {
      console.warn('Direct fetch failed:', e);
    }
  }

  throw new Error(`ไม่สามารถเข้าถึง Google Sheet ได้ กรุณาตรวจสอบว่าได้แชร์เป็น "ทุกคนที่มีลิงก์มีสิทธิ์ดู" (Anyone with link)`);
}

import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParsedFileData {
  fileName: string;
  fileSize: string;
  rowCount: number;
  columns: string[];
  sampleRows: Record<string, any>[];
  rawRows: any[];
}

/**
 * Parses either a CSV or Excel (.xlsx/.xls) file and returns structured preview data
 */
export async function parseUploadFile(file: File): Promise<ParsedFileData> {
  const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
  const sizeFormatted = file.size > 1024 * 1024 
    ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` 
    : `${(file.size / 1024).toFixed(1)} KB`;

  if (isExcel) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (!jsonData || jsonData.length === 0) {
      return {
        fileName: file.name,
        fileSize: sizeFormatted,
        rowCount: 0,
        columns: [],
        sampleRows: [],
        rawRows: [],
      };
    }

    // Find the real header row index (some Excel files have titles or blank rows in rows 0-5)
    let headerRowIdx = 0;
    let maxValidCols = 0;
    const headerKeywords = ['เลขที่', 'วันที่', 'สินค้า', 'ลูกค้า', 'รหัส', 'ลำดับ', 'จำนวน', 'so', 'doc', 'order', 'date', 'customer', 'product', 'item', 'qty', 'price', 'total', 'amount', 'พนักงานขาย', 'ผู้จัด', 'ทะเบียน', 'สถานะ'];

    for (let r = 0; r < Math.min(jsonData.length, 8); r++) {
      const row = jsonData[r];
      if (Array.isArray(row)) {
        const nonEmptyCells = row.filter((c: any) => c !== undefined && c !== null && String(c).trim() !== '');
        const hasKeywords = row.some((c: any) => {
          const str = String(c).toLowerCase();
          return headerKeywords.some((kw) => str.includes(kw));
        });

        if (hasKeywords && nonEmptyCells.length > maxValidCols) {
          headerRowIdx = r;
          maxValidCols = nonEmptyCells.length;
        } else if (nonEmptyCells.length > maxValidCols && maxValidCols === 0) {
          headerRowIdx = r;
          maxValidCols = nonEmptyCells.length;
        }
      }
    }

    const headers: string[] = (jsonData[headerRowIdx] || []).map((h: any, i: number) => {
      const str = h !== undefined && h !== null ? String(h).trim() : '';
      return str || `Column_${i + 1}`;
    });

    const rowObjects = jsonData.slice(headerRowIdx + 1).map((row: any[]) => {
      const obj: Record<string, any> = {};
      headers.forEach((h, index) => {
        obj[h] = row[index] !== undefined && row[index] !== null ? row[index] : '';
      });
      return obj;
    }).filter((r) => Object.values(r).some((v) => v !== ''));

    return {
      fileName: file.name,
      fileSize: sizeFormatted,
      rowCount: rowObjects.length,
      columns: headers,
      sampleRows: rowObjects.slice(0, 5),
      rawRows: rowObjects,
    };
  } else {
    // Parse CSV
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const headers = results.meta.fields || [];
          const rows = results.data as Record<string, any>[];
          resolve({
            fileName: file.name,
            fileSize: sizeFormatted,
            rowCount: rows.length,
            columns: headers,
            sampleRows: rows.slice(0, 5),
            rawRows: rows,
          });
        },
        error: (err) => {
          reject(err);
        },
      });
    });
  }
}

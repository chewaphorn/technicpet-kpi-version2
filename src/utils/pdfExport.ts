import jsPDF from 'jspdf';
import { toCanvas, toPng } from 'html-to-image';

export interface PDFExportOptions {
  fileName?: string;
  elementId?: string;
  element?: HTMLElement;
  orientation?: 'portrait' | 'landscape';
  format?: 'a4' | 'letter';
  quality?: number;
  onProgress?: (progress: number) => void;
}

/** Capture each pre-laid-out paper page intact. Never slice through text/rows. */
export async function exportElementToPDF({
  element, elementId, fileName = 'TechnicPet_Report.pdf',
  orientation = 'portrait', format = 'a4', quality = 2, onProgress,
}: PDFExportOptions): Promise<boolean> {
  const target = element || (elementId ? document.getElementById(elementId) : null);
  if (!target) return false;
  const scrollParent = target.closest<HTMLElement>('.pdf-preview-scroll') || target.parentElement;
  const scrollTop = scrollParent?.scrollTop || 0;
  const scrollLeft = scrollParent?.scrollLeft || 0;

  try {
    onProgress?.(10);
    if (scrollParent) { scrollParent.scrollTop = 0; scrollParent.scrollLeft = 0; }
    await document.fonts?.ready;
    const paperPages = [...target.querySelectorAll<HTMLElement>('[data-pdf-page]')];
    const pages = paperPages.length ? paperPages : [target];
    const pdf = new jsPDF({ orientation, unit: 'mm', format, compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    // Explicit pages already contain their 12 mm document margins.
    const margin = paperPages.length ? 0 : 12;
    for (let index = 0; index < pages.length; index++) {
      const page = pages[index];
      const bounds = page.getBoundingClientRect();
      if (!bounds.width || !bounds.height) throw new Error('Report page has no visible content');
      const options = {
        pixelRatio: quality, backgroundColor: '#ffffff', cacheBust: true,
        width: bounds.width, height: bounds.height,
        // Shadows belong to the preview, not to the printed sheet.
        style: { margin: '0', boxShadow: 'none' },
      };
      let canvas: HTMLCanvasElement;
      try {
        canvas = await toCanvas(page, options);
      } catch {
        const url = await toPng(page, options);
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve(); img.onerror = reject; img.src = url;
        });
        canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Unable to render report page');
        context.drawImage(img, 0, 0);
      }
      if (index) pdf.addPage();
      const scale = Math.min((pageWidth - margin * 2) / canvas.width, (pageHeight - margin * 2) / canvas.height);
      const width = canvas.width * scale;
      const height = canvas.height * scale;
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pageWidth - width) / 2, margin, width, height, undefined, 'FAST');
      onProgress?.(10 + Math.round(((index + 1) / pages.length) * 80));
    }
    pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
    onProgress?.(100);
    return true;
  } catch (error) {
    console.error('Failed to export PDF:', error);
    return false;
  } finally {
    if (scrollParent) { scrollParent.scrollTop = scrollTop; scrollParent.scrollLeft = scrollLeft; }
  }
}

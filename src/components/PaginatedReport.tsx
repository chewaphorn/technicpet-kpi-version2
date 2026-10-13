import React, { useLayoutEffect, useRef } from 'react';
import { paginateReport } from '../utils/reportPagination';

interface Props {
  children: React.ReactNode;
  revision: string;
  reportRef: React.RefObject<HTMLDivElement | null>;
  onLayout: (pages: number, error: string | null) => void;
}

/** Preview, browser print and download all use these same measured pages. */
export function PaginatedReport({ children, revision, reportRef, onLayout }: Props) {
  const sourceRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    let cancelled = false;
    onLayout(0, null);
    const layout = () => {
      if (cancelled || !sourceRef.current || !reportRef.current) return;
      try {
        onLayout(paginateReport(sourceRef.current, reportRef.current), null);
      } catch (error) {
        reportRef.current.replaceChildren();
        onLayout(0, error instanceof Error ? error.message : 'ไม่สามารถจัดหน้ารายงานได้');
      }
    };
    // Wait for final font metrics; fallback fonts can change where rows wrap.
    if (document.fonts?.status === 'loading') void document.fonts.ready.then(layout);
    else layout();
    document.fonts?.addEventListener('loadingdone', layout);
    return () => {
      cancelled = true;
      document.fonts?.removeEventListener('loadingdone', layout);
    };
  }, [revision, reportRef, onLayout]);

  return <>
    <div ref={sourceRef} className="pdf-report-source" aria-hidden="true">{children}</div>
    <div ref={reportRef} id="technicpet-pdf-printable-report" className="pdf-report-pages" />
  </>;
}

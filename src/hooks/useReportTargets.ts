import { useEffect, useState } from 'react';

export function readReportTargets() {
  let saved: Record<string, unknown> = {};
  try {
    saved = JSON.parse(localStorage.getItem('technicpet_kpi_targets') || '{}') || {};
  } catch { /* Use the same defaults in all report surfaces. */ }
  const positive = (value: unknown, fallback: number) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  };
  return {
    monthlySalesTarget: positive(saved.monthlySalesTarget, 15),
    warehousePickingLeadTimeTarget: positive(saved.warehousePickingLeadTimeTarget, 3),
  };
}

export function useReportTargets() {
  const [targets, setTargets] = useState(readReportTargets);
  useEffect(() => {
    const update = () => setTargets(readReportTargets());
    window.addEventListener('storage', update);
    window.addEventListener('technicpet:kpi-targets-updated', update);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener('technicpet:kpi-targets-updated', update);
    };
  }, []);
  return targets;
}

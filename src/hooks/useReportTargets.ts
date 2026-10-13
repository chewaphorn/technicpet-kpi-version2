import { useEffect, useState } from 'react';
import { DEFAULT_KPI_TARGETS } from '../utils/kpiTargets';

export function readReportTargets() {
  let saved: Record<string, unknown> = {};
  try {
    saved = JSON.parse(localStorage.getItem('technicpet_kpi_targets') || '{}') || {};
  } catch { /* Use the same defaults in all report surfaces. */ }
  const positive = (value: unknown, fallback: number) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  };
  const percent = (value: unknown, fallback: number) => {
    if (value === undefined || value === null || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 100 ? number : fallback;
  };
  return {
    warehouseCompletionTargetPercent: percent(saved.warehouseCompletionTargetPercent, DEFAULT_KPI_TARGETS.warehouseCompletionTargetPercent),
    warehousePickingLeadTimeTarget: positive(saved.warehousePickingLeadTimeTarget, DEFAULT_KPI_TARGETS.warehousePickingLeadTimeTarget),
    monthlySalesTarget: positive(saved.monthlySalesTarget, DEFAULT_KPI_TARGETS.monthlySalesTarget),
    averageSalesPerBillTargetBaht: positive(saved.averageSalesPerBillTargetBaht, DEFAULT_KPI_TARGETS.averageSalesPerBillTargetBaht),
    deliveryCompletionTargetPercent: percent(saved.deliveryCompletionTargetPercent, DEFAULT_KPI_TARGETS.deliveryCompletionTargetPercent),
    salesToLoadedLeadTimeTargetDays: positive(saved.salesToLoadedLeadTimeTargetDays, DEFAULT_KPI_TARGETS.salesToLoadedLeadTimeTargetDays),
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

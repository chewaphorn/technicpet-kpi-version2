export const DEFAULT_KPI_TARGETS = {
  warehouseCompletionTargetPercent: 80,
  warehousePickingLeadTimeTarget: 3,
  monthlySalesTarget: 15,
  averageSalesPerBillTargetBaht: 20000,
  deliveryCompletionTargetPercent: 80,
  salesToLoadedLeadTimeTargetDays: 6,
};
export type KpiTargets = typeof DEFAULT_KPI_TARGETS;

export function validKpiTargets(value: unknown): value is KpiTargets {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return Object.keys(DEFAULT_KPI_TARGETS).every(key => typeof data[key] === 'number' && Number.isFinite(data[key])) &&
    Number(data.warehousePickingLeadTimeTarget) > 0 && Number(data.monthlySalesTarget) > 0 &&
    Number(data.averageSalesPerBillTargetBaht) > 0 && Number(data.salesToLoadedLeadTimeTargetDays) > 0 &&
    Number(data.warehouseCompletionTargetPercent) >= 0 && Number(data.warehouseCompletionTargetPercent) <= 100 &&
    Number(data.deliveryCompletionTargetPercent) >= 0 && Number(data.deliveryCompletionTargetPercent) <= 100;
}

/** Preserve meaningful targets from the previous five-field settings document. */
export function normalizeKpiTargets(value: unknown): KpiTargets | null {
  if (validKpiTargets(value)) {
    const data = value as KpiTargets;
    return Object.fromEntries(Object.keys(DEFAULT_KPI_TARGETS).map(key => [key, data[key as keyof KpiTargets]])) as KpiTargets;
  }
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const oldDays = Number(data.kpiTargetDays);
  const oldPicking = Number(data.warehousePickingLeadTimeTarget);
  const oldMonthly = Number(data.monthlySalesTarget);
  if (!Number.isFinite(oldDays) || oldDays <= 0 || !Number.isFinite(oldPicking) || oldPicking <= 0 || !Number.isFinite(oldMonthly) || oldMonthly <= 0) return null;
  return {
    ...DEFAULT_KPI_TARGETS,
    warehousePickingLeadTimeTarget: oldPicking,
    monthlySalesTarget: oldMonthly,
    salesToLoadedLeadTimeTargetDays: oldPicking + oldDays,
  };
}

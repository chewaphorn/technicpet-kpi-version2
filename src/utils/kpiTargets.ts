export const DEFAULT_KPI_TARGETS = {
  kpiTargetDays: 3,
  slaTargetPercent: 95,
  utilizationTarget: 85,
  warehousePickingLeadTimeTarget: 3,
  monthlySalesTarget: 15,
};
export type KpiTargets = typeof DEFAULT_KPI_TARGETS;

export function validKpiTargets(value: unknown): value is KpiTargets {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return Object.keys(DEFAULT_KPI_TARGETS).every(key => typeof data[key] === 'number' && Number.isFinite(data[key])) &&
    Number(data.kpiTargetDays) > 0 && Number(data.warehousePickingLeadTimeTarget) > 0 && Number(data.monthlySalesTarget) > 0 &&
    Number(data.slaTargetPercent) >= 0 && Number(data.slaTargetPercent) <= 100 &&
    Number(data.utilizationTarget) >= 0 && Number(data.utilizationTarget) <= 100;
}

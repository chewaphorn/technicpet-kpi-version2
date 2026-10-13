import type { SalesDocType } from '../types';

export type ReportDepartment = 'overview' | 'sales' | 'warehouse' | 'delivery';
export interface ReportFilters {
  department: 'sales' | 'warehouse' | 'delivery';
  status?: string;
  search?: string;
  vehicle?: string;
  docType?: 'ALL' | SalesDocType;
}
export type ReportFilterValues = Omit<ReportFilters, 'department'>;

// Keep empty and one-sided ranges: '' means the user explicitly chose all dates.
export function createReportRequest(department: ReportDepartment | 'all', startDate?: string, endDate?: string, filters?: ReportFilterValues) {
  const dept = department === 'all' ? 'overview' : department;
  return {
    department: dept,
    dateRange: { start: startDate, end: endDate },
    filters: filters && dept !== 'overview' ? { ...filters, department: dept } as ReportFilters : null,
  };
}

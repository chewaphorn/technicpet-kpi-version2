import { warehouseDate } from './warehouseDates';
/**
 * Comprehensive Date Normalization & Parsing Utilities
 * Handles Thai Buddhist Era (2569 -> 2026), Gregorian years, multiple separators (/ and -),
 * and skips pure time strings (e.g. '08:30 น.') to avoid date filtering bugs.
 */

export function normalizeDateToISO(value?: string | number | Date | null): string {
  return warehouseDate(value);
}

/**
 * Calculates the earliest and latest valid ISO date from a list of raw date strings.
 */
export function getMinMaxDates(
  dateStrings: (string | undefined | null)[],
  fallbackStart = '2026-07-01',
  fallbackEnd = '2026-09-30'
): { min: string; max: string } {
  const normalized = dateStrings
    .map((d) => normalizeDateToISO(d))
    .filter((d) => d.length === 10)
    .sort();

  if (normalized.length === 0) {
    return { min: fallbackStart, max: fallbackEnd };
  }

  return {
    min: normalized[0],
    max: normalized[normalized.length - 1],
  };
}

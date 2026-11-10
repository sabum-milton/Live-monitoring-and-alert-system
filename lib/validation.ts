import { PARAMETERS, isPlausible } from './classification.ts';

export interface SampleValidation {
  values: Record<string, number | null>;
  rejected: string[];
  anyValue: boolean;
  signalQuality: 'valid' | 'weak' | 'invalid';
  dataSource: 'SIMULATED' | 'HARDWARE';
}

function coerce(value: unknown): number | null | 'INVALID' {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 'INVALID';
}

/**
 * Validate one incoming sample. Out-of-range or non-numeric values are dropped
 * and reported rather than being stored as if they were real measurements.
 */
export function validateSample(payload: Record<string, unknown>): SampleValidation {
  const rejected: string[] = [];
  const values: Record<string, number | null> = {};

  for (const parameter of PARAMETERS) {
    const parsed = coerce(payload[parameter]);
    if (parsed === 'INVALID') {
      rejected.push(`${parameter} is not numeric`);
      values[parameter] = null;
      continue;
    }
    if (parsed !== null && !isPlausible(parameter, parsed)) {
      rejected.push(`${parameter} value ${parsed} is outside plausible sensor range`);
      values[parameter] = null;
      continue;
    }
    values[parameter] = parsed;
  }

  const signalQuality = ['valid', 'weak', 'invalid'].includes(String(payload.signal_quality))
    ? (String(payload.signal_quality) as 'valid' | 'weak' | 'invalid')
    : 'valid';

  const dataSource = String(payload.data_source ?? 'HARDWARE').toUpperCase() === 'SIMULATED'
    ? 'SIMULATED'
    : 'HARDWARE';

  return {
    values,
    rejected,
    anyValue: PARAMETERS.some((parameter) => values[parameter] !== null),
    signalQuality,
    dataSource,
  };
}

/** Parse an optional ISO timestamp, clamped so a future clock cannot poison the timeline. */
export function resolveTimestamp(raw: unknown, now: Date = new Date()): Date | null {
  if (raw === undefined || raw === null || raw === '') return now;
  const parsed = new Date(String(raw));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime() > now.getTime() ? now : parsed;
}

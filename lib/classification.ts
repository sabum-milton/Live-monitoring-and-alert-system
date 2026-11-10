// CareWatch rule engine (browser copy).
// The ingest function holds an equivalent copy in supabase/functions/ingest-vitals/classification.ts.
// Keep the rules aligned across both files.

export type ParameterStatus = 'NORMAL' | 'ABNORMAL' | 'CRITICAL' | 'SENSOR_UNAVAILABLE';
export type Severity = 'ABNORMAL' | 'CRITICAL';

export interface Threshold {
  parameter: string;
  display_name: string;
  unit: string;
  warning_low: number | null;
  warning_high: number | null;
  critical_low: number | null;
  critical_high: number | null;
  enabled: boolean;
  persistence_samples: number;
}

export const PARAMETERS = [
  'heart_rate',
  'spo2',
  'temperature',
  'respiratory_rate',
] as const;

export const PARAMETER_LABELS: Record<string, string> = {
  heart_rate: 'Heart Rate',
  spo2: 'Blood Oxygen (SpO2)',
  temperature: 'Body Temperature',
  respiratory_rate: 'Respiratory Rate',
  device_connectivity: 'Device Connectivity',
};

/** Physiologically plausible bounds. Values outside these are sensor faults, not vital signs. */
export const PLAUSIBLE_BOUNDS: Record<string, { min: number; max: number }> = {
  heart_rate: { min: 20, max: 260 },
  spo2: { min: 50, max: 100 },
  temperature: { min: 30, max: 43 },
  respiratory_rate: { min: 4, max: 80 },
};

export function isPlausible(parameter: string, value: number | null | undefined): boolean {
  if (value === null || value === undefined || Number.isNaN(value)) return true;
  const bounds = PLAUSIBLE_BOUNDS[parameter];
  if (!bounds) return true;
  return value >= bounds.min && value <= bounds.max;
}

const STATUS_RANK: Record<ParameterStatus, number> = {
  NORMAL: 0,
  SENSOR_UNAVAILABLE: 1,
  ABNORMAL: 2,
  CRITICAL: 3,
};

function worstStatus(statuses: ParameterStatus[]): ParameterStatus {
  let worst: ParameterStatus = 'NORMAL';
  for (const s of statuses) if (STATUS_RANK[s] > STATUS_RANK[worst]) worst = s;
  return worst;
}

export interface ParameterEvaluation {
  parameter: string;
  status: ParameterStatus;
  severity: Severity | null;
  reason: string | null;
  value: number | null;
}

/**
 * Classify one parameter against its configured limits.
 * Precedence: critical breach, warning breach, then trend toward a limit.
 */
export function classifyParameter(
  parameter: string,
  value: number | null | undefined,
  threshold: Threshold | undefined,
  trend?: { slope: number; projected: number } | null
): ParameterEvaluation {
  const label = threshold?.display_name ?? PARAMETER_LABELS[parameter] ?? parameter;

  if (value === null || value === undefined || Number.isNaN(value)) {
    return {
      parameter,
      status: 'SENSOR_UNAVAILABLE',
      severity: null,
      reason: `${label} is not being reported by the assigned device.`,
      value: null,
    };
  }

  if (!threshold || !threshold.enabled) {
    return { parameter, status: 'NORMAL', severity: null, reason: null, value };
  }

  const unit = threshold.unit ? ` ${threshold.unit}` : '';

  if (threshold.critical_low !== null && value < threshold.critical_low) {
    return {
      parameter,
      status: 'CRITICAL',
      severity: 'CRITICAL',
      reason: `${label} (${value}${unit}) is below the critical lower limit of ${threshold.critical_low}.`,
      value,
    };
  }
  if (threshold.critical_high !== null && value > threshold.critical_high) {
    return {
      parameter,
      status: 'CRITICAL',
      severity: 'CRITICAL',
      reason: `${label} (${value}${unit}) has crossed the critical upper limit of ${threshold.critical_high}.`,
      value,
    };
  }
  if (threshold.warning_low !== null && value < threshold.warning_low) {
    return {
      parameter,
      status: 'ABNORMAL',
      severity: 'ABNORMAL',
      reason: `${label} (${value}${unit}) is below the warning lower limit of ${threshold.warning_low}.`,
      value,
    };
  }
  if (threshold.warning_high !== null && value > threshold.warning_high) {
    return {
      parameter,
      status: 'ABNORMAL',
      severity: 'ABNORMAL',
      reason: `${label} (${value}${unit}) has exceeded the warning upper limit of ${threshold.warning_high}.`,
      value,
    };
  }

  if (trend && trend.slope !== 0) {
    const towardHigh =
      trend.slope > 0 && threshold.warning_high !== null && trend.projected > threshold.warning_high;
    const towardLow =
      trend.slope < 0 && threshold.warning_low !== null && trend.projected < threshold.warning_low;
    if (towardHigh || towardLow) {
      return {
        parameter,
        status: 'ABNORMAL',
        severity: 'ABNORMAL',
        reason: `${label} is within limits but trending toward the ${
          towardHigh ? 'upper' : 'lower'
        } warning limit.`,
        value,
      };
    }
  }

  return { parameter, status: 'NORMAL', severity: null, reason: null, value };
}

/**
 * Count how many consecutive samples ending at the newest one breach the given
 * severity band. Used to apply the per-parameter persistence rule: a limit must
 * be crossed for N samples in a row before an alert is raised, so a single noisy
 * reading cannot trigger a notification.
 */
export function consecutiveBreachCount(
  series: number[],
  threshold: Threshold | undefined,
  severity: Severity
): number {
  if (!threshold || !threshold.enabled || series.length === 0) return 0;
  let count = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    const evaluation = classifyParameter(threshold.parameter, series[i], threshold);
    if (evaluation.status !== severity) break;
    count += 1;
  }
  return count;
}

/** Least-squares slope per sample over the supplied series (oldest first). */
export function trendSlope(series: number[]): number {
  const n = series.length;
  if (n < 3) return 0;
  const meanX = (n - 1) / 2;
  const meanY = series.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (series[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Overall patient classification derived from every parameter evaluation. */
export function classifyPatient(evaluations: ParameterEvaluation[]): {
  status: ParameterStatus;
  reason: string;
} {
  const available = evaluations.filter((e) => e.status !== 'SENSOR_UNAVAILABLE');
  if (available.length === 0) {
    return {
      status: 'SENSOR_UNAVAILABLE',
      reason: 'No monitoring data is currently available for this patient.',
    };
  }
  const status = worstStatus(evaluations.map((e) => e.status));
  if (status === 'NORMAL') {
    return {
      status: 'NORMAL',
      reason: 'All reported vital signs are inside their configured limits.',
    };
  }
  const drivers = evaluations.filter((e) => e.status === status);
  if (status === 'CRITICAL' && drivers.length > 1) {
    return {
      status,
      reason: `CRITICAL — multiple parameters are out of range: ${drivers
        .map((d) => d.reason)
        .join(' ')}`,
    };
  }
  return {
    status,
    reason: `${status} — ${
      drivers[0]?.reason ?? 'A parameter is outside its configured limits.'
    }`,
  };
}

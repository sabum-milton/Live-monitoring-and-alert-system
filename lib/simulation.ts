import type { SimulationScenario } from './types';

export interface SimulatorState {
  heart_rate: number;
  spo2: number;
  temperature: number;
  respiratory_rate: number | null;
  signal_quality: 'valid' | 'weak' | 'invalid';
}

const BASELINE: SimulatorState = {
  heart_rate: 78,
  spo2: 97,
  temperature: 36.8,
  respiratory_rate: 16,
  signal_quality: 'valid',
};

function jitter(value: number, amount: number): number {
  return value + (Math.random() * 2 - 1) * amount;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Produce the next simulated sample. `progress` is 0..1 across the scenario so
 * that a scenario drifts into its target rather than jumping, which is what the
 * real hardware will look like and what the alert cooldown logic expects.
 */
export function nextSample(
  scenario: SimulationScenario,
  previous: SimulatorState,
  progress: number
): SimulatorState {
  const blend = (target: number, current: number, rate: number) =>
    current + (target - current) * Math.min(1, Math.max(0.08, rate * progress));

  switch (scenario) {
    case 'abnormal':
      return {
        heart_rate: round(blend(122, previous.heart_rate, 0.6) + jitter(0, 2), 0),
        spo2: round(blend(93, previous.spo2, 0.5) + jitter(0, 1), 0),
        temperature: round(blend(38.3, previous.temperature, 0.4) + jitter(0, 0.15), 1),
        respiratory_rate: round(blend(23, previous.respiratory_rate ?? 16, 0.5) + jitter(0, 1.5), 0),
        signal_quality: 'weak',
      };
    case 'critical':
      return {
        heart_rate: round(blend(146, previous.heart_rate, 0.7) + jitter(0, 3), 0),
        spo2: round(blend(86, previous.spo2, 0.7) + jitter(0, 1), 0),
        temperature: round(blend(39.6, previous.temperature, 0.5) + jitter(0, 0.2), 1),
        respiratory_rate: round(blend(32, previous.respiratory_rate ?? 16, 0.6) + jitter(0, 2), 0),
        signal_quality: 'weak',
      };
    case 'sensor_disconnected':
      return {
        heart_rate: round(jitter(BASELINE.heart_rate, 6), 0),
        spo2: round(jitter(BASELINE.spo2, 2), 0),
        temperature: round(jitter(BASELINE.temperature, 0.3), 1),
        respiratory_rate: null,
        signal_quality: 'invalid',
      };
    case 'recovery':
      return {
        heart_rate: round(blend(BASELINE.heart_rate, previous.heart_rate, 0.5) + jitter(0, 2.5), 0),
        spo2: round(blend(BASELINE.spo2, previous.spo2, 0.5) + jitter(0, 1), 0),
        temperature: round(blend(BASELINE.temperature, previous.temperature, 0.4) + jitter(0, 0.2), 1),
        respiratory_rate: round(
          blend(BASELINE.respiratory_rate ?? 16, previous.respiratory_rate ?? 16, 0.5) + jitter(0, 1),
          0
        ),
        signal_quality: 'valid',
      };
    case 'normal':
    default:
      return {
        heart_rate: round(jitter(BASELINE.heart_rate, 4), 0),
        spo2: round(jitter(BASELINE.spo2, 1), 0),
        temperature: round(jitter(BASELINE.temperature, 0.15), 1),
        respiratory_rate: round(jitter(BASELINE.respiratory_rate ?? 16, 1.5), 0),
        signal_quality: 'valid',
      };
  }
}

export const BASELINE_STATE: SimulatorState = { ...BASELINE };

export const SCENARIO_META: Record<
  SimulationScenario,
  { label: string; description: string; tone: 'normal' | 'warn' | 'critical' | 'muted' }
> = {
  normal: {
    label: 'Normal scenario',
    description: 'Healthy readings inside every configured limit.',
    tone: 'normal',
  },
  abnormal: {
    label: 'Abnormal scenario',
    description: 'Heart rate, SpO2 and temperature drift past warning limits.',
    tone: 'warn',
  },
  critical: {
    label: 'Critical scenario',
    description: 'Multiple parameters cross critical limits and raise critical alerts.',
    tone: 'critical',
  },
  sensor_disconnected: {
    label: 'Sensor disconnected',
    description: 'Respiratory sensor drops out and signal quality degrades.',
    tone: 'muted',
  },
  recovery: {
    label: 'Recovery to normal',
    description: 'Readings return smoothly to healthy baseline values.',
    tone: 'normal',
  },
};

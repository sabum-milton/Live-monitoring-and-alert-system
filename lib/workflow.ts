import type { Device, DeviceAssignment } from './types.ts';
import type { Severity } from './classification.ts';

// Pure workflow rules shared by the dashboard. These mirror the decisions made
// server-side by the workflow functions and the ingest service, so the tests in
// tests/carewatch.test.ts cover the same behaviour the running app depends on.

export interface AttributeResult {
  accepted: boolean;
  code: 'OK' | 'UNASSIGNED_DEVICE' | 'DEVICE_MISMATCH';
  reason: string;
}

/**
 * Attribute a reading to a patient. The device is the authority: a raw patient
 * ID supplied by the firmware is never trusted, and an unassigned device is
 * rejected from patient monitoring.
 */
export function attributeReading(
  device: Pick<Device, 'device_id'> | null,
  assignment: Pick<DeviceAssignment, 'device_id' | 'is_active'> | null
): AttributeResult {
  if (!device) {
    return {
      accepted: false,
      code: 'UNASSIGNED_DEVICE',
      reason: 'Readings from an unregistered device are rejected.',
    };
  }
  if (!assignment || !assignment.is_active) {
    return {
      accepted: false,
      code: 'UNASSIGNED_DEVICE',
      reason: `Readings from ${device.device_id} are not attributed because the device has no active assignment.`,
    };
  }
  return { accepted: true, code: 'OK', reason: 'Attributed to the active assignment.' };
}

export type DeviceState = 'CONNECTED' | 'STALE_DATA' | 'DISCONNECTED' | 'SENSOR_ERROR' | 'UNASSIGNED';

export function deviceState(
  device: Pick<Device, 'connection_status'> | null,
  latestReadingAt: string | null,
  options: { staleSeconds: number; offlineSeconds: number; now?: number }
): DeviceState {
  if (!device) return 'UNASSIGNED';
  const now = options.now ?? Date.now();
  const reference = latestReadingAt;
  if (!reference) return device.connection_status === 'SENSOR_ERROR' ? 'SENSOR_ERROR' : 'DISCONNECTED';

  const ageSeconds = (now - new Date(reference).getTime()) / 1000;
  if (ageSeconds > options.offlineSeconds) return 'DISCONNECTED';
  if (device.connection_status === 'SENSOR_ERROR') return 'SENSOR_ERROR';
  if (ageSeconds > options.staleSeconds) return 'STALE_DATA';
  return 'CONNECTED';
}

export interface SuppressionInput {
  severity: Severity;
  parameter: string;
  openAlert: { parameter: string; severity: Severity } | null;
  lastAlert: { created_at: string; severity: Severity } | null;
  cooldownSeconds: number;
  now?: number;
}

export interface SuppressionResult {
  suppressed: boolean;
  reason: string | null;
}

/**
 * Decide whether a new alert should be suppressed. An already-open alert for the
 * same parameter always blocks a duplicate; the cooldown additionally rate-limits
 * repeats, but never blocks an escalation to CRITICAL.
 */
export function shouldSuppressAlert(input: SuppressionInput): SuppressionResult {
  if (input.openAlert) {
    return {
      suppressed: true,
      reason: `An open ${input.openAlert.severity} alert already exists for ${input.parameter}.`,
    };
  }
  if (input.lastAlert && input.severity !== 'CRITICAL') {
    const now = input.now ?? Date.now();
    const ageSeconds = (now - new Date(input.lastAlert.created_at).getTime()) / 1000;
    if (ageSeconds < input.cooldownSeconds) {
      return {
        suppressed: true,
        reason: `Within the ${Math.round(input.cooldownSeconds)}s cooldown for ${input.parameter}.`,
      };
    }
  }
  return { suppressed: false, reason: null };
}

export type AlertWorkflowStatus = 'ACTIVE' | 'NOTIFIED' | 'ACKNOWLEDGED' | 'RESOLVED';

/** Acknowledgment and resolution are deliberately separate actions. */
export function canAcknowledge(status: AlertWorkflowStatus): boolean {
  return status === 'ACTIVE' || status === 'NOTIFIED';
}

export function canResolve(status: AlertWorkflowStatus): boolean {
  return status !== 'RESOLVED';
}



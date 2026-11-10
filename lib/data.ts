import { supabase } from './supabase/client';
import type {
  Alert,
  AlertAcknowledgment,
  Device,
  DeviceAssignment,
  Nurse,
  Patient,
  Profile,
  SystemEvent,
  SystemSetting,
  ThresholdConfiguration,
  VitalReading,
} from './types';

function fail(context: string, error: unknown): never {
  console.error(`${context} failed`, error);
  throw new Error('That action could not be completed. Please try again.');
}


export async function fetchActivePatient(): Promise<Patient | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('is_active', true)
    .order('registered_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail('load active patient', error);
  return (data as Patient) ?? null;
}

export async function fetchPatients(): Promise<Patient[]> {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .order('registered_at', { ascending: false });
  if (error) fail('load patients', error);
  return (data as Patient[]) ?? [];
}

export async function fetchDevices(): Promise<Device[]> {
  const { data, error } = await supabase.from('devices').select('*').order('device_id');
  if (error) fail('load devices', error);
  return (data as Device[]) ?? [];
}

export async function fetchNurses(): Promise<Nurse[]> {
  const { data, error } = await supabase
    .from('nurses')
    .select('*')
    .eq('active', true)
    .order('full_name');
  if (error) fail('load nurses', error);
  return (data as Nurse[]) ?? [];
}

export async function fetchActiveAssignment(patientId: string): Promise<DeviceAssignment | null> {
  const { data, error } = await supabase
    .from('device_assignments')
    .select('*')
    .eq('patient_id', patientId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) fail('load assignment', error);
  return (data as DeviceAssignment) ?? null;
}

export async function fetchAssignmentHistory(patientId: string): Promise<DeviceAssignment[]> {
  const { data, error } = await supabase
    .from('device_assignments')
    .select('*')
    .eq('patient_id', patientId)
    .order('started_at', { ascending: false });
  if (error) fail('load assignment history', error);
  return (data as DeviceAssignment[]) ?? [];
}

export async function fetchReadings(patientId: string, sinceIso: string): Promise<VitalReading[]> {
  const { data, error } = await supabase
    .from('vital_readings')
    .select('*')
    .eq('patient_id', patientId)
    .gte('recorded_at', sinceIso)
    .order('recorded_at', { ascending: true });
  if (error) fail('load readings', error);
  return (data as VitalReading[]) ?? [];
}


export async function fetchAlerts(limit = 100): Promise<Alert[]> {
  const { data, error } = await supabase
    .from('alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fail('load alerts', error);
  return (data as Alert[]) ?? [];
}

export async function fetchAlertTimeline(alertId: string): Promise<AlertAcknowledgment[]> {
  const { data, error } = await supabase
    .from('alert_acknowledgments')
    .select('*')
    .eq('alert_id', alertId)
    .order('created_at', { ascending: true });
  if (error) fail('load alert timeline', error);
  return (data as AlertAcknowledgment[]) ?? [];
}

export async function fetchSystemEvents(limit = 120): Promise<SystemEvent[]> {
  const { data, error } = await supabase
    .from('system_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fail('load system events', error);
  return (data as SystemEvent[]) ?? [];
}

export async function fetchThresholds(): Promise<ThresholdConfiguration[]> {
  const { data, error } = await supabase.from('threshold_configurations').select('*').order('parameter');
  if (error) fail('load thresholds', error);
  return (data as ThresholdConfiguration[]) ?? [];
}

export async function fetchSettings(): Promise<SystemSetting[]> {
  const { data, error } = await supabase.from('system_settings').select('*').order('key');
  if (error) fail('load settings', error);
  return (data as SystemSetting[]) ?? [];
}

// --------------------------------------------------------------------------
// Workflow functions (server-authorised)
// --------------------------------------------------------------------------

export async function updateThreshold(input: {
  parameter: string;
  warning_low: number | null;
  warning_high: number | null;
  critical_low: number | null;
  critical_high: number | null;
  enabled: boolean;
  persistence_samples: number;
}): Promise<void> {
  const { error } = await supabase.rpc('update_threshold', {
    p_parameter: input.parameter,
    p_warning_low: input.warning_low,
    p_warning_high: input.warning_high,
    p_critical_low: input.critical_low,
    p_critical_high: input.critical_high,
    p_enabled: input.enabled,
    p_persistence_samples: input.persistence_samples,
  });
  if (error) fail('update threshold', error);
}

export async function updateSetting(key: string, value: unknown): Promise<void> {
  const { error } = await supabase.rpc('update_setting', { p_key: key, p_value: value });
  if (error) fail('update setting', error);
}

export async function acknowledgeAlert(alertId: string, notes?: string): Promise<void> {
  const { error } = await supabase.rpc('acknowledge_alert', {
    p_alert_id: alertId,
    p_notes: notes ?? null,
  });
  if (error) fail('acknowledge alert', error);
}

export async function resolveAlert(alertId: string, notes?: string): Promise<void> {
  const { error } = await supabase.rpc('resolve_alert', {
    p_alert_id: alertId,
    p_notes: notes ?? null,
  });
  if (error) fail('resolve alert', error);
}

export async function addAlertNote(alertId: string, notes: string): Promise<void> {
  const { error } = await supabase.rpc('add_alert_note', { p_alert_id: alertId, p_notes: notes });
  if (error) fail('add alert note', error);
}

export async function openAssignment(input: {
  patientId: string;
  deviceId: string;
  nurseId?: string | null;
  reason?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('open_assignment', {
    p_patient_id: input.patientId,
    p_device_id: input.deviceId,
    p_nurse_id: input.nurseId ?? null,
    p_reason: input.reason ?? null,
  });
  if (error) fail('open assignment', error);
}

export async function closeAssignment(patientId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('close_assignment', {
    p_patient_id: patientId,
    p_reason: reason ?? null,
  });
  if (error) fail('close assignment', error);
}

// --------------------------------------------------------------------------
// Patient and device records (direct staff CRUD, enforced by RLS)
// --------------------------------------------------------------------------

export async function createPatient(input: {
  full_name: string;
  age: number | null;
  sex: string | null;
  bed_number: string | null;
  ward: string | null;
}): Promise<Patient> {
  const { data, error } = await supabase.from('patients').insert(input).select().single();
  if (error) fail('register patient', error);
  return data as Patient;
}

export async function updatePatient(
  id: string,
  input: Partial<Pick<Patient, 'full_name' | 'age' | 'sex' | 'bed_number' | 'ward'>>
): Promise<void> {
  const { error } = await supabase.from('patients').update(input).eq('id', id);
  if (error) fail('update patient', error);
}


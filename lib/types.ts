import type { ParameterStatus, Severity } from './classification';

export type Role = 'admin' | 'nurse';
export type DataSource = 'SIMULATED' | 'HARDWARE';
export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'SENSOR_ERROR';
export type AlertStatus = 'ACTIVE' | 'NOTIFIED' | 'ACKNOWLEDGED' | 'RESOLVED';
export type NotificationStatus =
  | 'NOT_CREATED'
  | 'CREATED'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'FAILED';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  created_at: string;
}

export interface Nurse {
  id: string;
  full_name: string;
  employee_code: string | null;
  shift: string | null;
  profile_id: string | null;
  active: boolean;
  created_at: string;
}

export interface Patient {
  id: string;
  public_id: string;
  full_name: string;
  age: number | null;
  sex: string | null;
  bed_number: string | null;
  ward: string | null;
  assigned_nurse_name: string | null;
  monitoring_status: 'MONITORING' | 'PAUSED' | 'ENDED';
  is_active: boolean;
  registered_at: string;
}

export interface SensorAvailability {
  heart_rate: boolean;
  spo2: boolean;
  temperature: boolean;
  respiratory_rate: boolean;
}

export interface Device {
  id: string;
  device_id: string;
  label: string | null;
  mqtt_topic: string | null;
  firmware_version: string | null;
  sensor_availability: SensorAvailability;
  connection_status: ConnectionStatus;
  last_heartbeat: string | null;
  last_reading_at: string | null;
  created_at: string;
}

export interface DeviceAssignment {
  id: string;
  patient_id: string;
  device_id: string;
  nurse_id: string | null;
  nurse_name: string | null;
  started_at: string;
  ended_at: string | null;
  ended_reason: string | null;
  is_active: boolean;
  created_by: string | null;
  created_by_name: string | null;
}

export interface VitalReading {
  id: string;
  patient_id: string | null;
  device_id: string | null;
  assignment_id: string | null;
  recorded_at: string;
  received_at: string;
  heart_rate: number | null;
  spo2: number | null;
  temperature: number | null;
  respiratory_rate: number | null;
  signal_quality: 'valid' | 'weak' | 'invalid';
  data_source: DataSource;
  status: ParameterStatus;
  classification_reason: string | null;
  created_at: string;
}

export interface Alert {
  id: string;
  alert_code: string;
  patient_id: string | null;
  device_id: string | null;
  assignment_id: string | null;
  reading_id: string | null;
  parameter: string;
  measured_value: number | null;
  unit: string | null;
  severity: Severity;
  trigger_condition: string;
  status: AlertStatus;
  notification_status: NotificationStatus;
  notified_at: string | null;
  assigned_nurse_name: string | null;
  acknowledged_by: string | null;
  acknowledged_by_name: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  data_source: DataSource;
  dedupe_key: string | null;
  created_at: string;
}

export interface AlertAcknowledgment {
  id: string;
  alert_id: string;
  action: 'ACKNOWLEDGED' | 'RESOLVED' | 'NOTE' | 'NOTIFIED';
  actor_id: string | null;
  actor_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface SystemEvent {
  id: string;
  event_type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  patient_id: string | null;
  device_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ThresholdConfiguration {
  id: string;
  parameter: string;
  display_name: string;
  unit: string;
  warning_low: number | null;
  warning_high: number | null;
  critical_low: number | null;
  critical_high: number | null;
  enabled: boolean;
  persistence_samples: number;
  updated_by: string | null;
  updated_by_name: string | null;
  updated_at: string;
}

export interface SystemSetting {
  key: string;
  value: unknown;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

export type SimulationScenario =
  | 'normal'
  | 'abnormal'
  | 'critical'
  | 'sensor_disconnected'
  | 'recovery';

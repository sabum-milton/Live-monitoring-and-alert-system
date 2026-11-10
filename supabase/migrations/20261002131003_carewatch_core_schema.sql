/*
# CareWatch core schema

1. Purpose
- Creates the persistent data model for CareWatch, an intelligent single-patient vital-sign
  monitoring and nurse-alert dashboard driven by an ESP32 prototype.
- The design is intentionally single-patient-at-a-time (one active patient, one assigned device)
  but every reading, alert and event stores the patient_id AND assignment_id, so multi-patient
  support can be added later without rebuilding the schema or losing history.

2. New Tables
- `profiles`               : application users (administrator / nurse), linked to Supabase auth users.
- `nurses`                 : staff directory used for patient and alert assignment (staff are people, not logins).
- `patients`               : the registered patient record, with an auto-generated public ID (PT-001).
- `devices`                : ESP32 monitoring units, their MQTT topic, sensor availability and heartbeat state.
- `device_assignments`     : time-bounded link between a patient and a device. Only one may be active at a time.
- `vital_readings`         : every measurement sample received, tagged SIMULATED or HARDWARE.
- `alerts`                 : parameter-specific alerts with severity, workflow status and delivery tracking.
- `alert_acknowledgments`  : audit trail of acknowledge / resolve / note actions on an alert.
- `system_events`          : audit log for patient reassignment, device disconnection, simulation runs, role changes.
- `threshold_configurations`: per-parameter warning and critical limits (demonstration defaults, clinically reviewed before real use).
- `system_settings`        : key/value settings (notification delivery, alert cooldown, simulation interval, freshness windows).

3. Modified Tables
- None. This is the initial schema.

4. Indexes
- Time-series lookups on vital_readings by patient, device and assignment (descending time).
- Alert lookups by patient, status and open-alert dedupe key.
- Partial unique indexes guarantee ONE active assignment per device and ONE active assignment per patient.

5. Security
- Row Level Security is ENABLED on every table. Policies are scoped TO authenticated because the
  dashboard requires staff sign-in (anon-key clients with no session see nothing).
- Reads are shared across authenticated clinical staff. Writes are deliberately narrow:
  patients / nurses / devices / device_assignments allow direct staff CRUD;
  vital_readings, alerts and alert_acknowledgments are READ-ONLY for clients and are written by the
  ingest edge function and by SECURITY DEFINER workflow functions (see migration 2).
- Role is never client-writable; column privileges on profiles restrict updates to full_name only.

6. Important notes
- All timestamps are timestamptz stored in UTC and rendered in the viewer's local timezone.
- No destructive statements are used; every statement is idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS).
expect
*/

-- ---------------------------------------------------------------------------
-- Sequences for human-readable identifiers
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS patient_public_seq START 1;
CREATE SEQUENCE IF NOT EXISTS alert_code_seq START 1;

-- ---------------------------------------------------------------------------
-- profiles : application users (administrator / nurse)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'nurse' CHECK (role IN ('admin','nurse')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- nurses : staff directory (used for assignment, independent of login accounts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nurses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  employee_code text UNIQUE,
  shift text,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- patients : the registered (single active) patient
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text UNIQUE NOT NULL DEFAULT 'PT-' || lpad(nextval('patient_public_seq')::text, 3, '0'),
  full_name text NOT NULL,
  age int CHECK (age IS NULL OR (age > 0 AND age < 130)),
  sex text CHECK (sex IS NULL OR sex IN ('male','female','other','unspecified')),
  bed_number text,
  ward text,
  assigned_nurse_name text,
  monitoring_status text NOT NULL DEFAULT 'MONITORING'
    CHECK (monitoring_status IN ('MONITORING','PAUSED','ENDED')),
  is_active boolean NOT NULL DEFAULT true,
  registered_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- devices : ESP32 monitoring units
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text UNIQUE NOT NULL,
  label text,
  mqtt_topic text,
  firmware_version text,
  sensor_availability jsonb NOT NULL DEFAULT
    '{"heart_rate":true,"spo2":true,"temperature":true,"respiratory_rate":false}'::jsonb,
  connection_status text NOT NULL DEFAULT 'DISCONNECTED'
    CHECK (connection_status IN ('CONNECTED','DISCONNECTED','SENSOR_ERROR')),
  last_heartbeat timestamptz,
  last_reading_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- device_assignments : time-bounded patient <-> device link
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  nurse_id uuid REFERENCES nurses(id) ON DELETE SET NULL,
  nurse_name text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_reason text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_name text
);

CREATE UNIQUE INDEX IF NOT EXISTS device_assignments_one_active_device
  ON device_assignments(device_id) WHERE is_active;
CREATE UNIQUE INDEX IF NOT EXISTS device_assignments_one_active_patient
  ON device_assignments(patient_id) WHERE is_active;

-- ---------------------------------------------------------------------------
-- vital_readings : every sample received
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vital_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  assignment_id uuid REFERENCES device_assignments(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NOT NULL DEFAULT now(),
  heart_rate numeric(5,1),
  spo2 numeric(4,1),
  temperature numeric(4,2),
  respiratory_rate numeric(4,1),
  signal_quality text NOT NULL DEFAULT 'valid'
    CHECK (signal_quality IN ('valid','weak','invalid')),
  data_source text NOT NULL DEFAULT 'SIMULATED'
    CHECK (data_source IN ('SIMULATED','HARDWARE')),
  status text NOT NULL DEFAULT 'NORMAL'
    CHECK (status IN ('NORMAL','ABNORMAL','CRITICAL','SENSOR_UNAVAILABLE')),
  classification_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vital_readings_patient_time_idx
  ON vital_readings(patient_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS vital_readings_assignment_time_idx
  ON vital_readings(assignment_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS vital_readings_device_time_idx
  ON vital_readings(device_id, recorded_at DESC);

-- ---------------------------------------------------------------------------
-- alerts : parameter-specific alerts and their workflow state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_code text UNIQUE NOT NULL DEFAULT 'AL-' || lpad(nextval('alert_code_seq')::text, 4, '0'),
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  assignment_id uuid REFERENCES device_assignments(id) ON DELETE SET NULL,
  reading_id uuid REFERENCES vital_readings(id) ON DELETE SET NULL,
  parameter text NOT NULL,
  measured_value numeric(6,2),
  unit text,
  severity text NOT NULL CHECK (severity IN ('ABNORMAL','CRITICAL')),
  trigger_condition text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','NOTIFIED','ACKNOWLEDGED','RESOLVED')),
  notification_status text NOT NULL DEFAULT 'NOT_CREATED'
    CHECK (notification_status IN ('NOT_CREATED','CREATED','DISPATCHED','DELIVERED','FAILED')),
  notified_at timestamptz,
  assigned_nurse_name text,
  acknowledged_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  acknowledged_by_name text,
  acknowledged_at timestamptz,
  resolved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_by_name text,
  resolved_at timestamptz,
  resolution_notes text,
  data_source text NOT NULL DEFAULT 'SIMULATED' CHECK (data_source IN ('SIMULATED','HARDWARE')),
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alerts_patient_time_idx ON alerts(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_status_idx ON alerts(status);
CREATE INDEX IF NOT EXISTS alerts_open_dedupe_idx ON alerts(dedupe_key) WHERE status <> 'RESOLVED';

-- ---------------------------------------------------------------------------
-- alert_acknowledgments : audit trail of alert workflow actions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alert_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('ACKNOWLEDGED','RESOLVED','NOTE','NOTIFIED')),
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_acks_alert_idx ON alert_acknowledgments(alert_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- system_events : audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  message text NOT NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_events_time_idx ON system_events(created_at DESC);

-- ---------------------------------------------------------------------------
-- threshold_configurations : per-parameter limits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS threshold_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter text UNIQUE NOT NULL,
  display_name text NOT NULL,
  unit text NOT NULL,
  warning_low numeric,
  warning_high numeric,
  critical_low numeric,
  critical_high numeric,
  enabled boolean NOT NULL DEFAULT true,
  persistence_samples int NOT NULL DEFAULT 1 CHECK (persistence_samples >= 1),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- system_settings : key/value operational settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE nurses                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_assignments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vital_readings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_acknowledgments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE threshold_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings          ENABLE ROW LEVEL SECURITY;

-- profiles : staff can read the directory; rows are created by the signup trigger.
DROP POLICY IF EXISTS "profiles_select_staff" ON profiles;
CREATE POLICY "profiles_select_staff" ON profiles FOR SELECT
  TO authenticated USING (true);

-- nurses : shared staff directory, maintained by clinical staff.
DROP POLICY IF EXISTS "nurses_select_staff" ON nurses;
CREATE POLICY "nurses_select_staff" ON nurses FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "nurses_insert_staff" ON nurses;
CREATE POLICY "nurses_insert_staff" ON nurses FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "nurses_update_staff" ON nurses;
CREATE POLICY "nurses_update_staff" ON nurses FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "nurses_delete_staff" ON nurses;
CREATE POLICY "nurses_delete_staff" ON nurses FOR DELETE
  TO authenticated USING (true);

-- patients : clinical staff register and maintain the active patient.
DROP POLICY IF EXISTS "patients_select_staff" ON patients;
CREATE POLICY "patients_select_staff" ON patients FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "patients_insert_staff" ON patients;
CREATE POLICY "patients_insert_staff" ON patients FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "patients_update_staff" ON patients;
CREATE POLICY "patients_update_staff" ON patients FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "patients_delete_staff" ON patients;
CREATE POLICY "patients_delete_staff" ON patients FOR DELETE
  TO authenticated USING (true);

-- devices : staff register devices and edit labels; history rows are never deleted.
DROP POLICY IF EXISTS "devices_select_staff" ON devices;
CREATE POLICY "devices_select_staff" ON devices FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "devices_insert_staff" ON devices;
CREATE POLICY "devices_insert_staff" ON devices FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "devices_update_staff" ON devices;
CREATE POLICY "devices_update_staff" ON devices FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- device_assignments : assignments are opened/closed through staff CRUD and workflow functions.
DROP POLICY IF EXISTS "assignments_select_staff" ON device_assignments;
CREATE POLICY "assignments_select_staff" ON device_assignments FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "assignments_insert_staff" ON device_assignments;
CREATE POLICY "assignments_insert_staff" ON device_assignments FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "assignments_update_staff" ON device_assignments;
CREATE POLICY "assignments_update_staff" ON device_assignments FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- vital_readings : read-only for clients. Rows arrive from the ingest edge function (service role).
DROP POLICY IF EXISTS "readings_select_staff" ON vital_readings;
CREATE POLICY "readings_select_staff" ON vital_readings FOR SELECT
  TO authenticated USING (true);

-- alerts : read-only for clients. Created by ingest; state changes go through workflow functions.
DROP POLICY IF EXISTS "alerts_select_staff" ON alerts;
CREATE POLICY "alerts_select_staff" ON alerts FOR SELECT
  TO authenticated USING (true);

-- alert_acknowledgments : read-only for clients; written by workflow functions.
DROP POLICY IF EXISTS "alert_acks_select_staff" ON alert_acknowledgments;
CREATE POLICY "alert_acks_select_staff" ON alert_acknowledgments FOR SELECT
  TO authenticated USING (true);

-- system_events : read-only for clients; written by functions and the ingest service.
DROP POLICY IF EXISTS "system_events_select_staff" ON system_events;
CREATE POLICY "system_events_select_staff" ON system_events FOR SELECT
  TO authenticated USING (true);

-- threshold_configurations : read by staff, written by the admin-only function.
DROP POLICY IF EXISTS "thresholds_select_staff" ON threshold_configurations;
CREATE POLICY "thresholds_select_staff" ON threshold_configurations FOR SELECT
  TO authenticated USING (true);

-- system_settings : read by staff, written by the admin-only function.
DROP POLICY IF EXISTS "settings_select_staff" ON system_settings;
CREATE POLICY "settings_select_staff" ON system_settings FOR SELECT
  TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- Column privileges: role is NEVER client-writable.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON profiles FROM authenticated;
GRANT UPDATE (full_name) ON profiles TO authenticated;

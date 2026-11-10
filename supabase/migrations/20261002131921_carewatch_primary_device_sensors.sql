/*
# Declare respiratory-rate support on the primary device

1. Purpose
- The seeded demo devices both declare `respiratory_rate: false`, which correctly makes the
  fourth vital-sign card show SENSOR UNAVAILABLE, but leaves nothing to demonstrate the
  "supported parameter" path for respiratory rate.
- Declares respiratory-rate support on the primary unit (ESP32-001) and leaves the spare
  unit (ESP32-002) without it, so the dashboard demonstrates both the reporting and the
  unavailable states.

2. Modified Data
- `devices.sensor_availability` for device_id = 'ESP32-001': respiratory_rate set to true.

3. Security
- No policy or grant changes. The ingest function already refuses to store a measurement for
  any parameter the device declares unsupported.

4. Important notes
- This only changes declared capability metadata; no readings are modified or removed.
*/

UPDATE public.devices
SET sensor_availability = '{"heart_rate":true,"spo2":true,"temperature":true,"respiratory_rate":true}'::jsonb
WHERE device_id = 'ESP32-001';

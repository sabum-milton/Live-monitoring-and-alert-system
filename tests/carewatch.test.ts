import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyParameter,
  classifyPatient,
  consecutiveBreachCount,
  isPlausible,
  trendSlope,
  type Threshold,
} from '../lib/classification.ts';
import { validateSample, resolveTimestamp } from '../lib/validation.ts';
import {
  attributeReading,
  canAcknowledge,
  canResolve,
  deviceState,
  shouldSuppressAlert,
} from '../lib/workflow.ts';

function threshold(overrides: Partial<Threshold> = {}): Threshold {
  return {
    parameter: 'heart_rate',
    display_name: 'Heart Rate',
    unit: 'BPM',
    warning_low: 50,
    warning_high: 110,
    critical_low: 40,
    critical_high: 140,
    enabled: true,
    persistence_samples: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Patient assignment
// ---------------------------------------------------------------------------
test('an assigned device attributes a reading to the patient', () => {
  const result = attributeReading(
    { device_id: 'ESP32-001' },
    { device_id: 'device-uuid', is_active: true }
  );
  assert.equal(result.accepted, true);
  assert.equal(result.code, 'OK');
});

test('an unassigned device is rejected from patient monitoring', () => {
  const result = attributeReading({ device_id: 'ESP32-001' }, null);
  assert.equal(result.accepted, false);
  assert.equal(result.code, 'UNASSIGNED_DEVICE');
  assert.match(result.reason, /no active assignment/);
});

test('a closed assignment is treated as unassigned', () => {
  const result = attributeReading(
    { device_id: 'ESP32-001' },
    { device_id: 'device-uuid', is_active: false }
  );
  assert.equal(result.accepted, false);
});

test('an unregistered device is rejected', () => {
  assert.equal(attributeReading(null, null).code, 'UNASSIGNED_DEVICE');
});

// ---------------------------------------------------------------------------
// Reading validation
// ---------------------------------------------------------------------------
test('valid readings pass and are normalised', () => {
  const result = validateSample({
    heart_rate: 82,
    spo2: 97,
    temperature: '36.8',
    respiratory_rate: null,
    signal_quality: 'valid',
  });
  assert.equal(result.rejected.length, 0);
  assert.equal(result.values.heart_rate, 82);
  assert.equal(result.values.temperature, 36.8);
  assert.equal(result.anyValue, true);
});

test('implausible values are dropped and reported, not stored', () => {
  const result = validateSample({
    heart_rate: 900,
    spo2: 97,
    temperature: 36.8,
    signal_quality: 'valid',
  });
  assert.equal(result.values.heart_rate, null);
  assert.equal(result.values.spo2, 97);
  assert.ok(result.rejected.some((reason) => reason.includes('heart_rate')));
});

test('non-numeric values are rejected', () => {
  const result = validateSample({ heart_rate: 'abc', spo2: 97 });
  assert.equal(result.values.heart_rate, null);
  assert.ok(result.rejected.some((reason) => reason.includes('not numeric')));
});

test('plausibility bounds behave at the edges', () => {
  assert.equal(isPlausible('spo2', 50), true);
  assert.equal(isPlausible('spo2', 100), true);
  assert.equal(isPlausible('temperature', 45), false);
  assert.equal(isPlausible('heart_rate', null), true);
});

test('a future timestamp is clamped so the timeline cannot be poisoned', () => {
  const now = new Date('2026-10-02T12:00:00Z');
  const resolved = resolveTimestamp('2030-01-01T00:00:00Z', now);
  assert.equal(resolved?.toISOString(), now.toISOString());
});

test('an invalid timestamp is reported rather than guessed', () => {
  assert.equal(resolveTimestamp('not-a-date'), null);
});

// ---------------------------------------------------------------------------
// Alert generation
// ---------------------------------------------------------------------------
test('a value above the warning limit is ABNORMAL', () => {
  const evaluation = classifyParameter('heart_rate', 120, threshold());
  assert.equal(evaluation.status, 'ABNORMAL');
  assert.equal(evaluation.severity, 'ABNORMAL');
  assert.match(evaluation.reason ?? '', /warning upper limit/);
});

test('a value above the critical limit is CRITICAL', () => {
  const evaluation = classifyParameter('heart_rate', 150, threshold());
  assert.equal(evaluation.status, 'CRITICAL');
  assert.match(evaluation.reason ?? '', /critical upper limit/);
});

test('a missing parameter is SENSOR_UNAVAILABLE and is never treated as healthy', () => {
  const evaluation = classifyParameter('respiratory_rate', null, threshold({ parameter: 'respiratory_rate' }));
  assert.equal(evaluation.status, 'SENSOR_UNAVAILABLE');
  assert.equal(evaluation.severity, null);
});

test('a parameter inside its limits with no trend is NORMAL', () => {
  assert.equal(classifyParameter('heart_rate', 80, threshold()).status, 'NORMAL');
});

test('an in-range trend toward a limit raises ABNORMAL', () => {
  const evaluation = classifyParameter('heart_rate', 105, threshold(), {
    slope: 4,
    projected: 113,
  });
  assert.equal(evaluation.status, 'ABNORMAL');
  assert.match(evaluation.reason ?? '', /trending/);
});

test('a disabled rule does not raise alerts', () => {
  assert.equal(classifyParameter('heart_rate', 200, threshold({ enabled: false })).status, 'NORMAL');
});

test('overall condition escalates to the worst parameter', () => {
  const evaluations = [
    classifyParameter('heart_rate', 82, threshold()),
    classifyParameter('spo2', 88, threshold({ parameter: 'spo2', display_name: 'Blood Oxygen (SpO2)', unit: '%', warning_low: 94, critical_low: 90 })),
  ];
  const result = classifyPatient(evaluations);
  assert.equal(result.status, 'CRITICAL');
  assert.match(result.reason, /SpO2|Blood Oxygen/);
});

test('overall condition is SENSOR_UNAVAILABLE when nothing is reported', () => {
  const evaluations = [classifyParameter('heart_rate', null, threshold())];
  assert.equal(classifyPatient(evaluations).status, 'SENSOR_UNAVAILABLE');
});

test('trend slope detects a rising series', () => {
  assert.ok(trendSlope([70, 74, 78, 82, 86]) > 3);
  assert.equal(trendSlope([80]), 0);
});

// ---------------------------------------------------------------------------
// Persistence (debounce) rule
// ---------------------------------------------------------------------------
test('a single breaching sample does not satisfy a three-sample persistence rule', () => {
  const rule = threshold({ persistence_samples: 3 });
  assert.equal(consecutiveBreachCount([78, 80, 82, 120], rule, 'ABNORMAL'), 1);
});

test('three consecutive breaching samples satisfy the persistence rule', () => {
  const rule = threshold({ persistence_samples: 3 });
  assert.equal(consecutiveBreachCount([78, 118, 122, 126], rule, 'ABNORMAL'), 3);
});

test('a normal sample resets the consecutive breach count', () => {
  const rule = threshold({ persistence_samples: 3 });
  assert.equal(consecutiveBreachCount([118, 122, 80, 124, 128], rule, 'ABNORMAL'), 2);
});

test('critical breaches are counted against the critical band only', () => {
  const rule = threshold({ persistence_samples: 2 });
  assert.equal(consecutiveBreachCount([122, 145, 150], rule, 'CRITICAL'), 2);
  assert.equal(consecutiveBreachCount([122, 145, 150], rule, 'ABNORMAL'), 0);
});

// ---------------------------------------------------------------------------
// Alert flooding protection
// ---------------------------------------------------------------------------
test('a duplicate alert is suppressed while one is already open', () => {
  const result = shouldSuppressAlert({
    severity: 'ABNORMAL',
    parameter: 'heart_rate',
    openAlert: { parameter: 'heart_rate', severity: 'ABNORMAL' },
    lastAlert: null,
    cooldownSeconds: 300,
  });
  assert.equal(result.suppressed, true);
});

test('repeats inside the cooldown are suppressed', () => {
  const now = Date.now();
  const result = shouldSuppressAlert({
    severity: 'ABNORMAL',
    parameter: 'heart_rate',
    openAlert: null,
    lastAlert: { created_at: new Date(now - 60_000).toISOString(), severity: 'ABNORMAL' },
    cooldownSeconds: 300,
    now,
  });
  assert.equal(result.suppressed, true);
});

test('a critical escalation is never blocked by the cooldown', () => {
  const now = Date.now();
  const result = shouldSuppressAlert({
    severity: 'CRITICAL',
    parameter: 'heart_rate',
    openAlert: null,
    lastAlert: { created_at: new Date(now - 5_000).toISOString(), severity: 'ABNORMAL' },
    cooldownSeconds: 300,
    now,
  });
  assert.equal(result.suppressed, false);
});

// ---------------------------------------------------------------------------
// Acknowledgment and resolution
// ---------------------------------------------------------------------------
test('acknowledgment is allowed on an active or notified alert', () => {
  assert.equal(canAcknowledge('ACTIVE'), true);
  assert.equal(canAcknowledge('NOTIFIED'), true);
  assert.equal(canAcknowledge('ACKNOWLEDGED'), false);
  assert.equal(canAcknowledge('RESOLVED'), false);
});

test('resolution is a separate step from acknowledgment', () => {
  assert.equal(canResolve('ACKNOWLEDGED'), true);
  assert.equal(canResolve('RESOLVED'), false);
});

// ---------------------------------------------------------------------------
// Device disconnection
// ---------------------------------------------------------------------------
test('a silent device is reported DISCONNECTED, not as a healthy patient', () => {
  const now = Date.now();
  const state = deviceState(
    { connection_status: 'CONNECTED' },
    new Date(now - 90_000).toISOString(),
    { staleSeconds: 30, offlineSeconds: 45, now }
  );
  assert.equal(state, 'DISCONNECTED');
});

test('a device inside the freshness window is CONNECTED', () => {
  const now = Date.now();
  const state = deviceState(
    { connection_status: 'CONNECTED' },
    new Date(now - 5_000).toISOString(),
    { staleSeconds: 30, offlineSeconds: 45, now }
  );
  assert.equal(state, 'CONNECTED');
});

test('a device between the stale and offline thresholds reports STALE_DATA', () => {
  const now = Date.now();
  const state = deviceState(
    { connection_status: 'CONNECTED' },
    new Date(now - 35_000).toISOString(),
    { staleSeconds: 30, offlineSeconds: 45, now }
  );
  assert.equal(state, 'STALE_DATA');
});

test('an unassigned device reports UNASSIGNED', () => {
  assert.equal(deviceState(null, null, { staleSeconds: 30, offlineSeconds: 45 }), 'UNASSIGNED');
});

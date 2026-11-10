'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { INGEST_ANON_KEY, INGEST_URL, supabase } from './supabase/client';
import {
  acknowledgeAlert as ackAlert,
  addAlertNote as addNote,
  fetchActiveAssignment,
  fetchActivePatient,
  fetchAlerts,
  fetchDevices,
  fetchPatients,
  fetchSettings,
  fetchSystemEvents,
  fetchThresholds,
  fetchReadings,
  resolveAlert as resAlert,
} from './data';
import {
  PARAMETERS,
  classifyParameter,
  classifyPatient,
  trendSlope,
  type ParameterEvaluation,
} from './classification';
import { BASELINE_STATE, nextSample, type SimulatorState } from './simulation';
import type {
  Alert,
  Device,
  DeviceAssignment,
  Patient,
  SimulationScenario,
  SystemEvent,
  SystemSetting,
  ThresholdConfiguration,
  VitalReading,
} from './types';

const POLL_MS = 3000;
const READING_WINDOW = 80;

interface LiveValue {
  loading: boolean;
  error: string | null;
  activePatient: Patient | null;
  assignment: DeviceAssignment | null;
  device: Device | null;
  readings: VitalReading[];
  latestReading: VitalReading | null;
  evaluations: ParameterEvaluation[];
  thresholds: Map<string, ThresholdConfiguration>;
  alerts: Alert[];
  events: SystemEvent[];
  devices: Device[];
  patients: Patient[];
  settings: Map<string, SystemSetting>;
  classification: { status: ParameterEvaluation['status']; reason: string };
  settingNumber: (key: string, fallback: number) => number;
  settingBoolean: (key: string, fallback: boolean) => boolean;
  refresh: () => Promise<void>;
  simulation: {
    running: boolean;
    scenario: SimulationScenario;
    interval: number;
    start: (scenario: SimulationScenario) => void;
    stop: () => void;
    setScenario: (scenario: SimulationScenario) => void;
    reset: () => void;
    lastResult: SimulationResult | null;
    error: string | null;
  };
  acknowledge: (alertId: string, notes?: string) => Promise<void>;
  resolve: (alertId: string, notes?: string) => Promise<void>;
  note: (alertId: string, notes: string) => Promise<void>;
  reloadPatientContext: () => Promise<void>;
}

export interface SimulationResult {
  status: string;
  reason: string;
  alertsCreated: string[];
  alertsSuppressed: string[];
  alertsPending: string[];
  unassigned: boolean;
}

const LiveContext = createContext<LiveValue | null>(null);

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePatient, setActivePatient] = useState<Patient | null>(null);
  const [assignment, setAssignment] = useState<DeviceAssignment | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [readings, setReadings] = useState<VitalReading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [thresholdList, setThresholdList] = useState<ThresholdConfiguration[]>([]);
  const [settingList, setSettingList] = useState<SystemSetting[]>([]);

  const [simRunning, setSimRunning] = useState(false);
  const [simScenario, setSimScenario] = useState<SimulationScenario>('normal');
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  const simStateRef = useRef<SimulatorState>(BASELINE_STATE);
  const simProgressRef = useRef(0);
  const seenAlertsRef = useRef<Set<string> | null>(null);
  const scenarioRef = useRef<SimulationScenario>('normal');
  const contextRef = useRef<{ patientId: string | null; deviceId: string | null }>({
    patientId: null,
    deviceId: null,
  });

  const settings = useMemo(() => {
    const map = new Map<string, SystemSetting>();
    for (const row of settingList) map.set(row.key, row);
    return map;
  }, [settingList]);

  const thresholds = useMemo(() => {
    const map = new Map<string, ThresholdConfiguration>();
    for (const row of thresholdList) map.set(row.parameter, row);
    return map;
  }, [thresholdList]);

  const settingNumber = useCallback(
    (key: string, fallback: number): number => {
      const raw = settings.get(key)?.value;
      const value = Number(raw);
      return Number.isFinite(value) ? value : fallback;
    },
    [settings]
  );

  const settingBoolean = useCallback(
    (key: string, fallback: boolean): boolean => {
      const raw = settings.get(key)?.value;
      return typeof raw === 'boolean' ? raw : fallback;
    },
    [settings]
  );

  const notifyNewAlerts = useCallback((next: Alert[]) => {
    if (seenAlertsRef.current === null) {
      seenAlertsRef.current = new Set(next.map((alert) => alert.id));
      return;
    }
    const seen = seenAlertsRef.current;
    const fresh = next.filter((alert) => !seen.has(alert.id) && alert.status !== 'RESOLVED');
    for (const alert of fresh) {
      seen.add(alert.id);
      toast[alert.severity === 'CRITICAL' ? 'error' : 'warning'](
        `${alert.severity} — ${alert.parameter.replace(/_/g, ' ')}`,
        {
          description: `${alert.alert_code}: ${alert.trigger_condition}`,
          duration: alert.severity === 'CRITICAL' ? 15000 : 9000,
        }
      );
      playAlertTone(alert.severity);
    }
    for (const alert of next) seen.add(alert.id);
  }, []);

  const loadContext = useCallback(async () => {
    const patient = await fetchActivePatient();
    setActivePatient(patient);
    contextRef.current.patientId = patient?.id ?? null;

    const [assignmentRow, deviceRows, alertRows, eventRows] = await Promise.all([
      patient ? fetchActiveAssignment(patient.id) : Promise.resolve(null),
      fetchDevices(),
      fetchAlerts(200),
      fetchSystemEvents(80),
    ]);

    setAssignment(assignmentRow);
    contextRef.current.deviceId =
      deviceRows.find((device) => device.id === assignmentRow?.device_id)?.device_id ?? null;
    setDevices(deviceRows);
    setAlerts(alertRows);
    notifyNewAlerts(alertRows);
    setEvents(eventRows);

    if (patient) {
      const now = Date.now();
      const since = new Date(now - 6 * 60 * 60 * 1000).toISOString();
      const readingRows = await fetchReadings(patient.id, since);
      setReadings(readingRows.slice(-READING_WINDOW));
    } else {
      setReadings([]);
    }
  }, [notifyNewAlerts]);

  const refresh = useCallback(async () => {
    try {
      await loadContext();
      setError(null);
    } catch (cause) {
      console.error('refresh failed', cause);
      setError('Live data could not be refreshed. Showing the most recent values.');
    }
  }, [loadContext]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const [patientRows, deviceRows, thresholdRows, settingRows] = await Promise.all([
        fetchPatients(),
        fetchDevices(),
        fetchThresholds(),
        fetchSettings(),
      ]);
      setPatients(patientRows);
      setDevices(deviceRows);
      setThresholdList(thresholdRows);
      setSettingList(settingRows);
      await loadContext();
      setError(null);
    } catch (cause) {
      console.error('bootstrap failed', cause);
      setError('CareWatch could not load monitoring data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, [loadContext]);

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const reloadPatientContext = useCallback(async () => {
    const [patientRows, deviceRows] = await Promise.all([fetchPatients(), fetchDevices()]);
    setPatients(patientRows);
    setDevices(deviceRows);
    await refresh();
  }, [refresh]);

  // ---------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------
  const postSample = useCallback(
    async (sample: SimulatorState, isHeartbeat: boolean) => {
      const deviceKey = contextRef.current.deviceId;
      if (!deviceKey) {
        setSimError('No device is assigned. Assign a device before running the simulation.');
        return null;
      }
      const body: Record<string, unknown> = isHeartbeat
        ? { device_id: deviceKey, heartbeat: true, data_source: 'SIMULATED' }
        : {
            device_id: deviceKey,
            timestamp: new Date().toISOString(),
            heart_rate: sample.heart_rate,
            spo2: sample.spo2,
            temperature: sample.temperature,
            respiratory_rate: sample.respiratory_rate,
            signal_quality: sample.signal_quality,
            data_source: 'SIMULATED',
          };

      const response = await fetch(INGEST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${INGEST_ANON_KEY}`,
        },
        body: JSON.stringify(body),
      });

      const payload = await response.json().catch(() => ({}));
      if (response.status === 404 || response.status === 409) {
        setSimError(payload.error ?? 'The sample was rejected by the monitoring service.');
      } else if (!response.ok && response.status !== 422) {
        setSimError(payload.error ?? 'The monitoring service is unavailable.');
      } else {
        setSimError(null);
      }

      if (response.ok && !isHeartbeat) {
        setSimResult({
          status: payload.status ?? 'UNKNOWN',
          reason: payload.reason ?? '',
          alertsCreated: payload.alerts_created ?? [],
          alertsSuppressed: payload.alerts_suppressed ?? [],
          alertsPending: payload.alerts_pending ?? [],
          unassigned: false,
        });
      } else if (response.status === 409 || response.status === 404) {
        setSimResult({
          status: 'UNASSIGNED',
          reason: payload.error ?? 'Device is not assigned to a patient.',
          alertsCreated: [],
          alertsSuppressed: [],
          alertsPending: [],
          unassigned: true,
        });
      }
      return payload;
    },
    []
  );

  useEffect(() => {
    if (!simRunning) return;
    const intervalMs = Math.max(1, settingNumber('simulation_interval_seconds', 3)) * 1000;
    let tick = 0;

    const timer = setInterval(async () => {
      tick += 1;
      simProgressRef.current = Math.min(1, simProgressRef.current + 0.12);
      const scenario = scenarioRef.current;

      if (scenario === 'sensor_disconnected' && tick % 5 === 0) {
        // Model the ESP32 dropping off the air entirely so the device page reacts too.
        const deviceKey = contextRef.current.deviceId;
        if (deviceKey) {
          await fetch(INGEST_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${INGEST_ANON_KEY}`,
            },
            body: JSON.stringify({ device_id: deviceKey, data_source: 'SIMULATED' }),
          }).catch(() => undefined);
        }
      }

      const next = nextSample(scenario, simStateRef.current, simProgressRef.current);
      simStateRef.current = next;
      await postSample(next, false);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [simRunning, postSample, settingNumber]);

  const start = useCallback(
    (scenario: SimulationScenario) => {
      scenarioRef.current = scenario;
      setSimScenario(scenario);
      simProgressRef.current = 0.15;
      setSimRunning(true);
      toast.info('Simulation started', {
        description: 'All samples are labelled SIMULATED and use the same alert workflow as hardware.',
      });
    },
    []
  );

  const stop = useCallback(() => {
    setSimRunning(false);
    toast.info('Simulation stopped');
  }, []);

  const setScenario = useCallback((scenario: SimulationScenario) => {
    scenarioRef.current = scenario;
    setSimScenario(scenario);
    simProgressRef.current = 0.2;
  }, []);

  const reset = useCallback(async () => {
    simStateRef.current = BASELINE_STATE;
    simProgressRef.current = 0;
    setSimResult(null);
    setSimError(null);
    scenarioRef.current = 'normal';
    setSimScenario('normal');
    const deviceKey = contextRef.current.deviceId;
    if (deviceKey) {
      await fetch(INGEST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${INGEST_ANON_KEY}`,
        },
        body: JSON.stringify({ device_id: deviceKey, heartbeat: true, data_source: 'SIMULATED' }),
      }).catch(() => undefined);
    }
    toast.info('Simulation reset');
  }, []);

  const acknowledge = useCallback(
    async (alertId: string, notes?: string) => {
      await ackAlert(alertId, notes);
      await refresh();
      toast.success('Alert acknowledged');
    },
    [refresh]
  );

  const resolve = useCallback(
    async (alertId: string, notes?: string) => {
      await resAlert(alertId, notes);
      await refresh();
      toast.success('Alert resolved');
    },
    [refresh]
  );

  const note = useCallback(
    async (alertId: string, notes: string) => {
      await addNote(alertId, notes);
      await refresh();
      toast.success('Note added');
    },
    [refresh]
  );

  // ---------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------
  const latestReading = readings.length > 0 ? readings[readings.length - 1] : null;

  const device = useMemo(() => {
    if (!assignment) return null;
    return devices.find((row) => row.id === assignment.device_id) ?? null;
  }, [assignment, devices]);

  const evaluations = useMemo<ParameterEvaluation[]>(() => {
    const latest = latestReading;
    const availability = device?.sensor_availability;
    return PARAMETERS.map((parameter) => {
      const threshold = thresholds.get(parameter);
      const unsupported = availability ? availability[parameter] === false : false;
      if (unsupported && !latest) {
        return {
          parameter,
          status: 'SENSOR_UNAVAILABLE' as const,
          severity: null,
          reason: 'This parameter is not supported by the assigned device.',
          value: null,
        };
      }
      const series = readings
        .map((row) => row[parameter as keyof VitalReading])
        .filter((value): value is number => typeof value === 'number');
      const slope = trendSlope(series.slice(-8));
      const value = (latest?.[parameter as keyof VitalReading] ?? null) as number | null;
      const projected = value !== null && slope !== 0 ? value + slope * 2 : null;
      return classifyParameter(
        parameter,
        value,
        threshold,
        projected !== null ? { slope, projected } : null
      );
    });
  }, [latestReading, readings, thresholds, device]);

  const classification = useMemo(() => classifyPatient(evaluations), [evaluations]);

  const value = useMemo<LiveValue>(
    () => ({
      loading,
      error,
      activePatient,
      assignment,
      device,
      readings,
      latestReading,
      evaluations,
      thresholds,
      alerts,
      events,
      devices,
      patients,
      settings,
      classification,
      settingNumber,
      settingBoolean,
      refresh,
      reloadPatientContext,
      simulation: {
        running: simRunning,
        scenario: simScenario,
        interval: settingNumber('simulation_interval_seconds', 3),
        start,
        stop,
        setScenario,
        reset,
        lastResult: simResult,
        error: simError,
      },
      acknowledge,
      resolve,
      note,
    }),
    [
      loading,
      error,
      activePatient,
      assignment,
      device,
      readings,
      latestReading,
      evaluations,
      thresholds,
      alerts,
      events,
      devices,
      patients,
      settings,
      classification,
      settingNumber,
      settingBoolean,
      refresh,
      reloadPatientContext,
      simRunning,
      simScenario,
      start,
      stop,
      setScenario,
      reset,
      simResult,
      simError,
      acknowledge,
      resolve,
      note,
    ]
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveValue {
  const context = useContext(LiveContext);
  if (!context) throw new Error('useLive must be used inside LiveProvider');
  return context;
}

/** Notification tone. Browsers block audio until the user has interacted with the page. */
export function playAlertTone(severity: 'ABNORMAL' | 'CRITICAL'): void {
  try {
    const AudioCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const ctx = new AudioCtor();
    const now = ctx.currentTime;
    const beeps = severity === 'CRITICAL' ? 3 : 1;
    for (let i = 0; i < beeps; i++) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.value = severity === 'CRITICAL' ? 880 : 620;
      oscillator.type = 'sine';
      const start = now + i * 0.28;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      oscillator.start(start);
      oscillator.stop(start + 0.24);
    }
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    // Audio is a convenience only; ignore when the browser blocks it.
  }
}

export async function checkDeviceHealth(deviceKey: string): Promise<void> {
  await fetch(INGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${INGEST_ANON_KEY}`,
    },
    body: JSON.stringify({ action: 'status_check', device_id: deviceKey }),
  }).catch(() => undefined);
}

export { supabase };

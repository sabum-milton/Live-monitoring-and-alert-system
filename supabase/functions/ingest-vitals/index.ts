import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import {
  PARAMETERS,
  classifyParameter,
  classifyPatient,
  consecutiveBreachCount,
  isPlausible,
  trendSlope,
  type ParameterEvaluation,
  type Threshold,
} from './classification.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const tracking = new Map<string, unknown>();

void tracking;

function pickNumber(value: unknown): number | null | 'INVALID' {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 'INVALID';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return json({ error: 'Request body must be valid JSON' }, 400);
    }

    const action = typeof payload.action === 'string' ? payload.action : 'reading';
    const { data: settingsRows } = await supabase.from('system_settings').select('key, value');
    const settings: Record<string, unknown> = {};
    for (const row of settingsRows ?? []) settings[row.key] = row.value;

    const num = (key: string, fallback: number): number => {
      const v = Number(settings[key]);
      return Number.isFinite(v) ? v : fallback;
    };

    if (action === 'status_check') {
      const result = await evaluateDevices(supabase, num('device_offline_seconds', 45), settings);
      return json({ ok: true, action, ...result });
    }

    const deviceKey = typeof payload.device_id === 'string' ? payload.device_id.trim() : '';
    if (!deviceKey) return json({ error: 'device_id is required' }, 400);
    if (deviceKey.length > 64 || !/^[A-Za-z0-9._-]+$/.test(deviceKey)) {
      return json({ error: 'device_id must be an alphanumeric identifier' }, 400);
    }
    void tracking;

    // Heartbeat-only payload: updates liveness without inserting a reading.
    if (payload.heartbeat === true) {
      const nowIso = new Date().toISOString();
      const { data: device } = await supabase
        .from('devices')
        .select('id')
        .eq('device_id', deviceKey)
        .maybeSingle();
      if (!device) return json({ error: 'Unknown device' }, 404);
      await supabase
        .from('devices')
        .update({ last_heartbeat: nowIso, connection_status: 'CONNECTED' })
        .eq('id', device.id);
      return json({ ok: true, action: 'heartbeat', device_id: deviceKey });
    }

    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('*')
      .eq('device_id', deviceKey)
      .maybeSingle();

    if (deviceError) throw deviceError;
    if (!device) {
      return json({ error: `Unregistered device '${deviceKey}'` }, 404);
    }

    // ---- Validate and normalise the sample ----------------------------------
    let recordedAt = new Date();
    if (payload.timestamp !== undefined && payload.timestamp !== null) {
      const parsed = new Date(String(payload.timestamp));
      if (Number.isNaN(parsed.getTime())) {
        return json({ error: 'timestamp is not a valid ISO-8601 date' }, 400);
      }
      recordedAt = parsed.getTime() > Date.now() ? new Date() : parsed;
    }

    const rejected: string[] = [];
    const values: Record<string, number | null> = {};
    for (const parameter of PARAMETERS) {
      const parsed = pickNumber(payload[parameter], parameter);
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
      ? String(payload.signal_quality)
      : 'valid';

    const declaredSource = String(payload.data_source ?? 'HARDWARE').toUpperCase();
    const dataSource = declaredSource === 'SIMULATED' ? 'SIMULATED' : 'HARDWARE';

    // Honour the device's declared sensor set: never store a measurement for a
    // sensor the hardware says it does not have.
    const availability = (device.sensor_availability ?? {}) as Record<string, boolean | undefined>;
    for (const parameter of PARAMETERS) {
      if (values[parameter] !== null && availability[parameter] === false) {
        rejected.push(`${parameter} was supplied but is not declared supported by the device`);
        values[parameter] = null;
      }
    }

    const anyValue = PARAMETERS.some((p) => values[p] !== null);
    const nowIso = new Date().toISOString();

    if (!anyValue && rejected.length > 0) {
      await supabase
        .from('devices')
        .update({ last_heartbeat: nowIso, connection_status: 'SENSOR_ERROR' })
        .eq('id', device.id);
      await supabase.from('system_events').insert({
        event_type: 'READING_REJECTED',
        severity: 'WARNING',
        message: `Reading from ${deviceKey} rejected: ${rejected.join('; ')}`,
        device_id: device.id,
        metadata: { rejected, raw: payload },
      });
      return json({ ok: false, error: 'Reading rejected', reasons: rejected }, 422);
    }

    // ---- Resolve the active assignment -------------------------------------
    const { data: assignment } = await supabase
      .from('device_assignments')
      .select('id, patient_id, nurse_name')
      .eq('device_id', device.id)
      .eq('is_active', true)
      .maybeSingle();

    await supabase
      .from('devices')
      .update({ last_heartbeat: nowIso, last_reading_at: nowIso, connection_status: 'CONNECTED' })
      .eq('id', device.id);

    if (!assignment) {
      await supabase.from('system_events').insert({
        event_type: 'UNASSIGNED_DEVICE_READING',
        severity: 'WARNING',
        message: `Reading from ${deviceKey} was not attributed to a patient because the device has no active assignment.`,
        device_id: device.id,
        metadata: { sample: values, data_source: dataSource },
      });
      return json(
        {
          ok: false,
          code: 'UNASSIGNED_DEVICE',
          error: 'Device has no active patient assignment',
          device_id: deviceKey,
        },
        409
      );
    }

    // ---- Thresholds and recent history -------------------------------------
    const { data: thresholdRows } = await supabase.from('threshold_configurations').select('*');
    const thresholds = new Map<string, Threshold>();
    for (const row of thresholdRows ?? []) thresholds.set(row.parameter, row as Threshold);

    const { data: recent } = await supabase
      .from('vital_readings')
      .select('heart_rate, spo2, temperature, respiratory_rate, recorded_at')
      .eq('assignment_id', assignment.id)
      .order('recorded_at', { ascending: false })
      .limit(8);

    const history = (recent ?? []).slice().reverse();

    // ---- Classify every parameter ------------------------------------------
    // Build the ordered series (oldest to newest, including the current sample)
    // once, then reuse it for both trend fitting and persistence counting.
    const seriesMap: Record<string, number[]> = {};
    for (const parameter of PARAMETERS) {
      const series = history
        .map((row) => row[parameter as keyof typeof row])
        .filter((value): value is number => typeof value === 'number');
      if (values[parameter] !== null) series.push(values[parameter] as number);
      seriesMap[parameter] = series;
    }

    const evaluations: ParameterEvaluation[] = PARAMETERS.map((parameter) => {
      const series = seriesMap[parameter];
      const slope = trendSlope(series.slice(-8));
      const projected = values[parameter] !== null && slope !== 0
        ? (values[parameter] as number) + slope * 2
        : null;
      return classifyParameter(
        parameter,
        values[parameter],
        thresholds.get(parameter),
        projected !== null ? { slope, projected } : null
      );
    });

    const overall = classifyPatient(evaluations);
    const driver = evaluations.find((e) => e.status === overall.status) ?? evaluations[0];

    // ---- Persist the reading ----------------------------------------------
    const { data: reading, error: readingError } = await supabase
      .from('vital_readings')
      .insert({
        patient_id: assignment.patient_id,
        device_id: device.id,
        assignment_id: assignment.id,
        recorded_at: recordedAt.toISOString(),
        received_at: nowIso,
        heart_rate: values.heart_rate,
        spo2: values.spo2,
        temperature: values.temperature,
        respiratory_rate: values.respiratory_rate,
        signal_quality: signalQuality,
        data_source: dataSource,
        status: overall.status,
        classification_reason: overall.reason,
      })
      .select()
      .single();

    if (readingError) throw readingError;

    // Snapshot the recent series for this assignment so persistence rules can be
    // evaluated without a second round trip per parameter.
    // ---- Raise parameter alerts (with persistence + cooldown) --------------
    const cooldownSeconds = num('alert_cooldown_seconds', 300);
    const createdAlerts: string[] = [];
    const suppressed: string[] = [];
    const pending: string[] = [];

    for (const evaluation of evaluations) {
      if (evaluation.status !== 'ABNORMAL' && evaluation.status !== 'CRITICAL') continue;
      const severity = evaluation.severity ?? 'ABNORMAL';
      const threshold = thresholds.get(evaluation.parameter);

      // Persistence / debounce: require the limit to be breached for the configured
      // number of consecutive samples before notifying the nurse.
      const required = Math.max(1, threshold?.persistence_samples ?? 1);
      const breaches = consecutiveBreachCount(
        seriesMap[evaluation.parameter] ?? [],
        threshold,
        severity
      );
      if (breaches < required) {
        pending.push(`${evaluation.parameter} (${breaches}/${required} samples)`);
        continue;
      }

      const dedupeKey = `${assignment.patient_id}:${evaluation.parameter}:${severity}`;

      const { data: openAlerts } = await supabase
        .from('alerts')
        .select('id, severity, created_at, status, dedupe_key')
        .eq('dedupe_key', dedupeKey)
        .neq('status', 'RESOLVED')
        .order('created_at', { ascending: false })
        .limit(1);

      const open = openAlerts?.[0];
      if (open) {
        suppressed.push(`${evaluation.parameter} (already open)`);
        continue;
      }

      const { data: recentSame } = await supabase
        .from('alerts')
        .select('id, created_at, severity')
        .eq('patient_id', assignment.patient_id)
        .eq('parameter', evaluation.parameter)
        .order('created_at', { ascending: false })
        .limit(1);

      const last = recentSame?.[0];
      if (last && severity !== 'CRITICAL') {
        const ageSeconds = (Date.now() - new Date(last.created_at).getTime()) / 1000;
        if (ageSeconds < cooldownSeconds) {
          suppressed.push(`${evaluation.parameter} (cooldown ${Math.round(cooldownSeconds - ageSeconds)}s)`);
          continue;
        }
      }

      const notificationChannel = String(settings.notification_channel ?? 'in_dashboard');
      const remoteEnabled = settings.remote_notifications_enabled === true;
      const remoteUrl = Deno.env.get('CAREWATCH_NOTIFICATION_WEBHOOK_URL') ?? '';
      let notificationStatus = 'DISPATCHED';

      if (remoteEnabled) {
        if (!remoteUrl) {
          notificationStatus = 'DISPATCHED';
        } else {
          try {
            const response = await fetch(remoteUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                alert_code: null,
                patient_id: assignment.patient_id,
                parameter: evaluation.parameter,
                severity,
                value: evaluation.value,
                reason: evaluation.reason,
                nurse: assignment.nurse_name,
              }),
            });
            notificationStatus = response.ok ? 'DELIVERED' : 'FAILED';
          } catch {
            notificationStatus = 'FAILED';
          }
        }
      }

      const { data: alert } = await supabase
        .from('alerts')
        .insert({
          patient_id: assignment.patient_id,
          device_id: device.id,
          assignment_id: assignment.id,
          reading_id: reading.id,
          parameter: evaluation.parameter,
          measured_value: evaluation.value,
          unit: thresholds.get(evaluation.parameter)?.unit ?? null,
          severity,
          trigger_condition: evaluation.reason ?? 'Parameter outside configured limits',
          status: 'NOTIFIED',
          notification_status: notificationStatus,
          notified_at: nowIso,
          assigned_nurse_name: assignment.nurse_name,
          data_source: dataSource,
          dedupe_key: dedupeKey,
        })
        .select()
        .single();

      if (alert) {
        createdAlerts.push(alert.alert_code);
        await supabase.from('alert_acknowledgments').insert({
          alert_id: alert.id,
          action: 'NOTIFIED',
          actor_name: 'CareWatch',
          notes: `Notification dispatched via ${notificationChannel}${
            remoteEnabled ? ' and remote provider' : ''
          }.`,
        });
        await supabase.from('system_events').insert({
          event_type: 'ALERT_CREATED',
          severity: severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
          message: `${severity} alert ${alert.alert_code} created for ${evaluation.parameter}.`,
          patient_id: assignment.patient_id,
          device_id: device.id,
          metadata: { alert_id: alert.id, reason: evaluation.reason, notification_status: notificationStatus },
        });
      }
    }

    return json({
      ok: true,
      reading_id: reading.id,
      patient_id: assignment.patient_id,
      status: overall.status,
      reason: overall.reason,
      parameter_status: Object.fromEntries(evaluations.map((e) => [e.parameter, e.status])),
      driver: driver?.parameter ?? null,
      alerts_created: createdAlerts,
      alerts_suppressed: suppressed,
      alerts_pending: pending,
      rejected,
      data_source: dataSource,
      recorded_at: reading.recorded_at,
    });
  } catch (error) {
    console.error('ingest-vitals failed', error);
    return json({ error: 'Unable to process the incoming reading.' }, 500);
  }
});

async function evaluateDevices(
  supabase: ReturnType<typeof createClient>,
  offlineSeconds: number,
  settings: Record<string, unknown>
): Promise<{ offline: string[]; online: string[] }> {
  const alertingEnabled = settings.device_alerting_enabled !== false;
  const { data: devices } = await supabase.from('devices').select('*');
  const offline: string[] = [];
  const online: string[] = [];
  const now = Date.now();

  for (const device of devices ?? []) {
    const reference = device.last_reading_at ?? device.last_heartbeat;
    const ageSeconds = reference ? (now - new Date(reference).getTime()) / 1000 : Infinity;
    const isOffline = ageSeconds > offlineSeconds;

    if (!isOffline) {
      online.push(device.device_id);
      if (device.connection_status !== 'CONNECTED') {
        await supabase
          .from('devices')
          .update({ connection_status: 'CONNECTED' })
          .eq('id', device.id);
      }
      continue;
    }

    offline.push(device.device_id);
    if (device.connection_status !== 'DISCONNECTED') {
      await supabase
        .from('devices')
        .update({ connection_status: 'DISCONNECTED' })
        .eq('id', device.id);
    }

    if (!alertingEnabled) continue;

    const { data: assignment } = await supabase
      .from('device_assignments')
      .select('id, patient_id, nurse_name')
      .eq('device_id', device.id)
      .eq('is_active', true)
      .maybeSingle();
    if (!assignment) continue;

    const dedupeKey = `${assignment.patient_id}:device_connectivity:ABNORMAL`;
    const { data: open } = await supabase
      .from('alerts')
      .select('id')
      .eq('dedupe_key', dedupeKey)
      .neq('status', 'RESOLVED')
      .limit(1);

    if (open && open.length > 0) continue;

    const minutes = Number.isFinite(ageSeconds) ? Math.round(ageSeconds / 60) : null;
    const condition =
      minutes === null
        ? `No data has ever been received from device ${device.device_id}.`
        : `Device ${device.device_id} has not transmitted for about ${minutes} minute(s).`;

    const { data: alert } = await supabase
      .from('alerts')
      .insert({
        patient_id: assignment.patient_id,
        device_id: device.id,
        assignment_id: assignment.id,
        parameter: 'device_connectivity',
        measured_value: minutes,
        unit: 'minutes',
        severity: 'ABNORMAL',
        trigger_condition: condition,
        status: 'NOTIFIED',
        notification_status: 'DISPATCHED',
        notified_at: new Date().toISOString(),
        assigned_nurse_name: assignment.nurse_name,
        data_source: 'HARDWARE',
        dedupe_key: dedupeKey,
      })
      .select()
      .single();

    if (alert) {
      await supabase.from('system_events').insert({
        event_type: 'DEVICE_DISCONNECTED',
        severity: 'WARNING',
        message: condition,
        patient_id: assignment.patient_id,
        device_id: device.id,
        metadata: { alert_id: alert.id, age_seconds: ageSeconds },
      });
    }
  }

  return { offline, online };
}

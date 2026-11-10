'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DashboardShell } from '@/components/carewatch/dashboard-shell';
import { PageHeader, SectionTitle, EmptyState } from '@/components/carewatch/page-header';
import { ConnectionBadge } from '@/components/carewatch/status-badge';
import { useLive, checkDeviceHealth } from '@/lib/live-context';
import { PARAMETERS, PARAMETER_LABELS } from '@/lib/classification';
import { ageSeconds, formatAge, formatDateTime, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  Activity,
  CheckCircle2,
  Cpu,
  PlugZap,
  RadioTower,
  RefreshCw,
  Satellite,
  TriangleAlert,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';

export default function DevicePage() {
  const { devices, assignment, device, latestReading, settingNumber, events } = useLive();
  const [checking, setChecking] = useState(false);

  const offlineSeconds = settingNumber('device_offline_seconds', 45);
  const staleSeconds = settingNumber('stale_reading_seconds', 30);

  const lastSignal = latestReading?.recorded_at ?? device?.last_heartbeat ?? null;
  const signalAge = ageSeconds(lastSignal);

  async function runHealthCheck() {
    setChecking(true);
    try {
      await checkDeviceHealth(device?.device_id ?? 'ESP32-001');
    } finally {
      setChecking(false);
    }
  }

  const deviceEvents = events.filter(
    (event) =>
      event.event_type.includes('DEVICE') ||
      event.event_type.includes('READING') ||
      event.event_type.includes('ASSIGNMENT')
  );

  return (
    <DashboardShell>
      <div className="space-y-5">
        <PageHeader
          title="Device status"
          description="Connectivity health for the assigned ESP32 monitoring unit. A device that stops transmitting is reported as a connectivity problem, never as a normal patient condition."
          actions={
            <Button size="sm" variant="outline" onClick={() => void runHealthCheck()} disabled={checking} className="gap-1.5">
              <RefreshCw className={cn('h-3.5 w-3.5', checking && 'animate-spin')} />
              Run connectivity check
            </Button>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <HealthCard
            tone={device?.connection_status === 'CONNECTED' && signalAge <= staleSeconds ? 'ok' : device?.connection_status === 'SENSOR_ERROR' ? 'warn' : 'bad'}
            icon={device?.connection_status === 'CONNECTED' ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            label="Connection"
            value={
              !device
                ? 'UNASSIGNED'
                : device.connection_status === 'SENSOR_ERROR'
                  ? 'SENSOR ERROR'
                  : signalAge > offlineSeconds
                    ? 'DISCONNECTED'
                    : signalAge > staleSeconds
                      ? 'STALE DATA'
                      : 'CONNECTED'
            }
          />
          <HealthCard
            tone="neutral"
            icon={<Cpu className="h-4 w-4" />}
            label="Device ID"
            value={device?.device_id ?? 'No device assigned'}
          />
          <HealthCard
            tone="neutral"
            icon={<Satellite className="h-4 w-4" />}
            label="Last heartbeat"
            value={formatAge(device?.last_heartbeat)}
          />
          <HealthCard
            tone="neutral"
            icon={<Activity className="h-4 w-4" />}
            label="Last reading"
            value={formatAge(latestReading?.recorded_at)}
          />
        </div>

        {(!device || signalAge > staleSeconds) && (
          <div
            className={cn(
              'flex items-start gap-3 rounded-lg border px-4 py-3',
              !device
                ? 'border-slate-300 bg-slate-100'
                : 'border-red-200 bg-red-50'
            )}
          >
            <TriangleAlert className={cn('mt-0.5 h-4 w-4 shrink-0', device ? 'text-red-600' : 'text-slate-500')} />
            <div>
              <p className={cn('text-sm font-semibold', device ? 'text-red-900' : 'text-slate-800')}>
                {!device
                  ? 'UNASSIGNED DEVICE — no monitoring unit is linked to the active patient'
                  : 'Device connectivity warning'}
              </p>
              <p className={cn('text-xs', device ? 'text-red-800' : 'text-slate-600')}>
                {!device
                  ? 'Readings received from an unassigned device are rejected for patient monitoring and logged as unassigned events.'
                  : `No data has arrived for ${Math.round(signalAge)} seconds (offline threshold ${offlineSeconds}s). The last known vital signs are shown as stale and must not be treated as current.`}
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          <Card className="p-5">
            <SectionTitle title="Device record" hint="Registered ESP32 units and their MQTT configuration." />
            <div className="space-y-3">
              {devices.map((row) => {
                const assigned = assignment?.device_id === row.id;
                return (
                  <div
                    key={row.id}
                    className={cn(
                      'rounded-lg border px-4 py-3',
                      assigned ? 'border-sky-200 bg-sky-50/60' : 'border-slate-200 bg-white'
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sky-300">
                          <RadioTower className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{row.device_id}</p>
                          <p className="text-[11px] text-slate-500">{row.label ?? 'Unlabelled unit'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {assigned && (
                          <Badge className="border-transparent bg-sky-600 text-[10px] font-bold text-white">
                            ASSIGNED
                          </Badge>
                        )}
                        <ConnectionBadge state={assigned ? row.connection_status : 'UNASSIGNED'} />
                      </div>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-4">
                      <Detail label="MQTT topic" value={row.mqtt_topic ?? '—'} />
                      <Detail label="Firmware" value={row.firmware_version ?? '—'} />
                      <Detail label="Last heartbeat" value={row.last_heartbeat ? formatTime(row.last_heartbeat) : 'never'} />
                      <Detail label="Last reading" value={row.last_reading_at ? formatTime(row.last_reading_at) : 'never'} />
                    </dl>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="space-y-5">
            <Card className="p-5">
              <SectionTitle title="Sensor availability" hint="Declared by the device firmware, not inferred." />
              <div className="space-y-2.5">
                {PARAMETERS.map((parameter) => {
                  const available = device?.sensor_availability?.[parameter] ?? false;
                  const reported = latestReading?.[parameter as keyof typeof latestReading] != null;
                  return (
                    <div key={parameter} className="flex items-center justify-between gap-3 rounded-lg border bg-slate-50/60 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {available ? (
                          reported ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <PlugZap className="h-4 w-4 text-amber-500" />
                          )
                        ) : (
                          <XCircle className="h-4 w-4 text-slate-400" />
                        )}
                        <span className="text-xs font-medium text-slate-700">
                          {PARAMETER_LABELS[parameter]}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'text-[11px] font-semibold',
                          !available ? 'text-slate-400' : reported ? 'text-emerald-700' : 'text-amber-600'
                        )}
                      >
                        {!available ? 'not supported' : reported ? 'reporting' : 'no data yet'}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-slate-500">
                Parameters marked not supported are shown as SENSOR UNAVAILABLE. CareWatch never fabricates
                measurements for sensors the hardware does not have.
              </p>
            </Card>

            <Card className="p-5">
              <SectionTitle title="Data freshness" />
              <div className="space-y-3 text-xs">
                <Row label="Last signal received" value={lastSignal ? formatDateTime(lastSignal) : 'never'} />
                <Row label="Age of latest reading" value={latestReading ? formatAge(latestReading.recorded_at) : '—'} />
                <Row label="Signal quality" value={latestReading?.signal_quality ?? 'unknown'} />
                <Row label="Stale threshold" value={`${staleSeconds}s`} />
                <Row label="Offline threshold" value={`${offlineSeconds}s`} />
                <Row label="Data source" value={latestReading?.data_source ?? '—'} />
              </div>
            </Card>
          </div>
        </div>

        <section>
          <SectionTitle title="Connectivity and assignment events" />
          {deviceEvents.length === 0 ? (
            <EmptyState
              icon={<RadioTower className="h-5 w-5" />}
              title="No device events yet"
              description="Device connections, disconnections, rejected readings and assignment changes are logged here with timestamps."
            />
          ) : (
            <Card className="divide-y p-0">
              {deviceEvents.slice(0, 15).map((event) => (
                <div key={event.id} className="flex items-start gap-3 px-4 py-3">
                  <span
                    className={cn(
                      'mt-1 h-2 w-2 shrink-0 rounded-full',
                      event.severity === 'CRITICAL'
                        ? 'bg-red-500'
                        : event.severity === 'WARNING'
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700">{event.message}</p>
                    <p className="text-[11px] text-slate-400">
                      {formatDateTime(event.created_at)} · {event.event_type.replace(/_/g, ' ').toLowerCase()}
                    </p>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </section>

        <Card className="p-5">
          <SectionTitle
            title="Connecting a physical ESP32"
            hint="The hardware path shares the same validation, classification and alert workflow as the demonstration generator."
          />
          <div className="grid gap-4 text-xs sm:grid-cols-3">
            <Step
              index={1}
              title="Publish to MQTT"
              body="Publish JSON to the topic shown on the device record, for example carewatch/devices/ESP32-001/vitals."
            />
            <Step
              index={2}
              title="Bridge to the ingest service"
              body="Bridge the broker topic to the CareWatch ingest endpoint, or have the ESP32 POST the payload directly when Wi-Fi is available."
            />
            <Step
              index={3}
              title="Assign the device"
              body="Assign the device to the active patient on the patient page. Until then, readings are logged as unassigned and rejected for monitoring."
            />
          </div>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 px-4 py-3 text-[11px] leading-relaxed text-slate-100">
{`{
  "device_id": "ESP32-001",
  "timestamp": "2026-10-02T13:42:08Z",
  "heart_rate": 82,
  "spo2": 97,
  "temperature": 36.8,
  "respiratory_rate": null,
  "signal_quality": "valid"
}`}
          </pre>
        </Card>
      </div>
    </DashboardShell>
  );
}

function HealthCard({
  tone,
  icon,
  label,
  value,
}: {
  tone: 'ok' | 'warn' | 'bad' | 'neutral';
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  const tones = {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warn: 'border-amber-200 bg-amber-50 text-amber-700',
    bad: 'border-red-200 bg-red-50 text-red-700',
    neutral: 'border-slate-200 bg-white text-slate-700',
  };
  return (
    <Card className={cn('border p-4', tones[tone])}>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      </div>
      <p className="mt-1.5 truncate text-sm font-bold">{value}</p>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="truncate font-medium text-slate-700" title={value}>
        {value}
      </dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function Step({ index, title, body }: { index: number; title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-slate-50/60 p-3.5">
      <p className="flex items-center gap-2 text-xs font-semibold text-slate-800">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
          {index}
        </span>
        {title}
      </p>
      <p className="mt-1.5 leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DashboardShell } from '@/components/carewatch/dashboard-shell';
import { PageHeader, SectionTitle, EmptyState } from '@/components/carewatch/page-header';
import { AlertStatusBadge, SeverityPill } from '@/components/carewatch/status-badge';
import { useLive } from '@/lib/live-context';
import { PARAMETERS, PARAMETER_LABELS } from '@/lib/classification';
import { downloadCsv, formatDateTime, parameterLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Download, FileText, History, Printer } from 'lucide-react';

const RANGES = [
  { key: '15m', label: 'Last 15 minutes', minutes: 15 },
  { key: '1h', label: 'Last hour', minutes: 60 },
  { key: '6h', label: 'Last 6 hours', minutes: 360 },
  { key: '24h', label: 'Last 24 hours', minutes: 1440 },
  { key: 'custom', label: 'Custom range', minutes: 0 },
] as const;

const COLORS: Record<string, string> = {
  heart_rate: '#dc2626',
  spo2: '#0284c7',
  temperature: '#d97706',
  respiratory_rate: '#059669',
};

export default function HistoryPage() {
  const { activePatient, readings, alerts, devices, patients } = useLive();
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('1h');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const bounds = useMemo(() => {
    const now = Date.now();
    if (range === 'custom') {
      const from = customFrom ? new Date(customFrom).getTime() : now - 60 * 60 * 1000;
      const to = customTo ? new Date(customTo).getTime() : now;
      return { from: Math.min(from, to), to: Math.max(from, to) };
    }
    const minutes = RANGES.find((row) => row.key === range)?.minutes ?? 60;
    return { from: now - minutes * 60 * 1000, to: now };
  }, [range, customFrom, customTo]);

  const visibleReadings = useMemo(
    () =>
      readings.filter((row) => {
        const time = new Date(row.recorded_at).getTime();
        return time >= bounds.from && time <= bounds.to;
      }),
    [readings, bounds]
  );

  const visibleAlerts = useMemo(
    () =>
      alerts.filter((row) => {
        const time = new Date(row.created_at).getTime();
        return time >= bounds.from && time <= bounds.to;
      }),
    [alerts, bounds]
  );

  const chartData = useMemo(
    () =>
      visibleReadings.map((row) => ({
        label: new Date(row.recorded_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        heart_rate: row.heart_rate,
        spo2: row.spo2,
        temperature: row.temperature,
        respiratory_rate: row.respiratory_rate,
      })),
    [visibleReadings]
  );

  function exportReadings() {
    downloadCsv(
      `carewatch-readings-${activePatient?.public_id ?? 'patient'}-${range}.csv`,
      visibleReadings.map((row) => ({
        reading_id: row.id,
        recorded_at: row.recorded_at,
        heart_rate: row.heart_rate ?? '',
        spo2: row.spo2 ?? '',
        temperature: row.temperature ?? '',
        respiratory_rate: row.respiratory_rate ?? '',
        signal_quality: row.signal_quality,
        data_source: row.data_source,
        status: row.status,
        reason: row.classification_reason ?? '',
      }))
    );
  }

  function exportAlerts() {
    downloadCsv(
      `carewatch-alerts-${activePatient?.public_id ?? 'patient'}-${range}.csv`,
      visibleAlerts.map((row) => ({
        alert_id: row.alert_code,
        raised_at: row.created_at,
        parameter: row.parameter,
        value: row.measured_value ?? '',
        unit: row.unit ?? '',
        severity: row.severity,
        status: row.status,
        notification: row.notification_status,
        acknowledged_by: row.acknowledged_by_name ?? '',
        acknowledged_at: row.acknowledged_at ?? '',
        resolved_by: row.resolved_by_name ?? '',
        resolved_at: row.resolved_at ?? '',
        resolution_notes: row.resolution_notes ?? '',
      }))
    );
  }

  const deviceName = (id: string | null) =>
    devices.find((row) => row.id === id)?.device_id ?? 'unknown device';

  return (
    <DashboardShell>
      <div className="space-y-5">
        <div className="no-print">
          <PageHeader
            title="Patient history and analytics"
            description="Historical vital-sign charts, the full alert log and the assignment record for the active patient. All timestamps are shown in your local timezone."
            actions={
              <>
                <Button size="sm" variant="outline" onClick={exportReadings} disabled={visibleReadings.length === 0} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Readings CSV
                </Button>
                <Button size="sm" variant="outline" onClick={exportAlerts} disabled={visibleAlerts.length === 0} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Alerts CSV
                </Button>
                <Button size="sm" onClick={() => window.print()} className="gap-1.5">
                  <Printer className="h-3.5 w-3.5" />
                  Print report
                </Button>
              </>
            }
          />
        </div>

        <Card className="no-print p-4">
          <div className="flex flex-wrap items-center gap-2">
            {RANGES.map((row) => (
              <button
                key={row.key}
                type="button"
                onClick={() => setRange(row.key)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                  range === row.key
                    ? 'border-slate-400 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                )}
              >
                {row.label}
              </button>
            ))}
            {range === 'custom' && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="datetime-local"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="datetime-local"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                />
              </div>
            )}
            <span className="ml-auto text-xs text-slate-500">
              {visibleReadings.length} readings · {visibleAlerts.length} alerts
            </span>
          </div>
        </Card>

        <div className="hidden print:block">
          <h1 className="text-xl font-semibold">CareWatch monitoring report</h1>
          <p className="text-xs text-slate-600">
            {activePatient
              ? `${activePatient.full_name} (${activePatient.public_id}) · ${activePatient.bed_number ?? 'no bed' ?? ''}`
              : 'No active patient'}
          </p>
          <p className="text-xs text-slate-600">
            Range: {formatDateTime(new Date(bounds.from).toISOString())} –{' '}
            {formatDateTime(new Date(bounds.to).toISOString())}
          </p>
          <p className="mt-2 text-[11px] italic text-slate-500">
            Demonstration data from a university prototype. Not a clinically certified medical record and
            not a substitute for professional medical assessment.
          </p>
        </div>

        {visibleReadings.length === 0 ? (
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title="No readings in this range"
            description="Choose a wider time range, or start the demonstration generator so new samples are recorded and can be charted here."
          />
        ) : (
          <div className="space-y-5">
            {PARAMETERS.map((parameter) => {
              const hasData = visibleReadings.some((row) => row[parameter as keyof typeof row] !== null);
              return (
                <Card key={parameter} className="print-block p-5">
                  <SectionTitle
                    title={PARAMETER_LABELS[parameter]}
                    hint={`${visibleReadings.filter((row) => row[parameter as keyof typeof row] !== null).length} samples in range`}
                  />
                  {hasData ? (
                    <div className="h-[220px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 12, bottom: 0, left: -14 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={24} />
                          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} domain={['auto', 'auto']} />
                          <RechartsTooltip
                            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                          />
                          <Line
                            type="monotone"
                            dataKey={parameter}
                            stroke={COLORS[parameter]}
                            strokeWidth={2.5}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-xs text-slate-400">
                      This parameter was not reported in the selected range.
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <section className="print-block">
          <SectionTitle title="Alert history" hint={`${visibleAlerts.length} alerts in the selected range`} />
          <Card className="divide-y p-0">
            {visibleAlerts.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">No alerts in this range.</p>
            ) : (
              visibleAlerts.map((alert) => (
                <div key={alert.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <SeverityPill severity={alert.severity} />
                  <div className="min-w-[160px] flex-1">
                    <p className="text-xs font-semibold text-slate-800">
                      {parameterLabel(alert.parameter)}
                      {alert.measured_value !== null && (
                        <span className="ml-1.5 font-normal text-slate-500">
                          {alert.measured_value} {alert.unit ?? ''}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500">{alert.trigger_condition}</p>
                    {(alert.acknowledged_by_name || alert.resolved_by_name) && (
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {alert.acknowledged_by_name ? `Acknowledged by ${alert.acknowledged_by_name}` : ''}
                        {alert.resolved_by_name ? ` · Resolved by ${alert.resolved_by_name}` : ''}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400">{formatDateTime(alert.created_at)}</span>
                  <AlertStatusBadge status={alert.status} />
                </div>
              ))
            )}
          </Card>
        </section>

        <section className="print-block">
          <SectionTitle title="Assignment history" hint="Which device monitored which patient, and when." />
          <Card className="divide-y p-0">
            {patients.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">No patients registered.</p>
            ) : (
              patients.map((patient) => (
                <div key={patient.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      {patient.full_name}
                      <span className="ml-1.5 font-normal text-slate-500">{patient.public_id}</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Registered {formatDateTime(patient.registered_at)} · {patient.bed_number ?? 'no bed'}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      patient.is_active
                        ? 'border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700'
                        : 'border-slate-300 text-[10px] font-semibold text-slate-500'
                    }
                  >
                    {patient.is_active ? 'ACTIVE' : patient.monitoring_status}
                  </Badge>
                </div>
              ))
            )}
          </Card>
        </section>

        <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Exports contain the readings and alerts visible in the selected range for the active patient
          {activePatient ? ` (${activePatient.public_id})` : ''}. Each reading records the device and
          assignment that produced it, so history stays correct after a patient is reassigned.
        </p>
      </div>
    </DashboardShell>
  );
}

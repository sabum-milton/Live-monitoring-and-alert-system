'use client';

import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DashboardShell } from '@/components/carewatch/dashboard-shell';
import { PageHeader, SectionTitle } from '@/components/carewatch/page-header';
import { VitalCard } from '@/components/carewatch/vital-card';
import { StatusBadge, ConnectionBadge, SourceBadge } from '@/components/carewatch/status-badge';
import { useLive } from '@/lib/live-context';
import { PARAMETERS, PARAMETER_LABELS } from '@/lib/classification';
import { formatAge, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AlertTriangle, Info, Radio, TimerReset } from 'lucide-react';

const PARAMETER_COLORS: Record<string, string> = {
  heart_rate: '#dc2626',
  spo2: '#0284c7',
  temperature: '#d97706',
  respiratory_rate: '#059669',
};

export default function MonitoringPage() {
  const { readings, latestReading, evaluations, thresholds, device, settingNumber, classification } =
    useLive();
  const [active, setActive] = useState<string>('heart_rate');

  const staleSeconds = settingNumber('stale_reading_seconds', 30);
  const byEvaluation = new Map(evaluations.map((evaluation) => [evaluation.parameter, evaluation]));

  const chartData = useMemo(
    () =>
      readings.map((row) => ({
        time: formatTime(row.recorded_at),
        recorded_at: row.recorded_at,
        heart_rate: row.heart_rate,
        spo2: row.spo2,
        temperature: row.temperature,
        respiratory_rate: row.respiratory_rate,
      })),
    [readings]
  );

  const latestAge = latestReading
    ? (Date.now() - new Date(latestReading.recorded_at).getTime()) / 1000
    : Infinity;
  const stale = latestAge > staleSeconds;

  return (
    <DashboardShell>
      <div className="space-y-5">
        <PageHeader
          title="Live monitoring"
          description="Continuous vital-sign readings from the assigned device, classified per parameter. Values update automatically without refreshing the page."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <ConnectionBadge
                state={!latestReading ? 'DISCONNECTED' : stale ? 'STALE' : 'CONNECTED'}
              />
              {latestReading && <SourceBadge source={latestReading.data_source} />}
            </div>
          }
        />

        {stale && latestReading && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Monitoring data is outdated</p>
              <p className="text-xs text-amber-800">
                The newest reading is {Math.round(latestAge)} seconds old (freshness limit{' '}
                {staleSeconds}s). Values below are the last known measurements, not the current patient
                state.
              </p>
            </div>
          </div>
        )}

        {!latestReading && (
          <div className="flex items-start gap-2.5 rounded-lg border border-slate-300 bg-slate-100 px-4 py-3">
            <Radio className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <div>
              <p className="text-sm font-semibold text-slate-800">No readings received yet</p>
              <p className="text-xs text-slate-600">
                Start the demonstration generator or connect the ESP32 unit. Missing measurements are shown
                as sensor unavailable and are never presented as healthy values.
              </p>
            </div>
          </div>
        )}

        <section>
          <SectionTitle
            title="Parameter cards"
            hint="Each card shows the current value, status, freshness, limits and a short trend."
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {PARAMETERS.map((parameter) => {
              const evaluation = byEvaluation.get(parameter);
              if (!evaluation) return null;
              return (
                <VitalCard
                  key={parameter}
                  evaluation={evaluation}
                  threshold={thresholds.get(parameter)}
                  readings={readings}
                  latestRecording={latestReading?.recorded_at}
                  staleSeconds={staleSeconds}
                />
              );
            })}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
          <Card className="p-5">
            <SectionTitle
              title="Combined trend"
              hint="The last 80 samples received for the active patient."
              actions={
                <div className="flex flex-wrap gap-1.5">
                  {PARAMETERS.map((parameter) => (
                    <button
                      key={parameter}
                      type="button"
                      onClick={() => setActive(parameter)}
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
                        active === parameter
                          ? 'border-slate-400 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      {PARAMETER_LABELS[parameter]}
                    </button>
                  ))}
                </div>
              }
            />
            <div className="h-[300px] w-full">
              {chartData.length < 2 ? (
                <div className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">
                  Awaiting at least two readings to draw a trend.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={28} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} domain={['auto', 'auto']} />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        fontSize: 12,
                      }}
                      formatter={(value: number | string, name: string) => [
                        value,
                        PARAMETER_LABELS[name] ?? name,
                      ]}
                    />
                    <Legend
                      formatter={(value: string) => PARAMETER_LABELS[value] ?? value}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                    <Line
                      type="monotone"
                      dataKey={active}
                      stroke={PARAMETER_COLORS[active]}
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="p-5">
              <SectionTitle title="Reading quality" />
              <div className="space-y-3 text-sm">
                <Row
                  label="Last update"
                  value={latestReading ? formatAge(latestReading.recorded_at) : '—'}
                />
                <Row
                  label="Signal quality"
                  value={
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[11px] font-semibold',
                        latestReading?.signal_quality === 'valid'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                      )}
                    >
                      {latestReading?.signal_quality ?? 'unknown'}
                    </Badge>
                  }
                />
                <Row label="Samples buffered" value={`${readings.length}`} />
                <Row
                  label="Device"
                  value={device ? device.device_id : 'not assigned'}
                  tone={device ? 'default' : 'warn'}
                />
                <Row label="Overall condition" value={<StatusBadge status={classification.status} compact />} />
              </div>
            </Card>

            <Card className="p-5">
              <SectionTitle title="Configured limits" hint="Demonstration values — require clinical review." />
              <div className="space-y-3">
                {PARAMETERS.map((parameter) => {
                  const threshold = thresholds.get(parameter);
                  if (!threshold) return null;
                  return (
                    <div key={parameter} className="rounded-lg border bg-slate-50/60 px-3 py-2.5">
                      <p className="text-xs font-semibold text-slate-700">
                        {threshold.display_name}{' '}
                        <span className="font-normal text-slate-500">({threshold.unit})</span>
                      </p>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600">
                        <span>
                          Warning{' '}
                          <span className="font-semibold tabular">
                            {threshold.warning_low ?? '—'}–{threshold.warning_high ?? '—'}
                          </span>
                        </span>
                        <span>
                          Critical{' '}
                          <span className="font-semibold tabular">
                            {threshold.critical_low ?? '—'}–{threshold.critical_high ?? '—'}
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-500">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                CareWatch interprets configured rules only. It does not diagnose disease or predict
                clinical outcomes.
              </p>
            </Card>

            <Card className="p-5">
              <SectionTitle title="Explainable classification" />
              <div className="space-y-2.5">
                {evaluations.map((evaluation) => (
                  <div key={evaluation.parameter} className="flex items-start gap-2.5">
                    <span className="mt-1 flex h-2 w-2 shrink-0 rounded-full"
                      style={{ background: PARAMETER_COLORS[evaluation.parameter] }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-700">
                        {PARAMETER_LABELS[evaluation.parameter]}
                        <span className="ml-2 font-normal text-slate-500">
                          {evaluation.status.replace('_', ' ')}
                        </span>
                      </p>
                      <p className="text-[11px] leading-snug text-slate-500">
                        {evaluation.reason ?? 'Within configured limits, no concerning trend.'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 flex items-center gap-1.5 rounded-md bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
                <TimerReset className="h-3.5 w-3.5" />
                Trends use a least-squares fit over the last eight valid samples.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

function Row({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'warn';
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={cn('text-xs font-semibold', tone === 'warn' ? 'text-amber-600' : 'text-slate-800')}>
        {value}
      </span>
    </div>
  );
}

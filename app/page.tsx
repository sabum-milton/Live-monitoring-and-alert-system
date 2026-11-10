'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DashboardShell } from '@/components/carewatch/dashboard-shell';
import { PatientHeaderCard } from '@/components/carewatch/patient-header-card';
import { ClassificationBanner } from '@/components/carewatch/classification-banner';
import { SimulationRail } from '@/components/carewatch/simulation-rail';
import { VitalCard } from '@/components/carewatch/vital-card';
import { AlertStatusBadge, SeverityPill, ConnectionBadge, SourceBadge } from '@/components/carewatch/status-badge';
import { EmptyState, SectionTitle } from '@/components/carewatch/page-header';
import { useLive } from '@/lib/live-context';
import { formatAge, formatTime, parameterLabel } from '@/lib/format';
import { PARAMETERS } from '@/lib/classification';
import {
  ArrowRight,
  BellRing,
  Cpu,
  ScrollText,
  Signal,
} from 'lucide-react';

export default function OverviewPage() {
  const {
    alerts,
    events,
    devices,
    readings,
    latestReading,
    thresholds,
    evaluations,
    settingNumber,
    classification,
  } = useLive();

  const openAlerts = alerts.filter((alert) => alert.status !== 'RESOLVED');
  const staleSeconds = settingNumber('stale_reading_seconds', 30);

  const byEvaluation = new Map(evaluations.map((evaluation) => [evaluation.parameter, evaluation]));

  return (
    <DashboardShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Monitoring overview
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            The active patient, current vital signs, overall condition and open alerts — at a glance.
          </p>
        </div>

        <PatientHeaderCard />
        <ClassificationBanner />
        <SimulationRail />

        <section>
          <SectionTitle
            title="Current vital signs"
            hint="Each parameter is classified independently against its configured limits."
            actions={
              <Button asChild variant="ghost" size="sm" className="gap-1.5 text-slate-600">
                <Link href="/monitoring">
                  Full monitoring view <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            }
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

        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <section>
            <SectionTitle
              title="Open alerts"
              hint={`${openAlerts.length} alert${openAlerts.length === 1 ? '' : 's'} awaiting resolution`}
              actions={
                <Button asChild variant="ghost" size="sm" className="gap-1.5 text-slate-600">
                  <Link href="/alerts">
                    Alert centre <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              }
            />
            {openAlerts.length === 0 ? (
              <EmptyState
                icon={<BellRing className="h-5 w-5" />}
                title="No open alerts"
                description="Every detected condition has been resolved. New alerts appear here as soon as a parameter crosses a configured limit."
              />
            ) : (
              <div className="space-y-2.5">
                {openAlerts.slice(0, 5).map((alert) => (
                  <Card key={alert.id} className="flex flex-wrap items-center gap-3 p-3.5">
                    <SeverityPill severity={alert.severity} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {parameterLabel(alert.parameter)}
                        {alert.measured_value !== null && (
                          <span className="ml-2 font-normal text-slate-500">
                            {alert.measured_value} {alert.unit ?? ''}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-slate-500">{alert.trigger_condition}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertStatusBadge status={alert.status} />
                      <span className="text-[11px] text-slate-400">{formatAge(alert.created_at)}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <div className="space-y-5">
            <section>
              <SectionTitle title="Device status" />
              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <Cpu className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {devices.find((d) => d.connection_status === 'CONNECTED')?.device_id ??
                          devices[0]?.device_id ??
                          'No device'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Last reading {formatAge(latestReading?.recorded_at)}
                      </p>
                    </div>
                  </div>
                  <ConnectionBadge
                    state={
                      latestReading
                        ? (Date.now() - new Date(latestReading.recorded_at).getTime()) / 1000 > staleSeconds
                          ? 'STALE'
                          : 'CONNECTED'
                        : 'DISCONNECTED'
                    }
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Signal className="h-3.5 w-3.5" />
                    Signal quality: {latestReading?.signal_quality ?? 'unknown'}
                  </span>
                  {latestReading && <SourceBadge source={latestReading.data_source} />}
                </div>
                <Button asChild variant="outline" size="sm" className="mt-3 w-full gap-1.5">
                  <Link href="/device">
                    Device diagnostics <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </Card>
            </section>

            <section>
              <SectionTitle title="Recent system events" />
              <Card className="divide-y p-0">
                {events.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-400">
                    No system events recorded yet.
                  </p>
                ) : (
                  events.slice(0, 6).map((event) => (
                    <div key={event.id} className="flex gap-3 px-4 py-2.5">
                      <ScrollText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-700">{event.message}</p>
                        <p className="text-[10px] text-slate-400">
                          {formatTime(event.created_at)} · {event.event_type.replace(/_/g, ' ').toLowerCase()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </Card>
            </section>
          </div>
        </div>

        {classification.status === 'SENSOR_UNAVAILABLE' && (
          <p className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-xs text-slate-600">
            The device is not currently reporting vital signs. The dashboard deliberately shows this as
            unavailable rather than presenting missing data as healthy readings.
          </p>
        )}
      </div>
    </DashboardShell>
  );
}

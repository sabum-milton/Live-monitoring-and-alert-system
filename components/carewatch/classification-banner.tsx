'use client';

import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/carewatch/status-badge';
import { useLive } from '@/lib/live-context';
import { STATUS_META, formatValue } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Activity, CheckCircle2, HelpCircle, ShieldAlert } from 'lucide-react';

export function ClassificationBanner() {
  const { classification, evaluations, latestReading, settingNumber } = useLive();
  const meta = STATUS_META[classification.status];
  const staleSeconds = settingNumber('stale_reading_seconds', 30);

  const stale =
    latestReading && (Date.now() - new Date(latestReading.recorded_at).getTime()) / 1000 > staleSeconds;

  const Icon =
    classification.status === 'CRITICAL'
      ? ShieldAlert
      : classification.status === 'ABNORMAL'
        ? Activity
        : classification.status === 'SENSOR_UNAVAILABLE'
          ? HelpCircle
          : CheckCircle2;

  const drivers = evaluations.filter((e) => e.status === classification.status && e.status !== 'NORMAL');

  return (
    <Card
      className={cn(
        'overflow-hidden border',
        meta.border,
        meta.bg,
        classification.status === 'CRITICAL' && 'animate-pulse-ring'
      )}
    >
      <div className="flex flex-wrap items-start gap-4 p-5">
        <span
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white',
            meta.solid
          )}
        >
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn('text-lg font-bold tracking-tight', meta.text)}>
              Patient condition: {meta.label}
            </p>
            <StatusBadge status={classification.status} />
          </div>
          <p className={cn('mt-1 text-sm leading-relaxed', meta.text)}>{classification.reason}</p>

          {drivers.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {drivers.map((driver) => (
                <span
                  key={driver.parameter}
                  className="inline-flex items-center gap-2 rounded-md border border-white/60 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-slate-700"
                >
                  <span className={cn('h-2 w-2 rounded-full', STATUS_META[driver.status].dot)} />
                  {driver.parameter.replace(/_/g, ' ')} · {formatValue(driver.parameter, driver.value)}
                </span>
              ))}
            </div>
          )}

          {stale && (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-100/80 px-3 py-2 text-xs font-semibold text-amber-900">
              Monitoring data is outdated — the newest reading is older than {staleSeconds} seconds. This
              value does not represent the current patient state.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

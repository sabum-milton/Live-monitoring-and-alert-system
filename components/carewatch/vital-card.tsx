'use client';

import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Sparkline, StatusRail } from '@/components/carewatch/sparkline';
import { StatusBadge } from '@/components/carewatch/status-badge';
import { PARAMETER_LABELS } from '@/lib/classification';
import { formatAge, formatValue, isStale } from '@/lib/format';
import type { ParameterEvaluation } from '@/lib/classification';
import type { ThresholdConfiguration, VitalReading } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Activity, Clock3, Info, Radio, Wifi } from 'lucide-react';

export function VitalCard({
  evaluation,
  threshold,
  readings,
  latestRecording,
  staleSeconds,
  compact = false,
}: {
  evaluation: ParameterEvaluation;
  threshold?: ThresholdConfiguration;
  readings: VitalReading[];
  latestRecording?: string | null;
  staleSeconds: number;
  compact?: boolean;
}) {
  const { parameter, status, value, reason } = evaluation;
  const label = threshold?.display_name ?? PARAMETER_LABELS[parameter] ?? parameter;
  const unit = threshold?.unit ?? '';
  const series = readings
    .slice(compact ? -20 : -40)
    .map((row) => ({ value: (row[parameter as keyof VitalReading] ?? null) as number | null }));
  const stale = status !== 'SENSOR_UNAVAILABLE' && isStale(latestRecording, staleSeconds);

  return (
    <Card
      className={cn(
        'relative flex overflow-hidden transition-shadow hover:shadow-md',
        status === 'CRITICAL' && 'ring-1 ring-red-200',
        stale && 'opacity-95'
      )}
    >
      <StatusRail status={status} />
      <div className={cn('flex-1', compact ? 'p-4' : 'p-5')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-wider text-slate-500">
              {label}
            </p>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span
                className={cn(
                  'tabular font-semibold text-slate-900',
                  compact ? 'text-2xl' : 'text-3xl'
                )}
              >
                {formatValue(parameter, value)}
              </span>
              {unit && <span className="text-sm font-medium text-slate-500">{unit}</span>}
            </div>
          </div>
          <StatusBadge status={status} compact={compact} />
        </div>

        <div className="mt-3">
          <Sparkline data={series} status={status} className={compact ? 'h-8' : 'h-12'} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3 w-3" />
            {formatAge(latestRecording)}
          </span>
          <span className="inline-flex items-center gap-1">
            {status === 'SENSOR_UNAVAILABLE' ? (
              <Radio className="h-3 w-3 text-slate-400" />
            ) : (
              <Wifi className={cn('h-3 w-3', stale ? 'text-amber-500' : 'text-emerald-500')} />
            )}
            {status === 'SENSOR_UNAVAILABLE' ? 'not connected' : stale ? 'stale data' : 'live'}
          </span>
          {threshold && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-help items-center gap-1 text-slate-500 underline decoration-dotted underline-offset-2">
                  <Activity className="h-3 w-3" />
                  limits
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                <p className="font-semibold">Configured limits (demonstration values)</p>
                <p>
                  Warning: {threshold.warning_low ?? '—'} – {threshold.warning_high ?? '—'} {unit}
                </p>
                <p>
                  Critical: {threshold.critical_low ?? '—'} – {threshold.critical_high ?? '—'} {unit}
                </p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {reason && status !== 'NORMAL' && (
          <p
            className={cn(
              'mt-3 flex items-start gap-1.5 rounded-md border px-2.5 py-2 text-[11px] leading-snug',
              status === 'CRITICAL'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            )}
          >
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {reason}
          </p>
        )}
      </div>
    </Card>
  );
}

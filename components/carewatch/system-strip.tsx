'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { useLive } from '@/lib/live-context';
import { formatAge } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AlertTriangle, Clock, CloudCog, Radio, Satellite, ShieldAlert } from 'lucide-react';

export function SystemStrip() {
  const { device, assignment, latestReading, alerts, simulation, classification } = useLive();
  const [clock, setClock] = useState<string>('');

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  const openCritical = alerts.filter(
    (alert) => alert.severity === 'CRITICAL' && alert.status !== 'RESOLVED'
  ).length;
  const openAbnormal = alerts.filter(
    (alert) => alert.severity === 'ABNORMAL' && alert.status !== 'RESOLVED'
  ).length;

  return (
    <div className="no-print flex flex-wrap items-center gap-2 border-b bg-white/70 px-4 py-2.5 backdrop-blur lg:px-8">
      <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
        <Clock className="h-3.5 w-3.5" />
        <span className="tabular">{clock}</span>
      </span>

      <StripItem
        icon={<Radio className={cn('h-3.5 w-3.5', device?.connection_status === 'CONNECTED' ? 'text-emerald-600' : 'text-red-500')} />}
        label={device ? device.device_id : 'No device assigned'}
        tone={device?.connection_status === 'CONNECTED' ? 'ok' : 'bad'}
      />

      <StripItem
        icon={<Satellite className="h-3.5 w-3.5 text-slate-500" />}
        label={assignment ? `Assigned ${formatAge(assignment.started_at)}` : 'No active assignment'}
        tone={assignment ? 'neutral' : 'warn'}
      />

      <StripItem
        icon={<CloudCog className="h-3.5 w-3.5 text-slate-500" />}
        label={
          latestReading
            ? `Last reading ${formatAge(latestReading.recorded_at)} · ${
                latestReading.data_source === 'SIMULATED' ? 'simulated' : 'hardware'
              }`
            : 'No readings yet'
        }
        tone="neutral"
      />

      <span className="ml-auto flex items-center gap-2">
        {simulation.running && (
          <Badge
            variant="outline"
            className="animate-sweep relative overflow-hidden border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700"
          >
            DEMO · {simulation.scenario.replace('_', ' ')}
          </Badge>
        )}
        {openCritical > 0 && (
          <Badge className="gap-1.5 border-transparent bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white">
            <ShieldAlert className="h-3.5 w-3.5" />
            {openCritical} critical open
          </Badge>
        )}
        {openAbnormal > 0 && (
          <Badge className="gap-1.5 border-transparent bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white">
            <AlertTriangle className="h-3.5 w-3.5" />
            {openAbnormal} abnormal open
          </Badge>
        )}
        {openCritical === 0 && openAbnormal === 0 && classification.status === 'NORMAL' && (
          <Badge
            variant="outline"
            className="border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
          >
            ALL PARAMETERS WITHIN LIMITS
          </Badge>
        )}
      </span>
    </div>
  );
}

function StripItem({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone: 'ok' | 'bad' | 'warn' | 'neutral';
}) {
  const tones = {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    bad: 'border-red-200 bg-red-50 text-red-700',
    warn: 'border-amber-200 bg-amber-50 text-amber-700',
    neutral: 'border-slate-200 bg-slate-50 text-slate-600',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium',
        tones[tone]
      )}
    >
      {icon}
      {label}
    </span>
  );
}

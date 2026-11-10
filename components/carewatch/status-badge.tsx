import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { STATUS_META, ALERT_STATUS_META } from '@/lib/format';
import type { ParameterStatus } from '@/lib/classification';
import { AlertTriangle, CheckCircle2, HelpCircle, ShieldAlert } from 'lucide-react';

const ICONS: Record<ParameterStatus, React.ComponentType<{ className?: string }>> = {
  NORMAL: CheckCircle2,
  ABNORMAL: AlertTriangle,
  CRITICAL: ShieldAlert,
  SENSOR_UNAVAILABLE: HelpCircle,
};

export function StatusBadge({
  status,
  className,
  compact = false,
}: {
  status: ParameterStatus;
  className?: string;
  compact?: boolean;
}) {
  const meta = STATUS_META[status];
  const Icon = ICONS[status];
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 font-semibold tracking-wide',
        meta.border,
        meta.bg,
        meta.text,
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        className
      )}
    >
      <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {meta.label}
    </Badge>
  );
}

export function AlertStatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = ALERT_STATUS_META[status] ?? {
    label: status,
    text: 'text-slate-700',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
  };
  return (
    <Badge
      variant="outline"
      className={cn('px-2.5 py-1 text-xs font-semibold tracking-wide', meta.border, meta.bg, meta.text, className)}
    >
      {meta.label}
    </Badge>
  );
}

export function SeverityPill({ severity }: { severity: 'ABNORMAL' | 'CRITICAL' }) {
  const critical = severity === 'CRITICAL';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white',
        critical ? 'bg-red-600' : 'bg-amber-500'
      )}
    >
      {critical ? <ShieldAlert className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {severity}
    </span>
  );
}

export function SourceBadge({ source }: { source: 'SIMULATED' | 'HARDWARE' }) {
  const simulated = source === 'SIMULATED';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        simulated
          ? 'border-sky-200 bg-sky-50 text-sky-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
      )}
    >
      {simulated ? 'Simulated' : 'Hardware'}
    </span>
  );
}

export function ConnectionBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; className: string }> = {
    CONNECTED: { label: 'CONNECTED', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    DISCONNECTED: { label: 'DISCONNECTED', className: 'border-red-200 bg-red-50 text-red-700' },
    SENSOR_ERROR: { label: 'SENSOR ERROR', className: 'border-amber-200 bg-amber-50 text-amber-700' },
    STALE: { label: 'STALE DATA', className: 'border-amber-200 bg-amber-50 text-amber-700' },
    UNASSIGNED: { label: 'UNASSIGNED DEVICE', className: 'border-slate-300 bg-slate-100 text-slate-600' },
  };
  const meta = map[state] ?? map.UNASSIGNED;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide',
        meta.className
      )}
    >
      {meta.label}
    </span>
  );
}

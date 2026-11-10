import type { ParameterStatus } from './classification';
import { PARAMETER_LABELS } from './classification';

export function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ageSeconds(iso?: string | null): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 1000;
}

export function formatAge(iso?: string | null): string {
  if (!iso) return 'no data';
  const seconds = ageSeconds(iso);
  if (!Number.isFinite(seconds)) return 'no data';
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function isStale(iso?: string | null, staleSeconds = 30): boolean {
  return ageSeconds(iso) > staleSeconds;
}

export function formatValue(parameter: string, value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (parameter === 'temperature') return value.toFixed(1);
  if (parameter === 'spo2') return value.toFixed(0);
  return value.toFixed(0);
}

export const STATUS_META: Record<
  ParameterStatus,
  { label: string; text: string; bg: string; border: string; dot: string; solid: string }
> = {
  NORMAL: {
    label: 'NORMAL',
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    solid: 'bg-emerald-600',
  },
  ABNORMAL: {
    label: 'ABNORMAL',
    text: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    solid: 'bg-amber-500',
  },
  CRITICAL: {
    label: 'CRITICAL',
    text: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    dot: 'bg-red-500',
    solid: 'bg-red-600',
  },
  SENSOR_UNAVAILABLE: {
    label: 'SENSOR UNAVAILABLE',
    text: 'text-slate-600',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    dot: 'bg-slate-400',
    solid: 'bg-slate-500',
  },
};

export const ALERT_STATUS_META: Record<
  string,
  { label: string; text: string; bg: string; border: string }
> = {
  ACTIVE: { label: 'ACTIVE', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  NOTIFIED: {
    label: 'NOTIFIED',
    text: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  ACKNOWLEDGED: {
    label: 'ACKNOWLEDGED',
    text: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  RESOLVED: {
    label: 'RESOLVED',
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
};

export const NOTIFICATION_META: Record<string, { label: string; detail: string }> = {
  NOT_CREATED: { label: 'Not created', detail: 'No notification has been attempted.' },
  CREATED: { label: 'Created', detail: 'An alert record exists but dispatch has not started.' },
  DISPATCHED: { label: 'Dispatched', detail: 'Sent to the dashboard. Delivery is not confirmed.' },
  DELIVERED: { label: 'Delivered', detail: 'The notification provider confirmed delivery.' },
  FAILED: { label: 'Failed', detail: 'The remote provider could not be reached.' },
};

export function parameterLabel(parameter: string): string {
  return PARAMETER_LABELS[parameter] ?? parameter;
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const body = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n');

  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

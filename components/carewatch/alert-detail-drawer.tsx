'use client';

import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { AlertStatusBadge, SeverityPill, SourceBadge } from '@/components/carewatch/status-badge';
import { fetchAlertTimeline } from '@/lib/data';
import { NOTIFICATION_META, formatDateTime, formatAge, parameterLabel } from '@/lib/format';
import { useLive } from '@/lib/live-context';
import type { Alert, AlertAcknowledgment } from '@/lib/types';
import { cn } from '@/lib/utils';
import { BellRing, CheckCheck, MessageSquarePlus, ShieldCheck, Timer } from 'lucide-react';

export function AlertDetailDrawer({
  alert,
  onClose,
}: {
  alert: Alert | null;
  onClose: () => void;
}) {
  const { acknowledge, resolve, note } = useLive();
  const [timeline, setTimeline] = useState<AlertAcknowledgment[]>([]);
  const [noteText, setNoteText] = useState('');
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!alert) {
      setTimeline([]);
      setNoteText('');
      setResolution('');
      return;
    }
    void fetchAlertTimeline(alert.id)
      .then(setTimeline)
      .catch(() => setTimeline([]));
  }, [alert]);

  if (!alert) return null;

  const notification = NOTIFICATION_META[alert.notification_status] ?? {
    label: alert.notification_status,
    detail: '',
  };

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      // The shared data layer already surfaces a generic message via the provider.
      console.error(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!alert} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="text-left">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityPill severity={alert.severity} />
            <AlertStatusBadge status={alert.status} />
            <SourceBadge source={alert.data_source} />
          </div>
          <SheetTitle className="mt-2 text-lg">
            {parameterLabel(alert.parameter)}
            {alert.measured_value !== null && (
              <span className="ml-2 text-base font-normal text-slate-500">
                {alert.measured_value} {alert.unit ?? ''}
              </span>
            )}
          </SheetTitle>
          <SheetDescription className="text-sm leading-relaxed">{alert.trigger_condition}</SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Meta label="Alert ID" value={alert.alert_code} />
            <Meta label="Raised" value={`${formatDateTime(alert.created_at)} (${formatAge(alert.created_at)})`} />
            <Meta label="Patient ID" value={alert.patient_id ? alert.patient_id.slice(0, 8) : '—'} />
            <Meta label="Device ID" value={alert.device_id ? alert.device_id.slice(0, 8) : '—'} />
            <Meta label="Assigned nurse" value={alert.assigned_nurse_name ?? 'Unassigned'} />
            <Meta label="Acknowledged by" value={alert.acknowledged_by_name ?? 'Not yet acknowledged'} />
            <Meta label="Acknowledged at" value={alert.acknowledged_at ? formatDateTime(alert.acknowledged_at) : '—'} />
            <Meta label="Resolved by" value={alert.resolved_by_name ?? 'Open'} />
          </div>

          <div
            className={cn(
              'rounded-lg border px-3.5 py-3 text-xs',
              alert.notification_status === 'DELIVERED'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : alert.notification_status === 'FAILED'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-blue-200 bg-blue-50 text-blue-800'
            )}
          >
            <p className="flex items-center gap-1.5 font-semibold">
              <BellRing className="h-3.5 w-3.5" />
              Notification: {notification.label}
            </p>
            <p className="mt-0.5 opacity-90">{notification.detail}</p>
            {alert.notified_at && (
              <p className="mt-1 opacity-80">Dispatched {formatDateTime(alert.notified_at)}</p>
            )}
          </div>

          <Separator />

          {alert.status !== 'RESOLVED' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busy || alert.status === 'ACKNOWLEDGED'}
                  onClick={() => run(() => acknowledge(alert.id))}
                  className="gap-1.5"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {alert.status === 'ACKNOWLEDGED' ? 'Acknowledged' : 'Acknowledge alert'}
                </Button>
              </div>

              <div className="space-y-2">
                <Textarea
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value)}
                  placeholder="Resolution note — what was done in response to this alert?"
                  rows={3}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || resolution.trim().length === 0}
                  onClick={() =>
                    run(async () => {
                      await resolve(alert.id, resolution.trim());
                      setResolution('');
                    })
                  }
                  className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Mark resolved
                </Button>
                <p className="text-[11px] text-slate-500">
                  Acknowledging does not resolve an alert. Resolution is a separate step and is recorded
                  against your account.
                </p>
              </div>
            </div>
          )}

          {alert.resolution_notes && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs text-emerald-800">
              <p className="font-semibold">Resolution note</p>
              <p className="mt-0.5">{alert.resolution_notes}</p>
            </div>
          )}

          <div className="space-y-2">
            <Textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="Add an audit note to this alert…"
              rows={2}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || noteText.trim().length === 0}
              onClick={() =>
                run(async () => {
                  await note(alert.id, noteText.trim());
                  setNoteText('');
                  setTimeline(await fetchAlertTimeline(alert.id));
                })
              }
              className="gap-1.5"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              Add note
            </Button>
          </div>

          <Separator />

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Timer className="h-3.5 w-3.5" />
              Alert timeline
            </p>
            <ol className="space-y-3 border-l border-slate-200 pl-4">
              {timeline.length === 0 ? (
                <li className="text-xs text-slate-400">No workflow actions recorded yet.</li>
              ) : (
                timeline.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-slate-400 ring-4 ring-white" />
                    <p className="text-xs font-semibold text-slate-700">
                      {entry.action.charAt(0) + entry.action.slice(1).toLowerCase()}
                      <span className="ml-2 font-normal text-slate-500">{entry.actor_name ?? 'system'}</span>
                    </p>
                    <p className="text-[11px] text-slate-400">{formatDateTime(entry.created_at)}</p>
                    {entry.notes && <p className="mt-0.5 text-[11px] text-slate-600">{entry.notes}</p>}
                  </li>
                ))
              )}
            </ol>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="truncate font-medium text-slate-700" title={value}>
        {value}
      </p>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardShell } from '@/components/carewatch/dashboard-shell';
import { PageHeader, EmptyState, SectionTitle } from '@/components/carewatch/page-header';
import { AlertDetailDrawer } from '@/components/carewatch/alert-detail-drawer';
import { AlertStatusBadge, SeverityPill, SourceBadge } from '@/components/carewatch/status-badge';
import { useLive } from '@/lib/live-context';
import { formatAge, formatTime, parameterLabel } from '@/lib/format';
import type { Alert } from '@/lib/types';
import { cn } from '@/lib/utils';
import { BellRing, CheckCheck, ExternalLink, Inbox, ShieldAlert, ShieldCheck } from 'lucide-react';

type TabKey = 'open' | 'mine' | 'resolved' | 'all';

export default function AlertsPage() {
  const { alerts, acknowledge, settingNumber } = useLive();
  const [tab, setTab] = useState<TabKey>('open');
  const [selected, setSelected] = useState<Alert | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const cooldown = settingNumber('alert_cooldown_seconds', 300);

  const filtered = useMemo(() => {
    switch (tab) {
      case 'open':
        return alerts.filter((alert) => alert.status !== 'RESOLVED');
      case 'mine':
        return alerts.filter((alert) => alert.status === 'ACKNOWLEDGED');
      case 'resolved':
        return alerts.filter((alert) => alert.status === 'RESOLVED');
      default:
        return alerts;
    }
  }, [alerts, tab]);

  const counts = useMemo(
    () => ({
      open: alerts.filter((alert) => alert.status !== 'RESOLVED').length,
      critical: alerts.filter((a) => a.severity === 'CRITICAL' && a.status !== 'RESOLVED').length,
      acknowledged: alerts.filter((alert) => alert.status === 'ACKNOWLEDGED').length,
      resolved: alerts.filter((alert) => alert.status === 'RESOLVED').length,
    }),
    [alerts]
  );

  async function quickAcknowledge(alert: Alert) {
    setBusyId(alert.id);
    try {
      await acknowledge(alert.id);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-5">
        <PageHeader
          title="Nurse alert centre"
          description="Every detected condition, its delivery and acknowledgment state, and the resolution record. Identical alerts are suppressed within the cooldown window to avoid flooding the nurse on duty."
          actions={
            <Badge variant="outline" className="border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600">
              Cooldown {Math.round(cooldown / 60)} min
            </Badge>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Open alerts"
            value={counts.open}
            tone={counts.open > 0 ? 'warn' : 'ok'}
            icon={<Inbox className="h-4 w-4" />}
          />
          <StatCard
            label="Critical open"
            value={counts.critical}
            tone={counts.critical > 0 ? 'critical' : 'ok'}
            icon={<ShieldAlert className="h-4 w-4" />}
          />
          <StatCard
            label="Awaiting resolution"
            value={counts.acknowledged}
            tone={counts.acknowledged > 0 ? 'warn' : 'muted'}
            icon={<CheckCheck className="h-4 w-4" />}
          />
          <StatCard
            label="Resolved"
            value={counts.resolved}
            tone="ok"
            icon={<ShieldCheck className="h-4 w-4" />}
          />
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
          <TabsList>
            <TabsTrigger value="open">Open ({counts.open})</TabsTrigger>
            <TabsTrigger value="mine">Acknowledged ({counts.acknowledged})</TabsTrigger>
            <TabsTrigger value="resolved">Resolved ({counts.resolved})</TabsTrigger>
            <TabsTrigger value="all">All ({alerts.length})</TabsTrigger>
          </TabsList>
        </Tabs>

        <section>
          <SectionTitle
            title="Alert log"
            hint="Critical alerts carry a higher notification priority than warning alerts."
          />
          {filtered.length === 0 ? (
            <EmptyState
              icon={<BellRing className="h-5 w-5" />}
              title="Nothing in this view"
              description="Alerts appear here the moment a parameter crosses a configured limit, with the measured value and the rule that triggered it."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/monitoring">Open live monitoring</Link>
                </Button>
              }
            />
          ) : (
            <Card className="divide-y p-0">
              {filtered.map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    'flex flex-wrap items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/80',
                    alert.severity === 'CRITICAL' && alert.status !== 'RESOLVED' && 'bg-red-50/40'
                  )}
                >
                  <SeverityPill severity={alert.severity} />

                  <div className="min-w-[180px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {parameterLabel(alert.parameter)}
                      </p>
                      {alert.measured_value !== null && (
                        <span className="text-sm text-slate-500">
                          {alert.measured_value} {alert.unit ?? ''}
                        </span>
                      )}
                      <SourceBadge source={alert.data_source} />
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{alert.trigger_condition}</p>
                  </div>

                  <div className="flex flex-col items-start gap-1 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-600">{alert.alert_code}</span>
                    <span>
                      {formatTime(alert.created_at)} · {formatAge(alert.created_at)}
                    </span>
                  </div>

                  <AlertStatusBadge status={alert.status} />

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === alert.id || alert.status === 'RESOLVED' || alert.status === 'ACKNOWLEDGED'}
                      onClick={() => void quickAcknowledge(alert)}
                      className="gap-1.5"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Acknowledge
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(alert)} className="gap-1.5">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Details
                    </Button>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>

      <AlertDetailDrawer alert={selected} onClose={() => setSelected(null)} />
    </DashboardShell>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: 'ok' | 'warn' | 'critical' | 'muted';
  icon: React.ReactNode;
}) {
  const tones = {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warn: 'border-amber-200 bg-amber-50 text-amber-700',
    critical: 'border-red-200 bg-red-50 text-red-700',
    muted: 'border-slate-200 bg-slate-50 text-slate-600',
  };
  return (
    <Card className={cn('flex items-center gap-3 border p-4', tones[tone])}>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/70">{icon}</span>
      <div>
        <p className="text-2xl font-semibold tabular">{value}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      </div>
    </Card>
  );
}

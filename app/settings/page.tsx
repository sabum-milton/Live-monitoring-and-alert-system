'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardShell } from '@/components/carewatch/dashboard-shell';
import { PageHeader, SectionTitle } from '@/components/carewatch/page-header';
import { useLive } from '@/lib/live-context';
import { useAuth } from '@/lib/auth-context';
import { updateSetting, updateThreshold } from '@/lib/data';
import { formatDateTime, formatAge } from '@/lib/format';
import type { ThresholdConfiguration } from '@/lib/types';
import { toast } from 'sonner';
import { Info, Lock, Save, ShieldAlert, SlidersHorizontal, UserCog } from 'lucide-react';

const EDITABLE_THRESHOLDS = ['heart_rate', 'spo2', 'temperature', 'respiratory_rate'];

export default function SettingsPage() {
  const { thresholds, settings, refresh, settingNumber, settingBoolean } = useLive();
  const { profile, role } = useAuth();
  const isAdmin = role === 'admin';

  return (
    <DashboardShell>
      <div className="space-y-5">
        <PageHeader
          title="Settings"
          description="Alert thresholds, operational timing and the signed-in account. Threshold changes are recorded in the audit log with who made them."
          actions={
            <Badge
              variant="outline"
              className={
                isAdmin
                  ? 'border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700'
                  : 'border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600'
              }
            >
              {isAdmin ? 'Administrator access' : 'Nurse access (read-only settings)'}
            </Badge>
          }
        />

        <Tabs defaultValue="thresholds">
          <TabsList>
            <TabsTrigger value="thresholds">Thresholds</TabsTrigger>
            <TabsTrigger value="operations">Operations</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
          </TabsList>

          <TabsContent value="thresholds" className="mt-5 space-y-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-xs leading-relaxed text-amber-800">
                These limits are illustrative demonstration values for a university prototype. They require
                clinical review before any real use, and CareWatch does not diagnose disease or predict
                clinical outcomes.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {EDITABLE_THRESHOLDS.map((parameter) => {
                const threshold = thresholds.get(parameter);
                if (!threshold) return null;
                return (
                  <ThresholdEditor
                    key={parameter}
                    threshold={threshold}
                    isAdmin={isAdmin}
                    onSaved={refresh}
                  />
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="operations" className="mt-5 space-y-4">
            <Card className="p-5">
              <SectionTitle
                title="Alert timing"
                hint="Cooldown suppresses repeat alerts for the same parameter. Freshness thresholds control the stale and offline indicators."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <SettingRow
                  settingKey="alert_cooldown_seconds"
                  label="Alert cooldown"
                  suffix="seconds"
                  isAdmin={isAdmin}
                  current={settingNumber('alert_cooldown_seconds', 300)}
                  onSaved={refresh}
                />
                <SettingRow
                  settingKey="stale_reading_seconds"
                  label="Stale reading threshold"
                  suffix="seconds"
                  isAdmin={isAdmin}
                  current={settingNumber('stale_reading_seconds', 30)}
                  onSaved={refresh}
                />
                <SettingRow
                  settingKey="device_offline_seconds"
                  label="Device offline threshold"
                  suffix="seconds"
                  isAdmin={isAdmin}
                  current={settingNumber('device_offline_seconds', 45)}
                  onSaved={refresh}
                />
                <SettingRow
                  settingKey="escalation_seconds"
                  label="Critical escalation window"
                  suffix="seconds"
                  isAdmin={isAdmin}
                  current={settingNumber('escalation_seconds', 120)}
                  onSaved={refresh}
                />
                <SettingRow
                  settingKey="simulation_interval_seconds"
                  label="Simulation update interval"
                  suffix="seconds"
                  isAdmin={isAdmin}
                  current={settingNumber('simulation_interval_seconds', 3)}
                  onSaved={refresh}
                />
              </div>
            </Card>

            <Card className="p-5">
              <SectionTitle title="Notification delivery" hint="Remote providers are optional. The dashboard notification always remains as a fallback." />
              <div className="space-y-3">
                <ToggleRow
                  settingKey="remote_notifications_enabled"
                  label="Attempt remote notifications"
                  description="When enabled, CareWatch calls the configured notification provider in addition to the in-dashboard alert. Delivery is only marked delivered when the provider confirms it."
                  current={settingBoolean('remote_notifications_enabled', false)}
                  isAdmin={isAdmin}
                  onSaved={refresh}
                />
                <ToggleRow
                  settingKey="device_alerting_enabled"
                  label="Raise device connectivity warnings"
                  description="Creates an alert when the assigned device stops transmitting, kept separate from patient condition classification."
                  current={settingBoolean('device_alerting_enabled', true)}
                  isAdmin={isAdmin}
                  onSaved={refresh}
                />
              </div>
              <div className="mt-4 space-y-2 rounded-lg bg-slate-50 px-4 py-3 text-[11px] text-slate-600">
                <p className="font-semibold text-slate-700">Notification providers and secrets</p>
                <p>
                  Provider credentials are held in server-side environment variables and are never present in
                  the browser. A missing credential never blocks the dashboard alert — it is reported as
                  dispatched with delivery unconfirmed.
                </p>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="account" className="mt-5">
            <Card className="p-5">
              <SectionTitle title="Signed-in account" />
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Name</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-800">{profile?.full_name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Email</p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-slate-800">{profile?.email ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Role</p>
                  <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold capitalize text-slate-800">
                    <UserCog className="h-3.5 w-3.5 text-slate-400" />
                    {role ?? 'unknown'}
                  </p>
                </div>
              </div>
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 px-4 py-3 text-[11px] leading-relaxed text-slate-600">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Roles are assigned by the server and cannot be changed from the browser. The first account
                created becomes the administrator; every later account is a nurse. Only administrators can
                change thresholds and operational settings.
              </p>
            </Card>

            <Card className="mt-4 p-5">
              <SectionTitle title="Current settings snapshot" />
              <div className="divide-y">
                {Array.from(settings.values())
                  .sort((a, b) => a.key.localeCompare(b.key))
                  .map((row) => (
                    <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700">
                          {row.key.replace(/_/g, ' ')}
                        </p>
                        {row.description && (
                          <p className="text-[11px] text-slate-500">{row.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <code className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                          {JSON.stringify(row.value)}
                        </code>
                        {row.updated_at && (
                          <span className="text-[10px] text-slate-400">{formatAge(row.updated_at)}</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}

function ThresholdEditor({
  threshold,
  isAdmin,
  onSaved,
}: {
  threshold: ThresholdConfiguration;
  isAdmin: boolean;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    warning_low: threshold.warning_low?.toString() ?? '',
    warning_high: threshold.warning_high?.toString() ?? '',
    critical_low: threshold.critical_low?.toString() ?? '',
    critical_high: threshold.critical_high?.toString() ?? '',
    persistence_samples: threshold.persistence_samples.toString(),
    enabled: threshold.enabled,
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    const toNumber = (value: string) => (value.trim() === '' ? null : Number(value));
    for (const key of ['warning_low', 'warning_high', 'critical_low', 'critical_high'] as const) {
      const parsed = toNumber(draft[key]);
      if (parsed !== null && !Number.isFinite(parsed)) {
        toast.error(`${key.replace('_', ' ')} must be a number or left blank.`);
        return;
      }
    }
    setBusy(true);
    try {
      await updateThreshold({
        parameter: threshold.parameter,
        warning_low: toNumber(draft.warning_low),
        warning_high: toNumber(draft.warning_high),
        critical_low: toNumber(draft.critical_low),
        critical_high: toNumber(draft.critical_high),
        enabled: draft.enabled,
        persistence_samples: Number(draft.persistence_samples) || 1,
      });
      await onSaved();
      toast.success(`${threshold.display_name} limits updated.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update the thresholds.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <SlidersHorizontal className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">{threshold.display_name}</p>
            <p className="text-[11px] text-slate-500">Unit: {threshold.unit}</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={
            threshold.enabled
              ? 'border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700'
              : 'border-slate-300 text-[10px] font-semibold text-slate-500'
          }
        >
          {threshold.enabled ? 'ENABLED' : 'DISABLED'}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <NumberField
          label="Warning low"
          value={draft.warning_low}
          disabled={!isAdmin}
          onChange={(value) => setDraft({ ...draft, warning_low: value })}
        />
        <NumberField
          label="Warning high"
          value={draft.warning_high}
          disabled={!isAdmin}
          onChange={(value) => setDraft({ ...draft, warning_high: value })}
        />
        <NumberField
          label="Critical low"
          value={draft.critical_low}
          disabled={!isAdmin}
          onChange={(value) => setDraft({ ...draft, critical_low: value })}
        />
        <NumberField
          label="Critical high"
          value={draft.critical_high}
          disabled={!isAdmin}
          onChange={(value) => setDraft({ ...draft, critical_high: value })}
        />
        <NumberField
          label="Samples before alert"
          value={draft.persistence_samples}
          disabled={!isAdmin}
          onChange={(value) => setDraft({ ...draft, persistence_samples: value })}
        />
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <Switch
              checked={draft.enabled}
              disabled={!isAdmin}
              onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked })}
            />
            Rule enabled
          </label>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-[11px] text-slate-500">
          {threshold.updated_at
            ? `Last changed ${formatDateTime(threshold.updated_at)}${
                threshold.updated_by_name ? ` by ${threshold.updated_by_name}` : ''
              }`
            : 'Using seeded demonstration limits'}
        </p>
        {isAdmin ? (
          <Button size="sm" onClick={() => void save()} disabled={busy} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            Save limits
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <Lock className="h-3.5 w-3.5" />
            Administrator only
          </span>
        )}
      </div>
    </Card>
  );
}

function NumberField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</Label>
      <Input
        type="number"
        step="0.1"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function SettingRow({
  settingKey,
  label,
  suffix,
  isAdmin,
  current,
  onSaved,
}: {
  settingKey: string;
  label: string;
  suffix: string;
  isAdmin: boolean;
  current: number;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState(String(current));
  const [busy, setBusy] = useState(false);

  async function save() {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error('Enter a positive number of seconds.');
      return;
    }
    setBusy(true);
    try {
      await updateSetting(settingKey, parsed);
      await onSaved();
      toast.success(`${label} updated.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update the setting.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label} <span className="font-normal text-slate-400">({suffix})</span>
      </Label>
      <div className="flex gap-2">
        <Input
          type="number"
          value={value}
          disabled={!isAdmin}
          onChange={(event) => setValue(event.target.value)}
        />
        {isAdmin && (
          <Button size="sm" variant="outline" onClick={() => void save()} disabled={busy}>
            Save
          </Button>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  settingKey,
  label,
  description,
  current,
  isAdmin,
  onSaved,
}: {
  settingKey: string;
  label: string;
  description: string;
  current: boolean;
  isAdmin: boolean;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      await updateSetting(settingKey, next);
      await onSaved();
      toast.success(`${label} ${next ? 'enabled' : 'disabled'}.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update the setting.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-slate-50/60 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-800">{label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{description}</p>
      </div>
      <Switch checked={current} disabled={!isAdmin || busy} onCheckedChange={(next) => void toggle(next)} />
    </div>
  );
}

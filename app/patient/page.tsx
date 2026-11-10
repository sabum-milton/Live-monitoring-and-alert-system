'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DashboardShell } from '@/components/carewatch/dashboard-shell';
import { PageHeader, SectionTitle, EmptyState } from '@/components/carewatch/page-header';
import { Badge } from '@/components/ui/badge';
import { useLive } from '@/lib/live-context';
import {
  createPatient,
  fetchAssignmentHistory,
  fetchNurses,
  openAssignment,
  closeAssignment,
  updatePatient,
} from '@/lib/data';
import { formatDateTime, formatAge } from '@/lib/format';
import type { DeviceAssignment, Nurse, Patient } from '@/lib/types';
import { toast } from 'sonner';
import {
  CalendarClock,
  Cpu,
  History,
  IdCard,
  Link2,
  Save,
  Unlink,
  UserPlus,
  UserRound,
} from 'lucide-react';

export default function PatientPage() {
  const { activePatient, assignment, device, devices, patients, reloadPatientContext } = useLive();

  const [form, setForm] = useState({
    full_name: '',
    age: '',
    sex: 'unspecified',
    bed_number: '',
    ward: '',
  });
  const [deviceKey, setDeviceKey] = useState('');
  const [nurseId, setNurseId] = useState('');
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<DeviceAssignment[]>([]);
  const [editBed, setEditBed] = useState('');
  const [editWard, setEditWard] = useState('');

  useEffect(() => {
    void fetchNurses()
      .then(setNurses)
      .catch(() => setNurses([]));
  }, []);

  useEffect(() => {
    setEditBed(activePatient?.bed_number ?? '');
    setEditWard(activePatient?.ward ?? '');
  }, [activePatient?.id, activePatient?.bed_number, activePatient?.ward]);

  useEffect(() => {
    setNurseId(assignment?.nurse_id ?? '');
  }, [assignment?.id, assignment?.nurse_id]);

  useEffect(() => {
    if (!activePatient) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    void fetchAssignmentHistory(activePatient.id)
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activePatient?.id, busy]);

  async function registerAndAssign(event: React.FormEvent) {
    event.preventDefault();
    if (!form.full_name.trim()) {
      toast.error('Enter the patient full name.');
      return;
    }
    if (!deviceKey) {
      toast.error('Select the monitoring device to assign.');
      return;
    }
    setBusy(true);
    try {
      const patient: Patient = await createPatient({
        full_name: form.full_name.trim(),
        age: form.age ? Number(form.age) : null,
        sex: form.sex === 'unspecified' ? null : form.sex,
        bed_number: form.bed_number.trim() || null,
        ward: form.ward.trim() || null,
      });
      const selected = devices.find((row) => row.device_id === deviceKey);
      if (selected) {
        await openAssignment({
          patientId: patient.id,
          deviceId: selected.id,
          nurseId: nurseId || null,
          reason: 'New patient registration',
        });
      }
      setForm({ full_name: '', age: '', sex: 'unspecified', bed_number: '', ward: '' });
      setDeviceKey('');
      await reloadPatientContext();
      toast.success(`Registered ${patient.public_id} and opened a device assignment.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  }

  async function moveDevice() {
    if (!activePatient || !deviceKey) {
      toast.error('Select a device to assign.');
      return;
    }
    const selected = devices.find((row) => row.device_id === deviceKey);
    if (!selected) return;
    setBusy(true);
    try {
      await openAssignment({
        patientId: activePatient.id,
        deviceId: selected.id,
        nurseId: nurseId || null,
        reason: 'Device reassigned by staff',
      });
      setDeviceKey('');
      await reloadPatientContext();
      toast.success(`Device ${selected.device_id} assigned to ${activePatient.public_id}.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Reassignment failed.');
    } finally {
      setBusy(false);
    }
  }

  async function endMonitoring() {
    if (!activePatient) return;
    setBusy(true);
    try {
      await closeAssignment(activePatient.id, 'Monitoring ended by staff');
      await reloadPatientContext();
      toast.success('Monitoring ended and the assignment was closed.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not end monitoring.');
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!activePatient) return;
    setBusy(true);
    try {
      await updatePatient(activePatient.id, {
        bed_number: editBed.trim() || null,
        ward: editWard.trim() || null,
      });
      await reloadPatientContext();
      toast.success('Patient profile updated.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Update failed.');
    } finally {
      setBusy(false);
    }
  }

  function handleNurseChange(nextNurseId: string) {
    setNurseId(nextNurseId);
    if (!activePatient || !assignment) return;
    const chosen = nurses.find((row) => row.id === nextNurseId);
    if (!chosen) return;
    // Persist the assigned nurse by reopening the assignment for the same device.
    void (async () => {
      setBusy(true);
      try {
        await openAssignment({
          patientId: activePatient.id,
          deviceId: assignment.device_id,
          nurseId: nextNurseId,
          reason: `Nurse changed to ${chosen.full_name}`,
        });
        await reloadPatientContext();
        toast.success(`${chosen.full_name} is now the assigned nurse.`);
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : 'Could not change the assigned nurse.');
      } finally {
        setBusy(false);
      }
    })();
  }

  const nurseSelect = (
    <Select value={nurseId} onValueChange={handleNurseChange}>
      <SelectTrigger>
        <SelectValue placeholder="Assign a nurse…" />
      </SelectTrigger>
      <SelectContent>
        {nurses.length === 0 ? (
          <SelectItem value="none" disabled>
            No nurses available
          </SelectItem>
        ) : (
          nurses.map((row) => (
            <SelectItem key={row.id} value={row.id}>
              {row.full_name}
              {row.shift ? ` — ${row.shift} shift` : ''}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );

  return (
    <DashboardShell>
      <div className="space-y-6">
        <PageHeader
          title="Patient profile"
          description="Register the active patient, assign the ESP32 unit and keep the identification record current. Reassigning preserves every historical reading under its original owner."
        />

        <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-5">
            <section>
              <SectionTitle title="Active patient" />
              {activePatient ? (
                <Card className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-semibold text-slate-900">{activePatient.full_name}</p>
                        <Badge
                          variant="outline"
                          className={
                            activePatient.monitoring_status === 'MONITORING'
                              ? 'border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700'
                              : 'border-slate-300 text-[10px] font-semibold text-slate-500'
                          }
                        >
                          {activePatient.monitoring_status}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Registered {formatDateTime(activePatient.registered_at)}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-slate-300 text-[11px] font-semibold text-slate-600">
                      {activePatient.public_id}
                    </Badge>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <Field label="Age" value={activePatient.age ? `${activePatient.age} yrs` : '—'} />
                    <Field label="Sex" value={activePatient.sex ?? '—'} />
                    <Field label="Bed / room" value={activePatient.bed_number ?? '—'} />
                    <Field label="Ward" value={activePatient.ward ?? '—'} />
                    <Field label="Device" value={device?.device_id ?? 'Not assigned'} />
                    <Field label="Nurse" value={assignment?.nurse_name ?? 'Unassigned'} />
                  </dl>

                  <form onSubmit={saveProfile} className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Bed / room identifier
                      </Label>
                      <Input
                        value={editBed}
                        onChange={(event) => setEditBed(event.target.value)}
                        placeholder="Bed 12"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Ward
                      </Label>
                      <Input
                        value={editWard}
                        onChange={(event) => setEditWard(event.target.value)}
                        placeholder="Cardiology"
                      />
                    </div>
                    <Button type="submit" size="sm" variant="outline" disabled={busy} className="gap-1.5 sm:col-span-2">
                      <Save className="h-3.5 w-3.5" />
                      Save profile details
                    </Button>
                  </form>
                </Card>
              ) : (
                <EmptyState
                  icon={<IdCard className="h-5 w-5" />}
                  title="No active patient"
                  description="Register a patient below to start monitoring. Until a patient exists, incoming device readings are recorded as unassigned and will not be attributed."
                />
              )}
            </section>

            <section>
              <SectionTitle
                title="Assignment control"
                hint="Moving the device closes the previous assignment and opens a new one."
              />
              <Card className="space-y-3 p-5">
                <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5" />
                    Currently assigned: <strong>{device?.device_id ?? 'none'}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Since {assignment ? formatAge(assignment.started_at) : '—'}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Device
                    </Label>
                    <Select value={deviceKey} onValueChange={setDeviceKey}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a device…" />
                      </SelectTrigger>
                      <SelectContent>
                        {devices.map((row) => (
                          <SelectItem key={row.id} value={row.device_id}>
                            {row.device_id} — {row.label ?? 'unlabelled'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Nurse on duty
                    </Label>
                    {nurseSelect}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={moveDevice} disabled={busy || !activePatient} className="gap-1.5">
                    <Link2 className="h-3.5 w-3.5" />
                    Assign device
                  </Button>
                  <Button
                    variant="outline"
                    onClick={endMonitoring}
                    disabled={busy || !activePatient}
                    className="gap-1.5"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                    End monitoring
                  </Button>
                </div>
              </Card>
            </section>
          </div>

          <div className="space-y-5">
            <section>
              <SectionTitle
                title="Register a new patient"
                hint="A new patient ID is generated automatically, for example PT-003."
              />
              <Card className="p-5">
                <form onSubmit={registerAndAssign} className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Full name
                    </Label>
                    <Input
                      value={form.full_name}
                      onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                      placeholder="Patient full name"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Age
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={129}
                      value={form.age}
                      onChange={(event) => setForm({ ...form, age: event.target.value })}
                      placeholder="e.g. 54"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Sex (optional)
                    </Label>
                    <Select value={form.sex} onValueChange={(value) => setForm({ ...form, sex: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unspecified">Prefer not to say</SelectItem>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Bed / room
                    </Label>
                    <Input
                      value={form.bed_number}
                      onChange={(event) => setForm({ ...form, bed_number: event.target.value })}
                      placeholder="Bed 12"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Ward
                    </Label>
                    <Input
                      value={form.ward}
                      onChange={(event) => setForm({ ...form, ward: event.target.value })}
                      placeholder="Cardiology"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Assign monitoring device
                    </Label>
                    <Select value={deviceKey} onValueChange={setDeviceKey}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select the ESP32 unit to assign…" />
                      </SelectTrigger>
                      <SelectContent>
                        {devices.map((row) => (
                          <SelectItem key={row.id} value={row.device_id}>
                            {row.device_id} — {row.label ?? 'unlabelled'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Readings are attributed using this assignment, never by a patient ID supplied by the
                      device itself.
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Assigned nurse
                    </Label>
                    {nurseSelect}
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="submit" disabled={busy} className="w-full gap-1.5">
                      <UserPlus className="h-4 w-4" />
                      Register patient and start monitoring
                    </Button>
                  </div>
                </form>
              </Card>
            </section>

            <section>
              <SectionTitle
                title="Assignment history"
                hint={
                  activePatient
                    ? `Previous and current assignments for ${activePatient.public_id}`
                    : 'Select a patient first'
                }
                actions={
                  <Badge variant="outline" className="border-slate-300 text-[10px] font-semibold text-slate-500">
                    {history.length} record{history.length === 1 ? '' : 's'}
                  </Badge>
                }
              />
              <Card className="divide-y p-0">
                {history.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-400">
                    No assignment records for this patient yet.
                  </p>
                ) : (
                  history.map((row) => (
                    <div key={row.id} className="flex items-start gap-3 px-4 py-3">
                      <History className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800">
                          {devices.find((d) => d.id === row.device_id)?.device_id ?? 'Unknown device'}
                          <span className="ml-2 font-normal text-slate-500">
                            {row.is_active ? 'active' : row.ended_reason ?? 'closed'}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {row.nurse_name ? `${row.nurse_name} · ` : ''}
                          {formatDateTime(row.started_at)} →{' '}
                          {row.ended_at ? formatDateTime(row.ended_at) : 'present'}
                        </p>
                      </div>
                      {row.is_active && (
                        <Badge className="border-transparent bg-emerald-600 text-[10px] font-bold text-white">
                          ACTIVE
                        </Badge>
                      )}
                    </div>
                  ))
                )}
              </Card>
            </section>

            <section>
              <SectionTitle
                title="Registered patients"
                hint="Only one patient monitors at a time; history for previous patients is preserved."
              />
              <Card className="divide-y p-0">
                {patients.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-400">No patients registered.</p>
                ) : (
                  patients.slice(0, 6).map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-800">
                          {row.full_name} <span className="font-normal text-slate-500">· {row.public_id}</span>
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {row.bed_number ?? 'no bed'} · registered {formatDateTime(row.registered_at)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          row.is_active
                            ? 'border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700'
                            : 'border-slate-300 text-[10px] font-semibold text-slate-500'
                        }
                      >
                        {row.is_active ? 'ACTIVE' : row.monitoring_status}
                      </Badge>
                    </div>
                  ))
                )}
              </Card>
            </section>
          </div>
        </div>

        <Card className="flex items-start gap-3 p-4">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p className="text-[11px] leading-relaxed text-slate-500">
            Changing the active patient closes the previous assignment, records its end time and opens a new
            assignment. Historical readings and alerts keep the patient and assignment they belong to and are
            never re-attributed to the new patient. Every assignment change and nurse change is written to the
            audit log.
          </p>
        </Card>
      </div>
    </DashboardShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{value}</dd>
    </div>
  );
}

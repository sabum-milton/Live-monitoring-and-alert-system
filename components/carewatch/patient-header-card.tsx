'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/carewatch/status-badge';
import { useLive } from '@/lib/live-context';
import { formatDateTime, formatAge } from '@/lib/format';
import { cn } from '@/lib/utils';
import { BedDouble, Cpu, IdCard, Radio, Stethoscope, UserRound } from 'lucide-react';

export function PatientHeaderCard() {
  const { activePatient, assignment, device, classification, latestReading } = useLive();

  if (!activePatient) {
    return (
      <Card className="border-amber-200 bg-amber-50/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <UserRound className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-amber-900">No active patient is registered</p>
              <p className="text-xs text-amber-700">
                Register a patient and assign the monitoring device before readings can be attributed.
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700">
            <Link href="/patient">Register patient</Link>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4',
          classification.status === 'CRITICAL'
            ? 'border-red-100 bg-red-50/60'
            : classification.status === 'ABNORMAL'
              ? 'border-amber-100 bg-amber-50/50'
              : 'bg-slate-50/70'
        )}
      >
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-lg font-bold text-slate-700 ring-1 ring-slate-200">
            {activePatient.full_name
              .split(' ')
              .map((part) => part[0])
              .slice(0, 2)
              .join('')}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold text-slate-900">{activePatient.full_name}</p>
              <Badge variant="outline" className="border-slate-300 bg-white text-[11px] font-semibold text-slate-600">
                {activePatient.public_id}
              </Badge>
              {latestReading && latestReading.data_source === 'SIMULATED' && (
                <Badge variant="outline" className="border-sky-200 bg-sky-50 text-[10px] font-semibold uppercase text-sky-700">
                  Simulated data
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {activePatient.age ? `${activePatient.age} yrs` : 'Age not recorded'}
              {activePatient.sex ? ` · ${activePatient.sex}` : ''}
              {activePatient.ward ? ` · ${activePatient.ward}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={classification.status} />
        </div>
      </div>

      <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
        <Detail icon={<IdCard className="h-4 w-4" />} label="Patient ID" value={activePatient.public_id} />
        <Detail icon={<BedDouble className="h-4 w-4" />} label="Bed / room" value={activePatient.bed_number ?? '—'} />
        <Detail
          icon={<Cpu className="h-4 w-4" />}
          label="Assigned device"
          value={device ? device.device_id : 'Not assigned'}
          tone={device ? 'ok' : 'bad'}
        />
        <Detail
          icon={<Stethoscope className="h-4 w-4" />}
          label="Nurse on duty"
          value={assignment?.nurse_name ?? activePatient.assigned_nurse_name ?? 'Unassigned'}
        />
        <Detail
          icon={<Radio className="h-4 w-4" />}
          label="Monitoring since"
          value={
            assignment
              ? `${formatDateTime(assignment.started_at)} (${formatAge(assignment.started_at)})`
              : 'Not started'
          }
        />
      </div>
    </Card>
  );
}

function Detail({
  icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'neutral' | 'ok' | 'bad';
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <span className="text-slate-400">{icon}</span>
        {label}
      </p>
      <p
        className={cn(
          'mt-1 truncate text-sm font-semibold',
          tone === 'ok' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-600' : 'text-slate-800'
        )}
      >
        {value}
      </p>
    </div>
  );
}

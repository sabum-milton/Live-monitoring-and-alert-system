'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLive } from '@/lib/live-context';
import { SCENARIO_META } from '@/lib/simulation';
import type { SimulationScenario } from '@/lib/types';
import { cn } from '@/lib/utils';
import { FlaskConical, Play, RotateCcw, Square, Terminal } from 'lucide-react';

const SCENARIOS: SimulationScenario[] = [
  'normal',
  'abnormal',
  'critical',
  'sensor_disconnected',
  'recovery',
];

const TONE_CLASS: Record<string, string> = {
  normal: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  warn: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
  critical: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
  muted: 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200',
};

export function SimulationRail() {
  const { simulation, activePatient, assignment } = useLive();

  return (
    <Card className="no-print overflow-hidden border-slate-200 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50/80 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
            <FlaskConical className="h-4 w-4 text-sky-300" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Demonstration mode</p>
            <p className="text-[11px] text-slate-500">
              Samples are labelled SIMULATED and use the same validation, alert and notification workflow as hardware.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => simulation.start(simulation.scenario)}
            disabled={simulation.running || !assignment}
            className="gap-1.5 bg-slate-900 hover:bg-slate-800"
          >
            <Play className="h-3.5 w-3.5" />
            Start simulation
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={simulation.stop}
            disabled={!simulation.running}
            className="gap-1.5"
          >
            <Square className="h-3.5 w-3.5" />
            Stop
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void simulation.reset()} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </div>

      <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-5">
        {SCENARIOS.map((scenario) => {
          const meta = SCENARIO_META[scenario];
          const selected = simulation.scenario === scenario;
          return (
            <button
              key={scenario}
              type="button"
              onClick={() => {
                simulation.setScenario(scenario);
                if (!simulation.running) simulation.start(scenario);
              }}
              className={cn(
                'rounded-lg border p-3 text-left transition-all',
                selected
                  ? cn(TONE_CLASS[meta.tone], 'ring-2 ring-offset-1 ring-slate-400/60')
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              )}
            >
              <p className="text-xs font-semibold">{meta.label}</p>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">{meta.description}</p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t bg-slate-50/60 px-4 py-2.5 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <Terminal className="h-3.5 w-3.5" />
          Target patient: <strong className="font-semibold">{activePatient?.public_id ?? 'none registered'}</strong>
        </span>
        <span>
          Assigned device: <strong className="font-semibold">{assignment ? 'connected' : 'none'}</strong>
        </span>
        <span>
          Update interval: <strong className="font-semibold">{simulation.interval}s</strong>
        </span>
        {simulation.error && (
          <span className="font-semibold text-red-600">{simulation.error}</span>
        )}
        {simulation.lastResult && !simulation.error && (
          <span className="inline-flex items-center gap-2">
            <span
              className={cn(
                'rounded px-1.5 py-0.5 font-bold text-white',
                simulation.lastResult.status === 'CRITICAL'
                  ? 'bg-red-600'
                  : simulation.lastResult.status === 'ABNORMAL'
                    ? 'bg-amber-500'
                    : simulation.lastResult.status === 'UNASSIGNED'
                      ? 'bg-slate-500'
                      : 'bg-emerald-600'
              )}
            >
              {simulation.lastResult.status}
            </span>
            {simulation.lastResult.alertsCreated.length > 0
              ? `raised ${simulation.lastResult.alertsCreated.join(', ')}`
              : simulation.lastResult.alertsSuppressed.length > 0
                ? `suppressed: ${simulation.lastResult.alertsSuppressed.join(', ')}`
                : simulation.lastResult.alertsPending.length > 0
                  ? `building up: ${simulation.lastResult.alertsPending.join(', ')}`
                  : 'no new alerts'}
          </span>
        )}
      </div>
    </Card>
  );
}

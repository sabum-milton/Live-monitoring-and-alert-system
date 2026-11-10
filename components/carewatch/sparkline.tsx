'use client';

import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import type { ParameterStatus } from '@/lib/classification';
import { STATUS_META } from '@/lib/format';

const STROKE: Record<ParameterStatus, string> = {
  NORMAL: '#059669',
  ABNORMAL: '#d97706',
  CRITICAL: '#dc2626',
  SENSOR_UNAVAILABLE: '#94a3b8',
};

export function Sparkline({
  data,
  status,
  className,
}: {
  data: { value: number | null }[];
  status: ParameterStatus;
  className?: string;
}) {
  const points = data.filter((row) => row.value !== null) as { value: number }[];
  if (points.length < 2) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-md bg-slate-50 text-[10px] font-medium text-slate-400',
          className
        )}
      >
        awaiting trend data
      </div>
    );
  }

  const color = STROKE[status];
  const id = `spark-${status}`;

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${id})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusRail({ status }: { status: ParameterStatus }) {
  return <div className={cn('h-full w-1.5 rounded-l-xl', STATUS_META[status].solid)} />;
}

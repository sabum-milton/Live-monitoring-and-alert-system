'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLive } from '@/lib/live-context';
import { useAuth } from '@/lib/auth-context';
import {
  Activity,
  BellRing,
  ChevronsLeft,
  ChevronsRight,
  History,
  LayoutDashboard,
  Menu,
  Radio,
  Settings,
  ShieldPlus,
  UserRound,
} from 'lucide-react';

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard, description: 'Live patient summary' },
  { href: '/patient', label: 'Patient Profile', icon: UserRound, description: 'Registration and assignment' },
  { href: '/monitoring', label: 'Live Monitoring', icon: Activity, description: 'Vital-sign cards and trends' },
  { href: '/alerts', label: 'Nurse Alert Centre', icon: BellRing, description: 'Acknowledge and resolve' },
  { href: '/history', label: 'Patient History', icon: History, description: 'Charts, export and reports' },
  { href: '/device', label: 'Device Status', icon: Radio, description: 'ESP32 connectivity health' },
  { href: '/settings', label: 'Settings', icon: Settings, description: 'Thresholds and simulation' },
];

function NavList({
  onNavigate,
  collapsed,
}: {
  onNavigate?: () => void;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const { alerts } = useLive();
  const openAlerts = alerts.filter((alert) => alert.status !== 'RESOLVED');

  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        const badge = item.href === '/alerts' ? openAlerts.length : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
              active
                ? 'bg-white/12 text-white shadow-sm ring-1 ring-white/15'
                : 'text-slate-300 hover:bg-white/8 hover:text-white'
            )}
            title={collapsed ? item.label : undefined}
          >
            <Icon
              className={cn(
                'h-[18px] w-[18px] shrink-0 transition-colors',
                active ? 'text-sky-300' : 'text-slate-400 group-hover:text-sky-300'
              )}
            />
            {!collapsed && (
              <>
                <span className="flex-1 truncate">{item.label}</span>
                {badge > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </>
            )}
            {collapsed && badge > 0 && (
              <span className="absolute right-3 top-2 h-2 w-2 rounded-full bg-red-500" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5 px-5 py-5', collapsed && 'justify-center px-2')}>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/20 ring-1 ring-sky-400/30">
        <ShieldPlus className="h-5 w-5 text-sky-300" />
      </span>
      {!collapsed && (
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight text-white">CareWatch</p>
          <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
            Monitor · Alert · Respond
          </p>
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, signOut } = useAuth();

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'no-print sticky top-0 hidden h-screen shrink-0 flex-col border-r border-white/5 bg-[hsl(217,55%,15%)] transition-[width] duration-300 lg:flex',
          collapsed ? 'w-[76px]' : 'w-[264px]'
        )}
      >
        <Brand collapsed={collapsed} />
        <div className="flex-1 overflow-y-auto pb-4">
          <NavList collapsed={collapsed} />
        </div>
        <div className="border-t border-white/8 p-3">
          {!collapsed && (
            <div className="mb-2 rounded-lg bg-white/5 px-3 py-2">
              <p className="truncate text-xs font-semibold text-white">
                {profile?.full_name ?? 'Signed-in user'}
              </p>
              <p className="truncate text-[11px] capitalize text-slate-400">
                {profile?.role ?? 'nurse'} account
              </p>
            </div>
          )}
          <div className={cn('flex gap-2', collapsed && 'flex-col')}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void signOut()}
              className="flex-1 justify-start text-slate-300 hover:bg-white/8 hover:text-white"
            >
              <ChevronsLeft className="h-4 w-4" />
              {!collapsed && <span className="ml-2">Sign out</span>}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed((prev) => !prev)}
              className="hidden text-slate-400 hover:bg-white/8 hover:text-white lg:inline-flex"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="no-print sticky top-0 z-40 flex items-center justify-between border-b bg-[hsl(217,55%,15%)] px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <ShieldPlus className="h-5 w-5 text-sky-300" />
          <span className="text-sm font-semibold text-white">CareWatch</span>
        </div>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open navigation</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] border-white/10 bg-[hsl(217,55%,15%)] p-0">
            <Brand collapsed={false} />
            <NavList collapsed={false} onNavigate={() => setMobileOpen(false)} />
            <div className="mt-4 px-3">
              <Button
                variant="ghost"
                onClick={() => void signOut()}
                className="w-full justify-start text-slate-300 hover:bg-white/8 hover:text-white"
              >
                <ChevronsLeft className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

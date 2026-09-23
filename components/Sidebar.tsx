'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  GraduationCap, LayoutDashboard, Users, BookOpen,
  BarChart3, Settings, LogOut, Menu, X, ChevronRight,
  UserPlus, Calendar, CreditCard, Home, Shield,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth, getNavPermissions } from '@/lib/auth-context';

// ── All possible nav items ───────────────────────────────────────

const ALL_NAV = [
  // Admin / Staff
  { key: 'dashboard',       href: '/dashboard',        icon: LayoutDashboard, label: 'Dashboard' },
  { key: 'students',        href: '/students',         icon: Users,           label: 'Students' },
  { key: 'admissions',      href: '/admissions',       icon: UserPlus,        label: 'Admissions' },
  { key: 'attendance',      href: '/attendance',       icon: BookOpen,        label: 'Attendance' },
  { key: 'ledger',          href: '/ledger',           icon: BarChart3,       label: 'Ledger' },
  { key: 'settings',        href: '/settings',         icon: Settings,        label: 'Settings' },
  // Student
  { key: 'myAttendance',    href: '/my-attendance',    icon: Calendar,        label: 'My Attendance' },
  { key: 'myFees',          href: '/my-fees',          icon: CreditCard,      label: 'My Fees' },
  // Parent
  { key: 'parentDashboard', href: '/parent-dashboard', icon: Home,            label: 'Home' },
] as const;

type NavKey = typeof ALL_NAV[number]['key'];

// ── Role badge colours ───────────────────────────────────────────

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  super_admin: { label: 'Super Admin', cls: 'bg-brand-500/20 text-brand-300 border-brand-500/30' },
  staff:       { label: 'Staff',       cls: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
  student:     { label: 'Student',     cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  parent:      { label: 'Parent',      cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
};

const ROLE_AVATAR_GRADIENT: Record<string, string> = {
  super_admin: 'from-brand-500 to-violet-600',
  staff:       'from-violet-500 to-blue-600',
  student:     'from-emerald-500 to-teal-600',
  parent:      'from-amber-500 to-orange-600',
};

interface SidebarProps {
  collapsed?: boolean;
}

export default function Sidebar({ collapsed: initialCollapsed = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = session?.role ?? 'staff';
  const perms = getNavPermissions(role);
  const badge = ROLE_BADGE[role];
  const avatarGradient = ROLE_AVATAR_GRADIENT[role];

  // Filter nav items to only those the role can see
  const navItems = ALL_NAV.filter(item => perms[item.key as NavKey]);

  function handleLogout() {
    logout();
    router.replace('/');
  }

  const initials = session?.full_name
    ? session.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  const NavContent = () => (
    <>
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-white/[0.06] ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-glow-brand flex-shrink-0">
          <GraduationCap size={20} className="text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="font-bold text-white text-sm leading-tight">Okasha</div>
            <div className="text-[10px] text-slate-500 font-medium">Institute</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {!collapsed && (
          <p className="section-title px-2 mb-3">Navigation</p>
        )}
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== '/dashboard' && href !== '/my-attendance' && href !== '/parent-dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative
                ${active
                  ? 'bg-brand-600/20 text-brand-300 border border-brand-500/30'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-surface-800'
                }
                ${collapsed ? 'justify-center' : ''}
              `}
            >
              <Icon
                size={18}
                className={`flex-shrink-0 ${active ? 'text-brand-400' : 'text-slate-600 group-hover:text-slate-400'}`}
              />
              {!collapsed && <span className="flex-1">{label}</span>}
              {active && !collapsed && (
                <ChevronRight size={14} className="text-brand-500" />
              )}
              {/* Tooltip for collapsed state */}
              {collapsed && (
                <div className="absolute left-full ml-3 px-2 py-1 bg-surface-800 border border-white/10 rounded-lg text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  {label}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={`px-3 py-4 border-t border-white/[0.06] space-y-2`}>
        {/* User info + role badge */}
        {!collapsed && session && (
          <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-surface-800/50 mb-1">
            <div className={`avatar w-8 h-8 ${avatarGradient} text-xs flex-shrink-0`}>
              {initials}
            </div>
            <div className="overflow-hidden flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">{session.full_name}</div>
              <div className="text-[10px] text-slate-600 truncate">{session.email}</div>
              <span className={`inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${badge.cls}`}>
                <Shield size={8} />
                {badge.label}
              </span>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={16} />
          {!collapsed && 'Sign Out'}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`
          hidden lg:flex flex-col bg-surface-900/95 border-r border-white/[0.06] transition-all duration-300 h-screen sticky top-0
          ${collapsed ? 'w-[64px]' : 'w-[220px]'}
        `}
      >
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-6 w-6 h-6 bg-surface-800 border border-white/10 rounded-full flex items-center justify-center text-slate-500 hover:text-white hover:border-brand-500/50 transition-all z-10 shadow-card"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronRight size={12} className="rotate-180" />}
        </button>
        <NavContent />
      </aside>

      {/* Mobile header bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-surface-900/95 border-b border-white/[0.06] backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center">
            <GraduationCap size={16} className="text-white" />
          </div>
          <span className="font-bold text-white text-sm">Okasha Institute</span>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="btn-icon">
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <aside
            className="absolute left-0 top-0 h-full w-64 bg-surface-900 border-r border-white/[0.06] flex flex-col animate-slide-in-left"
            onClick={e => e.stopPropagation()}
          >
            <NavContent />
          </aside>
        </div>
      )}
    </>
  );
}

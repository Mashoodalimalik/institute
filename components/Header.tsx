'use client';

import { Search } from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onSearch?: (q: string) => void;
  searchPlaceholder?: string;
}

export default function Header({ title = 'The Prism Coaching Center', subtitle, actions, onSearch, searchPlaceholder }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-surface-950/80 backdrop-blur-sm border-b border-white/[0.05] px-6 py-4">
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white truncate">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-3">
          {/* Optional inline search */}
          {onSearch && (
            <div className="relative hidden md:block">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                placeholder={searchPlaceholder || 'Search...'}
                onChange={e => onSearch(e.target.value)}
                className="input pl-9 py-2 w-56 text-xs"
              />
            </div>
          )}

          {/* Web Push Notification Bell */}
          <NotificationBell />

          {/* Page actions */}
          {actions}
        </div>
      </div>
    </header>
  );
}

'use client';

/**
 * AUTH CONTEXT — OKASHA INSTITUTE
 * ─────────────────────────────────────────────────────────────────
 * Two modes:
 *  1. LIVE MODE  — Supabase configured in .env.local
 *     Uses Supabase Auth (email/password + Google OAuth).
 *     Session managed by @supabase/ssr; persists via cookies.
 *     Approval status checked on every load.
 *
 *  2. DEMO MODE  — NEXT_PUBLIC_SUPABASE_URL not set / placeholder
 *     Falls back to localStorage quick-login (existing demo behaviour).
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { UserRole } from '@/lib/types';

// ── Types ────────────────────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface UserSession {
  role: UserRole | null;         // null until admin assigns
  status: ApprovalStatus;
  userId: string;
  full_name: string;
  email: string;
  profileId?: string;            // for students
  childrenIds?: string[];        // for parents
  requested_role?: string;       // self-reported at sign-up
}

interface AuthContextValue {
  session: UserSession | null;
  isLoading: boolean;
  isDemoMode: boolean;
  login: (session: UserSession) => void;       // demo only
  logout: () => void;
  refreshSession: () => Promise<void>;
}

// ── Supabase detection ────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const IS_SUPABASE_LIVE =
  !!SUPABASE_URL &&
  !SUPABASE_URL.includes('your_supabase') &&
  SUPABASE_URL.startsWith('https://');

// ── Demo helpers (localStorage fallback) ─────────────────────────

const DEMO_KEY = 'okasha_auth_session';

function saveDemoSession(s: UserSession) {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(s)); } catch { /* noop */ }
}
function loadDemoSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    return raw ? (JSON.parse(raw) as UserSession) : null;
  } catch { return null; }
}
function clearDemoSession() {
  try { localStorage.removeItem(DEMO_KEY); } catch { /* noop */ }
}

// ── Role helpers ──────────────────────────────────────────────────

export function getRoleHomePath(role: UserRole | null, status: ApprovalStatus = 'approved'): string {
  if (status === 'pending')  return '/pending';
  if (status === 'rejected') return '/rejected';
  if (!role) return '/pending';
  switch (role) {
    case 'super_admin':
    case 'staff':
      return '/dashboard';
    case 'student':
      return '/my-attendance';
    case 'parent':
      return '/parent-dashboard';
    default:
      return '/pending';
  }
}

export type NavPermission = {
  dashboard: boolean;
  students: boolean;
  admissions: boolean;
  attendance: boolean;
  ledger: boolean;
  settings: boolean;
  myAttendance: boolean;
  parentDashboard: boolean;
  myFees: boolean;
  adminUsers: boolean;
};

export function getNavPermissions(role: UserRole | null): NavPermission {
  switch (role) {
    case 'super_admin':
      return {
        dashboard: true, students: true, admissions: true,
        attendance: true, ledger: true, settings: true,
        myAttendance: false, parentDashboard: false, myFees: false,
        adminUsers: true,
      };
    case 'staff':
      return {
        dashboard: true, students: true, admissions: true,
        attendance: true, ledger: false, settings: false,
        myAttendance: false, parentDashboard: false, myFees: false,
        adminUsers: false,
      };
    case 'student':
      return {
        dashboard: false, students: false, admissions: false,
        attendance: false, ledger: false, settings: false,
        myAttendance: true, parentDashboard: false, myFees: true,
        adminUsers: false,
      };
    case 'parent':
      return {
        dashboard: false, students: false, admissions: false,
        attendance: false, ledger: false, settings: false,
        myAttendance: false, parentDashboard: true, myFees: true,
        adminUsers: false,
      };
    default:
      return {
        dashboard: false, students: false, admissions: false,
        attendance: false, ledger: false, settings: false,
        myAttendance: false, parentDashboard: false, myFees: false,
        adminUsers: false,
      };
  }
}

// ── Context ──────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  session: null,
  isLoading: true,
  isDemoMode: !IS_SUPABASE_LIVE,
  login: () => {},
  logout: () => {},
  refreshSession: async () => {},
});

// ── Provider ─────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── LIVE MODE: Supabase ──────────────────────────────────────
  const fetchProfile = useCallback(async (userId: string): Promise<UserSession | null> => {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('auth_user_id', userId)
      .single();

    if (error || !data) return null;

    const childrenResult = data.role === 'parent'
      ? await supabase.from('profiles').select('id').eq('parent_id', data.id)
      : null;

    return {
      userId,
      role: data.role ?? null,
      status: (data.status as ApprovalStatus) ?? 'pending',
      full_name: data.full_name,
      email: data.email ?? '',
      profileId: data.id,
      requested_role: data.requested_role ?? undefined,
      childrenIds: childrenResult?.data?.map((c: { id: string }) => c.id) ?? [],
    };
  }, []);

  const refreshSession = useCallback(async () => {
    if (!IS_SUPABASE_LIVE) return;
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const profile = await fetchProfile(user.id);
      setSession(profile);
    } else {
      setSession(null);
    }
  }, [fetchProfile]);

  useEffect(() => {
    if (!IS_SUPABASE_LIVE) {
      // DEMO MODE: restore from localStorage
      const stored = loadDemoSession();
      if (stored) setSession(stored);
      setIsLoading(false);
      return;
    }

    // LIVE MODE: subscribe to Supabase auth state changes
    let mounted = true;

    const initAuth = async () => {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      // Get current session
      const { data: { user } } = await supabase.auth.getUser();
      if (user && mounted) {
        const profile = await fetchProfile(user.id);
        if (mounted) setSession(profile);
      }
      if (mounted) setIsLoading(false);

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, authSession) => {
        if (!mounted) return;
        if (authSession?.user) {
          // Do not await Supabase calls while its auth lock is held.
          setTimeout(() => {
            if (!mounted) return;
            fetchProfile(authSession.user.id).then(profile => {
              if (mounted) { setSession(profile); setIsLoading(false); }
            }).catch(() => { if (mounted) { setSession(null); setIsLoading(false); } });
          }, 0);
        } else {
          setSession(null);
        }
        setIsLoading(false);
      });

      return () => { mounted = false; subscription.unsubscribe(); };
    };

    const cleanup = initAuth().catch(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; cleanup.then(fn => fn?.())};
  }, [fetchProfile]);

  // Demo login (localStorage)
  const login = useCallback((s: UserSession) => {
    if (IS_SUPABASE_LIVE) return;
    saveDemoSession(s);
    setSession(s);
  }, []);

  const logout = useCallback(async () => {
    if (IS_SUPABASE_LIVE) {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      await supabase.auth.signOut();
    } else {
      clearDemoSession();
    }
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      session, isLoading,
      isDemoMode: !IS_SUPABASE_LIVE,
      login, logout, refreshSession,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// ── Demo credentials (quick-login pills) ─────────────────────────

export const DEMO_CREDENTIALS: Record<string, UserSession> = {
  'admin@okasha.edu.pk': {
    role: 'super_admin', status: 'approved',
    userId: 'admin-001', full_name: 'Super Admin', email: 'admin@okasha.edu.pk',
  },
  'staff@okasha.edu.pk': {
    role: 'staff', status: 'approved',
    userId: 'staff-001', full_name: 'Staff Member', email: 'staff@okasha.edu.pk',
  },
  'student@okasha.edu.pk': {
    role: 'student', status: 'approved',
    userId: 'student-001', full_name: 'Zara Malik', email: 'student@okasha.edu.pk',
    profileId: 'student-001',
  },
  'parent@okasha.edu.pk': {
    role: 'parent', status: 'approved',
    userId: 'parent-001', full_name: 'Ahmad Malik', email: 'parent@okasha.edu.pk',
    profileId: 'parent-001', childrenIds: ['student-001', 'student-004'],
  },
};

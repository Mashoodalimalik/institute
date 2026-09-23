'use client';

/**
 * AUTH CONTEXT — OKASHA INSTITUTE
 * ─────────────────────────────────────────────────────────────────
 * Provides role-based authentication state across the entire app.
 * Session is persisted in localStorage so it survives page refreshes.
 * Cleared only on explicit logout.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { UserRole } from '@/lib/types';

// ── Types ────────────────────────────────────────────────────────

export interface UserSession {
  role: UserRole;
  userId: string;       // e.g. 'student-001', 'parent-001', 'staff-001', 'admin-001'
  full_name: string;
  email: string;
  /** For students — links to their Profile id in DEMO_STUDENTS */
  profileId?: string;
  /** For parents — list of child profile ids */
  childrenIds?: string[];
}

interface AuthContextValue {
  session: UserSession | null;
  isLoading: boolean;
  login: (session: UserSession) => void;
  logout: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────

const STORAGE_KEY = 'okasha_auth_session';

function saveSession(s: UserSession) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

function loadSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserSession) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

// ── Context ──────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  session: null,
  isLoading: true,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from localStorage on mount (client-only)
  useEffect(() => {
    const stored = loadSession();
    if (stored) setSession(stored);
    setIsLoading(false);
  }, []);

  const login = useCallback((s: UserSession) => {
    saveSession(s);
    setSession(s);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// ── Role-based helpers ───────────────────────────────────────────

/** Map of email prefix → demo session */
export const DEMO_CREDENTIALS: Record<string, UserSession> = {
  'admin@okasha.edu.pk': {
    role: 'super_admin',
    userId: 'admin-001',
    full_name: 'Super Admin',
    email: 'admin@okasha.edu.pk',
  },
  'staff@okasha.edu.pk': {
    role: 'staff',
    userId: 'staff-001',
    full_name: 'Staff Member',
    email: 'staff@okasha.edu.pk',
  },
  'student@okasha.edu.pk': {
    role: 'student',
    userId: 'student-001',
    full_name: 'Zara Malik',
    email: 'student@okasha.edu.pk',
    profileId: 'student-001',
  },
  'parent@okasha.edu.pk': {
    role: 'parent',
    userId: 'parent-001',
    full_name: 'Ahmad Malik',
    email: 'parent@okasha.edu.pk',
    profileId: 'parent-001',
    childrenIds: ['student-001', 'student-004'],
  },
};

/** Returns the home route for a given role */
export function getRoleHomePath(role: UserRole): string {
  switch (role) {
    case 'super_admin':
    case 'staff':
      return '/dashboard';
    case 'student':
      return '/my-attendance';
    case 'parent':
      return '/parent-dashboard';
    default:
      return '/dashboard';
  }
}

/** Returns which nav items a role can see */
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
};

export function getNavPermissions(role: UserRole): NavPermission {
  switch (role) {
    case 'super_admin':
      return {
        dashboard: true, students: true, admissions: true,
        attendance: true, ledger: true, settings: true,
        myAttendance: false, parentDashboard: false, myFees: false,
      };
    case 'staff':
      return {
        dashboard: true, students: true, admissions: true,
        attendance: true, ledger: false, settings: false,
        myAttendance: false, parentDashboard: false, myFees: false,
      };
    case 'student':
      return {
        dashboard: false, students: false, admissions: false,
        attendance: false, ledger: false, settings: false,
        myAttendance: true, parentDashboard: false, myFees: true,
      };
    case 'parent':
      return {
        dashboard: false, students: false, admissions: false,
        attendance: false, ledger: false, settings: false,
        myAttendance: false, parentDashboard: true, myFees: true,
      };
  }
}

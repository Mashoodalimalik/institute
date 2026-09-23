'use client';

/**
 * useRequireAuth — Route Guard Hook
 * ─────────────────────────────────────────────────────────────────
 * Call this at the top of any page that requires authentication.
 * If the session is missing or the role is not in `allowedRoles`,
 * the user is redirected to login (or their correct home).
 *
 * Usage:
 *   const { session } = useRequireAuth(['super_admin', 'staff']);
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, getRoleHomePath } from '@/lib/auth-context';
import { UserRole } from '@/lib/types';

export function useRequireAuth(allowedRoles?: UserRole[]) {
  const { session, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return; // wait for localStorage restore

    if (!session) {
      // Not logged in → send to login
      router.replace('/');
      return;
    }

    if (allowedRoles && !allowedRoles.includes(session.role)) {
      // Wrong role → send to their correct home
      router.replace(getRoleHomePath(session.role));
    }
  }, [session, isLoading, allowedRoles, router]);

  return { session, isLoading };
}

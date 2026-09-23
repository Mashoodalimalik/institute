'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, ShieldAlert, LogOut, RefreshCw, GraduationCap, CheckCircle2 } from 'lucide-react';
import { useAuth, getRoleHomePath } from '@/lib/auth-context';

export default function PendingPage() {
  const router = useRouter();
  const { session, logout, refreshSession, isDemoMode } = useAuth();
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState('');

  const handleRefresh = async () => {
    setChecking(true);
    setMsg('');
    try {
      await refreshSession();
      if (session?.status === 'approved') {
        router.replace(getRoleHomePath(session.role, session.status));
      } else {
        setMsg('Status is still pending. The Super Admin has not reviewed your request yet.');
      }
    } catch {
      setMsg('Could not reach the server. Please check your connection.');
    } finally {
      setChecking(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    router.replace('/');
  };

  return (
    <main className="min-h-screen bg-surface-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg relative z-10">
        {/* Header Branding */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-glow-brand">
            <GraduationCap size={22} className="text-white" />
          </div>
          <span className="text-xl font-bold text-white">Okasha Institute</span>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-8 border border-white/10 shadow-2xl space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">
              <Clock size={28} className="animate-pulse" />
            </div>
            <div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Awaiting Approval
              </span>
              <h1 className="text-2xl font-bold text-white mt-1">Account Under Review</h1>
            </div>
          </div>

          <p className="text-slate-400 text-sm leading-relaxed">
            Welcome, <strong className="text-white">{session?.full_name || 'User'}</strong>! Your account registration has been submitted successfully. For security, every new login request must be approved and assigned a role by the <strong className="text-brand-300">Super Admin</strong> before you can access the system.
          </p>

          {/* User Details box */}
          <div className="bg-surface-800/80 rounded-xl p-4 border border-white/[0.06] space-y-2 text-xs">
            <div className="flex justify-between items-center text-slate-400">
              <span>Account Email:</span>
              <span className="text-slate-200 font-mono font-medium">{session?.email || 'N/A'}</span>
            </div>
            {session?.requested_role && (
              <div className="flex justify-between items-center text-slate-400">
                <span>Requested Designation:</span>
                <span className="capitalize text-brand-300 font-semibold">{session.requested_role}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-slate-400">
              <span>Current Status:</span>
              <span className="text-amber-400 font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block animate-ping" />
                Pending Super Admin Review
              </span>
            </div>
          </div>

          {msg && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 text-center">
              {msg}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3 pt-2">
            <button
              onClick={handleRefresh}
              disabled={checking}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold shadow-glow-brand"
            >
              <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
              {checking ? 'Checking Status...' : 'Check Approval Status'}
            </button>

            <button
              onClick={handleSignOut}
              className="w-full py-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-surface-800 transition-all text-sm font-medium flex items-center justify-center gap-2"
            >
              <LogOut size={16} />
              Sign Out / Return to Login
            </button>
          </div>

          {isDemoMode && (
            <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-[11px] text-brand-300 text-center">
              💡 <strong>Demo tip:</strong> Sign in as <code className="text-white">admin@okasha.edu.pk</code> to approve this user from the <strong>User Requests</strong> panel.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

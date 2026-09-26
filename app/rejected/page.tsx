'use client';

import { useRouter } from 'next/navigation';
import { XCircle, LogOut, GraduationCap, Mail } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export default function RejectedPage() {
  const router = useRouter();
  const { session, logout } = useAuth();

  const handleSignOut = async () => {
    await logout();
    router.replace('/');
  };

  return (
    <main className="min-h-screen bg-surface-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg relative z-10">
        {/* Header Branding */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-glow-brand">
            <GraduationCap size={22} className="text-white" />
          </div>
          <span className="text-xl font-bold text-white">The Prism Coaching Center</span>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-8 border border-white/10 shadow-2xl space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 flex-shrink-0">
              <XCircle size={28} />
            </div>
            <div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                Access Denied
              </span>
              <h1 className="text-2xl font-bold text-white mt-1">Registration Not Approved</h1>
            </div>
          </div>

          <p className="text-slate-400 text-sm leading-relaxed">
            Your login request for <strong className="text-white">{session?.email || 'this account'}</strong> was not approved by the administration.
          </p>

          <div className="p-4 rounded-xl bg-surface-800 border border-white/[0.06] text-xs text-slate-300 space-y-2">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <Mail size={14} className="text-brand-400" />
              Need help or believe this is an error?
            </div>
            <p className="text-slate-400">
              Please contact The Prism Coaching Center administration desk at{' '}
              <a href="mailto:admin@prismcoaching.edu.pk" className="text-brand-300 underline">
                admin@prismcoaching.edu.pk
              </a>{' '}
              or visit the institute admission office.
            </p>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full py-3 rounded-xl border border-white/10 text-slate-300 hover:text-white hover:bg-surface-800 transition-all text-sm font-semibold flex items-center justify-center gap-2"
          >
            <LogOut size={16} />
            Sign Out & Return to Login
          </button>
        </div>
      </div>
    </main>
  );
}

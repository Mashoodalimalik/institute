'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Lock, Mail, Eye, EyeOff, Loader2, GraduationCap } from 'lucide-react';
import { useAuth, DEMO_CREDENTIALS, getRoleHomePath } from '@/lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { session, isLoading, login } = useAuth();
  const [email, setEmail] = useState('admin@okasha.edu.pk');
  const [password, setPassword] = useState('demo1234');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If already logged in, redirect to the correct home page
  useEffect(() => {
    if (!isLoading && session) {
      router.replace(getRoleHomePath(session.role));
    }
  }, [session, isLoading, router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Simulate auth delay
    await new Promise(r => setTimeout(r, 800));

    if (!email || password.length < 4) {
      setError('Invalid credentials. Use any email with 4+ char password.');
      setLoading(false);
      return;
    }

    // Resolve demo session from credentials
    const demoSession = DEMO_CREDENTIALS[email.toLowerCase()];
    const resolvedSession = demoSession ?? {
      role: 'staff' as const,
      userId: `user-${Date.now()}`,
      full_name: email.split('@')[0],
      email,
    };

    login(resolvedSession);
    router.replace(getRoleHomePath(resolvedSession.role));
  }

  function quickLogin(role: string) {
    const creds: Record<string, { email: string; pw: string }> = {
      super_admin: { email: 'admin@okasha.edu.pk',   pw: 'demo1234' },
      staff:       { email: 'staff@okasha.edu.pk',   pw: 'demo1234' },
      student:     { email: 'student@okasha.edu.pk', pw: 'demo1234' },
      parent:      { email: 'parent@okasha.edu.pk',  pw: 'demo1234' },
    };
    setEmail(creds[role].email);
    setPassword(creds[role].pw);
  }

  // While restoring session, show nothing (avoids flash)
  if (isLoading) return null;

  return (
    <main className="min-h-screen flex">
      {/* Left: Branding Panel */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-gradient-to-br from-brand-950 via-brand-900 to-violet-950 p-12 relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-violet-600/15 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-violet-500 flex items-center justify-center shadow-glow-brand">
              <GraduationCap size={22} className="text-white" />
            </div>
            <span className="text-xl font-bold text-white">Okasha Institute</span>
          </div>
          
          <div>
            <h1 className="text-5xl font-extrabold text-white leading-tight mb-6">
              Manage your<br />
              <span className="text-gradient">institute</span><br />
              smarter.
            </h1>
            <p className="text-brand-200/70 text-lg leading-relaxed max-w-sm">
              All-in-one platform for student management, fee collection, attendance tracking, and financial reporting.
            </p>
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-4">
          {[
            { label: 'Students Managed', value: '200+' },
            { label: 'Fee Collection Rate', value: '94%' },
            { label: 'Biometric Devices', value: '6' },
            { label: 'Daily Reports', value: 'Auto' },
          ].map(stat => (
            <div key={stat.label} className="glass rounded-2xl p-4">
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-xs text-brand-300/60 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-16">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center">
              <GraduationCap size={18} className="text-white" />
            </div>
            <span className="font-bold text-white">Okasha Institute</span>
          </div>

          <h2 className="text-3xl font-bold text-white mb-2">Welcome back</h2>
          <p className="text-slate-500 mb-8">Sign in to access your portal</p>

          {/* Quick login pills */}
          <div className="mb-6">
            <p className="text-xs text-slate-600 mb-2.5 font-medium">Quick login (demo):</p>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'super_admin', label: 'Super Admin' },
                { key: 'staff',       label: 'Staff' },
                { key: 'student',     label: 'Student' },
                { key: 'parent',      label: 'Parent' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => quickLogin(key)}
                  className="px-3 py-1 rounded-full text-xs bg-surface-800 border border-white/10 text-slate-400 hover:text-white hover:border-brand-500/50 transition-all duration-150"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="input-label">Email address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input pl-10"
                  placeholder="you@okasha.edu.pk"
                  required
                />
              </div>
            </div>
            <div>
              <label className="input-label">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input pl-10 pr-10"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="btn-primary btn-lg w-full mt-2"
            >
              {loading ? (
                <><Loader2 size={18} className="animate-spin" /> Signing in...</>
              ) : (
                <><BookOpen size={18} /> Sign In</>
              )}
            </button>
          </form>

          {/* Role hints */}
          <div className="mt-6 p-4 rounded-xl bg-surface-800/60 border border-white/[0.06] space-y-2">
            <p className="text-xs font-semibold text-slate-400 mb-2">Demo Access Levels:</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { role: 'Super Admin', desc: 'Full access', color: 'text-brand-400' },
                { role: 'Staff',       desc: 'No financials', color: 'text-violet-400' },
                { role: 'Student',     desc: 'Own attendance & fees', color: 'text-emerald-400' },
                { role: 'Parent',      desc: 'Children overview', color: 'text-amber-400' },
              ].map(r => (
                <div key={r.role} className="flex items-start gap-1.5">
                  <span className={`text-[10px] font-bold ${r.color} mt-0.5`}>●</span>
                  <div>
                    <div className={`text-[11px] font-semibold ${r.color}`}>{r.role}</div>
                    <div className="text-[10px] text-slate-600">{r.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-xs text-slate-600 mt-6">
            Okasha Institute Management System — v2.0<br />
            <span className="text-slate-700">For production, configure Supabase in .env.local</span>
          </p>
        </div>
      </div>
    </main>
  );
}

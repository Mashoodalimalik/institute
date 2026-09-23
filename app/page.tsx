'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen, Lock, Mail, Eye, EyeOff, Loader2,
  GraduationCap, UserPlus, LogIn, CheckCircle2, AlertCircle
} from 'lucide-react';
import { useAuth, DEMO_CREDENTIALS, getRoleHomePath, IS_SUPABASE_LIVE } from '@/lib/auth-context';
import { demoStore } from '@/lib/services/store';

export default function LoginPage() {
  const router = useRouter();
  const { session, isLoading, login } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState(IS_SUPABASE_LIVE ? '' : 'admin@okasha.edu.pk');
  const [password, setPassword] = useState(IS_SUPABASE_LIVE ? '' : 'demo1234');
  const [fullName, setFullName] = useState('');
  const [requestedRole, setRequestedRole] = useState<'student' | 'parent' | 'staff'>('student');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // If already logged in, redirect to the correct home page or pending page
  useEffect(() => {
    if (!isLoading && session) {
      router.replace(getRoleHomePath(session.role, session.status));
    }
  }, [session, isLoading, router]);

  // Google OAuth sign-in / sign-up
  async function handleGoogleAuth() {
    setGoogleLoading(true);
    setError('');
    try {
      if (IS_SUPABASE_LIVE) {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
            queryParams: {
              access_type: 'offline',
              prompt: 'consent',
            },
          },
        });
        if (oauthError) throw oauthError;
      } else {
        // DEMO MODE Google Simulation
        await new Promise(r => setTimeout(r, 900));
        const demoEmail = 'student.google@gmail.com';
        const demoUser = await demoStore.registerDemoUser({
          full_name: 'Google Student',
          email: demoEmail,
          requested_role: requestedRole,
        });

        login({
          role: null,
          status: 'pending',
          userId: demoUser.id,
          full_name: demoUser.full_name,
          email: demoUser.email || demoEmail,
          requested_role: requestedRole,
        });
        router.replace('/pending');
      }
    } catch (err: any) {
      setError(err.message || 'Google authentication failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }

  // Handle standard email/password authentication
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      if (mode === 'signup') {
        if (!fullName.trim()) {
          setError('Please enter your full name.');
          setLoading(false);
          return;
        }
        if (!email.includes('@')) {
          setError('Please enter a valid email address.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setLoading(false);
          return;
        }

        if (IS_SUPABASE_LIVE) {
          const { createClient } = await import('@/lib/supabase/client');
          const supabase = createClient();
          const { data, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName.trim(),
                requested_role: requestedRole,
              },
            },
          });
          if (signUpError) throw signUpError;

          if (data.session) {
            router.replace('/pending');
          } else {
            setSuccessMsg('Registration submitted! Please verify your email or await Super Admin approval.');
          }
        } else {
          // DEMO MODE SIGNUP
          await new Promise(r => setTimeout(r, 600));
          const demoUser = await demoStore.registerDemoUser({
            full_name: fullName.trim(),
            email,
            requested_role: requestedRole,
          });

          login({
            role: null,
            status: 'pending',
            userId: demoUser.id,
            full_name: demoUser.full_name,
            email,
            requested_role: requestedRole,
          });
          router.replace('/pending');
        }
      } else {
        // SIGN IN MODE
        if (!email || !password) {
          setError('Please provide both email and password.');
          setLoading(false);
          return;
        }

        if (IS_SUPABASE_LIVE) {
          const { createClient } = await import('@/lib/supabase/client');
          const supabase = createClient();
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (signInError) throw signInError;
          // onAuthStateChange in AuthProvider will handle profile load & routing
        } else {
          // DEMO MODE SIGNIN
          await new Promise(r => setTimeout(r, 500));

          // Check if it's one of the built-in demo credentials
          const demoPreset = DEMO_CREDENTIALS[email.toLowerCase()];
          if (demoPreset) {
            login(demoPreset);
            router.replace(getRoleHomePath(demoPreset.role, demoPreset.status));
            return;
          }

          // Check if in demo pending users
          const pending = await demoStore.getPendingUsers();
          const matchedPending = pending.find(u => u.email?.toLowerCase() === email.toLowerCase());
          if (matchedPending) {
            login({
              role: matchedPending.role,
              status: matchedPending.status || 'pending',
              userId: matchedPending.id,
              full_name: matchedPending.full_name,
              email: matchedPending.email || email,
              requested_role: matchedPending.requested_role,
            });
            router.replace('/pending');
            return;
          }

          // Otherwise, demo fallback for quick testing
          const defaultSession = {
            role: 'staff' as const,
            status: 'approved' as const,
            userId: `user-${Date.now()}`,
            full_name: email.split('@')[0],
            email,
          };
          login(defaultSession);
          router.replace(getRoleHomePath(defaultSession.role, defaultSession.status));
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication error. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  function quickLogin(role: string) {
    setMode('signin');
    const creds: Record<string, { email: string; pw: string }> = {
      super_admin: { email: 'admin@okasha.edu.pk',   pw: 'demo1234' },
      staff:       { email: 'staff@okasha.edu.pk',   pw: 'demo1234' },
      student:     { email: 'student@okasha.edu.pk', pw: 'demo1234' },
      parent:      { email: 'parent@okasha.edu.pk',  pw: 'demo1234' },
    };
    setEmail(creds[role].email);
    setPassword(creds[role].pw);
  }

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
              Role-based management system with multi-channel authentication, Super Admin approvals, RFID/biometrics, and automated fees.
            </p>
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-4">
          {[
            { label: 'Role-Based Access', value: '4 Portals' },
            { label: 'Admin Approval', value: 'Protected' },
            { label: 'Device Model', value: 'ZKTeco K40' },
            { label: 'Account Access', value: 'Email' },
          ].map(stat => (
            <div key={stat.label} className="glass rounded-2xl p-4">
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-xs text-brand-300/60 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Auth Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-16 bg-surface-950">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-6 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center">
              <GraduationCap size={18} className="text-white" />
            </div>
            <span className="font-bold text-white">Okasha Institute</span>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex p-1 bg-surface-900 border border-white/[0.08] rounded-2xl mb-6">
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(''); setSuccessMsg(''); }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                mode === 'signin'
                  ? 'bg-brand-600 text-white shadow-glow-brand'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LogIn size={14} />
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(''); setSuccessMsg(''); }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                mode === 'signup'
                  ? 'bg-brand-600 text-white shadow-glow-brand'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus size={14} />
              Register / Sign Up
            </button>
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">
            {mode === 'signin' ? 'Welcome back' : 'Create an account'}
          </h2>
          <p className="text-xs text-slate-500 mb-6">
            {mode === 'signin'
              ? (IS_SUPABASE_LIVE ? 'Sign in with your institute account email and password' : 'Explore using a demo role')
              : 'Sign up to request portal access. Super Admin will review and assign your role.'}
          </p>

          {process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true' && <>
          {/* Google OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={googleLoading || loading}
            className="w-full py-3 px-4 rounded-xl border border-white/10 bg-surface-900/90 hover:bg-surface-800 text-slate-200 hover:text-white font-medium text-xs transition-all duration-150 flex items-center justify-center gap-3 shadow-sm hover:border-white/20 mb-5"
          >
            {googleLoading ? (
              <Loader2 size={16} className="animate-spin text-brand-400" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.87c2.26-2.09 3.67-5.17 3.67-9.15z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3.05c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.25v3.15C3.25 21.36 7.34 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.25C.45 8.22 0 10.06 0 12s.45 3.78 1.25 5.39l4.02-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.25 2.64 1.25 6.61l4.02 3.15c.95-2.85 3.6-4.96 6.73-4.96z"
                />
              </svg>
            )}
            <span>Continue with Google / Gmail</span>
          </button>

          <div className="relative flex items-center justify-center mb-5">
            <div className="border-t border-white/[0.08] w-full" />
            <span className="bg-surface-950 px-3 text-[10px] uppercase font-bold text-slate-600 tracking-wider">
              Or with email
            </span>
          </div>

          </>}

          {!IS_SUPABASE_LIVE && <>
          {/* Quick login pills (kept for testing convenience) */}
          <div className="mb-5">
            <p className="text-[11px] text-slate-500 mb-2 font-medium">Quick Demo Profiles:</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: 'super_admin', label: 'Super Admin' },
                { key: 'staff',       label: 'Staff' },
                { key: 'student',     label: 'Student' },
                { key: 'parent',      label: 'Parent' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => quickLogin(key)}
                  className="px-2.5 py-1 rounded-full text-[11px] bg-surface-900 border border-white/10 text-slate-400 hover:text-white hover:border-brand-500/50 transition-all duration-150"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          </>}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="input-label text-xs">Full Name</label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="input text-xs"
                    placeholder="Muhammad Ali"
                    required
                  />
                </div>

                <div>
                  <label className="input-label text-xs">I am registering as:</label>
                  <select
                    value={requestedRole}
                    onChange={e => setRequestedRole(e.target.value as any)}
                    className="input text-xs bg-surface-800"
                  >
                    <option value="student">Student (view own attendance & fees)</option>
                    <option value="parent">Parent / Guardian (monitor children)</option>
                    <option value="staff">Staff Member (campus management)</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="input-label text-xs">Email address</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input pl-10 text-xs"
                  placeholder="you@okasha.edu.pk or gmail.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="input-label text-xs">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input pl-10 pr-10 text-xs"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-center gap-2">
                <AlertCircle size={15} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 size={15} className="flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {mode === 'signup' && (
              <p className="text-[11px] text-slate-500 leading-relaxed bg-surface-900/60 p-2.5 rounded-xl border border-white/[0.05]">
                🔒 <strong>Admin Approval Required:</strong> Once you submit, your account will be placed in the Super Admin review queue. You will receive access once your role is approved.
              </p>
            )}

            <button
              id="login-submit"
              type="submit"
              disabled={loading || googleLoading}
              className="btn-primary btn-lg w-full mt-2 text-xs font-semibold"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Processing...</>
              ) : mode === 'signin' ? (
                <><BookOpen size={16} /> Sign In</>
              ) : (
                <><UserPlus size={16} /> Submit Registration Request</>
              )}
            </button>
          </form>

          <p className="text-center text-[11px] text-slate-600 mt-6">
            Okasha Institute Management System — v2.0<br />
            <span className="text-slate-700">Protected by Super Admin RBAC & Biometrics</span>
          </p>
        </div>
      </div>
    </main>
  );
}

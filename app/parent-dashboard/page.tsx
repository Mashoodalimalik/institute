'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  Users, Calendar, CreditCard, CheckCircle, AlertTriangle, XCircle,
  RefreshCw, ArrowUpCircle, ArrowDownCircle, Clock,
} from 'lucide-react';
import { Profile, AttendanceRecord, Receipt } from '@/lib/types';
import { demoStore } from '@/lib/services/store';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';

interface ChildData {
  profile: Profile;
  attendance: AttendanceRecord[];
  receipts: Receipt[];
}

export default function ParentDashboardPage() {
  const { session, isLoading: authLoading } = useRequireAuth(['parent']);
  const [children, setChildren] = useState<ChildData[]>([]);
  const [loading, setLoading] = useState(true);

  const childrenIds = session?.childrenIds ?? [];

  const loadData = useCallback(async () => {
    if (childrenIds.length === 0) { setLoading(false); return; }
    setLoading(true);
    const results = await Promise.all(
      childrenIds.map(async (id) => {
        const [profile, attendance, receipts] = await Promise.all([
          demoStore.getStudentById(id),
          demoStore.getAttendanceForStudent(id),
          demoStore.getReceiptsForStudent(id),
        ]);
        return profile ? { profile, attendance, receipts } : null;
      })
    );
    setChildren(results.filter(Boolean) as ChildData[]);
    setLoading(false);
  }, [childrenIds.join(',')]);

  useEffect(() => { loadData(); }, [loadData]);

  if (authLoading || !session) return null;

  const feeStatusColor: Record<string, string> = {
    paid: 'badge-paid', unpaid: 'badge-unpaid', overdue: 'badge-overdue',
  };
  const feeStatusIcon = (status: string) => {
    if (status === 'paid') return <CheckCircle size={12} className="text-emerald-400" />;
    if (status === 'overdue') return <XCircle size={12} className="text-red-400" />;
    return <AlertTriangle size={12} className="text-amber-400" />;
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 pt-14 lg:pt-0">
        <Header
          title="Parent Dashboard"
          subtitle={`Welcome, ${session.full_name}`}
          actions={
            <button onClick={loadData} className="btn-icon" title="Refresh">
              <RefreshCw size={16} className={loading ? 'animate-spin text-brand-400' : 'text-slate-400'} />
            </button>
          }
        />

        <div className="flex-1 p-6 space-y-6">
          {/* Summary Banner */}
          <div className="bg-gradient-to-r from-surface-900 via-surface-900/90 to-amber-950/20 p-6 rounded-2xl border border-white/[0.08] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider mb-2">
                <Users size={14} /> Parent Portal
              </div>
              <h1 className="text-2xl font-bold text-white">
                {children.length} Child{children.length !== 1 ? 'ren' : ''} Enrolled
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Monitor your children's attendance and fee status below.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2].map(i => <div key={i} className="skeleton h-48 rounded-2xl" />)}
            </div>
          ) : children.length === 0 ? (
            <div className="text-center text-slate-500 py-16 card">
              <Users size={44} className="mx-auto mb-3 text-slate-700" />
              <div className="font-semibold">No children linked to your account</div>
              <div className="text-sm mt-1">Contact the institute administrator</div>
            </div>
          ) : (
            <div className="space-y-6">
              {children.map(({ profile, attendance, receipts }) => {
                const today = new Date().toDateString();
                const todayAtt = attendance.filter(r => new Date(r.timestamp).toDateString() === today);
                const isIn = todayAtt.length > 0 && todayAtt[0].type === 'check_in';
                const daysPresent = new Set(attendance.map(r => new Date(r.timestamp).toDateString())).size;
                const lastReceipt = receipts[0];
                const initials = profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

                return (
                  <div key={profile.id} className="card overflow-hidden">
                    {/* Child header */}
                    <div className="p-5 border-b border-white/[0.06] flex items-center gap-4">
                      <div className="avatar w-12 h-12 from-amber-500 to-orange-600 text-sm font-bold flex-shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1">
                        <h2 className="text-base font-bold text-white">{profile.full_name}</h2>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-xs text-slate-400">{profile.class_name || '—'}</span>
                          <span className={`flex items-center gap-1 text-xs font-semibold ${feeStatusColor[profile.fee_status]}`}>
                            {feeStatusIcon(profile.fee_status)}
                            Fee: {profile.fee_status.charAt(0).toUpperCase() + profile.fee_status.slice(1)}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                            isIn
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : 'bg-slate-700/40 text-slate-400 border-white/10'
                          }`}>
                            {isIn ? '✅ Present Today' : '⬜ Absent Today'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-white/[0.06]">
                      <div className="p-4 text-center">
                        <div className="text-xl font-bold text-white">{daysPresent}</div>
                        <div className="text-xs text-slate-500 mt-0.5">Days Present</div>
                      </div>
                      <div className="p-4 text-center">
                        <div className="text-xl font-bold text-white">
                          PKR {(profile.monthly_fee || 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">Monthly Fee</div>
                      </div>
                      <div className="p-4 text-center">
                        <div className="text-xl font-bold text-white">{receipts.length}</div>
                        <div className="text-xs text-slate-500 mt-0.5">Receipts Issued</div>
                      </div>
                      <div className="p-4 text-center">
                        <div className="text-sm font-semibold text-white">
                          {lastReceipt
                            ? new Date(lastReceipt.created_at).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' })
                            : '—'
                          }
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">Last Payment</div>
                      </div>
                    </div>

                    {/* Recent attendance */}
                    <div className="p-4 border-t border-white/[0.06]">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                        <Calendar size={12} className="inline mr-1" />Recent Attendance
                      </p>
                      {attendance.length === 0 ? (
                        <p className="text-xs text-slate-600">No attendance records</p>
                      ) : (
                        <div className="space-y-1.5">
                          {attendance.slice(0, 5).map(rec => (
                            <div key={rec.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-800/60">
                              {rec.type === 'check_in'
                                ? <ArrowUpCircle size={14} className="text-emerald-400 flex-shrink-0" />
                                : <ArrowDownCircle size={14} className="text-slate-400 flex-shrink-0" />
                              }
                              <span className="text-xs text-slate-300 flex-1">
                                {rec.type === 'check_in' ? 'Checked In' : 'Checked Out'}
                              </span>
                              <span className="text-xs text-slate-500">
                                {new Date(rec.timestamp).toLocaleString('en-PK', {
                                  weekday: 'short', month: 'short', day: 'numeric',
                                  hour: '2-digit', minute: '2-digit'
                                })}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

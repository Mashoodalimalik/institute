'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  CreditCard, CheckCircle, AlertTriangle, XCircle,
  RefreshCw, DollarSign, Calendar,
} from 'lucide-react';
import { Profile, Receipt } from '@/lib/types';
import { demoStore } from '@/lib/services/store';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';

export default function MyFeesPage() {
  const { session, isLoading: authLoading } = useRequireAuth(['student', 'parent']);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);

  // For students: use profileId. For parents: show first child (demo simplification)
  const profileId = session?.role === 'parent' ? (session.childrenIds?.[0] ?? '') : (session?.profileId ?? '');

  const loadData = useCallback(async () => {
    if (!profileId) { setLoading(false); return; }
    setLoading(true);
    const [p, r] = await Promise.all([
      demoStore.getStudentById(profileId),
      demoStore.getReceiptsForStudent(profileId),
    ]);
    setProfile(p);
    setReceipts(r);
    setLoading(false);
  }, [profileId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (authLoading || !session) return null;

  const totalPaid = receipts.reduce((s, r) => s + (r.amount - r.discount), 0);

  const feeStatusIcon = (status: string) => {
    if (status === 'paid') return <CheckCircle size={16} className="text-emerald-400" />;
    if (status === 'overdue') return <XCircle size={16} className="text-red-400" />;
    return <AlertTriangle size={16} className="text-amber-400" />;
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 pt-14 lg:pt-0">
        <Header
          title="My Fees"
          subtitle="Fee history and payment status"
          actions={
            <button onClick={loadData} className="btn-icon" title="Refresh">
              <RefreshCw size={16} className={loading ? 'animate-spin text-brand-400' : 'text-slate-400'} />
            </button>
          }
        />

        <div className="flex-1 p-6 space-y-6 max-w-2xl mx-auto w-full">
          {loading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
            </div>
          ) : (
            <>
              {/* Fee Status Card */}
              {profile && (
                <div className={`card p-6 flex items-center gap-5 ${
                  profile.fee_status === 'paid'
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : profile.fee_status === 'overdue'
                    ? 'border-red-500/30 bg-red-500/5'
                    : 'border-amber-500/30 bg-amber-500/5'
                }`}>
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                    profile.fee_status === 'paid' ? 'bg-emerald-500/20'
                    : profile.fee_status === 'overdue' ? 'bg-red-500/20' : 'bg-amber-500/20'
                  }`}>
                    {feeStatusIcon(profile.fee_status)}
                  </div>
                  <div className="flex-1">
                    <div className="text-lg font-bold text-white">
                      {profile.fee_status === 'paid' ? 'Fees are up to date' :
                       profile.fee_status === 'overdue' ? 'Fee overdue — please pay immediately' :
                       'Fee payment pending'}
                    </div>
                    <div className="text-sm text-slate-400 mt-0.5">
                      Monthly fee: <span className="font-semibold text-white">PKR {(profile.monthly_fee || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="stat-card card">
                  <div className="stat-icon bg-emerald-500/15">
                    <DollarSign size={20} className="text-emerald-400" />
                  </div>
                  <div>
                    <div className="stat-value">PKR {totalPaid.toLocaleString()}</div>
                    <div className="stat-label">Total Paid</div>
                  </div>
                </div>
                <div className="stat-card card">
                  <div className="stat-icon bg-brand-500/15">
                    <Calendar size={20} className="text-brand-400" />
                  </div>
                  <div>
                    <div className="stat-value">{receipts.length}</div>
                    <div className="stat-label">Payments Made</div>
                  </div>
                </div>
              </div>

              {/* Receipt History */}
              <div className="card">
                <div className="p-5 border-b border-white/[0.06]">
                  <h2 className="text-base font-bold text-white">Payment Receipts</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{receipts.length} receipt{receipts.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="p-4">
                  {receipts.length === 0 ? (
                    <div className="text-center text-slate-500 py-10">
                      <CreditCard size={40} className="mx-auto mb-3 text-slate-700" />
                      <div className="font-medium">No payment records</div>
                      <div className="text-sm mt-1">Contact the institute to record your payment</div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {receipts.map(r => (
                        <div key={r.id} className="flex items-center gap-4 p-4 rounded-xl bg-surface-800/60 border border-white/[0.04]">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                            <CheckCircle size={18} className="text-emerald-400" />
                          </div>
                          <div className="flex-1">
                            <a href={`/api/receipts/pdf?id=${r.id}`} className="text-sm font-semibold text-brand-300">{r.receipt_number} · Download</a>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {new Date(r.created_at).toLocaleDateString('en-PK', {
                                year: 'numeric', month: 'long', day: 'numeric'
                              })} · {r.payment_method}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-emerald-400">
                              PKR {(r.amount - r.discount).toLocaleString()}
                            </div>
                            {r.discount > 0 && (
                              <div className="text-xs text-slate-600">−PKR {r.discount.toLocaleString()}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

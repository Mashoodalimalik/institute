'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  Clock, CheckCircle, XCircle, Calendar, RefreshCw,
  Fingerprint, ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react';
import { AttendanceRecord } from '@/lib/types';
import { demoStore } from '@/lib/services/store';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';

export default function MyAttendancePage() {
  const { session, isLoading: authLoading } = useRequireAuth(['student']);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const studentId = session?.profileId ?? '';

  const loadData = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    const data = await demoStore.getAttendanceForStudent(studentId);
    setRecords(data);
    setLoading(false);
  }, [studentId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (authLoading || !session) return null;

  // Stats
  const today = new Date().toDateString();
  const todayRecords = records.filter(r => new Date(r.timestamp).toDateString() === today);
  const checkIns  = records.filter(r => r.type === 'check_in').length;
  const checkOuts = records.filter(r => r.type === 'check_out').length;
  const daysPresent = new Set(records.map(r => new Date(r.timestamp).toDateString())).size;
  const isInToday = todayRecords.length > 0 && todayRecords[0].type === 'check_in';

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 pt-14 lg:pt-0">
        <Header
          title="My Attendance"
          subtitle={`Welcome back, ${session.full_name}`}
          actions={
            <button onClick={loadData} className="btn-icon" title="Refresh">
              <RefreshCw size={16} className={loading ? 'animate-spin text-brand-400' : 'text-slate-400'} />
            </button>
          }
        />

        <div className="flex-1 p-6 space-y-6">
          {/* Today's Status Banner */}
          <div className={`rounded-2xl p-6 border flex items-center gap-5 ${
            isInToday
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-surface-800/60 border-white/[0.08]'
          }`}>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
              isInToday ? 'bg-emerald-500/20' : 'bg-slate-700/40'
            }`}>
              <Fingerprint size={28} className={isInToday ? 'text-emerald-400' : 'text-slate-500'} />
            </div>
            <div>
              <div className={`text-lg font-bold ${isInToday ? 'text-emerald-300' : 'text-slate-400'}`}>
                {isInToday ? '✅ You are checked IN today' : '⬜ Not yet checked in today'}
              </div>
              <div className="text-sm text-slate-500 mt-0.5">
                {todayRecords.length > 0
                  ? `Last activity: ${new Date(todayRecords[0].timestamp).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Place your finger or RFID card on the scanner to check in'
                }
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="stat-card card">
              <div className="stat-icon bg-brand-500/15">
                <Calendar size={20} className="text-brand-400" />
              </div>
              <div>
                <div className="stat-value">{daysPresent}</div>
                <div className="stat-label">Days Present</div>
              </div>
            </div>
            <div className="stat-card card">
              <div className="stat-icon bg-emerald-500/15">
                <ArrowUpCircle size={20} className="text-emerald-400" />
              </div>
              <div>
                <div className="stat-value">{checkIns}</div>
                <div className="stat-label">Check-Ins</div>
              </div>
            </div>
            <div className="stat-card card">
              <div className="stat-icon bg-slate-500/15">
                <ArrowDownCircle size={20} className="text-slate-400" />
              </div>
              <div>
                <div className="stat-value">{checkOuts}</div>
                <div className="stat-label">Check-Outs</div>
              </div>
            </div>
          </div>

          {/* Attendance Log */}
          <div className="card">
            <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Attendance History</h2>
                <p className="text-xs text-slate-500 mt-0.5">{records.length} records total</p>
              </div>
            </div>

            <div className="p-4">
              {loading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
                </div>
              ) : records.length === 0 ? (
                <div className="text-center text-slate-500 py-12">
                  <Clock size={40} className="mx-auto mb-3 text-slate-700" />
                  <div className="font-medium">No attendance records yet</div>
                  <div className="text-sm mt-1">Visit the biometric scanner to check in</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {records.map(record => (
                    <div
                      key={record.id}
                      className="flex items-center gap-4 p-4 rounded-xl bg-surface-800/60 border border-white/[0.04] hover:border-white/10 transition-colors"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        record.type === 'check_in' ? 'bg-emerald-500/15' : 'bg-slate-500/15'
                      }`}>
                        {record.type === 'check_in'
                          ? <ArrowUpCircle size={18} className="text-emerald-400" />
                          : <ArrowDownCircle size={18} className="text-slate-400" />
                        }
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-white">
                          {record.type === 'check_in' ? 'Checked In' : 'Checked Out'}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {new Date(record.timestamp).toLocaleString('en-PK', {
                            weekday: 'long', year: 'numeric', month: 'short',
                            day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={record.type === 'check_in' ? 'badge-in' : 'badge-out'}>
                          {record.type === 'check_in' ? '↑ In' : '↓ Out'}
                        </span>
                        {record.device_id && (
                          <div className="text-[10px] text-slate-600 mt-1">{record.device_id}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

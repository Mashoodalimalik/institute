'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { Clock, UserCheck, UserX, RefreshCw, Calendar } from 'lucide-react';
import { AttendanceRecord } from '@/lib/types';
import { demoStore } from '@/lib/services/store';
import { pakistanDate } from '@/lib/dates';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';

export default function AttendancePage() {
  const { session, isLoading: authLoading } = useRequireAuth(['super_admin', 'staff']);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
    const allRecords = await demoStore.getAllAttendance();
    allRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setRecords(allRecords);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (!authLoading && session) void loadData(); }, [loadData, authLoading, session?.userId]);

  if (authLoading || !session) return null;

  const today = pakistanDate();
  const todayRecords = records.filter(r => pakistanDate(r.timestamp) === today);
  const checkIns = todayRecords.filter(r => r.type === 'check_in').length;
  const checkOuts = todayRecords.filter(r => r.type === 'check_out').length;
  const uniqueToday = new Set(todayRecords.map(r => r.student_id)).size;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 pt-14 lg:pt-0">
        <Header
          title="Attendance"
          subtitle="Biometric check-in/check-out log"
          actions={
            <button onClick={loadData} className="btn-icon">
              <RefreshCw size={16} className={loading ? 'animate-spin text-brand-400' : 'text-slate-400'} />
            </button>
          }
        />

        <div className="flex-1 p-6 space-y-6">
          {error && <p role="alert" className="text-red-400">{error}</p>}
          {/* Today Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="stat-card card">
              <div className="stat-icon bg-brand-500/15">
                <Calendar size={20} className="text-brand-400" />
              </div>
              <div>
                <div className="stat-value">{uniqueToday}</div>
                <div className="stat-label">Present Today</div>
              </div>
            </div>
            <div className="stat-card card">
              <div className="stat-icon bg-emerald-500/15">
                <UserCheck size={20} className="text-emerald-400" />
              </div>
              <div>
                <div className="stat-value">{checkIns}</div>
                <div className="stat-label">Check-Ins</div>
              </div>
            </div>
            <div className="stat-card card">
              <div className="stat-icon bg-slate-500/15">
                <UserX size={20} className="text-slate-400" />
              </div>
              <div>
                <div className="stat-value">{checkOuts}</div>
                <div className="stat-label">Check-Outs</div>
              </div>
            </div>
          </div>

          {/* Attendance Log */}
          <div className="card">
            <div className="p-5 border-b border-white/[0.06]">
              <h2 className="text-base font-bold text-white">All Attendance Records</h2>
              <p className="text-xs text-slate-500 mt-0.5">{records.length} total records</p>
            </div>

            <div className="overflow-x-auto p-2">
              {loading ? (
                <div className="space-y-2 p-3">
                  {[...Array(8)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Type</th>
                      <th>Class</th>
                      <th>Time & Date</th>
                      <th>Device</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(record => (
                      <tr key={record.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="avatar w-7 h-7 from-brand-500 to-violet-600 text-[10px]">
                              {record.student?.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium text-white text-sm">{record.student?.full_name || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <span className={record.type === 'check_in' ? 'badge-in' : 'badge-out'}>
                            {record.type === 'check_in' ? '↑ In' : '↓ Out'}
                          </span>
                        </td>
                        <td className="text-xs text-slate-500">{record.student?.class_name || '—'}</td>
                        <td className="text-xs text-slate-400">
                          {new Date(record.timestamp).toLocaleString('en-PK', {
                            weekday: 'short', month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="text-xs text-slate-600">{record.device_id || 'Biometric Terminal'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

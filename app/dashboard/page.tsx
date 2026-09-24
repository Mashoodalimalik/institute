'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ProfileModal from '@/components/ProfileModal';
import {
  Users, CheckCircle, AlertTriangle, XCircle,
  TrendingUp, UserCheck, RefreshCw, UserPlus,
  BookOpen, BarChart3, ArrowRight, Clock,
  Fingerprint, Radio, Eye, Calendar, Sparkles
} from 'lucide-react';
import { Profile, DashboardStats, AttendanceRecord } from '@/lib/types';
import { demoStore } from '@/lib/services/store';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  href?: string;
}) {
  const content = (
    <div className="stat-card card-hover transition-all duration-200">
      <div className={`stat-icon ${color}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="stat-value">{value}</div>
        <div className="stat-label flex items-center justify-between">
          <span>{label}</span>
          {href && <ArrowRight size={13} className="text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />}
        </div>
        {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="group block focus:outline-none">
        {content}
      </Link>
    );
  }

  return content;
}

export default function DashboardPage() {
  const { session, isLoading: authLoading } = useRequireAuth(['super_admin', 'staff']);
  const isSuperAdmin = session?.role === 'super_admin';

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentStudents, setRecentStudents] = useState<Profile[]>([]);
  const [recentAttendance, setRecentAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [st, studentList, attendanceList] = await Promise.all([
        demoStore.getDashboardStats(),
        demoStore.getStudents(),
        demoStore.getAllAttendance(),
      ]);

      setStats(st);

      // Latest enrolled students
      const sortedStudents = [...studentList].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setRecentStudents(sortedStudents.slice(0, 6));

      // Latest attendance records
      const sortedAttendance = [...attendanceList].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setRecentAttendance(sortedAttendance.slice(0, 6));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && session) {
      void loadData();
    }
  }, [loadData, authLoading, session?.userId]);

  if (authLoading || !session) return null;

  const feeStatusColor: Record<string, string> = {
    paid: 'badge-paid',
    unpaid: 'badge-unpaid',
    overdue: 'badge-overdue',
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 lg:pl-0 pt-14 lg:pt-0">
        <Header
          title="Dashboard"
          subtitle={new Date().toLocaleDateString('en-PK', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
          actions={
            <div className="flex items-center gap-2">
              <Link
                href="/students"
                className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
              >
                <Users size={14} />
                <span>Student Directory</span>
              </Link>
              <button
                onClick={loadData}
                className="btn-icon"
                title="Refresh dashboard"
              >
                <RefreshCw
                  size={16}
                  className={loading ? 'animate-spin text-brand-400' : 'text-slate-400'}
                />
              </button>
            </div>
          }
        />

        <div className="flex-1 p-6 space-y-6">
          {error && (
            <div role="alert" className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Key Metric Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<Users size={22} className="text-brand-400" />}
              label="Total Students"
              value={stats?.total_students ?? '—'}
              sub="Click to view directory"
              color="bg-brand-500/15"
              href="/students"
            />
            <StatCard
              icon={<CheckCircle size={22} className="text-emerald-400" />}
              label="Fees Paid"
              value={stats?.paid_count ?? '—'}
              sub={`${stats?.total_students ? Math.round((stats.paid_count / stats.total_students) * 100) : 0}% collected`}
              color="bg-emerald-500/15"
              href="/students"
            />
            <StatCard
              icon={<AlertTriangle size={22} className="text-amber-400" />}
              label="Pending Fees"
              value={stats?.unpaid_count ?? '—'}
              sub="Awaiting settlement"
              color="bg-amber-500/15"
              href="/students"
            />
            <StatCard
              icon={<XCircle size={22} className="text-red-400" />}
              label="Overdue Fees"
              value={stats?.overdue_count ?? '—'}
              sub="Urgent attention required"
              color="bg-red-500/15"
              href="/students"
            />
          </div>

          {/* Secondary Financial & Attendance Row */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {isSuperAdmin && (
              <StatCard
                icon={<TrendingUp size={22} className="text-emerald-400" />}
                label="Monthly Income"
                value={`PKR ${(stats?.monthly_income ?? 0).toLocaleString()}`}
                color="bg-emerald-500/15"
                href="/ledger"
              />
            )}
            {isSuperAdmin && (
              <StatCard
                icon={<TrendingUp size={22} className="text-red-400 rotate-180" />}
                label="Monthly Expenses"
                value={`PKR ${(stats?.monthly_expenses ?? 0).toLocaleString()}`}
                color="bg-red-500/15"
                href="/ledger"
              />
            )}
            <StatCard
              icon={<UserCheck size={22} className="text-brand-400" />}
              label="Today's Attendance"
              value={stats?.todays_attendance ?? '—'}
              sub="Unique students scanned"
              color="bg-brand-500/15"
              href="/attendance"
            />
          </div>

          {/* Quick Actions Shortcuts */}
          <div className="card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Quick Shortcuts
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Link
                href="/admissions"
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-800/80 hover:bg-surface-700/80 border border-white/[0.04] transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-brand-500/15 text-brand-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <UserPlus size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">New Admission</div>
                  <div className="text-[11px] text-slate-500 truncate">Enroll student</div>
                </div>
              </Link>

              <Link
                href="/students"
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-800/80 hover:bg-surface-700/80 border border-white/[0.04] transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-violet-500/15 text-violet-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Users size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">Students</div>
                  <div className="text-[11px] text-slate-500 truncate">Manage roster</div>
                </div>
              </Link>

              <Link
                href="/attendance"
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-800/80 hover:bg-surface-700/80 border border-white/[0.04] transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <BookOpen size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">Attendance</div>
                  <div className="text-[11px] text-slate-500 truncate">Live scanner log</div>
                </div>
              </Link>

              <Link
                href={isSuperAdmin ? '/ledger' : '/attendance'}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-800/80 hover:bg-surface-700/80 border border-white/[0.04] transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <BarChart3 size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">
                    {isSuperAdmin ? 'Ledger' : 'Logs'}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {isSuperAdmin ? 'Financial records' : 'Daily records'}
                  </div>
                </div>
              </Link>
            </div>
          </div>

          {/* Two-Column Grid: Recent Students & Recent Attendance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Column 1: Recent Students */}
            <div className="card">
              <div className="p-4 sm:p-5 border-b border-white/[0.06] flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Users size={17} className="text-brand-400" />
                    <span>Recent Admissions</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Latest students enrolled</p>
                </div>
                <Link
                  href="/students"
                  className="btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center gap-1 text-brand-300 hover:text-white"
                >
                  <span>View All</span>
                  <ArrowRight size={13} />
                </Link>
              </div>

              <div className="p-2">
                {loading ? (
                  <div className="space-y-2 p-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="skeleton h-12 rounded-xl" />
                    ))}
                  </div>
                ) : recentStudents.length === 0 ? (
                  <div className="text-center text-slate-500 py-10">
                    <Users size={32} className="mx-auto mb-2 text-slate-700" />
                    <p className="text-sm">No students enrolled yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.04]">
                    {recentStudents.map((student) => (
                      <div
                        key={student.id}
                        onClick={() => setSelectedStudent(student.id)}
                        className="p-3 flex items-center justify-between hover:bg-white/[0.02] rounded-xl cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="avatar w-8 h-8 from-brand-500 to-violet-600 text-xs font-semibold flex-shrink-0">
                            {student.full_name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">
                              {student.full_name}
                            </div>
                            <div className="text-xs text-slate-500 truncate">
                              {student.class_name || 'No Class'} · {student.phone_number || 'No phone'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={feeStatusColor[student.fee_status] || 'badge-unpaid'}>
                            {student.fee_status}
                          </span>
                          <Eye size={14} className="text-slate-500 hover:text-white ml-1" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Column 2: Live Attendance Activity */}
            <div className="card">
              <div className="p-4 sm:p-5 border-b border-white/[0.06] flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Clock size={17} className="text-emerald-400" />
                    <span>Recent Attendance Activity</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Live scanner feed & check-ins</p>
                </div>
                <Link
                  href="/attendance"
                  className="btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center gap-1 text-emerald-300 hover:text-white"
                >
                  <span>Full Log</span>
                  <ArrowRight size={13} />
                </Link>
              </div>

              <div className="p-2">
                {loading ? (
                  <div className="space-y-2 p-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="skeleton h-12 rounded-xl" />
                    ))}
                  </div>
                ) : recentAttendance.length === 0 ? (
                  <div className="text-center text-slate-500 py-10">
                    <Clock size={32} className="mx-auto mb-2 text-slate-700" />
                    <p className="text-sm">No attendance scans recorded today</p>
                    <p className="text-xs text-slate-600 mt-1">
                      K40 scanner logs will appear here automatically
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.04]">
                    {recentAttendance.map((record) => {
                      const timeStr = new Date(record.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const isCheckIn = record.type === 'check_in';

                      return (
                        <div
                          key={record.id}
                          className="p-3 flex items-center justify-between hover:bg-white/[0.02] rounded-xl transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                isCheckIn
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : 'bg-amber-500/15 text-amber-400'
                              }`}
                            >
                              <Fingerprint size={15} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white truncate">
                                {record.student?.full_name || record.student_id}
                              </div>
                              <div className="text-xs text-slate-500 truncate">
                                {record.student?.class_name ? `${record.student.class_name} · ` : ''}
                                {record.device_id ? `Device: ${record.device_id}` : 'Biometric / K40'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                isCheckIn
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {isCheckIn ? 'Check In' : 'Check Out'}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">{timeStr}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Modal */}
      {selectedStudent && (
        <ProfileModal
          studentId={selectedStudent}
          onClose={() => setSelectedStudent(null)}
          onFeeCollected={loadData}
        />
      )}
    </div>
  );
}

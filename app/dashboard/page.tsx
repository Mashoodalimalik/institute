'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ProfileModal from '@/components/ProfileModal';
import {
  Users, CheckCircle, AlertTriangle, XCircle,
  TrendingUp, UserCheck, Search, Filter, ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { Profile, DashboardStats } from '@/lib/types';
import { demoStore } from '@/lib/services/store';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import { useAuth } from '@/lib/auth-context';

const FEE_STATUS_OPTIONS = [
  { value: 'all',     label: 'All Status' },
  { value: 'paid',    label: 'Paid' },
  { value: 'unpaid',  label: 'Unpaid' },
  { value: 'overdue', label: 'Overdue' },
];

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="stat-card card-hover">
      <div className={`stat-icon ${color}`}>{icon}</div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div className="text-xs text-slate-600 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { session, isLoading: authLoading } = useRequireAuth(['super_admin', 'staff']);
  const isSuperAdmin = session?.role === 'super_admin';

  const [students, setStudents] = useState<Profile[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [feeFilter, setFeeFilter] = useState('all');
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [classes, setClasses] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [s, st] = await Promise.all([
      demoStore.getStudents({ search, class_name: classFilter, fee_status: feeFilter }),
      demoStore.getDashboardStats(),
    ]);
    setStudents(s);
    setStats(st);
    setClasses(demoStore.getUniqueClasses());
    setLoading(false);
  }, [search, classFilter, feeFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  // Wait for auth check
  if (authLoading || !session) return null;

  const feeStatusColor: Record<string, string> = {
    paid: 'badge-paid', unpaid: 'badge-unpaid', overdue: 'badge-overdue',
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 lg:pl-0 pt-14 lg:pt-0">
        <Header
          title="Dashboard"
          subtitle={`${new Date().toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
          actions={
            <button onClick={loadData} className="btn-icon" title="Refresh">
              <RefreshCw size={16} className={loading ? 'animate-spin text-brand-400' : 'text-slate-400'} />
            </button>
          }
        />

        <div className="flex-1 p-6 space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<Users size={22} className="text-brand-400" />}
              label="Total Students"
              value={stats?.total_students ?? '—'}
              sub="Enrolled"
              color="bg-brand-500/15"
            />
            <StatCard
              icon={<CheckCircle size={22} className="text-emerald-400" />}
              label="Fees Paid"
              value={stats?.paid_count ?? '—'}
              sub={`${stats ? Math.round((stats.paid_count / stats.total_students) * 100) : 0}% of total`}
              color="bg-emerald-500/15"
            />
            <StatCard
              icon={<AlertTriangle size={22} className="text-amber-400" />}
              label="Unpaid"
              value={stats?.unpaid_count ?? '—'}
              sub="Pending payment"
              color="bg-amber-500/15"
            />
            <StatCard
              icon={<XCircle size={22} className="text-red-400" />}
              label="Overdue"
              value={stats?.overdue_count ?? '—'}
              sub="Needs attention"
              color="bg-red-500/15"
            />
          </div>

          {/* Secondary Stats — financial cards hidden from staff */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {isSuperAdmin && (
              <StatCard
                icon={<TrendingUp size={22} className="text-emerald-400" />}
                label="Monthly Income"
                value={`PKR ${(stats?.monthly_income ?? 0).toLocaleString()}`}
                color="bg-emerald-500/15"
              />
            )}
            {isSuperAdmin && (
              <StatCard
                icon={<TrendingUp size={22} className="text-red-400 rotate-180" />}
                label="Monthly Expenses"
                value={`PKR ${(stats?.monthly_expenses ?? 0).toLocaleString()}`}
                color="bg-red-500/15"
              />
            )}
            <StatCard
              icon={<UserCheck size={22} className="text-brand-400" />}
              label="Today's Attendance"
              value={stats?.todays_attendance ?? '—'}
              sub="Unique students"
              color="bg-brand-500/15"
            />
          </div>

          {/* Student Management Table */}
          <div className="card">
            {/* Table Header */}
            <div className="p-5 border-b border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex-1">
                <h2 className="text-base font-bold text-white">Students</h2>
                <p className="text-xs text-slate-500 mt-0.5">{students.length} record{students.length !== 1 ? 's' : ''} found</p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                {/* Search */}
                <div className="relative flex-1 sm:flex-none">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    id="student-search"
                    type="search"
                    placeholder="Search name, RFID, biometric..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="input pl-8 py-2 text-xs w-full sm:w-52"
                  />
                </div>

                {/* Class filter */}
                <select
                  id="class-filter"
                  value={classFilter}
                  onChange={e => setClassFilter(e.target.value)}
                  className="select py-2 text-xs w-36"
                >
                  <option value="all">All Classes</option>
                  {classes.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                {/* Fee status filter */}
                <select
                  id="fee-filter"
                  value={feeFilter}
                  onChange={e => setFeeFilter(e.target.value)}
                  className="select py-2 text-xs w-36"
                >
                  {FEE_STATUS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto p-2">
              {loading ? (
                <div className="space-y-2 p-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="skeleton h-12 rounded-xl" />
                  ))}
                </div>
              ) : students.length === 0 ? (
                <div className="text-center text-slate-500 py-12">
                  <Users size={40} className="mx-auto mb-3 text-slate-700" />
                  <div className="font-medium">No students found</div>
                  <div className="text-sm mt-1">Try adjusting your search or filters</div>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Contact</th>
                      <th>RFID / Biometric</th>
                      <th>Monthly Fee</th>
                      <th>Fee Status</th>
                      <th>Parent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(student => (
                      <tr
                        key={student.id}
                        id={`student-row-${student.id}`}
                        onClick={() => setSelectedStudent(student.id)}
                        title="Click to view full profile"
                      >
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="avatar w-8 h-8 from-brand-500 to-violet-600 text-xs">
                              {student.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-white text-sm">{student.full_name}</div>
                              <div className="text-xs text-slate-600 truncate max-w-[160px]">{student.email || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="text-slate-400 text-xs">{student.class_name || '—'}</td>
                        <td className="text-slate-400 text-xs">{student.phone_number || '—'}</td>
                        <td>
                          <div className="text-xs text-slate-500 space-y-0.5">
                            <div>{student.rfid_tag || '—'}</div>
                            <div className="text-slate-600">{student.biometric_id || '—'}</div>
                          </div>
                        </td>
                        <td className="font-semibold text-white text-sm">
                          PKR {(student.monthly_fee || 0).toLocaleString()}
                        </td>
                        <td>
                          <span className={feeStatusColor[student.fee_status]}>
                            {student.fee_status.charAt(0).toUpperCase() + student.fee_status.slice(1)}
                          </span>
                        </td>
                        <td className="text-xs text-slate-400">{student.parent?.full_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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

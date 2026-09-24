'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ProfileModal from '@/components/ProfileModal';
import {
  Users, CheckCircle, AlertTriangle, XCircle,
  Search, Filter, RefreshCw, UserPlus, Fingerprint,
  Radio, Phone, Mail, ArrowUpDown, ChevronRight,
  CreditCard, Eye, ShieldCheck, X
} from 'lucide-react';
import { Profile } from '@/lib/types';
import { demoStore } from '@/lib/services/store';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';

const FEE_STATUS_OPTIONS = [
  { value: 'all',     label: 'All Fee Statuses' },
  { value: 'paid',    label: 'Paid' },
  { value: 'unpaid',  label: 'Unpaid' },
  { value: 'overdue', label: 'Overdue' },
];

const BIOMETRIC_FILTER_OPTIONS = [
  { value: 'all',      label: 'All Enrollment' },
  { value: 'enrolled', label: 'Biometric / RFID Enrolled' },
  { value: 'missing',  label: 'Missing Biometric / RFID' },
];

export default function StudentsPage() {
  const { session, isLoading: authLoading } = useRequireAuth(['super_admin', 'staff']);

  const [students, setStudents] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [feeFilter, setFeeFilter] = useState('all');
  const [bioFilter, setBioFilter] = useState('all');

  // Modal
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [studentList, uniqueClasses] = await Promise.all([
        demoStore.getStudents({
          search: search.trim() ? search.trim() : undefined,
          class_name: classFilter !== 'all' ? classFilter : undefined,
          fee_status: feeFilter !== 'all' ? feeFilter : undefined,
        }),
        demoStore.getUniqueClasses(),
      ]);
      setStudents(studentList);
      setClasses(uniqueClasses);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load student directory');
    } finally {
      setLoading(false);
    }
  }, [search, classFilter, feeFilter]);

  useEffect(() => {
    if (!authLoading && session) {
      void loadData();
    }
  }, [loadData, authLoading, session?.userId]);

  // Client-side filtering for biometric/RFID status
  const filteredStudents = useMemo(() => {
    if (bioFilter === 'all') return students;
    if (bioFilter === 'enrolled') {
      return students.filter(s => Boolean(s.biometric_id || s.rfid_tag));
    }
    if (bioFilter === 'missing') {
      return students.filter(s => !s.biometric_id && !s.rfid_tag);
    }
    return students;
  }, [students, bioFilter]);

  // Quick stats computed from currently loaded student roster
  const stats = useMemo(() => {
    const total = students.length;
    const paid = students.filter(s => s.fee_status === 'paid').length;
    const unpaid = students.filter(s => s.fee_status === 'unpaid').length;
    const overdue = students.filter(s => s.fee_status === 'overdue').length;
    const bioEnrolled = students.filter(s => Boolean(s.biometric_id || s.rfid_tag)).length;
    return { total, paid, unpaid, overdue, bioEnrolled };
  }, [students]);

  const hasActiveFilters = search !== '' || classFilter !== 'all' || feeFilter !== 'all' || bioFilter !== 'all';

  const resetFilters = () => {
    setSearch('');
    setClassFilter('all');
    setFeeFilter('all');
    setBioFilter('all');
  };

  if (authLoading || !session) return null;

  const feeStatusBadgeClass: Record<string, string> = {
    paid: 'badge-paid',
    unpaid: 'badge-unpaid',
    overdue: 'badge-overdue',
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 lg:pl-0 pt-14 lg:pt-0">
        <Header
          title="Students Directory"
          subtitle="Comprehensive student records, fee status, and biometric enrollment"
          actions={
            <div className="flex items-center gap-2">
              <Link
                href="/admissions"
                className="btn-primary text-xs py-2 px-3 inline-flex items-center gap-1.5"
              >
                <UserPlus size={15} />
                <span>New Admission</span>
              </Link>
              <button
                onClick={loadData}
                className="btn-icon"
                title="Refresh student roster"
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

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-500/15 flex items-center justify-center text-brand-400">
                <Users size={20} />
              </div>
              <div>
                <div className="text-xl font-bold text-white">{stats.total}</div>
                <div className="text-xs text-slate-400">Total Enrolled</div>
              </div>
            </div>

            <div className="card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                <CheckCircle size={20} />
              </div>
              <div>
                <div className="text-xl font-bold text-emerald-400">{stats.paid}</div>
                <div className="text-xs text-slate-400">Fees Paid</div>
              </div>
            </div>

            <div className="card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400">
                <AlertTriangle size={20} />
              </div>
              <div>
                <div className="text-xl font-bold text-amber-400">{stats.unpaid}</div>
                <div className="text-xs text-slate-400">Fees Unpaid</div>
              </div>
            </div>

            <div className="card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center text-red-400">
                <XCircle size={20} />
              </div>
              <div>
                <div className="text-xl font-bold text-red-400">{stats.overdue}</div>
                <div className="text-xs text-slate-400">Fees Overdue</div>
              </div>
            </div>

            <div className="card p-4 flex items-center gap-3 col-span-2 sm:col-span-1">
              <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center text-violet-400">
                <Fingerprint size={20} />
              </div>
              <div>
                <div className="text-xl font-bold text-violet-300">{stats.bioEnrolled}</div>
                <div className="text-xs text-slate-400">Hardware Linked</div>
              </div>
            </div>
          </div>

          {/* Main Card: Filter Bar + Student Roster */}
          <div className="card">
            {/* Filter controls */}
            <div className="p-4 sm:p-5 border-b border-white/[0.06] flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Users size={18} className="text-brand-400" />
                  <span>Enrolled Students</span>
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  {filteredStudents.length}
                </span>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative flex-1 sm:flex-none">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    id="student-search-input"
                    type="search"
                    placeholder="Search name, RFID, phone..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="input pl-8 py-2 text-xs w-full sm:w-56"
                  />
                </div>

                {/* Class filter */}
                <select
                  id="student-class-filter"
                  value={classFilter}
                  onChange={e => setClassFilter(e.target.value)}
                  className="select py-2 text-xs w-36"
                >
                  <option value="all">All Classes</option>
                  {classes.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                {/* Fee filter */}
                <select
                  id="student-fee-filter"
                  value={feeFilter}
                  onChange={e => setFeeFilter(e.target.value)}
                  className="select py-2 text-xs w-36"
                >
                  {FEE_STATUS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>

                {/* Biometric filter */}
                <select
                  id="student-bio-filter"
                  value={bioFilter}
                  onChange={e => setBioFilter(e.target.value)}
                  className="select py-2 text-xs w-44"
                >
                  {BIOMETRIC_FILTER_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>

                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="btn-secondary py-2 px-3 text-xs inline-flex items-center gap-1 text-slate-400 hover:text-white"
                    title="Reset all filters"
                  >
                    <X size={14} />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto p-2">
              {loading ? (
                <div className="space-y-2 p-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="skeleton h-14 rounded-xl" />
                  ))}
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="text-center text-slate-500 py-16 px-4">
                  <Users size={44} className="mx-auto mb-3 text-slate-700" />
                  <div className="text-base font-semibold text-slate-300">No students found</div>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    {hasActiveFilters
                      ? 'No student matches your current search criteria or active filters.'
                      : 'No students have been registered yet.'}
                  </p>
                  {hasActiveFilters ? (
                    <button
                      onClick={resetFilters}
                      className="btn-secondary text-xs mt-4"
                    >
                      Clear active filters
                    </button>
                  ) : (
                    <Link
                      href="/admissions"
                      className="btn-primary text-xs mt-4 inline-flex items-center gap-1.5"
                    >
                      <UserPlus size={14} />
                      <span>Admit First Student</span>
                    </Link>
                  )}
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Contact</th>
                      <th>Hardware Identity</th>
                      <th>Monthly Fee</th>
                      <th>Fee Status</th>
                      <th>Guardian</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map(student => (
                      <tr
                        key={student.id}
                        id={`student-row-${student.id}`}
                        onClick={() => setSelectedStudent(student.id)}
                        className="cursor-pointer transition-colors"
                        title="Click to view full student profile & options"
                      >
                        {/* Student Name & Avatar */}
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="avatar w-9 h-9 from-brand-500 to-violet-600 text-xs font-bold text-white shadow-sm flex-shrink-0">
                              {student.full_name
                                .split(' ')
                                .map(n => n[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-white text-sm truncate max-w-[180px]">
                                {student.full_name}
                              </div>
                              <div className="text-xs text-slate-500 truncate max-w-[180px]">
                                {student.email || 'No email provided'}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Class */}
                        <td>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700/60">
                            {student.class_name || 'Unassigned'}
                          </span>
                        </td>

                        {/* Contact */}
                        <td>
                          <div className="text-xs text-slate-300">
                            {student.phone_number ? (
                              <div className="flex items-center gap-1.5">
                                <Phone size={12} className="text-slate-500 flex-shrink-0" />
                                <span>{student.phone_number}</span>
                              </div>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </div>
                        </td>

                        {/* Hardware Identity (Biometric & RFID) */}
                        <td>
                          <div className="flex flex-col gap-1 text-xs">
                            {student.biometric_id ? (
                              <div className="inline-flex items-center gap-1 text-violet-300">
                                <Fingerprint size={12} className="text-violet-400" />
                                <span className="font-mono text-[11px]">{student.biometric_id}</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1 text-slate-600 text-[11px]">
                                <Fingerprint size={12} />
                                <span>No Bio ID</span>
                              </div>
                            )}

                            {student.rfid_tag ? (
                              <div className="inline-flex items-center gap-1 text-brand-300">
                                <Radio size={12} className="text-brand-400" />
                                <span className="font-mono text-[11px]">{student.rfid_tag}</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1 text-slate-600 text-[11px]">
                                <Radio size={12} />
                                <span>No RFID</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Monthly Fee */}
                        <td>
                          <div className="font-semibold text-white text-sm">
                            PKR {(student.monthly_fee || 0).toLocaleString()}
                          </div>
                        </td>

                        {/* Fee Status */}
                        <td>
                          <span className={feeStatusBadgeClass[student.fee_status] || 'badge-unpaid'}>
                            {student.fee_status.charAt(0).toUpperCase() + student.fee_status.slice(1)}
                          </span>
                        </td>

                        {/* Guardian / Parent */}
                        <td>
                          <div className="text-xs">
                            {student.parent?.full_name ? (
                              <div>
                                <span className="text-slate-300 font-medium">
                                  {student.parent.full_name}
                                </span>
                                {student.parent.phone_number && (
                                  <div className="text-[11px] text-slate-500">
                                    {student.parent.phone_number}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </div>
                        </td>

                        {/* Action buttons */}
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStudent(student.id);
                            }}
                            className="btn-secondary py-1 px-2.5 text-xs inline-flex items-center gap-1"
                          >
                            <Eye size={13} />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Student Profile Modal */}
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

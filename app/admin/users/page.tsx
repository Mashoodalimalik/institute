'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  UserCheck, Shield, Clock, CheckCircle2, XCircle, Search,
  RefreshCw, AlertCircle, ArrowRight, UserPlus, Filter, ShieldAlert
} from 'lucide-react';
import { Profile, UserRole } from '@/lib/types';
import { demoStore } from '@/lib/services/store';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';

const ROLE_OPTIONS: { value: UserRole; label: string; desc: string; color: string }[] = [
  { value: 'student',     label: 'Student',      desc: 'Own attendance & fees', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  { value: 'parent',      label: 'Parent',       desc: 'Children overview & fees', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { value: 'staff',       label: 'Staff Member', desc: 'Admissions & attendance', color: 'text-violet-400 bg-violet-500/10 border-violet-500/30' },
  { value: 'super_admin', label: 'Super Admin',  desc: 'Full system control', color: 'text-brand-400 bg-brand-500/10 border-brand-500/30' },
];

export default function AdminUsersPage() {
  const { session, isLoading: authLoading } = useRequireAuth(['super_admin']);
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');
  const [pendingUsers, setPendingUsers] = useState<Profile[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, UserRole>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pending, all] = await Promise.all([
        demoStore.getPendingUsers(),
        demoStore.getAllUsers(),
      ]);
      setPendingUsers(pending);
      setAllUsers(all);

      // Prepopulate role selections with requested_role or student
      const initialRoles: Record<string, UserRole> = {};
      pending.forEach(u => {
        const req = u.requested_role as UserRole;
        initialRoles[u.id] = (req && ['student', 'parent', 'staff', 'super_admin'].includes(req)) ? req : 'student';
      });
      setSelectedRoles(prev => ({ ...initialRoles, ...prev }));
    } catch {
      setFeedback({ type: 'error', message: 'Failed to load user list.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && session?.role === 'super_admin') {
      loadData();
    }
  }, [authLoading, session, loadData]);

  const handleApprove = async (userId: string) => {
    const roleToAssign = selectedRoles[userId] || 'student';
    setProcessingId(userId);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/approve-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'approve', role: roleToAssign }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ type: 'success', message: `User approved as ${roleToAssign.replace('_', ' ')}!` });
        await loadData();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Failed to approve user.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network error approving user.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (userId: string) => {
    if (!confirm('Are you sure you want to reject this registration request?')) return;
    setProcessingId(userId);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/approve-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'reject' }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ type: 'success', message: 'Registration rejected.' });
        await loadData();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Failed to reject user.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network error rejecting user.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleChangeRole = async (userId: string, newRole: UserRole) => {
    setProcessingId(userId);
    setFeedback(null);
    try {
      const success = await demoStore.updateUserRole(userId, newRole);
      if (success) {
        setFeedback({ type: 'success', message: `User role updated to ${newRole}!` });
        await loadData();
      } else {
        setFeedback({ type: 'error', message: 'Failed to update user role.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Error updating user role.' });
    } finally {
      setProcessingId(null);
    }
  };

  if (authLoading) return null;

  // Filtered all users
  const filteredUsers = allUsers.filter(u => {
    const matchesSearch =
      (u.full_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (u.email?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="flex min-h-screen bg-surface-950 text-slate-100">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="User Approvals & Role Assignment"
          subtitle="Review incoming sign-in requests and grant designated portal access"
          actions={
            <button
              onClick={loadData}
              disabled={loading}
              className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          }
        />

        <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
          {/* Status Feedback Banner */}
          {feedback && (
            <div
              className={`p-4 rounded-xl border text-sm flex items-center justify-between transition-all ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{feedback.message}</span>
              </div>
              <button onClick={() => setFeedback(null)} className="text-xs opacity-75 hover:opacity-100">
                Dismiss
              </button>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveTab('pending')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'pending'
                    ? 'bg-brand-600 text-white shadow-glow-brand'
                    : 'text-slate-400 hover:text-white hover:bg-surface-800'
                }`}
              >
                <Clock size={16} />
                Pending Requests
                {pendingUsers.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-black">
                    {pendingUsers.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('all')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'all'
                    ? 'bg-brand-600 text-white shadow-glow-brand'
                    : 'text-slate-400 hover:text-white hover:bg-surface-800'
                }`}
              >
                <Shield size={16} />
                All Users & Roles ({allUsers.length})
              </button>
            </div>
          </div>

          {/* TAB 1: PENDING REQUESTS */}
          {activeTab === 'pending' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Pending Approval Queue</h2>
                  <p className="text-xs text-slate-400">
                    Review users who signed in via Email or Google. They cannot view any institute pages until approved.
                  </p>
                </div>
              </div>

              {pendingUsers.length === 0 ? (
                <div className="card p-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 size={24} />
                  </div>
                  <h3 className="text-base font-bold text-white">All Caught Up!</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    There are no pending account registration requests right now. New sign-ups will show up here for role assignment.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {pendingUsers.map(user => {
                    const isProcessing = processingId === user.id;
                    const assignedRole = selectedRoles[user.id] || (user.requested_role as UserRole) || 'student';

                    return (
                      <div
                        key={user.id}
                        className="card p-5 border border-amber-500/20 bg-gradient-to-r from-surface-900 to-amber-950/10 hover:border-amber-500/40 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                      >
                        {/* User identity */}
                        <div className="flex items-start gap-3.5 min-w-[280px]">
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">
                            {user.full_name
                              ? user.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                              : '??'}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-base">{user.full_name}</span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Pending
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5 font-mono">{user.email}</div>
                            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                              <span>Requested:</span>
                              <span className="capitalize font-semibold text-brand-300 bg-brand-500/10 px-1.5 py-0.2 rounded border border-brand-500/20">
                                {user.requested_role || 'Not specified'}
                              </span>
                              <span>•</span>
                              <span>
                                {user.created_at ? new Date(user.created_at).toLocaleString() : 'Recently'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Role selection & approval actions */}
                        <div className="flex flex-wrap items-center gap-3 pt-2 lg:pt-0 border-t lg:border-t-0 border-white/[0.06]">
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-slate-400 font-medium whitespace-nowrap">
                              Assign Role:
                            </label>
                            <select
                              value={assignedRole}
                              onChange={e =>
                                setSelectedRoles(prev => ({
                                  ...prev,
                                  [user.id]: e.target.value as UserRole,
                                }))
                              }
                              disabled={isProcessing}
                              className="input text-xs py-2 px-3 bg-surface-800 border-white/10 rounded-xl"
                            >
                              {ROLE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label} ({opt.desc})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleApprove(user.id)}
                              disabled={isProcessing}
                              className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 shadow-none border-emerald-500/30"
                            >
                              <CheckCircle2 size={14} />
                              {isProcessing ? 'Saving...' : 'Approve & Grant'}
                            </button>

                            <button
                              onClick={() => handleReject(user.id)}
                              disabled={isProcessing}
                              className="btn-secondary text-xs py-2 px-3 text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/20"
                            >
                              <XCircle size={14} />
                              Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ALL USERS & ROLES */}
          {activeTab === 'all' && (
            <div className="space-y-4">
              {/* Search & Filters */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="search"
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="input pl-10 text-xs py-2 w-full"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Filter size={14} className="text-slate-500" />
                  <span className="text-xs text-slate-400">Role:</span>
                  <select
                    value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value)}
                    className="input text-xs py-1.5 px-3 bg-surface-800 border-white/10 rounded-xl"
                  >
                    <option value="all">All Roles</option>
                    <option value="super_admin">Super Admin</option>
                    <option value="staff">Staff</option>
                    <option value="student">Student</option>
                    <option value="parent">Parent</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-800/80 border-b border-white/[0.06] text-slate-400 uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">User</th>
                        <th className="py-3 px-4">Email</th>
                        <th className="py-3 px-4">Current Role</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Registered</th>
                        <th className="py-3 px-4 text-right">Change Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">
                            No users match the search filter.
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map(user => {
                          const currentRoleOpt = ROLE_OPTIONS.find(r => r.value === user.role);

                          return (
                            <tr key={user.id} className="hover:bg-surface-800/30 transition-colors">
                              <td className="py-3 px-4">
                                <div className="font-semibold text-white">{user.full_name}</div>
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-400">
                                {user.email || '—'}
                              </td>
                              <td className="py-3 px-4">
                                {user.role ? (
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold border ${
                                      currentRoleOpt?.color || 'bg-slate-800 text-slate-300'
                                    }`}
                                  >
                                    <Shield size={10} />
                                    {currentRoleOpt?.label || user.role}
                                  </span>
                                ) : (
                                  <span className="text-slate-500 italic">None (Unassigned)</span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded-full font-medium ${
                                    user.status === 'approved'
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                      : user.status === 'rejected'
                                      ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  }`}
                                >
                                  {user.status || (user.role ? 'approved' : 'pending')}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-slate-500">
                                {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <select
                                  value={user.role || ''}
                                  onChange={e => handleChangeRole(user.id, e.target.value as UserRole)}
                                  disabled={processingId === user.id}
                                  className="input text-xs py-1 px-2 bg-surface-800 border-white/10 rounded-lg inline-block w-auto"
                                >
                                  {ROLE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

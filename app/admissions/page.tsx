'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { demoStore } from '@/lib/services/store';
import { Profile } from '@/lib/types';
import {
  UserPlus,
  Users,
  CreditCard,
  Radio,
  Fingerprint,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';

export default function AdmissionsPage() {
  const { session, isLoading: authLoading } = useRequireAuth(['super_admin', 'staff']);
  const [parents, setParents] = useState<Profile[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Parent mode: 'existing' | 'new'
  const [parentMode, setParentMode] = useState<'existing' | 'new'>('new');
  const [selectedParentId, setSelectedParentId] = useState('');

  // Form Fields
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [className, setClassName] = useState('Grade 9-A');
  const [monthlyFee, setMonthlyFee] = useState('5000');
  const [rfidTag, setRfidTag] = useState('');
  const [biometricId, setBiometricId] = useState('');

  // New Parent Fields
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentEmail, setParentEmail] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  if (authLoading || !session) return null;

  async function loadData() {
    const parentList = await demoStore.getParents();
    const studentList = await demoStore.getStudents();
    setParents(parentList);
    setStudents(studentList);

    // Auto-generate RFID and Biometric defaults for easy demoing
    const nextNum = studentList.length + 1;
    setRfidTag(`RFID-X${100 + nextNum}`);
    setBiometricId(`BIO-0${10 + nextNum}`);
  }

  const handleAdmissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) return;

    setLoading(true);
    setSuccessMsg('');

    try {
      let finalParentId = selectedParentId;

      // Handle New Parent creation
      if (parentMode === 'new') {
        if (!parentName.trim()) {
          alert('Please enter Parent/Guardian Name');
          setLoading(false);
          return;
        }
        const createdParent = await demoStore.addParent({
          full_name: parentName,
          phone_number: parentPhone,
          email: parentEmail,
        });
        finalParentId = createdParent.id;
      }

      // Create Student
      const newStudent = await demoStore.addStudent({
        full_name: studentName,
        email: studentEmail || `${studentName.toLowerCase().replace(/\s+/g, '.')}@student.com`,
        phone_number: studentPhone,
        class_name: className,
        monthly_fee: parseFloat(monthlyFee) || 5000,
        rfid_tag: rfidTag,
        biometric_id: biometricId,
        parent_id: finalParentId,
      });

      setSuccessMsg(`Student "${newStudent.full_name}" admitted successfully! ID: ${newStudent.id}`);
      
      // Refresh list
      loadData();

      // Reset form
      setStudentName('');
      setStudentEmail('');
      setStudentPhone('');
      setParentName('');
      setParentPhone('');
      setParentEmail('');
    } catch (err: any) {
      console.error(err);
      alert('Error during admission submit: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const recentAdmissions = [...students].reverse().slice(0, 6);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-950 text-slate-100">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Header />

        <main className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
          {/* Page Title & Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-surface-900 via-surface-900/90 to-brand-950/40 p-6 rounded-2xl border border-white/[0.08] shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="space-y-1 relative z-10">
              <div className="flex items-center gap-2 text-brand-400 font-semibold text-xs uppercase tracking-wider">
                <Sparkles size={14} /> Admissions Portal
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
                New Student Registration
              </h1>
              <p className="text-sm text-slate-400">
                Enroll new students, assign biometric tags & linking parent accounts.
              </p>
            </div>

            <div className="flex items-center gap-3 relative z-10">
              <div className="bg-surface-800/80 border border-white/10 px-4 py-2 rounded-xl text-center">
                <p className="text-xs text-slate-400">Total Enrolled</p>
                <p className="text-xl font-bold text-brand-400">{students.length}</p>
              </div>
            </div>
          </div>

          {successMsg && (
            <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-3 text-sm animate-fade-in">
              <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
              <span className="flex-1 font-medium">{successMsg}</span>
              <button
                onClick={() => setSuccessMsg('')}
                className="text-emerald-400 hover:text-emerald-200 text-xs font-bold"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Form (8 cols) */}
            <div className="lg:col-span-8 space-y-6">
              <form onSubmit={handleAdmissionSubmit} className="space-y-6">
                {/* Card 1: Student Information */}
                <div className="bg-surface-900 border border-white/[0.08] rounded-2xl p-6 space-y-5 shadow-card">
                  <div className="flex items-center gap-3 pb-4 border-b border-white/[0.06]">
                    <div className="w-9 h-9 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center font-bold">
                      <UserPlus size={18} />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-white">Student Information</h2>
                      <p className="text-xs text-slate-400">Basic details of the candidate student</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Full Name <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        placeholder="e.g. Muhammad Ali"
                        className="w-full px-4 py-2.5 rounded-xl bg-surface-800 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Class / Grade <span className="text-rose-400">*</span>
                      </label>
                      <select
                        value={className}
                        onChange={(e) => setClassName(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-surface-800 border border-white/10 text-white focus:outline-none focus:border-brand-500 text-sm"
                      >
                        <option value="Grade 8-A">Grade 8-A</option>
                        <option value="Grade 8-B">Grade 8-B</option>
                        <option value="Grade 9-A">Grade 9-A</option>
                        <option value="Grade 9-B">Grade 9-B</option>
                        <option value="Grade 10-A">Grade 10-A</option>
                        <option value="Grade 10-B">Grade 10-B</option>
                        <option value="ICS Part-1">ICS Part-1</option>
                        <option value="ICS Part-2">ICS Part-2</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Monthly Fee (PKR) <span className="text-rose-400">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-2.5 text-xs text-slate-500 font-bold">Rs.</span>
                        <input
                          type="number"
                          required
                          value={monthlyFee}
                          onChange={(e) => setMonthlyFee(e.target.value)}
                          placeholder="5000"
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-800 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Student Email (Optional)
                      </label>
                      <input
                        type="email"
                        value={studentEmail}
                        onChange={(e) => setStudentEmail(e.target.value)}
                        placeholder="student@example.com"
                        className="w-full px-4 py-2.5 rounded-xl bg-surface-800 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Phone Number (Optional)
                      </label>
                      <input
                        type="text"
                        value={studentPhone}
                        onChange={(e) => setStudentPhone(e.target.value)}
                        placeholder="+923001234567"
                        className="w-full px-4 py-2.5 rounded-xl bg-surface-800 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Card 2: Biometric & Hardware Pairing */}
                <div className="bg-surface-900 border border-white/[0.08] rounded-2xl p-6 space-y-5 shadow-card">
                  <div className="flex items-center gap-3 pb-4 border-b border-white/[0.06]">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center font-bold">
                      <Fingerprint size={18} />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-white">Biometric & Smart Credentials</h2>
                      <p className="text-xs text-slate-400">RFID tag card and Biometric scanner mapping</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                        <Radio size={14} className="text-brand-400" /> RFID Tag Code
                      </label>
                      <input
                        type="text"
                        value={rfidTag}
                        onChange={(e) => setRfidTag(e.target.value)}
                        placeholder="RFID-A101"
                        className="w-full px-4 py-2.5 rounded-xl bg-surface-800 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                        <Fingerprint size={14} className="text-violet-400" /> Biometric ID
                      </label>
                      <input
                        type="text"
                        value={biometricId}
                        onChange={(e) => setBiometricId(e.target.value)}
                        placeholder="BIO-005"
                        className="w-full px-4 py-2.5 rounded-xl bg-surface-800 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Card 3: Parent / Guardian Details */}
                <div className="bg-surface-900 border border-white/[0.08] rounded-2xl p-6 space-y-5 shadow-card">
                  <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                        <UserCheck size={18} />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-white">Parent / Guardian Information</h2>
                        <p className="text-xs text-slate-400">Link student to guardian profile</p>
                      </div>
                    </div>

                    {/* Mode Toggle */}
                    <div className="flex bg-surface-800 p-1 rounded-xl border border-white/10 text-xs">
                      <button
                        type="button"
                        onClick={() => setParentMode('new')}
                        className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                          parentMode === 'new'
                            ? 'bg-brand-600 text-white shadow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        + Register New
                      </button>
                      <button
                        type="button"
                        onClick={() => setParentMode('existing')}
                        className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                          parentMode === 'existing'
                            ? 'bg-brand-600 text-white shadow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Select Existing
                      </button>
                    </div>
                  </div>

                  {parentMode === 'existing' ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Select Parent
                      </label>
                      <select
                        value={selectedParentId}
                        onChange={(e) => setSelectedParentId(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-surface-800 border border-white/10 text-white focus:outline-none focus:border-brand-500 text-sm"
                      >
                        <option value="">-- Choose Existing Parent --</option>
                        {parents.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name} ({p.phone_number || p.email || 'No contact info'})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Guardian Full Name <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required={parentMode === 'new'}
                          value={parentName}
                          onChange={(e) => setParentName(e.target.value)}
                          placeholder="e.g. Tariq Mehmood"
                          className="w-full px-4 py-2.5 rounded-xl bg-surface-800 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Phone Number (For Push / SMS Alerts) <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required={parentMode === 'new'}
                          value={parentPhone}
                          onChange={(e) => setParentPhone(e.target.value)}
                          placeholder="+923001234567"
                          className="w-full px-4 py-2.5 rounded-xl bg-surface-800 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Guardian Email
                        </label>
                        <input
                          type="email"
                          value={parentEmail}
                          onChange={(e) => setParentEmail(e.target.value)}
                          placeholder="guardian@example.com"
                          className="w-full px-4 py-2.5 rounded-xl bg-surface-800 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit Bar */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStudentName('');
                      setStudentEmail('');
                      setStudentPhone('');
                      setParentName('');
                      setParentPhone('');
                      setParentEmail('');
                    }}
                    className="px-5 py-2.5 rounded-xl bg-surface-800 text-slate-300 hover:text-white border border-white/10 text-sm font-medium transition-all"
                  >
                    Reset Form
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white text-sm font-semibold hover:from-brand-500 hover:to-violet-500 shadow-glow-brand transition-all flex items-center gap-2"
                  >
                    {loading ? (
                      'Processing Admission...'
                    ) : (
                      <>
                        <CheckCircle2 size={18} /> Confirm & Enroll Student
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Right: Summary & Recent Admissions (4 cols) */}
            <div className="lg:col-span-4 space-y-6">
              {/* Guidance Box */}
              <div className="bg-surface-900 border border-brand-500/30 rounded-2xl p-5 space-y-3 relative overflow-hidden">
                <div className="flex items-center gap-2 text-brand-400 font-bold text-sm">
                  <ShieldCheck size={18} /> Instant Integration
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Submitting this form automatically connects the student's RFID card and Biometric profile to daily automated attendance & web push notification dispatches.
                </p>
              </div>

              {/* Recent Admissions Feed */}
              <div className="bg-surface-900 border border-white/[0.08] rounded-2xl p-5 space-y-4 shadow-card">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Users size={16} className="text-brand-400" /> Recent Admissions
                  </h3>
                  <span className="text-[10px] bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded-full font-semibold">
                    Live Feed
                  </span>
                </div>

                <div className="space-y-3">
                  {recentAdmissions.map((st) => (
                    <div
                      key={st.id}
                      className="p-3 rounded-xl bg-surface-800/60 border border-white/[0.05] hover:border-brand-500/30 transition-all flex items-center gap-3"
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center font-bold text-xs text-white flex-shrink-0">
                        {st.full_name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-white truncate">{st.full_name}</h4>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span>{st.class_name}</span>
                          <span>•</span>
                          <span className="font-mono text-brand-400 text-[10px]">{st.rfid_tag || 'No RFID'}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-200">
                          Rs. {st.monthly_fee?.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

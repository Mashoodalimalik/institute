'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  X, User, Phone, Fingerprint, CreditCard, Calendar,
  Clock, CheckCircle, AlertTriangle, XCircle, Download,
  Loader2, ChevronDown, MessageSquare, Edit3, Save, Plus,
  Radio, Wifi, WifiOff, ScanLine, Trash2
} from 'lucide-react';
import { Profile, AttendanceRecord, Receipt, PaymentMethod, PAYMENT_METHODS } from '@/lib/types';
import { demoStore } from '@/lib/services/store';
import { useAuth } from '@/lib/auth-context';
import SendMessageModal from '@/components/SendMessageModal';

interface ProfileModalProps {
  studentId: string;
  onClose: () => void;
  onFeeCollected?: () => void;
}

const FeeStatusIcon = ({ status }: { status: string }) => {
  if (status === 'paid') return <CheckCircle size={14} className="text-emerald-400" />;
  if (status === 'overdue') return <XCircle size={14} className="text-red-400" />;
  return <AlertTriangle size={14} className="text-amber-400" />;
};

type ActiveTab = 'info' | 'attendance' | 'fees' | 'collect' | 'enrollment';

export default function ProfileModal({ studentId, onClose, onFeeCollected }: ProfileModalProps) {
  const { session } = useAuth();
  const canEnroll = session?.role === 'super_admin' || session?.role === 'staff';
  const canCollectFee = session?.role === 'super_admin' || session?.role === 'staff';

  const [student, setStudent] = useState<Profile | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('info');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Profile>>({});
  const [showMessageModal, setShowMessageModal] = useState(false);

  // Enrollment state
  const [enrollBiometricId, setEnrollBiometricId] = useState('');
  const [enrollRfidTag, setEnrollRfidTag] = useState('');
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollStatus, setEnrollStatus] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [enrollMsg, setEnrollMsg] = useState('');
  const [enrollType, setEnrollType] = useState<'fingerprint' | 'rfid'>('fingerprint');
  const [enrollSaved, setEnrollSaved] = useState(false);

  // Fee collection form
  const [feeAmount, setFeeAmount] = useState('');
  const [feeDiscount, setFeeDiscount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [feeNotes, setFeeNotes] = useState('');
  const [collectLoading, setCollectLoading] = useState(false);
  const [collectError, setCollectError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [lastReceiptNum, setLastReceiptNum] = useState('');
  const paymentRequest = useRef<{ signature: string; id: string } | undefined>(undefined);
  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [s, att, rec] = await Promise.all([
      demoStore.getStudentById(studentId),
      demoStore.getAttendanceForStudent(studentId),
      demoStore.getReceiptsForStudent(studentId),
    ]);
    setStudent(s);
    setEditData(s ? { full_name: s.full_name, phone_number: s.phone_number, class_name: s.class_name } : {});
    setFeeAmount(String(s?.monthly_fee || ''));
    setAttendance(att);
    setReceipts(rec);
    // Populate enrollment fields from existing data
    if (s) {
      setEnrollBiometricId(s.biometric_id || '');
      setEnrollRfidTag(s.rfid_tag || '');
    }
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSaveEdit() {
    if (!student) return;
    await demoStore.updateStudent(student.id, editData);
    setStudent(prev => prev ? { ...prev, ...editData } : prev);
    setEditing(false);
  }

  async function handleCollectFee() {
    if (!student) return;
    const amount = parseFloat(feeAmount);
    const discount = parseFloat(feeDiscount) || 0;
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(discount) || discount < 0 || discount >= amount) {
      setCollectError('Please enter a valid fee amount.');
      return;
    }
    setCollectLoading(true);
    setCollectError('');
    setDownloadUrl(null);
    try {
      const signature = JSON.stringify([student.id, amount, discount, paymentMethod, feeNotes]);
      if (paymentRequest.current?.signature !== signature) paymentRequest.current = { signature, id: crypto.randomUUID() };
      const resp = await fetch('/api/receipts/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: student.id,
          amount,
          discount,
          payment_method: paymentMethod,
          notes: feeNotes,
          request_id: paymentRequest.current.id,
        }),
      });
      if (!resp.ok) { const error = await resp.json(); throw new Error(error.error || 'Payment processing failed.'); }
      const receiptNum = resp.headers.get('X-Receipt-Number') || '';
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setLastReceiptNum(receiptNum);
      await loadData();
      onFeeCollected?.();
    } catch (e) {
      setCollectError(String(e));
    } finally {
      setCollectLoading(false);
    }
  }

  // ── ZKT Enrollment ───────────────────────────────────────────
  async function handleSendZktCommand() {
    if (!student) return;
    setEnrollLoading(true);
    setEnrollStatus('waiting');
    setEnrollMsg(`Sending ${enrollType} enrollment command to ZKTeco scanner...`);
    try {
      const resp = await fetch('/api/zkt/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student.id,
          enrollType,
          requestId: crypto.randomUUID(),
        }),
      });
      const data = await resp.json();
      if (data.success || data.pending) {
        setEnrollMsg(data.message);
        if (data.pending) {
          const deadline = Date.now() + 60000;
          let complete = false;
          while (Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const response = await fetch(`/api/zkt/enroll?commandId=${encodeURIComponent(data.commandId)}`);
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            if (result.state === 'succeeded') { setEnrollStatus('success'); setEnrollMsg('Bridge confirmed enrollment completed.'); complete = true; break; }
            if (!['queued', 'running'].includes(result.state)) throw new Error(result.error?.message || `Enrollment ${result.state}. Verify the device before retrying.`);
          }
          if (!complete) throw new Error(`Enrollment is still pending (${data.commandId}). Check the bridge before retrying.`);
        } else setEnrollStatus('success');
      } else {
        setEnrollStatus('error');
        setEnrollMsg(data.error || 'Failed to contact scanner');
      }
    } catch (err) {
      setEnrollStatus('error');
      setEnrollMsg(err instanceof Error ? err.message : 'Could not reach enrollment API');
    } finally {
      setEnrollLoading(false);
    }
  }

  async function handleSaveEnrollment() {
    if (!student) return;
    if ((enrollBiometricId && !/^\d{1,9}$/.test(enrollBiometricId)) || (enrollRfidTag && !/^\d+$/.test(enrollRfidTag))) {
      setEnrollStatus('error'); setEnrollMsg('Use the numeric K40 user ID and actual numeric RFID card number, or leave them empty.'); return;
    }
    setEnrollLoading(true);
    try {
      await demoStore.updateStudent(student.id, {
        biometric_id: enrollBiometricId || undefined,
        rfid_tag: enrollRfidTag || undefined,
      });
      setStudent(prev => prev ? {
        ...prev,
        biometric_id: enrollBiometricId || undefined,
        rfid_tag: enrollRfidTag || undefined,
      } : prev);
      setEnrollSaved(true);
      setEnrollStatus('success');
      setEnrollMsg('Biometric/RFID credentials saved successfully.');
      setTimeout(() => { setEnrollSaved(false); setEnrollStatus('idle'); setEnrollMsg(''); }, 3000);
    } catch (err) {
      setEnrollStatus('error');
      setEnrollMsg('Failed to save credentials.');
    } finally {
      setEnrollLoading(false);
    }
  }

  const handleDeleteStudent = async () => {
    if (!student) return;
    if (!confirm('Are you sure you want to completely delete this student and all their attendance/fee records? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: student.id, type: 'student' })
      });
      if (!res.ok) throw new Error('Failed to delete student');
      alert('Student deleted successfully.');
      if (onFeeCollected) onFeeCollected(); // Refreshes the list in parent
      onClose();
    } catch (err: any) {
      alert(err.message || 'Error deleting student.');
    }
  };

  const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'info',       label: 'Profile',    icon: <User size={14} /> },
    { id: 'attendance', label: 'Attendance', icon: <Calendar size={14} /> },
    { id: 'fees',       label: 'Fee History', icon: <CreditCard size={14} /> },
    ...(canCollectFee ? [{ id: 'collect' as ActiveTab, label: 'Collect Fee', icon: <Plus size={14} /> }] : []),
    ...(canEnroll ? [{ id: 'enrollment' as ActiveTab, label: 'Enrollment', icon: <ScanLine size={14} /> }] : []),
  ];

  const initials = student?.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel max-w-2xl w-full"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header rounded-t-2xl">
          <div className="flex items-center gap-4">
            {loading ? (
              <div className="w-12 h-12 skeleton rounded-full" />
            ) : (
              <div className="avatar w-12 h-12 from-brand-500 to-violet-600 text-sm font-bold">
                {initials}
              </div>
            )}
            <div>
              {loading ? (
                <>
                  <div className="skeleton h-5 w-36 mb-1.5 rounded" />
                  <div className="skeleton h-3.5 w-24 rounded" />
                </>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-white">{student?.full_name}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-500">{student?.class_name}</span>
                    {student?.fee_status && (
                      <span className={`badge-${student.fee_status} flex items-center gap-1`}>
                        <FeeStatusIcon status={student.fee_status} />
                        {student.fee_status.charAt(0).toUpperCase() + student.fee_status.slice(1)}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEnroll && (
              <button onClick={handleDeleteStudent} className="p-2 rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors" title="Delete Student">
                <Trash2 size={18} />
              </button>
            )}
            <button onClick={onClose} className="btn-icon" id="modal-close-btn">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06] px-6 gap-1 bg-surface-900/80">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-all duration-150
                ${activeTab === tab.id
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
                }
              `}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-10 rounded-xl" />)}
            </div>
          ) : !student ? (
            <div className="text-center text-slate-500 py-8">Student not found.</div>
          ) : (
            <>
              {/* ── Profile Tab ─────────────────────────────── */}
              {activeTab === 'info' && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex justify-between items-center">
                    <p className="section-title">Student Information</p>
                    {!editing ? (
                      <button disabled={!canEnroll} onClick={() => setEditing(true)} className="btn btn-secondary btn-sm">
                        <Edit3 size={12} /> Edit
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => setEditing(false)} className="btn btn-secondary btn-sm">Cancel</button>
                        <button onClick={handleSaveEdit} className="btn btn-primary btn-sm">
                          <Save size={12} /> Save
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="input-label">Full Name</label>
                      {editing ? (
                        <input className="input" value={editData.full_name || ''} onChange={e => setEditData(p => ({ ...p, full_name: e.target.value }))} />
                      ) : (
                        <div className="input bg-surface-800/40 flex items-center gap-2 text-slate-300">
                          <User size={14} className="text-slate-500" />{student.full_name}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="input-label">Class</label>
                      {editing ? (
                        <input className="input" value={editData.class_name || ''} onChange={e => setEditData(p => ({ ...p, class_name: e.target.value }))} />
                      ) : (
                        <div className="input bg-surface-800/40 text-slate-300">{student.class_name || '—'}</div>
                      )}
                    </div>
                    <div>
                      <label className="input-label">Phone Number</label>
                      {editing ? (
                        <input className="input" value={editData.phone_number || ''} onChange={e => setEditData(p => ({ ...p, phone_number: e.target.value }))} />
                      ) : (
                        <div className="input bg-surface-800/40 flex items-center gap-2 text-slate-300">
                          <Phone size={14} className="text-slate-500" />{student.phone_number || '—'}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="input-label">Monthly Fee (PKR)</label>
                      <div className="input bg-surface-800/40 text-slate-300 font-semibold">
                        PKR {(student.monthly_fee || 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <label className="input-label">Biometric ID</label>
                      <div className="input bg-surface-800/40 flex items-center gap-2 text-slate-300">
                        <Fingerprint size={14} className="text-slate-500" />{student.biometric_id || '—'}
                      </div>
                    </div>
                    <div>
                      <label className="input-label">RFID Tag</label>
                      <div className="input bg-surface-800/40 flex items-center gap-2 text-slate-300">
                        <CreditCard size={14} className="text-slate-500" />{student.rfid_tag || '—'}
                      </div>
                    </div>
                  </div>

                  {/* Parent info */}
                  {student.parent && (
                    <>
                      <p className="section-title mt-2">Parent / Guardian</p>
                      <div className="card p-4 grid grid-cols-2 gap-3">
                        <div>
                          <label className="input-label">Name</label>
                          <div className="text-sm text-slate-300 font-medium">{student.parent.full_name}</div>
                        </div>
                        <div>
                          <label className="input-label">Phone</label>
                          <div className="flex items-center gap-2">
                            <div className="text-sm text-slate-300">{student.parent.phone_number}</div>
                            <button
                              type="button"
                              onClick={() => setShowMessageModal(true)}
                              className="btn btn-secondary btn-sm"
                              title="Send WhatsApp Message"
                            >
                              <MessageSquare size={12} className="text-emerald-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Attendance Tab ────────────────────────────── */}
              {activeTab === 'attendance' && (
                <div className="animate-fade-in">
                  <p className="section-title">Recent Attendance Log</p>
                  {attendance.length === 0 ? (
                    <div className="text-center text-slate-500 py-8">No attendance records found.</div>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {attendance.map(rec => (
                        <div key={rec.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-800/60 border border-white/[0.04]">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${rec.type === 'check_in' ? 'bg-emerald-500/15' : 'bg-slate-500/15'}`}>
                            <Clock size={14} className={rec.type === 'check_in' ? 'text-emerald-400' : 'text-slate-400'} />
                          </div>
                          <div className="flex-1">
                            <div className="text-sm text-slate-300 font-medium">
                              {rec.type === 'check_in' ? 'Checked In' : 'Checked Out'}
                            </div>
                            <div className="text-xs text-slate-600">
                              {new Date(rec.timestamp).toLocaleString('en-PK', {
                                weekday: 'short', month: 'short', day: 'numeric',
                                hour: '2-digit', minute: '2-digit'
                              })}
                            </div>
                          </div>
                          <span className={rec.type === 'check_in' ? 'badge-in' : 'badge-out'}>
                            {rec.type === 'check_in' ? 'In' : 'Out'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Fee History Tab ───────────────────────────── */}
              {activeTab === 'fees' && (
                <div className="animate-fade-in">
                  <p className="section-title">Fee History & Receipts</p>
                  {receipts.length === 0 ? (
                    <div className="text-center text-slate-500 py-8">No payment records found.</div>
                  ) : (
                    <div className="space-y-2">
                      {receipts.map(r => (
                        <div key={r.id} className="flex items-center gap-3 p-3.5 rounded-xl bg-surface-800/60 border border-white/[0.04]">
                          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                            <CheckCircle size={16} className="text-emerald-400" />
                          </div>
                          <div className="flex-1">
                            <a href={`/api/receipts/pdf?id=${r.id}`} className="text-sm font-semibold text-brand-300">{r.receipt_number} · Download</a>
                            <div className="text-xs text-slate-500">
                              {new Date(r.created_at).toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' })}
                              {' · '}{r.payment_method}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-emerald-400">PKR {(r.amount - r.discount).toLocaleString()}</div>
                            {r.discount > 0 && <div className="text-xs text-slate-600">−PKR {r.discount.toLocaleString()}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Collect Fee Tab ───────────────────────────── */}
              {activeTab === 'collect' && (
                <div className="animate-fade-in space-y-4">
                  <p className="section-title">Collect Fee Payment</p>

                  {downloadUrl ? (
                    /* Success state */
                    <div className="flex flex-col items-center py-6 gap-4 animate-slide-up">
                      <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
                        <CheckCircle size={32} className="text-emerald-400" />
                      </div>
                      <div className="text-center">
                        <h3 className="text-lg font-bold text-white mb-1">Payment Successful!</h3>
                        <p className="text-slate-500 text-sm">Receipt #{lastReceiptNum} has been generated.</p>
                      </div>
                      <a
                        href={downloadUrl}
                        download={`receipt-${lastReceiptNum}.pdf`}
                        id="receipt-download-btn"
                        className="btn-primary btn-lg"
                      >
                        <Download size={18} /> Download PDF Receipt
                      </a>
                      <button
                        onClick={() => { paymentRequest.current = undefined; setDownloadUrl(null); setLastReceiptNum(''); setFeeNotes(''); }}
                        className="btn-secondary"
                      >
                        Collect Another Payment
                      </button>
                    </div>
                  ) : (
                    /* Form state */
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="input-label">Amount (PKR)</label>
                          <input
                            id="fee-amount-input"
                            type="number"
                            min="0"
                            className="input"
                            placeholder={student.monthly_fee?.toString() || '0'}
                            value={feeAmount}
                            onChange={e => setFeeAmount(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="input-label">Discount (PKR)</label>
                          <input
                            id="fee-discount-input"
                            type="number"
                            min="0"
                            className="input"
                            placeholder="0"
                            value={feeDiscount}
                            onChange={e => setFeeDiscount(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Net amount preview */}
                      <div className="p-3 rounded-xl bg-brand-600/10 border border-brand-500/20 flex items-center justify-between">
                        <span className="text-sm text-slate-400">Net Amount Payable</span>
                        <span className="text-lg font-bold text-brand-300">
                          PKR {Math.max(0, (parseFloat(feeAmount) || 0) - (parseFloat(feeDiscount) || 0)).toLocaleString()}
                        </span>
                      </div>

                      <div>
                        <label className="input-label">Payment Method</label>
                        <div className="flex gap-2">
                          {PAYMENT_METHODS.map(m => (
                            <button
                              key={m}
                              onClick={() => setPaymentMethod(m)}
                              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all duration-150 ${
                                paymentMethod === m
                                  ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                                  : 'bg-surface-800 border-white/10 text-slate-500 hover:text-slate-300'
                              }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="input-label">Notes (optional)</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g., September 2026 monthly fee"
                          value={feeNotes}
                          onChange={e => setFeeNotes(e.target.value)}
                        />
                      </div>

                      {collectError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
                          {collectError}
                        </div>
                      )}

                      <button
                        id="submit-payment-btn"
                        onClick={handleCollectFee}
                        disabled={collectLoading || !feeAmount}
                        className="btn-primary btn-lg w-full"
                      >
                        {collectLoading
                          ? <><Loader2 size={18} className="animate-spin" /> Processing & Generating Receipt...</>
                          : <><CheckCircle size={18} /> Submit Payment & Generate Receipt</>
                        }
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Enrollment Tab ─────────────────────────────── */}
              {activeTab === 'enrollment' && (
                <div className="animate-fade-in space-y-5">
                  <p className="section-title">Biometric & RFID Enrollment</p>

                  {/* ZKT Command Panel */}
                  <div className="p-4 rounded-xl bg-surface-800/60 border border-brand-500/20 space-y-4">
                    <div className="flex items-center gap-2 text-brand-400 font-semibold text-xs uppercase tracking-wider">
                      <Radio size={14} /> ZKTeco Scanner Command
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Select enrollment type and click <strong className="text-white">Send to Scanner</strong>. The website will send a command to the ZKTeco device to open enrollment mode — then ask the student to scan their finger or RFID card on the device.
                    </p>

                    {/* Enrollment type toggle */}
                    <div>
                      <label className="input-label">Enrollment Type</label>
                      <div className="flex gap-2 mt-1">
                        {[
                          { val: 'fingerprint' as const, icon: <Fingerprint size={14} />, label: 'Fingerprint' },
                          { val: 'rfid' as const, icon: <CreditCard size={14} />, label: 'RFID Card' },
                        ].map(opt => (
                          <button
                            key={opt.val}
                            onClick={() => setEnrollType(opt.val)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                              enrollType === opt.val
                                ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                                : 'bg-surface-800 border-white/10 text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            {opt.icon} {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      id="zkt-enroll-btn"
                      onClick={handleSendZktCommand}
                      disabled={enrollLoading}
                      className="btn-primary w-full"
                    >
                      {enrollLoading
                        ? <><Loader2 size={16} className="animate-spin" /> Sending Command...</>
                        : <><Radio size={16} /> Send to ZKTeco Scanner</>
                      }
                    </button>

                    {/* Status feedback */}
                    {enrollMsg && (
                      <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                        enrollStatus === 'error'
                          ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                          : enrollStatus === 'success'
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                          : 'bg-brand-500/10 border border-brand-500/20 text-brand-300'
                      }`}>
                        {enrollStatus === 'waiting' && <Loader2 size={14} className="animate-spin flex-shrink-0 mt-0.5" />}
                        {enrollStatus === 'success' && <CheckCircle size={14} className="flex-shrink-0 mt-0.5" />}
                        {enrollStatus === 'error' && <XCircle size={14} className="flex-shrink-0 mt-0.5" />}
                        {enrollMsg}
                      </div>
                    )}
                  </div>

                  {/* Manual ID Entry */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Or Set IDs Manually
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="input-label flex items-center gap-1.5">
                          <Fingerprint size={12} className="text-violet-400" /> Biometric ID
                        </label>
                        <input
                          id="enroll-biometric-input"
                          type="text"
                          className="input font-mono text-sm"
                          placeholder="e.g. 101"
                          value={enrollBiometricId}
                          onChange={e => setEnrollBiometricId(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="input-label flex items-center gap-1.5">
                          <CreditCard size={12} className="text-brand-400" /> RFID Tag
                        </label>
                        <input
                          id="enroll-rfid-input"
                          type="text"
                          className="input font-mono text-sm"
                          placeholder="e.g. 12345678"
                          value={enrollRfidTag}
                          onChange={e => setEnrollRfidTag(e.target.value)}
                        />
                      </div>
                    </div>
                    <button
                      id="save-enrollment-btn"
                      onClick={handleSaveEnrollment}
                      disabled={enrollLoading}
                      className="btn-primary w-full"
                    >
                      {enrollLoading
                        ? <><Loader2 size={16} className="animate-spin" /> Saving...</>
                        : enrollSaved
                        ? <><CheckCircle size={16} className="text-emerald-300" /> Saved!</>
                        : <><Save size={16} /> Save Credentials</>
                      }
                    </button>
                  </div>

                  {/* Device config hint */}
                  <div className="p-3 rounded-xl bg-surface-800/40 border border-white/[0.06] text-xs text-slate-500 leading-relaxed">
                    <strong className="text-slate-400">ZKTeco Setup:</strong> Set device Push URL to{' '}
                    <code className="bg-surface-700 px-1 py-0.5 rounded text-brand-300">
                      /api/attendance/push
                    </code>{' '}
                    and configure <code className="bg-surface-700 px-1 py-0.5 rounded">ZKT_DEVICE_URL</code> in{' '}
                    <code className="bg-surface-700 px-1 py-0.5 rounded">.env.local</code> to enable live two-way commands.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showMessageModal && student && (
        <SendMessageModal
          student={student}
          recipientName={student.parent?.full_name || student.full_name}
          recipientPhone={student.parent?.phone_number || student.phone_number || ''}
          onClose={() => setShowMessageModal(false)}
        />
      )}
    </div>
  );
}

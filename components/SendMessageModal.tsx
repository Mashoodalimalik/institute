'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  X, MessageSquare, Send, CheckCircle2, AlertCircle,
  Loader2, Copy, Sparkles, RefreshCw, BookmarkPlus, Trash2
} from 'lucide-react';
import { Profile } from '@/lib/types';
import { sendWhatsAppMessageDirect, checkOnDeviceBridge } from '@/lib/client-bridge';

export interface MessageTemplate {
  id: string;
  name: string;
  category: 'attendance' | 'fee' | 'academic' | 'announcement' | 'custom';
  text: string;
}

const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: 'att-checkin',
    name: '✅ Attendance — Checked IN',
    category: 'attendance',
    text: '✅ *Checked IN* — {{institute_name}}\n\nDear Parent, your child *{{student_name}}* has arrived at the institute at {{time}} on {{date}}.\n\nRegards,\n*{{institute_name}}*',
  },
  {
    id: 'att-checkout',
    name: '🚪 Attendance — Checked OUT',
    category: 'attendance',
    text: '🚪 *Checked OUT* — {{institute_name}}\n\nDear Parent, your child *{{student_name}}* has left the institute at {{time}} on {{date}}.\n\nRegards,\n*{{institute_name}}*',
  },
  {
    id: 'fee-reminder',
    name: '📚 Fee — Monthly Reminder',
    category: 'fee',
    text: '📚 *Fee Reminder* — {{institute_name}}\n\nDear Parent, the monthly fee of *PKR {{fee_amount}}* for *{{student_name}}* (Class: {{class_name}}) is due by the 5th of this month. Kindly deposit to avoid late charges.\n📞 Contact: admin@okasha.edu.pk\n\nRegards,\n*{{institute_name}}*',
  },
  {
    id: 'fee-overdue',
    name: '⚠️ Fee — OVERDUE Notice',
    category: 'fee',
    text: '⚠️ *Fee OVERDUE Alert* — {{institute_name}}\n\nDear Parent, the tuition fee of *PKR {{fee_amount}}* for *{{student_name}}* is currently overdue. Please clear the pending fee at your earliest convenience.\n📞 Contact: admin@okasha.edu.pk\n\nThank you,\n*{{institute_name}}*',
  },
  {
    id: 'fee-receipt',
    name: '🧾 Fee — Payment Acknowledgment',
    category: 'fee',
    text: '🧾 *Payment Received* — {{institute_name}}\n\nWe acknowledge receipt of tuition payment for *{{student_name}}*.\nAmount Paid: *PKR {{fee_amount}}*\nStatus: Settled\n\nThank you for your timely payment!\n\nRegards,\n*{{institute_name}}*',
  },
  {
    id: 'academic-exam',
    name: '📝 Academic — Exam / Test Schedule',
    category: 'academic',
    text: '📝 *Academic Update* — {{institute_name}}\n\nDear Parent of *{{student_name}}*,\nPlease be informed that upcoming evaluations for *{{class_name}}* will commence soon. Regular attendance and timely preparation are mandatory.\n\nBest regards,\n*{{institute_name}}*',
  },
  {
    id: 'announcement-holiday',
    name: '📢 Announcement — Official Notice',
    category: 'announcement',
    text: '📢 *Important Announcement* — {{institute_name}}\n\nDear Parents and Students,\nPlease note that the institute will remain closed on {{date}} due to scheduled holiday/maintenance. Classes resume normally the following working day.\n\nRegards,\n*{{institute_name}}*',
  },
  {
    id: 'custom-blank',
    name: '✏️ Custom Blank Message',
    category: 'custom',
    text: '📢 *Notice* — {{institute_name}}\n\nDear Parent of *{{student_name}}*,\n\n[Type your custom message here]\n\nRegards,\n*{{institute_name}}*',
  },
];

interface SendMessageModalProps {
  recipientName?: string;
  recipientPhone?: string;
  student?: Profile | null;
  onClose: () => void;
  onSent?: (sid: string) => void;
}

export default function SendMessageModal({
  recipientName,
  recipientPhone,
  student,
  onClose,
  onSent,
}: SendMessageModalProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>(DEFAULT_TEMPLATES);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('fee-reminder');
  const [phone, setPhone] = useState(recipientPhone || student?.parent?.phone_number || student?.phone_number || '');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [showSaveCustom, setShowSaveCustom] = useState(false);
  const [onDevice, setOnDevice] = useState(false);

  useEffect(() => {
    checkOnDeviceBridge().then(setOnDevice);
  }, []);

  // Load custom templates from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('okasha_custom_msg_templates');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTemplates([...DEFAULT_TEMPLATES, ...parsed]);
        }
      }
    } catch {}
  }, []);

  // Compute variable substitutions
  const variables = useMemo(() => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' });
    const dateStr = now.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' });

    return {
      '{{student_name}}': student?.full_name || recipientName || 'Student',
      '{{parent_name}}': student?.parent?.full_name || 'Parent/Guardian',
      '{{class_name}}': student?.class_name || 'General Batch',
      '{{fee_amount}}': (student?.monthly_fee || 5000).toLocaleString('en-PK'),
      '{{time}}': timeStr,
      '{{date}}': dateStr,
      '{{institute_name}}': 'Okasha Institute',
    };
  }, [student, recipientName]);

  const applyTemplate = (tpl: MessageTemplate) => {
    let populated = tpl.text;
    for (const [tag, val] of Object.entries(variables)) {
      populated = populated.replaceAll(tag, val);
    }
    setMessage(populated);
  };

  // Set initial template
  useEffect(() => {
    const tpl = templates.find(t => t.id === selectedTemplateId) || templates[0];
    if (tpl) {
      applyTemplate(tpl);
    }
  }, [selectedTemplateId, variables]);

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const tpl = templates.find(t => t.id === id);
    if (tpl) applyTemplate(tpl);
  };

  const insertVariable = (tag: string) => {
    const val = variables[tag as keyof typeof variables] || tag;
    setMessage(prev => prev + ' ' + val);
  };

  const handleSaveAsCustomTemplate = () => {
    if (!newTemplateTitle.trim() || !message.trim()) return;
    const newTpl: MessageTemplate = {
      id: `custom-${Date.now()}`,
      name: `⭐ ${newTemplateTitle.trim()}`,
      category: 'custom',
      text: message,
    };
    const updated = [...templates, newTpl];
    setTemplates(updated);
    try {
      const customOnly = updated.filter(t => t.id.startsWith('custom-') && t.id !== 'custom-blank');
      localStorage.setItem('okasha_custom_msg_templates', JSON.stringify(customOnly));
    } catch {}
    setSelectedTemplateId(newTpl.id);
    setNewTemplateTitle('');
    setShowSaveCustom(false);
  };

  const handleDeleteCustomTemplate = (id: string) => {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    try {
      const customOnly = updated.filter(t => t.id.startsWith('custom-') && t.id !== 'custom-blank');
      localStorage.setItem('okasha_custom_msg_templates', JSON.stringify(customOnly));
    } catch {}
    if (selectedTemplateId === id) {
      setSelectedTemplateId('fee-reminder');
    }
  };

  const handleSend = async () => {
    if (!phone.trim()) {
      setStatus({ type: 'error', message: 'Recipient phone number is required.' });
      return;
    }
    if (!message.trim()) {
      setStatus({ type: 'error', message: 'Message content cannot be empty.' });
      return;
    }

    setSending(true);
    setStatus(null);

    try {
      const data = await sendWhatsAppMessageDirect({
        phone: phone.trim(),
        message: message.trim(),
      });

      setStatus({
        type: 'success',
        message: data.onDevice
          ? `WhatsApp message sent directly via On-Device Bridge! ID: ${data.sid || 'Confirmed'}`
          : `WhatsApp message successfully dispatched! ID: ${data.sid || 'Confirmed'}`,
      });
      if (onSent && data.sid) onSent(data.sid);
    } catch (err: any) {
      setStatus({
        type: 'error',
        message: err.message || 'Error communicating with WhatsApp bridge.',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="card w-full max-w-2xl bg-surface-900 border border-white/10 shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-surface-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <MessageSquare size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                WhatsApp Messenger & Templates
                {onDevice && (
                  <span className="text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full px-2 py-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    On-Device Bridge
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Send templated or customized messages directly to parents/students
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Status Message */}
          {status && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
                status.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                  : 'bg-red-500/10 border border-red-500/20 text-red-300'
              }`}
            >
              {status.type === 'success' ? (
                <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 font-medium">{status.message}</div>
            </div>
          )}

          {/* Template Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Select Message Template
              </label>
              <button
                type="button"
                onClick={() => setShowSaveCustom(!showSaveCustom)}
                className="text-xs text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1"
              >
                <BookmarkPlus size={13} /> Save Current as Template
              </button>
            </div>

            {/* Save Custom Template Input */}
            {showSaveCustom && (
              <div className="mb-3 p-3 rounded-xl bg-surface-800/80 border border-brand-500/30 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Template title (e.g., Sports Day Reminder)"
                  value={newTemplateTitle}
                  onChange={e => setNewTemplateTitle(e.target.value)}
                  className="input flex-1 text-xs py-1.5"
                />
                <button
                  type="button"
                  onClick={handleSaveAsCustomTemplate}
                  className="btn-primary text-xs py-1.5 px-3"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowSaveCustom(false)}
                  className="text-xs text-slate-400 hover:text-white px-1"
                >
                  Cancel
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {templates.map(tpl => {
                const isSelected = tpl.id === selectedTemplateId;
                const isCustom = tpl.id.startsWith('custom-') && tpl.id !== 'custom-blank';
                return (
                  <div
                    key={tpl.id}
                    onClick={() => handleSelectTemplate(tpl.id)}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-brand-600/15 border-brand-500 text-white font-medium shadow-sm'
                        : 'bg-surface-800/60 border-white/[0.06] text-slate-300 hover:border-white/20 hover:bg-surface-800'
                    }`}
                  >
                    <span className="text-xs truncate">{tpl.name}</span>
                    {isCustom && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleDeleteCustomTemplate(tpl.id);
                        }}
                        title="Delete custom template"
                        className="text-slate-500 hover:text-red-400 p-1 rounded"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Insert Variables */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Click to insert dynamic tags:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(variables).map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => insertVariable(tag)}
                  className="px-2 py-1 rounded-lg bg-surface-800 border border-white/[0.08] text-[11px] font-mono text-slate-300 hover:border-brand-500/50 hover:text-brand-300 transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Recipient Phone */}
          <div>
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
              Recipient WhatsApp Number
            </label>
            <input
              type="text"
              placeholder="+92 300 1234567"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="input w-full text-sm font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Supports Pakistani format (03001234567) or international (+923001234567).
            </p>
          </div>

          {/* Message Content (Editable Textarea) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Message Content (Fully Editable)
              </label>
              <span className="text-xs text-slate-500">
                {message.length} characters
              </span>
            </div>
            <textarea
              rows={6}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Write or edit your message here..."
              className="input w-full text-sm font-sans leading-relaxed resize-y"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              WhatsApp formatting supported: <code className="text-slate-400">*bold*</code>, <code className="text-slate-400">_italic_</code>, <code className="text-slate-400">~strike~</code>.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-surface-950/60">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary text-xs px-4 py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={sending || !phone.trim() || !message.trim()}
            onClick={handleSend}
            className="btn-primary text-xs px-5 py-2 flex items-center gap-2"
          >
            {sending ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Dispatching...
              </>
            ) : (
              <>
                <Send size={14} />
                Send via WhatsApp
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

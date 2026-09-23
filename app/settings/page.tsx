'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import BridgeStatus from '@/components/BridgeStatus';
import WhatsAppConnection from '@/components/WhatsAppConnection';
import {
  Settings, Bell, MessageSquare, Phone, Calendar, Clock,
  DollarSign, Loader2, Save, CheckCircle, AlertTriangle,
} from 'lucide-react';
import { FeeSettings } from '@/lib/types';
import { demoStore } from '@/lib/services/store';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';

function Toggle({ checked, onToggle, id }: { checked: boolean; onToggle: () => void; id: string }) {
  return (
    <button
      id={id}
      onClick={onToggle}
      role="switch"
      aria-checked={checked}
      className={`
        relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-surface-950 flex-shrink-0
        ${checked ? 'bg-brand-600' : 'bg-surface-700'}
      `}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 shadow-sm ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

function SettingSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/[0.06]">
        <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center">{icon}</div>
        <h2 className="text-sm font-bold text-white">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div>
        <div className="text-sm font-medium text-slate-300">{label}</div>
        {description && <div className="text-xs text-slate-600 mt-0.5">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { session, isLoading: authLoading } = useRequireAuth(['super_admin']);
  const [settings, setSettings] = useState<FeeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading || !session) return;
    demoStore.getFeeSettings().then(setSettings).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [authLoading, session?.userId]);

  function update(key: keyof FeeSettings, value: unknown) {
    setSettings(prev => prev ? { ...prev, [key]: value } : prev);
    setSaved(false);
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      await demoStore.updateFeeSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save settings'); }
    finally { setSaving(false); }
  }

  if (authLoading || !session) return null;
  if (error && !settings) return <p role="alert" className="p-6 text-red-400">{error}</p>;
  if (loading || !settings) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-brand-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 pt-14 lg:pt-0">
        <Header
          title="Settings"
          subtitle="Manage WhatsApp, devices, fee rules and notifications"
          actions={
            <button
              id="save-settings-btn"
              onClick={handleSave}
              disabled={saving}
              className="btn-primary btn-sm"
            >
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Saving...</>
                : saved
                ? <><CheckCircle size={14} className="text-emerald-400" /> Saved!</>
                : <><Save size={14} /> Save Settings</>
              }
            </button>
          }
        />

        <div className="flex-1 p-6 max-w-2xl mx-auto w-full space-y-6">
          {error && <p role="alert" className="text-red-400">{error}</p>}
          <WhatsAppConnection />
          <BridgeStatus />

          {/* Institute Info */}
          <SettingSection title="Institute Details" icon={<Settings size={16} className="text-brand-400" />}>
            <div>
              <label className="input-label">Institute Name</label>
              <input
                id="institute-name"
                className="input"
                value={settings.institute_name}
                onChange={e => update('institute_name', e.target.value)}
              />
            </div>
          </SettingSection>

          {/* Fee Rules */}
          <SettingSection title="Fee Rules" icon={<Calendar size={16} className="text-amber-400" />}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">
                  Fee Due Day <span className="normal-case text-slate-600">(1–31)</span>
                </label>
                <input
                  id="due-day-input"
                  type="number"
                  min="1"
                  max="31"
                  className="input"
                  value={settings.universal_due_day}
                  onChange={e => update('universal_due_day', parseInt(e.target.value))}
                />
                <p className="text-xs text-slate-600 mt-1.5">
                  Fees are due on the {settings.universal_due_day}{['st','nd','rd'][settings.universal_due_day - 1] || 'th'} of each month.
                </p>
              </div>
              <div>
                <label className="input-label">Grace Period (days)</label>
                <input
                  id="grace-period-input"
                  type="number"
                  min="0"
                  max="30"
                  className="input"
                  value={settings.grace_period_days}
                  onChange={e => update('grace_period_days', parseInt(e.target.value))}
                />
                <p className="text-xs text-slate-600 mt-1.5">
                  Mark overdue {settings.grace_period_days} days after due date.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <label className="input-label">Late Fee Reference {settings.late_fee_is_percent ? '(%)' : '(PKR)'}</label>
                <p className="text-xs text-slate-500 mb-2">Recorded for reference; late fees must be collected manually.</p>
                <input
                  id="late-fee-input"
                  type="number"
                  min="0"
                  className="input"
                  value={settings.late_fee_amount}
                  onChange={e => update('late_fee_amount', parseFloat(e.target.value))}
                />
              </div>
              <div>
                <label className="input-label">Late Fee Type</label>
                <div className="flex gap-2 mt-1">
                  {[
                    { label: 'Fixed Amount', val: false },
                    { label: 'Percentage %', val: true },
                  ].map(opt => (
                    <button
                      key={String(opt.val)}
                      onClick={() => update('late_fee_is_percent', opt.val)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-medium border transition-all duration-150 ${
                        settings.late_fee_is_percent === opt.val
                          ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                          : 'bg-surface-800 border-white/10 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <SettingRow
              label="Reminder Interval"
              description="How often to re-send fee reminders (in days)"
            >
              <div className="flex items-center gap-2">
                <input
                  id="reminder-interval-input"
                  type="number"
                  min="1"
                  max="30"
                  className="input w-20 text-center"
                  value={settings.reminder_interval_days}
                  onChange={e => update('reminder_interval_days', parseInt(e.target.value))}
                />
                <span className="text-xs text-slate-500 w-10">days</span>
              </div>
            </SettingRow>
          </SettingSection>

          {/* Notification Channels */}
          <SettingSection title="Notification Channels" icon={<Bell size={16} className="text-violet-400" />}>
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-300/80">
                WhatsApp requires a connected institute account in the local bridge. SMS requires a configured provider.
              </p>
            </div>

            <SettingRow
              label="SMS Notifications"
              description="Send fee reminders via Twilio SMS"
            >
              <Toggle
                id="toggle-sms"
                checked={settings.notify_sms}
                onToggle={() => update('notify_sms', !settings.notify_sms)}
              />
            </SettingRow>

            <SettingRow
              label="WhatsApp Notifications"
              description="Send reminders and receipts through the local WhatsApp bridge"
            >
              <Toggle
                id="toggle-whatsapp"
                checked={settings.notify_whatsapp}
                onToggle={() => update('notify_whatsapp', !settings.notify_whatsapp)}
              />
            </SettingRow>

          </SettingSection>

          {/* Cron Info */}
          <SettingSection title="Automation" icon={<Clock size={16} className="text-emerald-400" />}>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-800/60">
                <CheckCircle size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-300">Fee Reminder Cron</div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    The Vercel schedule targets 09:00 AM Pakistan time via <code className="text-xs bg-surface-700 px-1 py-0.5 rounded">/api/cron/fee-reminders</code>.
                    A local reminder scheduler is not configured. Enabling WhatsApp alone does not start scheduled reminders.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-800/60">
                <CheckCircle size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-300">Biometric Webhook</div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    The K40 bridge forwards attendance to <code className="text-xs bg-surface-700 px-1 py-0.5 rounded">/api/attendance/push</code>
                    — auto check_in/check_out with parent alerts.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-800/60">
                <CheckCircle size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-300">PDF Receipt Generation</div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    On fee collection, a branded PDF is auto-generated via <code className="text-xs bg-surface-700 px-1 py-0.5 rounded">/api/receipts/pdf</code>
                    and can be downloaded again from the student’s fee history. Payments do not automatically send a WhatsApp receipt yet.
                  </div>
                </div>
              </div>
            </div>
          </SettingSection>

          {/* Save hint */}
          <div className="flex justify-end pb-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary"
            >
              {saving
                ? <><Loader2 size={16} className="animate-spin" /> Saving...</>
                : saved
                ? <><CheckCircle size={16} className="text-emerald-300" /> Settings Saved!</>
                : <><Save size={16} /> Save All Settings</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

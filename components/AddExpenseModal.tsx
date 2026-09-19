'use client';

import { useState } from 'react';
import { X, Upload, Loader2, Receipt } from 'lucide-react';
import { demoStore } from '@/lib/services/store';
import { EXPENSE_CATEGORIES } from '@/lib/types';

interface AddExpenseModalProps {
  onClose: () => void;
  onAdded: () => void;
}

export default function AddExpenseModal({ onClose, onAdded }: AddExpenseModalProps) {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0].value);
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    setLoading(true);
    setError('');
    await demoStore.insertLedgerEntry({
      amount: amt,
      transaction_type: 'expense',
      category: EXPENSE_CATEGORIES.find(c => c.value === category)?.label || category,
      notes,
      date,
      receipt_url: receiptFile ? URL.createObjectURL(receiptFile) : undefined,
    });
    setLoading(false);
    onAdded();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel max-w-md w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center">
              <Receipt size={18} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Log Expense</h2>
              <p className="text-xs text-slate-500">Record an operational cost</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">Amount (PKR)</label>
              <input
                id="expense-amount"
                type="number"
                min="0"
                step="0.01"
                className="input"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="input-label">Date</label>
              <input
                type="date"
                className="input"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="input-label">Category</label>
            <select
              id="expense-category"
              className="select"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {EXPENSE_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="input-label">Notes</label>
            <input
              type="text"
              className="input"
              placeholder="e.g., Monthly rent payment for September"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {/* Receipt attachment */}
          <div>
            <label className="input-label">Receipt Attachment (optional)</label>
            <label className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-white/15 rounded-xl cursor-pointer hover:border-brand-500/40 hover:bg-brand-500/5 transition-all duration-150">
              <Upload size={20} className="text-slate-500" />
              <span className="text-xs text-slate-500">
                {receiptFile ? receiptFile.name : 'Click to upload image or PDF'}
              </span>
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={e => setReceiptFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">{error}</div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button
              id="expense-submit-btn"
              type="submit"
              disabled={loading}
              className="btn-primary flex-1"
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : 'Log Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

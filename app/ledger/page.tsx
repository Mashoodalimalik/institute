'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import AddExpenseModal from '@/components/AddExpenseModal';
import {
  TrendingUp, TrendingDown, DollarSign, Plus,
  ArrowUpRight, ArrowDownRight, Calendar, Filter,
} from 'lucide-react';
import { LedgerEntry } from '@/lib/types';
import { demoStore } from '@/lib/services/store';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date();
  d.setMonth(d.getMonth() - i);
  return {
    value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    label: d.toLocaleString('en-PK', { month: 'long', year: 'numeric' }),
  };
});

export default function LedgerPage() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [month, setMonth] = useState(currentMonth);
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [loading, setLoading] = useState(true);
  const [showAddExpense, setShowAddExpense] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const data = await demoStore.getLedger(month);
    setEntries(data);
    setLoading(false);
  }, [month]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = typeFilter === 'all' ? entries : entries.filter(e => e.transaction_type === typeFilter);
  const totalIncome = entries.filter(e => e.transaction_type === 'income').reduce((s, e) => s + e.amount, 0);
  const totalExpenses = entries.filter(e => e.transaction_type === 'expense').reduce((s, e) => s + e.amount, 0);
  const netBalance = totalIncome - totalExpenses;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 lg:pl-0 pt-14 lg:pt-0">
        <Header
          title="Financial Ledger"
          subtitle="Track income, expenses and net balance"
          actions={
            <button
              id="add-expense-btn"
              onClick={() => setShowAddExpense(true)}
              className="btn-primary btn-sm"
            >
              <Plus size={14} /> Log Expense
            </button>
          }
        />

        <div className="flex-1 p-6 space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="stat-card card">
              <div className="stat-icon bg-emerald-500/15">
                <TrendingUp size={22} className="text-emerald-400" />
              </div>
              <div>
                <div className="stat-value text-emerald-400">PKR {totalIncome.toLocaleString()}</div>
                <div className="stat-label">Total Income</div>
                <div className="text-xs text-slate-600 mt-1">
                  {MONTH_OPTIONS.find(m => m.value === month)?.label}
                </div>
              </div>
            </div>
            <div className="stat-card card">
              <div className="stat-icon bg-red-500/15">
                <TrendingDown size={22} className="text-red-400" />
              </div>
              <div>
                <div className="stat-value text-red-400">PKR {totalExpenses.toLocaleString()}</div>
                <div className="stat-label">Total Expenses</div>
                <div className="text-xs text-slate-600 mt-1">Operational costs</div>
              </div>
            </div>
            <div className={`stat-card card border ${netBalance >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
              <div className={`stat-icon ${netBalance >= 0 ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                <DollarSign size={22} className={netBalance >= 0 ? 'text-emerald-400' : 'text-red-400'} />
              </div>
              <div>
                <div className={`stat-value ${netBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {netBalance >= 0 ? '' : '−'}PKR {Math.abs(netBalance).toLocaleString()}
                </div>
                <div className="stat-label">Net Balance</div>
                <div className="text-xs text-slate-600 mt-1">{netBalance >= 0 ? 'Surplus' : 'Deficit'}</div>
              </div>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="card">
            <div className="p-5 border-b border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex-1">
                <h2 className="text-base font-bold text-white">Ledger Entries</h2>
                <p className="text-xs text-slate-500 mt-0.5">{filtered.length} transactions</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {/* Month picker */}
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <select
                    value={month}
                    onChange={e => setMonth(e.target.value)}
                    className="select py-2 text-xs pl-8 w-44"
                  >
                    {MONTH_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                {/* Type filter tabs */}
                <div className="flex bg-surface-800 border border-white/10 rounded-xl p-1 gap-1">
                  {(['all', 'income', 'expense'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150 ${
                        typeFilter === t
                          ? 'bg-brand-600 text-white'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto p-2">
              {loading ? (
                <div className="space-y-2 p-3">
                  {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center text-slate-500 py-10">No transactions for this period.</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Student</th>
                      <th>Date</th>
                      <th className="text-right">Amount (PKR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(entry => (
                      <tr key={entry.id}>
                        <td>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            entry.transaction_type === 'income' ? 'bg-emerald-500/15' : 'bg-red-500/15'
                          }`}>
                            {entry.transaction_type === 'income'
                              ? <ArrowUpRight size={14} className="text-emerald-400" />
                              : <ArrowDownRight size={14} className="text-red-400" />
                            }
                          </div>
                        </td>
                        <td>
                          <div className="font-medium text-white text-sm">{entry.category}</div>
                          {entry.notes && <div className="text-xs text-slate-600 truncate max-w-[200px]">{entry.notes}</div>}
                        </td>
                        <td>
                          <span className={entry.transaction_type === 'income' ? 'badge-income' : 'badge-expense'}>
                            {entry.transaction_type.charAt(0).toUpperCase() + entry.transaction_type.slice(1)}
                          </span>
                        </td>
                        <td className="text-xs text-slate-400">{entry.student?.full_name || '—'}</td>
                        <td className="text-xs text-slate-500">
                          {new Date(entry.date).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className={`text-right font-bold text-sm ${
                          entry.transaction_type === 'income' ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {entry.transaction_type === 'income' ? '+' : '−'} {entry.amount.toLocaleString()}
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

      {showAddExpense && (
        <AddExpenseModal
          onClose={() => setShowAddExpense(false)}
          onAdded={loadData}
        />
      )}
    </div>
  );
}

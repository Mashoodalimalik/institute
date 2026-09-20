/**
 * HYBRID DATA STORE & SUPABASE CONNECTOR
 * ───────────────────────────────────────
 * When NEXT_PUBLIC_SUPABASE_URL is configured → connects to live Supabase DB.
 * Otherwise → uses in-memory demo dataset so the dashboard works out of the box.
 */

import { createClient } from '@supabase/supabase-js';
import {
  Profile,
  LedgerEntry,
  AttendanceRecord,
  FeeSettings,
  Receipt,
  DashboardStats,
} from '@/lib/types';

// ================================================================
// SUPABASE CLIENT INITIALIZATION
// ================================================================
const isSupabaseConfigured =
  typeof process !== 'undefined' &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your_supabase');

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

// ================================================================
// DEMO SEED DATA
// ================================================================
export const DEMO_PARENTS: Profile[] = [
  {
    id: 'parent-001',
    role: 'parent',
    full_name: 'Ahmad Malik',
    email: 'ahmad.malik@email.com',
    phone_number: '+923001234567',
    fee_status: 'paid',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'parent-002',
    role: 'parent',
    full_name: 'Fatima Hussain',
    email: 'fatima.h@email.com',
    phone_number: '+923009876543',
    fee_status: 'paid',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'parent-003',
    role: 'parent',
    full_name: 'Bilal Chaudhry',
    email: 'bilal.c@email.com',
    phone_number: '+923005551234',
    fee_status: 'paid',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

const now = new Date();
const thisYear = now.getFullYear();
const thisMonth = String(now.getMonth() + 1).padStart(2, '0');

export let DEMO_STUDENTS: Profile[] = [
  {
    id: 'student-001',
    role: 'student',
    full_name: 'Zara Malik',
    email: 'zara.malik@student.com',
    phone_number: '+923012345678',
    rfid_tag: 'RFID-A1B2',
    biometric_id: 'BIO-001',
    parent_id: 'parent-001',
    class_name: 'Grade 8-A',
    fee_status: 'paid',
    monthly_fee: 5000,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'student-002',
    role: 'student',
    full_name: 'Omar Hussain',
    email: 'omar.h@student.com',
    phone_number: '+923023456789',
    rfid_tag: 'RFID-C3D4',
    biometric_id: 'BIO-002',
    parent_id: 'parent-002',
    class_name: 'Grade 9-B',
    fee_status: 'unpaid',
    monthly_fee: 5500,
    created_at: '2024-01-20T00:00:00Z',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'student-003',
    role: 'student',
    full_name: 'Aisha Chaudhry',
    email: 'aisha.c@student.com',
    phone_number: '+923034567890',
    rfid_tag: 'RFID-E5F6',
    biometric_id: 'BIO-003',
    parent_id: 'parent-003',
    class_name: 'Grade 8-A',
    fee_status: 'overdue',
    monthly_fee: 5000,
    created_at: '2024-02-01T00:00:00Z',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'student-004',
    role: 'student',
    full_name: 'Hassan Malik',
    email: 'hassan.m@student.com',
    phone_number: '+923045678901',
    rfid_tag: 'RFID-G7H8',
    biometric_id: 'BIO-004',
    parent_id: 'parent-001',
    class_name: 'Grade 10-A',
    fee_status: 'paid',
    monthly_fee: 6000,
    created_at: '2024-02-10T00:00:00Z',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'student-005',
    role: 'student',
    full_name: 'Sana Hussain',
    email: 'sana.h@student.com',
    phone_number: '+923056789012',
    rfid_tag: 'RFID-I9J0',
    biometric_id: 'BIO-005',
    parent_id: 'parent-002',
    class_name: 'Grade 9-B',
    fee_status: 'unpaid',
    monthly_fee: 5500,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: new Date().toISOString(),
  },
];

export let DEMO_LEDGER: LedgerEntry[] = [
  { id: 'led-001', student_id: 'student-001', amount: 5000, transaction_type: 'income', category: 'Tuition Fee', notes: 'Monthly fee - Sep 2026', date: `${thisYear}-${thisMonth}-03`, created_at: new Date().toISOString() },
  { id: 'led-002', student_id: 'student-004', amount: 6000, transaction_type: 'income', category: 'Tuition Fee', notes: 'Monthly fee - Sep 2026', date: `${thisYear}-${thisMonth}-04`, created_at: new Date().toISOString() },
  { id: 'led-003', amount: 45000, transaction_type: 'expense', category: 'Rent', notes: 'Monthly building rent', date: `${thisYear}-${thisMonth}-01`, created_at: new Date().toISOString() },
  { id: 'led-004', amount: 8000,  transaction_type: 'expense', category: 'Utilities', notes: 'Electricity + Internet', date: `${thisYear}-${thisMonth}-02`, created_at: new Date().toISOString() },
  { id: 'led-005', amount: 120000, transaction_type: 'expense', category: 'Salaries', notes: '3 teachers - September', date: `${thisYear}-${thisMonth}-01`, created_at: new Date().toISOString() },
  { id: 'led-006', amount: 3500,  transaction_type: 'expense', category: 'Supplies', notes: 'Stationery & markers', date: `${thisYear}-${thisMonth}-05`, created_at: new Date().toISOString() },
];

export let DEMO_ATTENDANCE: AttendanceRecord[] = [
  { id: 'att-001', student_id: 'student-001', timestamp: new Date(Date.now() - 7 * 3600000).toISOString(), type: 'check_in',  created_at: new Date().toISOString() },
  { id: 'att-002', student_id: 'student-001', timestamp: new Date(Date.now() - 1 * 3600000).toISOString(), type: 'check_out', created_at: new Date().toISOString() },
  { id: 'att-003', student_id: 'student-002', timestamp: new Date(Date.now() - 6 * 3600000).toISOString(), type: 'check_in',  created_at: new Date().toISOString() },
  { id: 'att-004', student_id: 'student-003', timestamp: new Date(Date.now() - 8 * 3600000).toISOString(), type: 'check_in',  created_at: new Date().toISOString() },
  { id: 'att-005', student_id: 'student-004', timestamp: new Date(Date.now() - 7 * 3600000).toISOString(), type: 'check_in',  created_at: new Date().toISOString() },
  { id: 'att-006', student_id: 'student-005', timestamp: new Date(Date.now() - 5 * 3600000).toISOString(), type: 'check_in',  created_at: new Date().toISOString() },
];

export let DEMO_RECEIPTS: Receipt[] = [
  { id: 'rec-001', student_id: 'student-001', ledger_id: 'led-001', receipt_number: 'OKI-2026-0001', amount: 5000, discount: 0, payment_method: 'Cash', created_at: new Date().toISOString() },
  { id: 'rec-002', student_id: 'student-004', ledger_id: 'led-002', receipt_number: 'OKI-2026-0002', amount: 6000, discount: 0, payment_method: 'Bank Transfer', created_at: new Date().toISOString() },
];

export const DEMO_FEE_SETTINGS: FeeSettings = {
  id: 'settings-001',
  universal_due_day: 10,
  grace_period_days: 5,
  late_fee_amount: 500,
  late_fee_is_percent: false,
  reminder_interval_days: 3,
  notify_sms: true,
  notify_whatsapp: true,
  institute_name: 'Okasha Institute',
  updated_at: new Date().toISOString(),
};

export let demoSettings: FeeSettings = { ...DEMO_FEE_SETTINGS };

function getParentDemo(parentId?: string): Profile | undefined {
  return DEMO_PARENTS.find(p => p.id === parentId);
}

function enrichStudentsDemo(students: Profile[]): Profile[] {
  return students.map(s => ({
    ...s,
    parent: getParentDemo(s.parent_id),
  }));
}

// ================================================================
// UNIFIED STORE SERVICE
// ================================================================

export const demoStore = {
  // ─── Students ───────────────────────────────────────────────
  async getStudents(filters?: { class_name?: string; fee_status?: string; search?: string }): Promise<Profile[]> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      let query = supabase.from('profiles').select('*, parent:profiles!parent_id(*)').eq('role', 'student');

      if (filters?.class_name && filters.class_name !== 'all') {
        query = query.eq('class_name', filters.class_name);
      }
      if (filters?.fee_status && filters.fee_status !== 'all') {
        query = query.eq('fee_status', filters.fee_status);
      }
      if (filters?.search) {
        query = query.or(`full_name.ilike.%${filters.search}%,rfid_tag.ilike.%${filters.search}%,biometric_id.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Supabase getStudents error:', error);
        return enrichStudentsDemo(DEMO_STUDENTS);
      }
      return data || [];
    }

    // Demo store fallback
    let result = enrichStudentsDemo(DEMO_STUDENTS);
    if (filters?.class_name && filters.class_name !== 'all') {
      result = result.filter(s => s.class_name === filters.class_name);
    }
    if (filters?.fee_status && filters.fee_status !== 'all') {
      result = result.filter(s => s.fee_status === filters.fee_status);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(s =>
        s.full_name.toLowerCase().includes(q) ||
        s.rfid_tag?.toLowerCase().includes(q) ||
        s.biometric_id?.toLowerCase().includes(q) ||
        s.phone_number?.includes(q)
      );
    }
    return result;
  },

  async getStudentById(id: string): Promise<Profile | null> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const { data } = await supabase.from('profiles').select('*, parent:profiles!parent_id(*)').eq('id', id).single();
      return data || null;
    }
    const student = DEMO_STUDENTS.find(s => s.id === id);
    if (!student) return null;
    return { ...student, parent: getParentDemo(student.parent_id) };
  },

  async updateStudent(id: string, data: Partial<Profile>): Promise<Profile> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const { data: updated, error } = await supabase.from('profiles').update(data).eq('id', id).select('*, parent:profiles!parent_id(*)').single();
      if (error) throw error;
      return updated;
    }
    const idx = DEMO_STUDENTS.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Student not found');
    DEMO_STUDENTS[idx] = { ...DEMO_STUDENTS[idx], ...data, updated_at: new Date().toISOString() };
    return { ...DEMO_STUDENTS[idx], parent: getParentDemo(DEMO_STUDENTS[idx].parent_id) };
  },

  async addStudent(data: Partial<Profile>): Promise<Profile> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const payload = {
        role: 'student',
        full_name: data.full_name || 'New Student',
        email: data.email,
        phone_number: data.phone_number,
        rfid_tag: data.rfid_tag,
        biometric_id: data.biometric_id,
        parent_id: data.parent_id,
        class_name: data.class_name,
        fee_status: 'unpaid',
        monthly_fee: data.monthly_fee || 0,
      };
      const { data: created, error } = await supabase.from('profiles').insert(payload).select('*, parent:profiles!parent_id(*)').single();
      if (error) throw error;
      return created;
    }
    const newStudent: Profile = {
      id: `student-${Date.now()}`,
      role: 'student',
      full_name: data.full_name || 'New Student',
      email: data.email,
      phone_number: data.phone_number,
      rfid_tag: data.rfid_tag,
      biometric_id: data.biometric_id,
      parent_id: data.parent_id,
      class_name: data.class_name,
      fee_status: 'unpaid',
      monthly_fee: data.monthly_fee || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    DEMO_STUDENTS.push(newStudent);
    return { ...newStudent, parent: getParentDemo(newStudent.parent_id) };
  },

  // ─── Parents ─────────────────────────────────────────────────
  async getParents(): Promise<Profile[]> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const { data } = await supabase.from('profiles').select('*').eq('role', 'parent');
      return data || [];
    }
    return [...DEMO_PARENTS];
  },

  async addParent(data: { full_name: string; phone_number?: string; email?: string }): Promise<Profile> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const payload = {
        role: 'parent',
        full_name: data.full_name,
        email: data.email,
        phone_number: data.phone_number,
        fee_status: 'paid',
      };
      const { data: created, error } = await supabase.from('profiles').insert(payload).select().single();
      if (error) throw error;
      return created;
    }
    const newParent: Profile = {
      id: `parent-${Date.now()}`,
      role: 'parent',
      full_name: data.full_name,
      email: data.email,
      phone_number: data.phone_number,
      fee_status: 'paid',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    DEMO_PARENTS.push(newParent);
    return newParent;
  },

  getParent(parentId?: string): Profile | undefined {
    return DEMO_PARENTS.find(p => p.id === parentId);
  },

  // ─── Attendance ──────────────────────────────────────────────
  async getAttendanceForStudent(studentId: string): Promise<AttendanceRecord[]> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const { data } = await supabase.from('attendance').select('*').eq('student_id', studentId).order('timestamp', { ascending: false });
      return data || [];
    }
    return DEMO_ATTENDANCE
      .filter(a => a.student_id === studentId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  async getAllAttendanceToday(): Promise<AttendanceRecord[]> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data } = await supabase.from('attendance').select('*, student:profiles!student_id(*)').gte('timestamp', todayStart.toISOString());
      return data || [];
    }
    const today = new Date().toDateString();
    return DEMO_ATTENDANCE.filter(a => new Date(a.timestamp).toDateString() === today);
  },

  async insertAttendance(record: Omit<AttendanceRecord, 'id' | 'created_at'>): Promise<AttendanceRecord> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from('attendance').insert(record).select().single();
      if (error) throw error;
      return data;
    }
    const newRecord: AttendanceRecord = {
      ...record,
      id: `att-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    DEMO_ATTENDANCE.push(newRecord);
    return newRecord;
  },

  async getLastAttendanceForStudent(studentId: string): Promise<AttendanceRecord | null> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const { data } = await supabase.from('attendance').select('*').eq('student_id', studentId).order('timestamp', { ascending: false }).limit(1).maybeSingle();
      return data || null;
    }
    const today = new Date().toDateString();
    const todayRecords = DEMO_ATTENDANCE
      .filter(a => a.student_id === studentId && new Date(a.timestamp).toDateString() === today)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return todayRecords[0] ?? null;
  },

  // ─── Ledger ──────────────────────────────────────────────────
  async getLedger(month?: string): Promise<LedgerEntry[]> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      let query = supabase.from('ledger').select('*, student:profiles!student_id(*)').order('date', { ascending: false });
      if (month) {
        query = query.gte('date', `${month}-01`).lte('date', `${month}-31`);
      }
      const { data } = await query;
      return data || [];
    }
    let entries = [...DEMO_LEDGER].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (month) {
      entries = entries.filter(e => e.date.startsWith(month));
    }
    return entries.map(e => ({
      ...e,
      student: e.student_id ? DEMO_STUDENTS.find(s => s.id === e.student_id) : undefined,
    }));
  },

  async insertLedgerEntry(entry: Omit<LedgerEntry, 'id' | 'created_at'>): Promise<LedgerEntry> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from('ledger').insert(entry).select().single();
      if (error) throw error;
      return data;
    }
    const newEntry: LedgerEntry = {
      ...entry,
      id: `led-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    DEMO_LEDGER.push(newEntry);
    return newEntry;
  },

  // ─── Receipts ────────────────────────────────────────────────
  async getReceiptsForStudent(studentId: string): Promise<Receipt[]> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const { data } = await supabase.from('receipts').select('*').eq('student_id', studentId).order('created_at', { ascending: false });
      return data || [];
    }
    return DEMO_RECEIPTS
      .filter(r => r.student_id === studentId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async insertReceipt(receipt: Omit<Receipt, 'id' | 'created_at'>): Promise<Receipt> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from('receipts').insert(receipt).select().single();
      if (error) throw error;
      return data;
    }
    const newReceipt: Receipt = {
      ...receipt,
      id: `rec-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    DEMO_RECEIPTS.push(newReceipt);
    return newReceipt;
  },

  // ─── Fee Settings ────────────────────────────────────────────
  async getFeeSettings(): Promise<FeeSettings> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const { data } = await supabase.from('fee_settings').select('*').limit(1).maybeSingle();
      if (data) return data;
    }
    return { ...demoSettings };
  },

  async updateFeeSettings(data: Partial<FeeSettings>): Promise<FeeSettings> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const existing = await this.getFeeSettings();
      const { data: updated, error } = await supabase.from('fee_settings').update(data).eq('id', existing.id).select().single();
      if (error) throw error;
      return updated;
    }
    demoSettings = { ...demoSettings, ...data, updated_at: new Date().toISOString() };
    return { ...demoSettings };
  },

  // ─── Dashboard Stats ─────────────────────────────────────────
  async getDashboardStats(): Promise<DashboardStats> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const { data: students } = await supabase.from('profiles').select('fee_status').eq('role', 'student');
      const total_students = students?.length || 0;
      const paid_count = students?.filter(s => s.fee_status === 'paid').length || 0;
      const unpaid_count = students?.filter(s => s.fee_status === 'unpaid').length || 0;
      const overdue_count = students?.filter(s => s.fee_status === 'overdue').length || 0;

      const monthStr = `${thisYear}-${thisMonth}`;
      const { data: ledger } = await supabase.from('ledger').select('amount, transaction_type').gte('date', `${monthStr}-01`);
      const monthly_income = ledger?.filter(e => e.transaction_type === 'income').reduce((sum, e) => sum + Number(e.amount), 0) || 0;
      const monthly_expenses = ledger?.filter(e => e.transaction_type === 'expense').reduce((sum, e) => sum + Number(e.amount), 0) || 0;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: att } = await supabase.from('attendance').select('student_id').gte('timestamp', todayStart.toISOString());
      const todays_attendance = new Set(att?.map(a => a.student_id)).size;

      return {
        total_students,
        paid_count,
        unpaid_count,
        overdue_count,
        monthly_income,
        monthly_expenses,
        net_balance: monthly_income - monthly_expenses,
        todays_attendance,
      };
    }

    const monthStr = `${thisYear}-${thisMonth}`;
    const monthlyEntries = DEMO_LEDGER.filter(e => e.date.startsWith(monthStr));
    const monthlyIncome = monthlyEntries
      .filter(e => e.transaction_type === 'income')
      .reduce((sum, e) => sum + e.amount, 0);
    const monthlyExpenses = monthlyEntries
      .filter(e => e.transaction_type === 'expense')
      .reduce((sum, e) => sum + e.amount, 0);

    const today = new Date().toDateString();
    const todayAtt = DEMO_ATTENDANCE.filter(a => new Date(a.timestamp).toDateString() === today);
    const uniqueToday = new Set(todayAtt.map(a => a.student_id)).size;

    return {
      total_students: DEMO_STUDENTS.length,
      paid_count: DEMO_STUDENTS.filter(s => s.fee_status === 'paid').length,
      unpaid_count: DEMO_STUDENTS.filter(s => s.fee_status === 'unpaid').length,
      overdue_count: DEMO_STUDENTS.filter(s => s.fee_status === 'overdue').length,
      monthly_income: monthlyIncome,
      monthly_expenses: monthlyExpenses,
      net_balance: monthlyIncome - monthlyExpenses,
      todays_attendance: uniqueToday,
    };
  },

  // ─── Find by biometric / RFID ────────────────────────────────
  async findStudentByBiometric(userId: string): Promise<Profile | null> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('profiles')
        .select('*, parent:profiles!parent_id(*)')
        .or(`biometric_id.eq.${userId},rfid_tag.eq.${userId}`)
        .maybeSingle();
      return data || null;
    }
    const student = DEMO_STUDENTS.find(
      s => s.biometric_id === userId || s.rfid_tag === userId
    );
    return student ? { ...student, parent: getParentDemo(student.parent_id) } : null;
  },

  // ─── All Students needing fee reminders ──────────────────────
  async getStudentsNeedingReminders(settings: FeeSettings): Promise<Profile[]> {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('profiles')
        .select('*, parent:profiles!parent_id(*)')
        .eq('role', 'student')
        .neq('fee_status', 'paid');
      return data || [];
    }
    const today = new Date();
    return DEMO_STUDENTS
      .filter(s => s.fee_status !== 'paid')
      .filter(s => {
        if (!s.last_reminder_sent) return true;
        const daysSince = (today.getTime() - new Date(s.last_reminder_sent).getTime()) / 86400000;
        return daysSince >= settings.reminder_interval_days;
      })
      .map(s => ({ ...s, parent: getParentDemo(s.parent_id) }));
  },

  getUniqueClasses(): string[] {
    return Array.from(new Set(DEMO_STUDENTS.map(s => s.class_name).filter(Boolean) as string[])).sort();
  },
};

export function generateReceiptNumber(): string {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `OKI-${year}-${randomNum}`;
}

export const dataService = isSupabaseConfigured ? null : demoStore;
export { isSupabaseConfigured };

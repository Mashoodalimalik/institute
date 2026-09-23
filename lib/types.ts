// ================================================================
// OKASHA INSTITUTE - TYPE DEFINITIONS
// ================================================================

export type UserRole = 'super_admin' | 'staff' | 'student' | 'parent';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type FeeStatus = 'paid' | 'unpaid' | 'overdue';
export type AttendanceType = 'check_in' | 'check_out';
export type TransactionType = 'income' | 'expense';

export interface Profile {
  id: string;
  role: UserRole | null;
  status?: ApprovalStatus;
  requested_role?: string;
  full_name: string;
  email?: string;
  phone_number?: string;
  rfid_tag?: string;
  biometric_id?: string;
  parent_id?: string;
  class_name?: string;
  fee_status: FeeStatus;
  last_reminder_sent?: string;
  monthly_fee?: number;
  web_push_sub?: any | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  parent?: Profile;
  children?: Profile[];
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  timestamp: string;
  type: AttendanceType;
  device_id?: string;
  created_at: string;
  // Joined
  student?: Profile;
}

export interface LedgerEntry {
  id: string;
  student_id?: string;
  amount: number;
  transaction_type: TransactionType;
  category: string;
  notes?: string;
  date: string;
  receipt_url?: string;
  created_by?: string;
  created_at: string;
  // Joined
  student?: Profile;
}

export interface FeeSettings {
  id: string;
  universal_due_day: number;
  grace_period_days: number;
  late_fee_amount: number;
  late_fee_is_percent: boolean;
  reminder_interval_days: number;
  notify_sms: boolean;
  notify_whatsapp: boolean;
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  twilio_phone_number?: string;
  whatsapp_from_number?: string;
  institute_name: string;
  institute_logo_url?: string;
  updated_at: string;
}

export interface Receipt {
  id: string;
  student_id: string;
  ledger_id?: string;
  receipt_number: string;
  pdf_url?: string;
  amount: number;
  discount: number;
  payment_method: string;
  created_at: string;
  // Joined
  student?: Profile;
}

export interface CollectFeePayload {
  student_id: string;
  amount: number;
  discount: number;
  payment_method: 'Cash' | 'Bank Transfer' | 'Online';
  notes?: string;
}

export interface BiometricPushPayload {
  user_id: string;       // biometric_id or rfid_tag value
  id_type?: 'biometric' | 'rfid';
  timestamp: string;     // ISO8601
  device_id?: string;
  secret: string;
}

export interface DashboardStats {
  total_students: number;
  paid_count: number;
  unpaid_count: number;
  overdue_count: number;
  monthly_income: number;
  monthly_expenses: number;
  net_balance: number;
  todays_attendance: number;
}

export interface ExpenseCategory {
  label: string;
  value: string;
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { label: 'Rent', value: 'rent' },
  { label: 'Utilities', value: 'utilities' },
  { label: 'Salaries', value: 'salaries' },
  { label: 'Supplies', value: 'supplies' },
  { label: 'Maintenance', value: 'maintenance' },
  { label: 'Marketing', value: 'marketing' },
  { label: 'IT / Technology', value: 'it_technology' },
  { label: 'Miscellaneous', value: 'miscellaneous' },
];

export const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Online'] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

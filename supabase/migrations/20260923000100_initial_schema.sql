-- ================================================================
-- OKASHA INSTITUTE - SUPABASE DATABASE SCHEMA
-- Run this in Supabase SQL Editor after creating your project
-- ================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================
-- ENUMS
-- ========================
CREATE TYPE user_role AS ENUM ('super_admin', 'staff', 'student', 'parent');
CREATE TYPE fee_status AS ENUM ('paid', 'unpaid', 'overdue');
CREATE TYPE attendance_type AS ENUM ('check_in', 'check_out');
CREATE TYPE transaction_type AS ENUM ('income', 'expense');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');

-- ========================
-- TABLE: profiles
-- ========================
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role            user_role,                          -- NULL until admin assigns
  status          approval_status NOT NULL DEFAULT 'pending',
  requested_role  TEXT,                               -- self-reported at signup
  full_name       TEXT NOT NULL,
  email           TEXT,
  phone_number    TEXT,
  rfid_tag        TEXT UNIQUE,
  biometric_id    TEXT UNIQUE,
  parent_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  class_name      TEXT,
  fee_status      fee_status NOT NULL DEFAULT 'unpaid',
  last_reminder_sent TIMESTAMPTZ,
  monthly_fee     NUMERIC(10,2) DEFAULT 0,
  web_push_sub    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- TABLE: attendance
-- ========================
CREATE TABLE IF NOT EXISTS attendance (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type        attendance_type NOT NULL,
  device_id   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- TABLE: ledger
-- ========================
CREATE TABLE IF NOT EXISTS ledger (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  amount           NUMERIC(10,2) NOT NULL,
  transaction_type transaction_type NOT NULL,
  category         TEXT NOT NULL,
  notes            TEXT,
  date             DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url      TEXT,
  created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- TABLE: fee_settings
-- ========================
CREATE TABLE IF NOT EXISTS fee_settings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  universal_due_day     INTEGER NOT NULL DEFAULT 5 CHECK (universal_due_day BETWEEN 1 AND 31),
  grace_period_days     INTEGER NOT NULL DEFAULT 3,
  late_fee_amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
  late_fee_is_percent   BOOLEAN NOT NULL DEFAULT false,
  reminder_interval_days INTEGER NOT NULL DEFAULT 3,
  notify_sms            BOOLEAN NOT NULL DEFAULT false,
  notify_whatsapp       BOOLEAN NOT NULL DEFAULT false,
  twilio_account_sid    TEXT,
  twilio_auth_token     TEXT,
  twilio_phone_number   TEXT,
  whatsapp_from_number  TEXT,
  institute_name        TEXT NOT NULL DEFAULT 'Okasha Institute',
  institute_logo_url    TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default fee_settings row
INSERT INTO fee_settings (id) VALUES (uuid_generate_v4()) ON CONFLICT DO NOTHING;

-- ========================
-- TABLE: receipts
-- ========================
CREATE TABLE IF NOT EXISTS receipts (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ledger_id      UUID REFERENCES ledger(id) ON DELETE SET NULL,
  receipt_number TEXT UNIQUE NOT NULL,
  pdf_url        TEXT,
  amount         NUMERIC(10,2) NOT NULL,
  discount       NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'Cash',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- INDEXES
-- ========================
CREATE INDEX IF NOT EXISTS idx_profiles_role          ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_fee_status    ON profiles(fee_status);
CREATE INDEX IF NOT EXISTS idx_profiles_parent_id     ON profiles(parent_id);
CREATE INDEX IF NOT EXISTS idx_profiles_rfid          ON profiles(rfid_tag);
CREATE INDEX IF NOT EXISTS idx_profiles_biometric     ON profiles(biometric_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student     ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_timestamp   ON attendance(timestamp);
CREATE INDEX IF NOT EXISTS idx_ledger_student         ON ledger(student_id);
CREATE INDEX IF NOT EXISTS idx_ledger_date            ON ledger(date);
CREATE INDEX IF NOT EXISTS idx_receipts_student       ON receipts(student_id);
CREATE INDEX IF NOT EXISTS idx_receipts_number        ON receipts(receipt_number);

-- ========================
-- TRIGGERS
-- ========================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status, requested_role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NULL,                                              -- role assigned by admin
    'pending',                                         -- must be approved first
    COALESCE(NEW.raw_user_meta_data->>'requested_role', 'student')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ========================
-- MIGRATION: run if table already exists
-- ========================
-- ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status approval_status NOT NULL DEFAULT 'pending';
-- ALTER TABLE profiles ADD COLUMN IF NOT EXISTS requested_role TEXT;
-- ALTER TABLE profiles ALTER COLUMN role DROP NOT NULL;
-- UPDATE profiles SET status = 'approved' WHERE role IS NOT NULL;  -- approve existing users
-- UPDATE profiles SET role = NULL WHERE role = 'student' AND status = 'pending'; -- optional cleanup

-- ========================
-- ROW-LEVEL SECURITY (RLS)
-- ========================
ALTER TABLE profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts    ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROFILES
CREATE POLICY "admin_staff_read_all_profiles" ON profiles FOR SELECT USING (get_my_role() IN ('super_admin', 'staff'));
CREATE POLICY "admin_staff_insert_profiles"   ON profiles FOR INSERT WITH CHECK (get_my_role() IN ('super_admin', 'staff'));
CREATE POLICY "admin_staff_update_profiles"   ON profiles FOR UPDATE USING (get_my_role() IN ('super_admin', 'staff'));
CREATE POLICY "super_admin_delete_profiles"   ON profiles FOR DELETE USING (get_my_role() = 'super_admin');
CREATE POLICY "student_read_own_profile"      ON profiles FOR SELECT USING (auth.uid() = id AND get_my_role() = 'student');
CREATE POLICY "parent_read_own_and_children"  ON profiles FOR SELECT USING (get_my_role() = 'parent' AND (auth.uid() = id OR parent_id = auth.uid()));

-- ATTENDANCE
CREATE POLICY "admin_staff_all_attendance"       ON attendance FOR ALL    USING (get_my_role() IN ('super_admin', 'staff'));
CREATE POLICY "student_read_own_attendance"      ON attendance FOR SELECT USING (student_id = auth.uid() AND get_my_role() = 'student');
CREATE POLICY "parent_read_children_attendance"  ON attendance FOR SELECT USING (get_my_role() = 'parent' AND student_id IN (SELECT id FROM profiles WHERE parent_id = auth.uid()));
CREATE POLICY "service_role_insert_attendance"   ON attendance FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- LEDGER
CREATE POLICY "admin_staff_all_ledger"       ON ledger FOR ALL    USING (get_my_role() IN ('super_admin', 'staff'));
CREATE POLICY "student_read_own_ledger"      ON ledger FOR SELECT USING (student_id = auth.uid() AND get_my_role() = 'student');
CREATE POLICY "parent_read_children_ledger"  ON ledger FOR SELECT USING (get_my_role() = 'parent' AND student_id IN (SELECT id FROM profiles WHERE parent_id = auth.uid()));

-- FEE_SETTINGS
CREATE POLICY "admin_read_fee_settings"        ON fee_settings FOR SELECT USING (get_my_role() IN ('super_admin', 'staff'));
CREATE POLICY "super_admin_modify_fee_settings" ON fee_settings FOR ALL   USING (get_my_role() = 'super_admin');

-- RECEIPTS
CREATE POLICY "admin_staff_all_receipts"      ON receipts FOR ALL    USING (get_my_role() IN ('super_admin', 'staff'));
CREATE POLICY "student_read_own_receipts"     ON receipts FOR SELECT USING (student_id = auth.uid() AND get_my_role() = 'student');
CREATE POLICY "parent_read_children_receipts" ON receipts FOR SELECT USING (get_my_role() = 'parent' AND student_id IN (SELECT id FROM profiles WHERE parent_id = auth.uid()));

-- ================================================================
-- OKASHA INSTITUTE - COMPLETE SUPABASE SETUP SCRIPT
-- Run this in your Supabase Project -> SQL Editor
-- Includes all core schema, functions, triggers, RLS, & storage
-- ================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUMS
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('super_admin', 'staff', 'student', 'parent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fee_status AS ENUM ('paid', 'unpaid', 'overdue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.attendance_type AS ENUM ('check_in', 'check_out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.transaction_type AS ENUM ('income', 'expense');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. SEQUENCES
CREATE SEQUENCE IF NOT EXISTS public.receipt_number_seq START WITH 1;

-- 4. TABLES

-- PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id       UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  role               public.user_role,
  status             public.approval_status NOT NULL DEFAULT 'pending',
  requested_role     TEXT,
  full_name          TEXT NOT NULL,
  email              TEXT,
  phone_number       TEXT,
  rfid_tag           TEXT UNIQUE,
  biometric_id       TEXT UNIQUE,
  parent_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  class_name         TEXT,
  fee_status         public.fee_status NOT NULL DEFAULT 'unpaid',
  last_reminder_sent TIMESTAMPTZ,
  monthly_fee        NUMERIC(10,2) DEFAULT 0 CONSTRAINT monthly_fee_nonnegative CHECK (monthly_fee >= 0),
  web_push_sub       JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- In case profiles table already existed from earlier schema without auth_user_id:
DO $$ BEGIN
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
  ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='auth_user_id') THEN
    ALTER TABLE public.profiles ADD COLUMN auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ATTENDANCE
CREATE TABLE IF NOT EXISTS public.attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type            public.attendance_type NOT NULL,
  device_id       TEXT,
  source_event_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- LEDGER
CREATE TABLE IF NOT EXISTS public.ledger (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  amount           NUMERIC(10,2) NOT NULL CONSTRAINT ledger_amount_positive CHECK (amount > 0),
  transaction_type public.transaction_type NOT NULL,
  category         TEXT NOT NULL,
  notes            TEXT,
  date             DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url      TEXT,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FEE SETTINGS
CREATE TABLE IF NOT EXISTS public.fee_settings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  universal_due_day      INTEGER NOT NULL DEFAULT 5 CHECK (universal_due_day BETWEEN 1 AND 31),
  grace_period_days      INTEGER NOT NULL DEFAULT 3 CHECK (grace_period_days >= 0),
  late_fee_amount        NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (late_fee_amount >= 0),
  late_fee_is_percent    BOOLEAN NOT NULL DEFAULT false,
  reminder_interval_days INTEGER NOT NULL DEFAULT 3 CHECK (reminder_interval_days >= 1),
  notify_sms             BOOLEAN NOT NULL DEFAULT false,
  notify_whatsapp        BOOLEAN NOT NULL DEFAULT false,
  institute_name         TEXT NOT NULL DEFAULT 'Okasha Institute',
  institute_logo_url     TEXT,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RECEIPTS
CREATE TABLE IF NOT EXISTS public.receipts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ledger_id      UUID REFERENCES public.ledger(id) ON DELETE SET NULL,
  receipt_number TEXT UNIQUE NOT NULL,
  pdf_url        TEXT,
  amount         NUMERIC(10,2) NOT NULL,
  discount       NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'Cash',
  request_id     UUID UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_payment CHECK (amount > 0 AND discount >= 0 AND discount <= amount)
);

-- 5. DEFAULT SETTINGS ROW
INSERT INTO public.fee_settings (institute_name)
SELECT 'Okasha Institute'
WHERE NOT EXISTS (SELECT 1 FROM public.fee_settings);

-- 6. INDEXES
CREATE INDEX IF NOT EXISTS idx_profiles_role          ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_fee_status    ON public.profiles(fee_status);
CREATE INDEX IF NOT EXISTS idx_profiles_parent_id     ON public.profiles(parent_id);
CREATE INDEX IF NOT EXISTS idx_profiles_rfid          ON public.profiles(rfid_tag);
CREATE INDEX IF NOT EXISTS idx_profiles_biometric     ON public.profiles(biometric_id);
CREATE INDEX IF NOT EXISTS idx_profiles_auth_user_id  ON public.profiles(auth_user_id);

CREATE INDEX IF NOT EXISTS idx_attendance_student     ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_timestamp   ON public.attendance(timestamp);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_source_event ON public.attendance(device_id, source_event_id) WHERE source_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_same_punch ON public.attendance(student_id, timestamp, COALESCE(device_id, ''));

CREATE INDEX IF NOT EXISTS idx_ledger_student         ON public.ledger(student_id);
CREATE INDEX IF NOT EXISTS idx_ledger_date            ON public.ledger(date);

CREATE UNIQUE INDEX IF NOT EXISTS one_fee_settings    ON public.fee_settings ((true));

CREATE INDEX IF NOT EXISTS idx_receipts_student       ON public.receipts(student_id);
CREATE INDEX IF NOT EXISTS idx_receipts_number        ON public.receipts(receipt_number);
CREATE INDEX IF NOT EXISTS idx_receipts_request_id    ON public.receipts(request_id);

-- 7. HELPER FUNCTIONS

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, auth_user_id, email, full_name, status, requested_role)
  VALUES (
    NEW.id,
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1), 'New user'),
    'pending',
    COALESCE(NEW.raw_user_meta_data->>'requested_role','student')
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE auth_user_id = auth.uid() AND status = 'approved';
$$;

CREATE OR REPLACE FUNCTION public.get_my_profile_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_access()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.role() = 'authenticated' AND public.get_my_role() IS DISTINCT FROM 'super_admin' THEN
    IF (NEW.role, NEW.status, NEW.auth_user_id, NEW.id) IS DISTINCT FROM (OLD.role, OLD.status, OLD.auth_user_id, OLD.id) THEN
      RAISE EXCEPTION 'Only an administrator may change account access';
    END IF;
    IF OLD.role NOT IN ('student','parent') THEN
      RAISE EXCEPTION 'Staff may only edit students and parents';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_device_punch(p_student uuid, p_timestamp timestamptz, p_device text, p_source text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  previous public.attendance;
  existing public.attendance;
  recorded public.attendance;
  kind public.attendance_type;
BEGIN
  IF p_timestamp IS NULL OR p_timestamp > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Invalid device time';
  END IF;
  PERFORM 1 FROM public.profiles WHERE id = p_student AND role = 'student' AND status = 'approved' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approved student not found';
  END IF;

  IF p_source IS NOT NULL THEN
    SELECT * INTO existing FROM public.attendance WHERE device_id = p_device AND source_event_id = p_source;
    IF FOUND THEN RETURN to_jsonb(existing); END IF;
  END IF;

  SELECT * INTO existing FROM public.attendance
  WHERE student_id = p_student AND timestamp = p_timestamp AND COALESCE(device_id, '') = COALESCE(p_device, '');
  IF FOUND THEN RETURN to_jsonb(existing); END IF;

  SELECT * INTO previous FROM public.attendance
  WHERE student_id = p_student
    AND (timestamp AT TIME ZONE 'Asia/Karachi')::date = (p_timestamp AT TIME ZONE 'Asia/Karachi')::date
    AND timestamp < p_timestamp
  ORDER BY timestamp DESC LIMIT 1;

  kind := CASE WHEN previous.type = 'check_in' THEN 'check_out'::public.attendance_type ELSE 'check_in'::public.attendance_type END;

  INSERT INTO public.attendance(student_id, timestamp, type, device_id, source_event_id)
  VALUES (p_student, p_timestamp, kind, p_device, p_source)
  RETURNING * INTO recorded;

  RETURN to_jsonb(recorded);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_fee_status(p_student uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  month_start date;
  due date;
  settings public.fee_settings;
BEGIN
  month_start := date_trunc('month', today)::date;
  SELECT * INTO settings FROM public.fee_settings LIMIT 1;
  due := month_start + (least(settings.universal_due_day,
    extract(day FROM (month_start + interval '1 month - 1 day'))::integer) - 1) + settings.grace_period_days;
  
  UPDATE public.profiles p SET fee_status = CASE
    WHEN COALESCE((SELECT sum(r.amount) FROM public.receipts r WHERE r.student_id = p.id
      AND (r.created_at AT TIME ZONE 'Asia/Karachi')::date >= month_start
      AND (r.created_at AT TIME ZONE 'Asia/Karachi')::date < (month_start + interval '1 month')::date), 0) >= COALESCE(p.monthly_fee, 0)
      THEN 'paid'::public.fee_status
    WHEN today > due THEN 'overdue'::public.fee_status
    ELSE 'unpaid'::public.fee_status
  END
  WHERE p.role = 'student' AND p.status = 'approved' AND (p_student IS NULL OR p.id = p_student);
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_fee_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_fee_status(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.collect_fee(
  p_student uuid,
  p_amount numeric,
  p_discount numeric,
  p_method text,
  p_notes text,
  p_request uuid,
  p_actor uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  receipt public.receipts;
  entry_id uuid;
  number text;
BEGIN
  IF p_amount IS NULL OR p_discount IS NULL OR p_amount <= 0 OR p_discount < 0 OR p_discount >= p_amount OR
     p_method IS NULL OR p_method NOT IN ('Cash', 'Bank Transfer', 'Online') OR p_request IS NULL THEN
    RAISE EXCEPTION 'Invalid payment';
  END IF;
  
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO receipt FROM public.receipts WHERE request_id = p_request;
  IF FOUND THEN
    IF receipt.student_id <> p_student OR receipt.amount <> p_amount OR receipt.discount <> p_discount OR receipt.payment_method <> p_method THEN
      RAISE EXCEPTION 'Payment request already used with different details';
    END IF;
    RETURN to_jsonb(receipt);
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_student AND role = 'student' AND status = 'approved' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approved student not found';
  END IF;

  number := 'OKI-' || to_char(now() AT TIME ZONE 'Asia/Karachi', 'YYYY') || '-' || lpad(nextval('public.receipt_number_seq')::text, 6, '0');
  INSERT INTO public.ledger(student_id, amount, transaction_type, category, notes, date, created_by)
    VALUES(p_student, p_amount - p_discount, 'income', 'Tuition Fee', COALESCE(p_notes, 'Receipt ' || number), (now() AT TIME ZONE 'Asia/Karachi')::date, p_actor)
    RETURNING id INTO entry_id;

  INSERT INTO public.receipts(student_id, ledger_id, receipt_number, amount, discount, payment_method, request_id)
    VALUES(p_student, entry_id, number, p_amount, p_discount, p_method, p_request)
    RETURNING * INTO receipt;

  PERFORM public.refresh_fee_status(p_student);
  RETURN to_jsonb(receipt);
END;
$$;
REVOKE ALL ON FUNCTION public.collect_fee(uuid,numeric,numeric,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collect_fee(uuid,numeric,numeric,text,text,uuid,uuid) TO service_role;

-- 8. TRIGGERS
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS protect_profile_access ON public.profiles;
CREATE TRIGGER protect_profile_access
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_access();

-- 9. ROW-LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

-- Clean existing policies to prevent duplicate errors
DROP POLICY IF EXISTS "own_profile_read" ON public.profiles;
DROP POLICY IF EXISTS "admin_staff_read_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "admin_staff_insert_profiles" ON public.profiles;
DROP POLICY IF EXISTS "admin_staff_update_profiles" ON public.profiles;
DROP POLICY IF EXISTS "super_admin_delete_profiles" ON public.profiles;
DROP POLICY IF EXISTS "student_read_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "parent_read_own_and_children" ON public.profiles;

CREATE POLICY "own_profile_read" ON public.profiles FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "admin_staff_read_all_profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'staff'));

CREATE POLICY "admin_staff_insert_profiles" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    public.get_my_role() = 'super_admin' OR
    (public.get_my_role() = 'staff' AND role IN ('student', 'parent') AND status = 'approved' AND auth_user_id IS NULL)
  );

CREATE POLICY "admin_staff_update_profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'staff'));

CREATE POLICY "super_admin_delete_profiles" ON public.profiles FOR DELETE TO authenticated
  USING (public.get_my_role() = 'super_admin');

CREATE POLICY "student_read_own_profile" ON public.profiles FOR SELECT TO authenticated
  USING (public.get_my_role() = 'student' AND id = public.get_my_profile_id());

CREATE POLICY "parent_read_own_and_children" ON public.profiles FOR SELECT TO authenticated
  USING (public.get_my_role() = 'parent' AND (id = public.get_my_profile_id() OR parent_id = public.get_my_profile_id()));

-- ATTENDANCE POLICIES
DROP POLICY IF EXISTS "admin_staff_all_attendance" ON public.attendance;
DROP POLICY IF EXISTS "student_read_own_attendance" ON public.attendance;
DROP POLICY IF EXISTS "parent_read_children_attendance" ON public.attendance;
DROP POLICY IF EXISTS "service_role_insert_attendance" ON public.attendance;

CREATE POLICY "admin_staff_all_attendance" ON public.attendance FOR ALL TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'staff'));

CREATE POLICY "student_read_own_attendance" ON public.attendance FOR SELECT TO authenticated
  USING (public.get_my_role() = 'student' AND student_id = public.get_my_profile_id());

CREATE POLICY "parent_read_children_attendance" ON public.attendance FOR SELECT TO authenticated
  USING (public.get_my_role() = 'parent' AND student_id IN (SELECT id FROM public.profiles WHERE parent_id = public.get_my_profile_id()));

CREATE POLICY "service_role_insert_attendance" ON public.attendance FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- LEDGER POLICIES
DROP POLICY IF EXISTS "admin_staff_all_ledger" ON public.ledger;
DROP POLICY IF EXISTS "student_read_own_ledger" ON public.ledger;
DROP POLICY IF EXISTS "parent_read_children_ledger" ON public.ledger;

CREATE POLICY "admin_staff_all_ledger" ON public.ledger FOR ALL TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'staff'));

CREATE POLICY "student_read_own_ledger" ON public.ledger FOR SELECT TO authenticated
  USING (public.get_my_role() = 'student' AND student_id = public.get_my_profile_id());

CREATE POLICY "parent_read_children_ledger" ON public.ledger FOR SELECT TO authenticated
  USING (public.get_my_role() = 'parent' AND student_id IN (SELECT id FROM public.profiles WHERE parent_id = public.get_my_profile_id()));

-- FEE SETTINGS POLICIES
DROP POLICY IF EXISTS "admin_read_fee_settings" ON public.fee_settings;
DROP POLICY IF EXISTS "super_admin_modify_fee_settings" ON public.fee_settings;

CREATE POLICY "admin_read_fee_settings" ON public.fee_settings FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'staff'));

CREATE POLICY "super_admin_modify_fee_settings" ON public.fee_settings FOR ALL TO authenticated
  USING (public.get_my_role() = 'super_admin');

-- RECEIPTS POLICIES
DROP POLICY IF EXISTS "admin_staff_all_receipts" ON public.receipts;
DROP POLICY IF EXISTS "student_read_own_receipts" ON public.receipts;
DROP POLICY IF EXISTS "parent_read_children_receipts" ON public.receipts;

CREATE POLICY "admin_staff_all_receipts" ON public.receipts FOR ALL TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'staff'));

CREATE POLICY "student_read_own_receipts" ON public.receipts FOR SELECT TO authenticated
  USING (public.get_my_role() = 'student' AND student_id = public.get_my_profile_id());

CREATE POLICY "parent_read_children_receipts" ON public.receipts FOR SELECT TO authenticated
  USING (public.get_my_role() = 'parent' AND student_id IN (SELECT id FROM public.profiles WHERE parent_id = public.get_my_profile_id()));

-- 10. STORAGE SETUP
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('expense-receipts', 'expense-receipts', false, 5242880, ARRAY['image/jpeg', 'image/png', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "admin_expense_files" ON storage.objects;
CREATE POLICY "admin_expense_files" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'expense-receipts' AND public.get_my_role() = 'super_admin')
  WITH CHECK (bucket_id = 'expense-receipts' AND public.get_my_role() = 'super_admin');

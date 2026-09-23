-- Admissions may exist before a student or parent has a login.
ALTER TABLE public.profiles DROP CONSTRAINT profiles_id_fkey;
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.profiles ADD COLUMN auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
UPDATE public.profiles SET auth_user_id = id WHERE id IN (SELECT id FROM auth.users);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, auth_user_id, email, full_name, status, requested_role)
  VALUES (NEW.id, NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1), 'New user'),
    'pending', COALESCE(NEW.raw_user_meta_data->>'requested_role','student'));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS public.user_role
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE auth_user_id = auth.uid() AND status = 'approved';
$$;

CREATE POLICY own_profile_read ON public.profiles FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
DROP POLICY admin_staff_insert_profiles ON public.profiles;
CREATE POLICY admin_staff_insert_profiles ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'super_admin' OR
    (get_my_role() = 'staff' AND role IN ('student','parent') AND status = 'approved' AND auth_user_id IS NULL));

-- RLS controls rows; this trigger also protects privileged columns.
CREATE FUNCTION public.protect_profile_access() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.role() = 'authenticated' AND public.get_my_role() IS DISTINCT FROM 'super_admin' THEN
    IF (NEW.role, NEW.status, NEW.auth_user_id, NEW.id) IS DISTINCT FROM (OLD.role, OLD.status, OLD.auth_user_id, OLD.id) THEN
      RAISE EXCEPTION 'Only an administrator may change account access';
    END IF;
    IF OLD.role NOT IN ('student','parent') THEN RAISE EXCEPTION 'Staff may only edit students and parents'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_profile_access BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_access();

ALTER TABLE public.profiles ADD CONSTRAINT monthly_fee_nonnegative CHECK (monthly_fee >= 0);
ALTER TABLE public.ledger ADD CONSTRAINT ledger_amount_positive CHECK (amount > 0);
ALTER TABLE public.receipts ADD CONSTRAINT valid_payment CHECK (amount > 0 AND discount >= 0 AND discount <= amount);
ALTER TABLE public.fee_settings ADD CONSTRAINT valid_fee_rules CHECK
  (grace_period_days >= 0 AND late_fee_amount >= 0 AND reminder_interval_days >= 1);

-- The app reads one settings record. Enforce this in PostgreSQL too.
CREATE UNIQUE INDEX one_fee_settings ON public.fee_settings ((true));
ALTER TABLE public.attendance ADD COLUMN source_event_id text;
CREATE UNIQUE INDEX attendance_source_event ON public.attendance(device_id, source_event_id) WHERE source_event_id IS NOT NULL;
CREATE UNIQUE INDEX attendance_same_punch ON public.attendance(student_id, timestamp, COALESCE(device_id, ''));

CREATE FUNCTION public.record_device_punch(p_student uuid, p_timestamp timestamptz, p_device text, p_source text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE previous public.attendance; existing public.attendance; recorded public.attendance; kind public.attendance_type;
BEGIN
  IF p_timestamp IS NULL OR p_timestamp > now() + interval '5 minutes' THEN RAISE EXCEPTION 'Invalid device time'; END IF;
  PERFORM 1 FROM public.profiles WHERE id = p_student AND role = 'student' AND status = 'approved' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approved student not found'; END IF;
  SELECT * INTO existing FROM public.attendance WHERE student_id = p_student AND
    ((timestamp = p_timestamp AND COALESCE(device_id,'') = COALESCE(p_device,'')) OR
     (p_source IS NOT NULL AND source_event_id = p_source AND device_id = p_device)) LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('record', to_jsonb(existing), 'duplicate', true); END IF;
  -- Determine direction using the punch's local date, not the server's current day.
  SELECT * INTO previous FROM public.attendance WHERE student_id = p_student AND timestamp < p_timestamp
    AND (timestamp AT TIME ZONE 'Asia/Karachi')::date = (p_timestamp AT TIME ZONE 'Asia/Karachi')::date
    ORDER BY timestamp DESC LIMIT 1;
  kind := CASE WHEN previous.type = 'check_in' THEN 'check_out'::public.attendance_type ELSE 'check_in'::public.attendance_type END;
  INSERT INTO public.attendance(student_id,timestamp,type,device_id,source_event_id)
    VALUES(p_student,p_timestamp,kind,p_device,p_source) RETURNING * INTO recorded;
  -- Recovered punches can arrive out of order; restore alternating order for this date.
  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY timestamp,id) AS n FROM public.attendance
    WHERE student_id = p_student AND (timestamp AT TIME ZONE 'Asia/Karachi')::date = (p_timestamp AT TIME ZONE 'Asia/Karachi')::date
  ) UPDATE public.attendance a SET type = CASE WHEN o.n % 2 = 1 THEN 'check_in'::public.attendance_type ELSE 'check_out'::public.attendance_type END
    FROM ordered o WHERE a.id = o.id;
  SELECT * INTO recorded FROM public.attendance WHERE id = recorded.id;
  RETURN jsonb_build_object('record', to_jsonb(recorded), 'duplicate', false);
END $$;
REVOKE ALL ON FUNCTION public.record_device_punch(uuid,timestamptz,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_device_punch(uuid,timestamptz,text,text) TO service_role;

CREATE SEQUENCE public.receipt_number_seq;
ALTER TABLE public.receipts ADD COLUMN request_id uuid UNIQUE;
CREATE FUNCTION public.collect_fee(p_student uuid, p_amount numeric, p_discount numeric, p_method text, p_notes text, p_request uuid, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE receipt public.receipts; entry_id uuid; number text;
BEGIN
  IF p_amount IS NULL OR p_discount IS NULL OR p_amount <= 0 OR p_discount < 0 OR p_discount >= p_amount OR
     p_method IS NULL OR p_method NOT IN ('Cash','Bank Transfer','Online') OR p_request IS NULL THEN
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
  IF NOT FOUND THEN RAISE EXCEPTION 'Approved student not found'; END IF;
  number := 'OKI-' || to_char(now() AT TIME ZONE 'Asia/Karachi','YYYY') || '-' || lpad(nextval('public.receipt_number_seq')::text, 6, '0');
  INSERT INTO public.ledger(student_id,amount,transaction_type,category,notes,date,created_by)
    VALUES(p_student,p_amount-p_discount,'income','Tuition Fee',COALESCE(p_notes,'Receipt ' || number),(now() AT TIME ZONE 'Asia/Karachi')::date,p_actor)
    RETURNING id INTO entry_id;
  INSERT INTO public.receipts(student_id,ledger_id,receipt_number,amount,discount,payment_method,request_id)
    VALUES(p_student,entry_id,number,p_amount,p_discount,p_method,p_request) RETURNING * INTO receipt;
  UPDATE public.profiles SET fee_status = 'paid' WHERE id = p_student;
  RETURN to_jsonb(receipt);
END $$;
REVOKE ALL ON FUNCTION public.collect_fee(uuid,numeric,numeric,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collect_fee(uuid,numeric,numeric,text,text,uuid,uuid) TO service_role;

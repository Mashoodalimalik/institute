-- Fee status is based on this month's receipts, including discounts granted.
CREATE OR REPLACE FUNCTION public.refresh_fee_status(p_student uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE today date := (now() AT TIME ZONE 'Asia/Karachi')::date; month_start date;
  due date; settings public.fee_settings;
BEGIN
  month_start := date_trunc('month',today)::date;
  SELECT * INTO settings FROM public.fee_settings LIMIT 1;
  due := month_start + (least(settings.universal_due_day,
    extract(day FROM (month_start + interval '1 month - 1 day'))::integer) - 1) + settings.grace_period_days;
  UPDATE public.profiles p SET fee_status = CASE
    WHEN COALESCE((SELECT sum(r.amount) FROM public.receipts r WHERE r.student_id = p.id
      AND (r.created_at AT TIME ZONE 'Asia/Karachi')::date >= month_start
      AND (r.created_at AT TIME ZONE 'Asia/Karachi')::date < (month_start + interval '1 month')::date),0) >= COALESCE(p.monthly_fee,0)
      THEN 'paid'::public.fee_status
    WHEN today > due THEN 'overdue'::public.fee_status ELSE 'unpaid'::public.fee_status END
  WHERE p.role = 'student' AND p.status = 'approved' AND (p_student IS NULL OR p.id = p_student);
END $$;
REVOKE ALL ON FUNCTION public.refresh_fee_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_fee_status(uuid) TO service_role;

-- Keep messaging credentials solely in the server environment.
ALTER TABLE public.fee_settings DROP COLUMN twilio_auth_token;
ALTER TABLE public.fee_settings DROP COLUMN twilio_account_sid;
ALTER TABLE public.fee_settings DROP COLUMN twilio_phone_number;
ALTER TABLE public.fee_settings DROP COLUMN whatsapp_from_number;

CREATE OR REPLACE FUNCTION public.collect_fee(p_student uuid, p_amount numeric, p_discount numeric, p_method text, p_notes text, p_request uuid, p_actor uuid)
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
  PERFORM public.refresh_fee_status(p_student);
  RETURN to_jsonb(receipt);
END $$;
REVOKE ALL ON FUNCTION public.collect_fee(uuid,numeric,numeric,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collect_fee(uuid,numeric,numeric,text,text,uuid,uuid) TO service_role;

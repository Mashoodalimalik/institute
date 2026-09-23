CREATE FUNCTION public.get_my_profile_id() RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid();
$$;
DROP POLICY student_read_own_profile ON public.profiles;
DROP POLICY parent_read_own_and_children ON public.profiles;
CREATE POLICY parent_read_own_and_children ON public.profiles FOR SELECT TO authenticated
  USING (get_my_role() = 'parent' AND (id = get_my_profile_id() OR parent_id = get_my_profile_id()));

DROP POLICY student_read_own_attendance ON public.attendance;
DROP POLICY parent_read_children_attendance ON public.attendance;
CREATE POLICY student_read_own_attendance ON public.attendance FOR SELECT TO authenticated
  USING (get_my_role() = 'student' AND student_id = get_my_profile_id());
CREATE POLICY parent_read_children_attendance ON public.attendance FOR SELECT TO authenticated
  USING (get_my_role() = 'parent' AND student_id IN (SELECT id FROM public.profiles WHERE parent_id = get_my_profile_id()));

DROP POLICY student_read_own_ledger ON public.ledger;
DROP POLICY parent_read_children_ledger ON public.ledger;
CREATE POLICY student_read_own_ledger ON public.ledger FOR SELECT TO authenticated
  USING (get_my_role() = 'student' AND student_id = get_my_profile_id());
CREATE POLICY parent_read_children_ledger ON public.ledger FOR SELECT TO authenticated
  USING (get_my_role() = 'parent' AND student_id IN (SELECT id FROM public.profiles WHERE parent_id = get_my_profile_id()));

DROP POLICY student_read_own_receipts ON public.receipts;
DROP POLICY parent_read_children_receipts ON public.receipts;
CREATE POLICY student_read_own_receipts ON public.receipts FOR SELECT TO authenticated
  USING (get_my_role() = 'student' AND student_id = get_my_profile_id());
CREATE POLICY parent_read_children_receipts ON public.receipts FOR SELECT TO authenticated
  USING (get_my_role() = 'parent' AND student_id IN (SELECT id FROM public.profiles WHERE parent_id = get_my_profile_id()));

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  VALUES('expense-receipts','expense-receipts',false,5242880,ARRAY['image/jpeg','image/png','application/pdf']);
CREATE POLICY admin_expense_files ON storage.objects FOR ALL TO authenticated
  USING(bucket_id = 'expense-receipts' AND public.get_my_role() = 'super_admin')
  WITH CHECK(bucket_id = 'expense-receipts' AND public.get_my_role() = 'super_admin');

import 'server-only';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UserRole } from '@/lib/types';

export async function requireUser(roles?: UserRole[]) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { response: NextResponse.json({ error: 'Server database is not configured' }, { status: 503 }) };
  }
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: 'Sign in required' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('id,role,status').eq('auth_user_id', user.id).single();
  if (!profile || profile.status !== 'approved' || (roles && !roles.includes(profile.role))) {
    return { response: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }
  return { user, profile, supabase };
}

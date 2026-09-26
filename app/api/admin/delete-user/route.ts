import { requireUser } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { serverStore as demoStore } from '@/lib/services/server-store';
import { isSupabaseConfigured } from '@/lib/services/store';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  const auth = await requireUser(['super_admin', 'staff']);
  if (auth.response) return auth.response;
  
  try {
    const body = await request.json();
    const { userId, type, authUserId } = body as {
      userId: string;
      type: 'user' | 'student';
      authUserId?: string | null;
    };

    if (!userId || !type) {
      return NextResponse.json({ error: 'userId and type are required' }, { status: 400 });
    }

    if (userId === auth.profile.id) {
      return NextResponse.json({ error: 'You cannot delete yourself' }, { status: 400 });
    }

    // Must be super_admin to delete users other than students
    if (type !== 'student' && auth.profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized to delete users' }, { status: 403 });
    }

    if (type === 'student') {
      await demoStore.deleteStudent(userId);
    } else {
      await demoStore.deleteUser(userId);
    }

    // In Supabase mode, if this user has an auth record, we should delete it using the service role key
    if (isSupabaseConfigured && process.env.SUPABASE_SERVICE_ROLE_KEY && authUserId) {
      try {
        const supabaseAdmin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { persistSession: false } }
        );
        // We attempt to delete the auth user
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      } catch (err) {
        console.error('Failed to delete Supabase auth user:', err);
      }
    }

    return NextResponse.json({ success: true, message: `${type === 'student' ? 'Student' : 'User'} deleted successfully.` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

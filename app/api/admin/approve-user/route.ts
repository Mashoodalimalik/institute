import { requireUser } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { serverStore as demoStore } from '@/lib/services/server-store';
import { isSupabaseConfigured } from '@/lib/services/store';
import { UserRole } from '@/lib/types';

/**
 * POST /api/admin/approve-user
 * Body: { userId: string, action: 'approve' | 'reject', role?: UserRole }
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(['super_admin']);
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const { userId, action, role } = body as {
      userId: string;
      action: 'approve' | 'reject';
      role?: UserRole;
    };

    if (!userId || !action) {
      return NextResponse.json({ error: 'userId and action are required' }, { status: 400 });
    }
    if (role && !['super_admin', 'staff', 'student', 'parent'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    if (userId === auth.profile.id && (action === 'reject' || (role && role !== 'super_admin'))) {
      return NextResponse.json({ error: 'You cannot remove your own administrator access' }, { status: 400 });
    }

    if (action === 'approve') {
      const assignedRole = role || 'student';
      const success = await demoStore.approveUser(userId, assignedRole);
      return NextResponse.json({ success, message: `User approved as ${assignedRole}` });
    } else if (action === 'reject') {
      const success = await demoStore.rejectUser(userId);
      return NextResponse.json({ success, message: 'User registration rejected' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

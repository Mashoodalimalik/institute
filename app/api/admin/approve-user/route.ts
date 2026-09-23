import { NextRequest, NextResponse } from 'next/server';
import { demoStore, isSupabaseConfigured } from '@/lib/services/store';
import { UserRole } from '@/lib/types';

/**
 * POST /api/admin/approve-user
 * Body: { userId: string, action: 'approve' | 'reject', role?: UserRole }
 */
export async function POST(request: NextRequest) {
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

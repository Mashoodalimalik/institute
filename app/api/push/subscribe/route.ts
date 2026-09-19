import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { demoStore, isSupabaseConfigured } from '@/lib/services/store';

export async function POST(req: NextRequest) {
  try {
    const { subscription, userId } = await req.json();

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription data required' }, { status: 400 });
    }

    const targetUserId = userId || 'parent-001';

    if (isSupabaseConfigured) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { error } = await supabase
        .from('profiles')
        .update({
          web_push_sub: subscription,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetUserId);

      if (error) {
        console.error('Supabase update web_push_sub error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      // Save in Demo Store
      const parent = demoStore.getParent(targetUserId);
      if (parent) {
        parent.web_push_sub = subscription;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Push subscription saved successfully.',
    });
  } catch (err: any) {
    console.error('Subscribe POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await req.json();
    const targetUserId = userId || 'parent-001';

    if (isSupabaseConfigured) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      await supabase
        .from('profiles')
        .update({ web_push_sub: null })
        .eq('id', targetUserId);
    } else {
      const parent = demoStore.getParent(targetUserId);
      if (parent) {
        parent.web_push_sub = null;
      }
    }

    return NextResponse.json({ success: true, message: 'Push subscription removed.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

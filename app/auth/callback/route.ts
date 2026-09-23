import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * GET /auth/callback
 *
 * Handles the OAuth redirect from Google (and any other Supabase provider).
 * Exchanges the ?code= query param for a Supabase session, then redirects
 * the user to the root "/" so the auth-context can detect the session and
 * route them to the correct home page (or /pending if not yet approved).
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;

  if (code) {
    const response = NextResponse.redirect(`${origin}/`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: object) {
            response.cookies.set({ name, value, ...options } as any);
          },
          remove(name: string, options: object) {
            response.cookies.set({ name, value: '', ...options } as any);
          },
        },
      }
    );

    await supabase.auth.exchangeCodeForSession(code);
    return response;
  }

  // No code — redirect to login
  return NextResponse.redirect(`${origin}/`);
}

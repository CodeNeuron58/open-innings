import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/auth/server';

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Ignore — even if sign-out fails, send them to landing
  }
  return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'));
}

export async function POST() {
  return GET();
}
import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/auth/server';

export async function Nav() {
  let userEmail: string | null = null;
  try {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    userEmail = data.user?.email ?? null;
  } catch {
    userEmail = null;
  }

  return (
    <header className="border-b border-border bg-card">
      <nav className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-green-600">
            🏏 Open Innings
          </Link>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/players" className="text-sm text-muted-foreground hover:text-foreground">
            Players
          </Link>
          <Link href="/teams" className="text-sm text-muted-foreground hover:text-foreground">
            Teams
          </Link>
          <Link href="/matches" className="text-sm text-muted-foreground hover:text-foreground">
            Matches
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {userEmail ? (
            <>
              <span className="text-muted-foreground">{userEmail}</span>
              <Link href="/api/auth/signout" className="text-muted-foreground hover:text-foreground">
                Sign out
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="text-muted-foreground hover:text-foreground">
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-green-600 px-3 py-1.5 font-medium text-white hover:bg-green-700"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
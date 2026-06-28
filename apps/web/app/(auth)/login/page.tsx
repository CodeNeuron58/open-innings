export default function LoginPage() {
  return (
    <main className="container flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="mb-1 text-2xl font-bold">Welcome back</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Sign in to score matches, manage teams, view stats.
        </p>
        <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          Auth flow coming in the next milestone. See{' '}
          <code className="rounded bg-background px-1">lib/auth/server.ts</code>.
        </p>
      </div>
    </main>
  );
}

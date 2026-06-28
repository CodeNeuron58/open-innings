export default function DashboardPage() {
  return (
    <main className="container py-12">
      <h1 className="mb-6 text-3xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile title="Live matches" value="—" hint="Matches you're scoring right now" />
        <Tile title="Recent" value="—" hint="Your last 5 matches" />
        <Tile title="Players" value="—" hint="Players in your database" />
      </div>
    </main>
  );
}

function Tile({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="my-2 text-3xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

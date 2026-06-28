import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center text-center">
      <p className="text-6xl">🏏</p>
      <h1 className="mt-4 text-3xl font-bold">Hit for a duck</h1>
      <p className="mt-2 text-muted-foreground">
        We couldn&apos;t find that page. Bowled out.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Back to the pavilion
      </Link>
    </main>
  );
}

import { ButtonLink, LogoMark } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center text-center">
      <LogoMark className="h-16 w-16 opacity-80" />
      <p className="mt-6 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        404 · Out for a duck
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        The umpire&apos;s finger is up — this one&apos;s not in the book.
      </p>
      <ButtonLink href="/" className="mt-6">
        Back to the pavilion
      </ButtonLink>
    </main>
  );
}

import { ButtonLink, LogoMark } from '@/components/ui';

/**
 * The 404 page.
 *
 * ⚠️ **Do not add `app/loading.tsx`.** There was one, and it silently broke
 * every 404 on the site.
 *
 * A root `loading.tsx` wraps the whole app in a Suspense boundary, so Next
 * streams the shell immediately — which commits HTTP 200 before the page has
 * even loaded its data. By the time `notFound()` throws, the status is
 * already sent, so this page renders under a **200**. It looked right in a
 * browser and was wrong to every crawler.
 *
 * That matters more here than on most sites: the growth loop is shared links.
 * A deleted match returning 200 gets indexed by Google as live content and
 * previewed in WhatsApp as though the scorecard still exists.
 *
 * If a loading state is wanted again, scope it to a route that is genuinely
 * slow and has nothing to 404 on — never the root, and never `/m`, `/p` or
 * `/c`.
 */
export default function NotFound() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center text-center">
      <LogoMark className="h-16 w-16 opacity-80" />
      <p className="text-muted-foreground mt-6 text-sm font-semibold uppercase tracking-widest">
        404 · Out for a duck
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">We couldn&apos;t find that page</h1>
      <p className="text-muted-foreground mt-2 max-w-sm">
        The umpire&apos;s finger is up — this one&apos;s not in the book.
      </p>
      <ButtonLink href="/" className="mt-6">
        Back to the pavilion
      </ButtonLink>
    </main>
  );
}

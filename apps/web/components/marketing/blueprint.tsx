import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * The Industry design system's wireframe frame: a square-cornered, hairline
 * box with `+` registration marks at each corner.
 *
 * Its readme has one rule stated twice — "do not drop the registration marks
 * from a framed element" — so the marks are not the caller's job here. Ask for
 * a blueprint and you get all four, every time. That makes the rule
 * unbreakable rather than merely documented.
 *
 * Three concrete exports rather than one polymorphic component: the design
 * only ever frames a div, a link or a button, and this mirrors how
 * `components/ui.tsx` splits `Button` from `ButtonLink`.
 *
 * All three are server-compatible — no hooks, no client boundary.
 */

/** The four `+` marks. Not exported: a frame without them is out of spec. */
function Corners() {
  return (
    <>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
    </>
  );
}

export function Blueprint({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('blueprint', className)} {...props}>
      <Corners />
      {children}
    </div>
  );
}

export function BlueprintLink({
  className,
  children,
  href,
  ...props
}: React.ComponentProps<typeof Link>) {
  return (
    <Link href={href} className={cn('blueprint', className)} {...props}>
      <Corners />
      {children}
    </Link>
  );
}

export function BlueprintButton({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn('blueprint', className)} {...props}>
      <Corners />
      {children}
    </button>
  );
}

import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Open Innings UI kit — small, dependency-free primitives shared by every page.
 * All components are server-compatible (no hooks) so they work in RSCs.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Button
// ─────────────────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonBase =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]';

const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'border border-input bg-card text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground',
  ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
  destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
};

const buttonSizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export function buttonVariants({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(buttonBase, buttonVariantClasses[variant], buttonSizeClasses[size], className);
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <button className={buttonVariants({ variant, size, className })} {...props} />;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  href,
  ...props
}: React.ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <Link href={href} className={buttonVariants({ variant, size, className })} {...props} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────────────────────

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-card text-card-foreground shadow-card', className)}
      {...props}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge
// ─────────────────────────────────────────────────────────────────────────────

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'live' | 'success' | 'warning';

const badgeVariantClasses: Record<BadgeVariant, string> = {
  default: 'border-transparent bg-primary text-primary-foreground',
  secondary: 'border-transparent bg-secondary text-secondary-foreground',
  outline: 'border-border text-muted-foreground',
  live: 'border-transparent bg-live text-live-foreground',
  success: 'border-transparent bg-accent text-accent-foreground',
  warning: 'border-transparent bg-extra/15 text-extra',
};

export function Badge({
  variant = 'default',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        badgeVariantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Pulsing LIVE badge — dot + label so state never reads by color alone. */
export function LiveBadge({ className }: { className?: string }) {
  return (
    <Badge variant="live" className={className}>
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-live" aria-hidden />
      Live
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Form controls
// ─────────────────────────────────────────────────────────────────────────────

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn('mb-1.5 block text-sm font-medium text-foreground', className)} {...props} />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm transition-colors',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-10 w-full appearance-none rounded-md border border-input bg-card px-3 text-sm shadow-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page scaffolding
// ─────────────────────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted-foreground/60">{icon}</div>}
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Stat tile: sentence-case label, semibold value, muted context line. */
export function StatTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground/50">{icon}</span>}
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand
// ─────────────────────────────────────────────────────────────────────────────

/** Cricket-ball mark: filled circle with a stitched seam. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-7 w-7', className)} aria-hidden>
      <circle cx="16" cy="16" r="15" className="fill-primary" />
      <path
        d="M10 3.5c3.5 3.4 5.6 7.7 5.6 12.5S13.5 25.1 10 28.5"
        fill="none"
        stroke="hsl(45 30% 97%)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="2.6 2.4"
      />
      <path
        d="M22 3.5c-3.5 3.4-5.6 7.7-5.6 12.5s2.1 9.1 5.6 12.5"
        fill="none"
        stroke="hsl(45 30% 97%)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="2.6 2.4"
      />
    </svg>
  );
}

export function Logo({ className, textClassName }: { className?: string; textClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className={cn('text-base font-bold tracking-tight', textClassName)}>
        Open&nbsp;Innings
      </span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cricket bits shared across pages
// ─────────────────────────────────────────────────────────────────────────────

/** Initials monogram for players/teams (deterministic tint from the name). */
export function Monogram({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground',
        className,
      )}
    >
      {initials || '?'}
    </span>
  );
}

/** Match / innings status chip. */
export function StatusBadge({ status }: { status: string }) {
  if (status === 'live' || status === 'in_progress') return <LiveBadge />;
  if (status === 'completed') return <Badge variant="secondary">Result</Badge>;
  if (status === 'scheduled' || status === 'not_started')
    return <Badge variant="outline">Upcoming</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

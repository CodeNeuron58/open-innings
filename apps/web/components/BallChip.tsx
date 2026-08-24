import { ballMark, type BallChipKind } from '@open-innings/scoring';
import { cn } from '@/lib/utils';

/**
 * One ball rendered as a chip. Shared by the scorer and the public scorecard.
 * The chip always carries a text label — color reinforces, never replaces it.
 */

type BallLike = {
  eventType: string;
  runsOffBat: number;
  totalRuns: number;
  wicketType?: string | null;
  overNumber?: number;
  ballNumber?: number;
};

/**
 * Colour for each kind of delivery. The mark itself comes from `ballMark` in
 * the scoring package — this file used to derive both, and its notation had
 * drifted from the engine's and the app's: a three-run wide read `3wd` here
 * and `wd2` in both of the others.
 */
const KIND_CLASS: Record<BallChipKind, string> = {
  wicket: 'bg-wicket text-wicket-foreground',
  six: 'bg-six text-six-foreground',
  boundary: 'bg-four text-four-foreground',
  wide: 'bg-extra text-extra-foreground',
  no_ball: 'bg-extra text-extra-foreground',
  bye: 'bg-extra text-extra-foreground',
  leg_bye: 'bg-extra text-extra-foreground',
  penalty: 'bg-extra text-extra-foreground',
  run: 'bg-secondary text-secondary-foreground',
  dot: 'bg-muted text-muted-foreground',
};

export function ballChipParts(ball: BallLike): { label: string; className: string } {
  const { label, kind } = ballMark(ball);
  return { label, className: KIND_CLASS[kind] };
}

export function BallChip({
  ball,
  size = 'md',
  className,
}: {
  ball: BallLike;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { label, className: colorClass } = ballChipParts(ball);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums',
        size === 'sm' ? 'h-7 min-w-7 px-1 text-[11px]' : 'h-8 min-w-8 px-1 text-xs',
        colorClass,
        className,
      )}
      title={
        ball.overNumber !== undefined && ball.ballNumber !== undefined
          ? `Over ${ball.overNumber}.${ball.ballNumber}`
          : undefined
      }
    >
      {label}
    </span>
  );
}

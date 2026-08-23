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

export function ballChipParts(ball: BallLike): { label: string; className: string } {
  if (ball.wicketType) {
    return { label: 'W', className: 'bg-wicket text-wicket-foreground' };
  }
  switch (ball.eventType) {
    case 'wide':
      return {
        label: ball.totalRuns > 1 ? `${ball.totalRuns}wd` : 'wd',
        className: 'bg-extra/15 text-extra ring-1 ring-inset ring-extra/30',
      };
    case 'no_ball':
      return {
        label: ball.totalRuns > 1 ? `${ball.totalRuns}nb` : 'nb',
        className: 'bg-extra/15 text-extra ring-1 ring-inset ring-extra/30',
      };
    case 'bye':
      return {
        label: `${ball.totalRuns}b`,
        className: 'bg-extra/15 text-extra ring-1 ring-inset ring-extra/30',
      };
    case 'leg_bye':
      return {
        label: `${ball.totalRuns}lb`,
        className: 'bg-extra/15 text-extra ring-1 ring-inset ring-extra/30',
      };
    case 'penalty':
      return {
        label: `+${ball.totalRuns}P`,
        className: 'bg-extra/15 text-extra ring-1 ring-inset ring-extra/30',
      };
  }
  if (ball.runsOffBat === 4) return { label: '4', className: 'bg-four text-four-foreground' };
  if (ball.runsOffBat === 6) return { label: '6', className: 'bg-six text-six-foreground' };
  if (ball.totalRuns === 0) return { label: '•', className: 'bg-muted text-muted-foreground' };
  return { label: String(ball.totalRuns), className: 'bg-secondary text-secondary-foreground' };
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

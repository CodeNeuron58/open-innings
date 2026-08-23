/**
 * One delivery in the over strip.
 * Uses text labels for accessibility, with a monochrome steel color scale for quick visual scanning.
 */
import { Pressable, Text, View } from 'react-native';
import type { BallEvent } from '@open-innings/scoring';

type Tone = 'four' | 'six' | 'wicket' | 'extra' | 'dot';

function describe(ball: BallEvent): { label: string; tone: Tone } {
  if (ball.wicketType) {
    const label = ball.totalRuns > 0 ? `W${ball.totalRuns}` : 'W';
    return { label, tone: 'wicket' };
  }

  switch (ball.eventType) {
    case 'wide':
      // A wide is never touched by the bat, so its total is all extras.
      return { label: ball.totalRuns > 1 ? `wd${ball.totalRuns - 1}` : 'wd', tone: 'extra' };
    case 'no_ball':
      return { label: ball.totalRuns > 1 ? `nb${ball.totalRuns - 1}` : 'nb', tone: 'extra' };
    case 'bye':
      return { label: `b${ball.totalRuns}`, tone: 'extra' };
    case 'leg_bye':
      return { label: `lb${ball.totalRuns}`, tone: 'extra' };
    case 'penalty':
      return { label: `+${ball.totalRuns}P`, tone: 'extra' };
    case 'dot':
      return { label: '•', tone: 'dot' };
    case '4':
      return { label: '4', tone: 'four' };
    case '6':
      return { label: '6', tone: 'six' };
    default:
      return { label: String(ball.runsOffBat), tone: 'dot' };
  }
}

const TONE_STYLES: Record<Tone, { bg: string; text: string; border: string }> = {
  four: { bg: 'bg-four', text: 'text-four-foreground', border: 'border-steel-300' },
  six: { bg: 'bg-six', text: 'text-six-foreground', border: 'border-steel-400' },
  wicket: { bg: 'bg-wicket', text: 'text-wicket-foreground', border: 'border-wicket' },
  extra: { bg: 'bg-extra', text: 'text-extra-foreground', border: 'border-extra' },
  // A dot ball is the quietest thing that happened — drawn, not filled.
  dot: { bg: 'bg-neutral-100', text: 'text-foreground', border: 'border-border' },
};

/**
 * The same ramp inverted, for the strip on the score plate.
 *
 * The ordering has to survive the flip: on paper a wicket is the darkest chip,
 * so against a dark ground it becomes the lightest. Reusing the light styles
 * here would put a near-black wicket chip on a near-black plate.
 */
const DARK_TONE_STYLES: Record<Tone, { bg: string; text: string; border: string }> = {
  four: { bg: 'bg-steel-700', text: 'text-scoreboard-text', border: 'border-steel-600' },
  six: { bg: 'bg-steel-500', text: 'text-scoreboard', border: 'border-steel-500' },
  wicket: { bg: 'bg-scoreboard-text', text: 'text-scoreboard', border: 'border-scoreboard-text' },
  extra: { bg: 'bg-steel-800', text: 'text-scoreboard-accent', border: 'border-steel-700' },
  dot: { bg: 'bg-transparent', text: 'text-scoreboard-text', border: 'border-scoreboard-border' },
};

export function BallChip({
  ball,
  onDark = false,
  onPress,
}: {
  ball: BallEvent;
  onDark?: boolean;
  /** Present only where the delivery can be corrected. See below. */
  onPress?: () => void;
}) {
  const { label, tone } = describe(ball);
  const style = (onDark ? DARK_TONE_STYLES : TONE_STYLES)[tone];
  const body = <Text className={`${style.text} font-heading text-[13px]`}>{label}</Text>;
  const box = `${style.bg} ${style.border} h-9 min-w-9 items-center justify-center border px-2`;

  /*
   * Tappable only where a correction is possible.
   *
   * The same chip appears on the score plate and on read-only surfaces, and a
   * chip that looks pressable and does nothing is worse than one that does
   * not — so the affordance follows the handler rather than the component.
   */
  if (!onPress) {
    return <View className={box}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Correct this delivery — currently ${label}`}
      onPress={onPress}
      className={`${box} active:opacity-60`}
    >
      {body}
    </Pressable>
  );
}

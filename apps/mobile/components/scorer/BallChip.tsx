/**
 * One delivery in the over strip.
 *
 * Colour reinforces the label, it never carries the meaning alone — every chip
 * shows text ("4", "W", "wd"). A scorer glancing at this in sunlight reads the
 * character; the value just makes the boundary and the wicket findable.
 *
 * Under the Industry palette these are steps on one steel ramp rather than
 * separate hues, because the system is mono — a four is lighter than a six is
 * lighter than a wicket. That is only safe because of the labels above; do not
 * remove them.
 *
 * Square, not pill-shaped: the design draws the over strip as a row of cells.
 */
import { Text, View } from 'react-native';
import type { BallEvent } from '@open-innings/scoring';

type Tone = 'four' | 'six' | 'wicket' | 'extra' | 'dot';

function describe(ball: BallEvent): { label: string; tone: Tone } {
  if (ball.wicketType) return { label: 'W', tone: 'wicket' };

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

export function BallChip({ ball, onDark = false }: { ball: BallEvent; onDark?: boolean }) {
  const { label, tone } = describe(ball);
  const style = (onDark ? DARK_TONE_STYLES : TONE_STYLES)[tone];

  return (
    <View
      className={`${style.bg} ${style.border} h-9 min-w-9 items-center justify-center border px-2`}
    >
      <Text className={`${style.text} font-heading text-[13px]`}>{label}</Text>
    </View>
  );
}

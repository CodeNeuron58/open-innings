/**
 * One delivery in the over strip.
 *
 * Colour reinforces the label, it never carries the meaning alone — every chip
 * shows text ("4", "W", "wd"). A scorer glancing at this in sunlight reads the
 * character; the colour just makes the boundary and the wicket findable.
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

const TONE_STYLES: Record<Tone, { bg: string; text: string }> = {
  four: { bg: 'bg-four', text: 'text-four-foreground' },
  six: { bg: 'bg-six', text: 'text-six-foreground' },
  wicket: { bg: 'bg-wicket', text: 'text-wicket-foreground' },
  extra: { bg: 'bg-extra', text: 'text-extra-foreground' },
  dot: { bg: 'bg-scoreboard-border', text: 'text-scoreboard-text' },
};

export function BallChip({ ball }: { ball: BallEvent }) {
  const { label, tone } = describe(ball);
  const style = TONE_STYLES[tone];

  return (
    <View className={`${style.bg} h-9 min-w-9 items-center justify-center rounded-full px-2`}>
      <Text className={`${style.text} text-xs font-bold`}>{label}</Text>
    </View>
  );
}

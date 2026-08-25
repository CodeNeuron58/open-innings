/**
 * One delivery in the over strip.
 * Uses text labels for accessibility, with a monochrome steel color scale for quick visual scanning.
 */
import { Pressable, Text, View } from 'react-native';
import { ballMark, type BallEvent, type BallChipKind } from '@open-innings/scoring';

type Tone = 'four' | 'six' | 'wicket' | 'extra' | 'run' | 'dot';

/**
 * Which tone each kind of delivery is drawn in.
 *
 * The mark itself comes from `ballMark` in the scoring package. This file used
 * to work it out too, and had drifted: a bye for two read `b2` here and `2b`
 * everywhere else, and — worse — a ball struck for two with four overthrown
 * showed `2`, because it read `runsOffBat` where the scorecard read the total.
 * The same delivery reported two different scores on two screens.
 *
 * `run` was the other half of that bug: every 1, 2, 3 and 5 fell through to
 * the dot tone and was drawn as though nothing had happened.
 */
const KIND_TONE: Record<BallChipKind, Tone> = {
  wicket: 'wicket',
  six: 'six',
  boundary: 'four',
  wide: 'extra',
  no_ball: 'extra',
  bye: 'extra',
  leg_bye: 'extra',
  penalty: 'extra',
  run: 'run',
  dot: 'dot',
};

function describe(ball: BallEvent): { label: string; tone: Tone } {
  const { label, kind } = ballMark(ball);
  return { label, tone: KIND_TONE[kind] };
}

const TONE_STYLES: Record<Tone, { bg: string; text: string; border: string }> = {
  four: { bg: 'bg-four', text: 'text-four-foreground', border: 'border-steel-300' },
  six: { bg: 'bg-six', text: 'text-six-foreground', border: 'border-steel-400' },
  wicket: { bg: 'bg-wicket', text: 'text-wicket-foreground', border: 'border-wicket' },
  extra: { bg: 'bg-extra', text: 'text-extra-foreground', border: 'border-extra' },
  // Runs off the bat that were not a boundary. Filled, so the over strip shows
  // at a glance which balls were scored off — these used to be drawn as dots.
  run: { bg: 'bg-steel-200', text: 'text-foreground', border: 'border-steel-300' },
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
  run: { bg: 'bg-steel-900', text: 'text-scoreboard-text', border: 'border-steel-700' },
  dot: { bg: 'bg-transparent', text: 'text-scoreboard-text', border: 'border-scoreboard-border' },
};

export function BallChip({
  ball,
  onDark = false,
  latest = false,
  onPress,
}: {
  ball: BallEvent;
  onDark?: boolean;
  /**
   * The delivery that just landed.
   *
   * Nothing used to mark it. A ball was recorded, a chip appeared among five
   * others that look much like it, and the only other acknowledgement was
   * `Last: 4` in small grey type at the foot of the console. A mis-tap was
   * invisible until the over ended.
   *
   * Drawn rather than filled — a ring outside the chip, so the mark does not
   * change what the chip itself says. The colour of a chip is how a four is
   * told from a wicket, and borrowing it to mean "recent" would make two
   * things share one channel.
   */
  latest?: boolean;
  /** Present only where the delivery can be corrected. See below. */
  onPress?: () => void;
}) {
  const { label, tone } = describe(ball);
  const style = (onDark ? DARK_TONE_STYLES : TONE_STYLES)[tone];
  const body = <Text className={`${style.text} font-heading text-[15px]`}>{label}</Text>;
  // 44pt, because these are tap targets: a chip is how a delivery gets
  // corrected. `components/ui.tsx` opens by promising 48pt minimums and the
  // console broke it in six places, this being the one people actually aim at
  // in sunlight, one-handed, while somebody asks them the score.
  // A ring outside the chip, drawn not filled. The colour of a chip is how a
  // four is told from a wicket, and borrowing it to also mean "recent" would
  // make two things share one channel.
  const edge = latest
    ? onDark
      ? 'border-2 border-scoreboard-accent'
      : 'border-2 border-primary'
    : style.border;

  /*
   * A delivery that was decided afterwards rather than watched.
   *
   * A corrected ball used to look exactly like one that was right first time,
   * which quietly undercuts the claim this product makes — that the ball log
   * is the record. Somebody who remembers a four where the card shows a single
   * had no way to tell whether they misremembered or the scorer changed it.
   *
   * A corner mark rather than a colour or a border: both of those are already
   * carrying something on this chip.
   */
  const corrected = Boolean(ball.correctedAt);
  const box = `${style.bg} ${edge} h-11 min-w-11 items-center justify-center border px-2`;

  /*
   * Tappable only where a correction is possible.
   *
   * The same chip appears on the score plate and on read-only surfaces, and a
   * chip that looks pressable and does nothing is worse than one that does
   * not — so the affordance follows the handler rather than the component.
   */
  const mark = corrected ? (
    <View
      pointerEvents="none"
      className={`absolute right-0 top-0 h-1.5 w-1.5 ${
        onDark ? 'bg-scoreboard-accent' : 'bg-steel-600'
      }`}
    />
  ) : null;

  if (!onPress) {
    return (
      <View className={box}>
        {body}
        {mark}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        latest ? `Last ball, ${label}.` : `Delivery ${label}.`,
        corrected ? 'Corrected.' : null,
        'Tap to correct it.',
      ]
        .filter(Boolean)
        .join(' ')}
      onPress={onPress}
      className={`${box} active:opacity-60`}
    >
      {body}
      {mark}
    </Pressable>
  );
}

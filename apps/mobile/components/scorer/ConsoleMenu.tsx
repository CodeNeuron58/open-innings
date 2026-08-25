/**
 * Everything a scorer needs mid-match that is not a delivery.
 *
 * These actions existed before and were each hidden somewhere different: the
 * bowler replacement behind a tap on the bowler row, a retirement among eleven
 * chips inside a sheet titled "Wicket", the overthrow and the five-run penalty
 * as `+OT` and `+5 Pen` in the extras row, and abandoning the match behind a
 * long-press on a row in the match list — a screen away from the console.
 *
 * CricHeroes puts the same set behind one control on the scoring screen, and
 * that is the shape worth copying: the keypad is for deliveries, and everything
 * else is one tap away in a place a scorer can be told about once.
 *
 * The penalty is the reason this is a menu of rows rather than a row of icons.
 * Five runs is one of the rarest awards in cricket and it used to be a single
 * unconfirmed tap next to Wide, recoverable only by noticing and undoing.
 */
import { Pressable, Text, View } from 'react-native';
import { SheetShell } from './Sheets';

type Item = {
  label: string;
  /** What it does, in a scorer's words rather than a law's. */
  note: string;
  onPress: () => void;
  /** Present when the action is not available, and why. */
  unavailable?: string;
  destructive?: boolean;
};

function Row({ item }: { item: Item }) {
  const inert = item.unavailable !== undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert }}
      accessibilityLabel={inert ? `${item.label} — ${item.unavailable}` : item.label}
      onPress={item.onPress}
      disabled={inert}
      className={`border-border min-h-14 flex-row items-center gap-3 border-b py-3 ${
        inert ? 'opacity-45' : 'active:opacity-70'
      }`}
    >
      <View className="min-w-0 flex-1">
        <Text
          className={`font-heading text-[15.5px] ${
            item.destructive ? 'text-destructive' : 'text-foreground'
          }`}
        >
          {item.label}
        </Text>
        <Text className="text-foreground/65 mt-0.5 text-[12.5px] leading-[17px]">
          {item.unavailable ?? item.note}
        </Text>
      </View>
      {!inert ? <Text className="text-foreground/35 shrink-0 text-[17px]">›</Text> : null}
    </Pressable>
  );
}

export function ConsoleMenu({
  overInProgress,
  canAbandon,
  onReplaceBowler,
  onRetire,
  onOverthrow,
  onPenalty,
  onScorecard,
  onAbandon,
  onDismiss,
}: {
  /** Law 17.4 only applies part-way through an over. */
  overInProgress: boolean;
  canAbandon: boolean;
  onReplaceBowler: () => void;
  onRetire: () => void;
  onOverthrow: () => void;
  onPenalty: () => void;
  onScorecard: () => void;
  onAbandon: () => void;
  onDismiss: () => void;
}) {
  const items: Item[] = [
    {
      label: 'Full scorecard',
      note: 'Both innings, over by over',
      onPress: onScorecard,
    },
    {
      label: 'Replace the bowler',
      note: 'Only if they cannot finish the over — injury or illness',
      onPress: onReplaceBowler,
      unavailable: overInProgress ? undefined : 'The over has not started',
    },
    {
      label: 'Retire a batter',
      note: 'They walk off between deliveries. Not a dismissal, and it costs no ball',
      onPress: onRetire,
    },
    {
      label: 'Overthrow runs',
      note: 'Runs struck, plus what came of the throw',
      onPress: onOverthrow,
    },
    {
      label: 'Award 5 penalty runs',
      note: 'A helmet on the field, or the ball tampered with',
      onPress: onPenalty,
    },
    {
      label: 'Abandon the match',
      note: 'Rain, bad light, or a dispute. Recorded as no result',
      onPress: onAbandon,
      unavailable: canAbandon ? undefined : 'Only while the match is live',
      destructive: true,
    },
  ];

  return (
    <SheetShell title="Match" subtitle="Everything that is not a delivery" onDismiss={onDismiss}>
      <View className="border-border border-t">
        {items.map((item) => (
          <Row key={item.label} item={item} />
        ))}
      </View>
    </SheetShell>
  );
}

/**
 * Where did that go? — capturing a shot's placement.
 *
 * Reached by holding a runs key rather than by a step in the flow, and that is
 * the whole design. The promise this app makes is one tap per ball; a
 * placement step on every delivery would break it forty times an over, and a
 * scorer watching the cricket would stop using the app rather than stop
 * watching. So a tap records the ball exactly as before, and a hold records
 * the same ball with a shot on it.
 *
 * The columns have been waiting since migration 0019, deliberately: a wagon
 * wheel added later starts empty for every delivery already recorded, and
 * nobody remembers where a cover drive went three seasons ago.
 *
 * Offered only where the ball was struck. Byes and wides never touched the
 * bat, and a dot is the key that most needs to stay instant.
 */
import { useState } from 'react';
import { Text, View } from 'react-native';
import { regionOf, type Placement } from '../../lib/wagon-wheel';
import { tap } from '../../lib/haptics';
import { WagonWheel } from '../WagonWheel';
import { SheetShell } from './Sheets';
import { Button } from '../ui';

const FIELD_SIZE = 260;

export function ShotPlacement({
  runs,
  batterName,
  onCancel,
  onRecord,
}: {
  /** Runs off the bat for the delivery being placed. */
  runs: number;
  batterName: string | null;
  onCancel: () => void;
  /** `null` records the delivery with no placement at all. */
  onRecord: (placement: Placement | null) => void;
}) {
  const [placement, setPlacement] = useState<Placement | null>(null);

  return (
    <SheetShell
      title={`${runs} — where did it go?`}
      subtitle={
        batterName
          ? `${batterName}. Tap the ground; hold the key again to skip this next time.`
          : 'Tap the ground where the ball was hit.'
      }
      onDismiss={onCancel}
      footer={
        <View className="gap-2">
          <Button
            label={placement ? 'Record with placement' : 'Tap the ground first'}
            disabled={placement === null}
            onPress={() => placement && onRecord(placement)}
          />
          {/*
            The way out that still scores the ball.

            Without it, a scorer who opened this by accident mid-over has to
            cancel and tap again — and the delivery they were recording is the
            one thing that must not get lost to a mis-hold.
          */}
          <Button label="Record without it" variant="secondary" onPress={() => onRecord(null)} />
        </View>
      }
    >
      <View className="mt-4 items-center gap-3">
        <WagonWheel
          shots={[]}
          size={FIELD_SIZE}
          highlight={placement}
          onPick={(p) => {
            tap();
            setPlacement(p);
          }}
        />

        {/*
          The reading, in words. The diagram is small and a thumb covers a
          good deal of it, so the sentence is how a scorer checks the tap
          landed where they meant — and it is the only thing a screen reader
          has to go on.
        */}
        <Text
          accessibilityLiveRegion="polite"
          className="text-foreground/70 font-sans text-[13px] leading-[19px]"
        >
          {placement
            ? `${placement.distance}% of the way to the rope, ${regionOf(placement.angle)}.`
            : 'Nothing placed yet. The middle is the striker; the top is straight down the ground.'}
        </Text>
      </View>
    </SheetShell>
  );
}

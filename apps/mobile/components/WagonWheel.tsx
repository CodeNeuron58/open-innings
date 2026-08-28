/**
 * The ground, and where the ball went.
 *
 * One component draws it for both jobs — reading a match back, and capturing a
 * shot while scoring — because two drawings of the same ground would be two
 * conventions, and the second one to drift would be the one nobody checked.
 * Pass `onPick` and it takes taps; leave it off and it is a picture.
 *
 * Drawn with plain views rather than SVG. `react-native-svg` is a native
 * module, so adding it would mean rebuilding the dev client for everyone
 * before a single shot could be plotted — a large cost for a circle, two
 * rings and some straight lines.
 *
 * All the arithmetic is in `lib/wagon-wheel.ts`, including the convention the
 * angles follow and the reason handedness is not applied yet.
 */
import { Pressable, Text, View } from 'react-native';
import {
  lineFor,
  placementFromTap,
  pointFor,
  toneFor,
  type Placement,
  type ShotTone,
} from '../lib/wagon-wheel';

export type Shot = {
  key: string;
  placement: Placement;
  runsOffBat: number;
};

/*
 * Boundaries carry the weight, because a wagon wheel is read for them first.
 * Steel and the wicket navy rather than new colours — Industry is a mono
 * scheme and its readme says not to add decorative colour beyond the accent.
 */
const TONE: Record<ShotTone, string> = {
  six: 'bg-wicket',
  four: 'bg-primary',
  run: 'bg-foreground/30',
};

/** The strip in the middle. Not to scale — it is there to orient the reader. */
function Pitch({ radius }: { radius: number }) {
  const w = Math.max(6, radius * 0.11);
  const h = radius * 0.42;
  return (
    <View
      pointerEvents="none"
      className="border-border absolute border"
      style={{ left: radius - w / 2, top: radius - h / 2, width: w, height: h }}
    />
  );
}

export function WagonWheel({
  shots,
  size,
  onPick,
  highlight,
}: {
  shots: Shot[];
  size: number;
  /** Supply to make the ground tappable. Omit for a read-only wheel. */
  onPick?: (placement: Placement) => void;
  /** Drawn heavier than the rest — the shot being placed right now. */
  highlight?: Placement | null;
}) {
  const radius = size / 2;
  const inner = radius * 0.62;

  const field = (
    <View style={{ width: size, height: size }}>
      {/* The rope. */}
      <View
        pointerEvents="none"
        className="border-border absolute border"
        style={{ width: size, height: size, borderRadius: radius }}
      />
      {/* The ring. Dashed, so it never reads as a second boundary. */}
      <View
        pointerEvents="none"
        className="border-border/60 absolute border border-dashed"
        style={{
          left: radius - inner,
          top: radius - inner,
          width: inner * 2,
          height: inner * 2,
          borderRadius: inner,
        }}
      />
      <Pitch radius={radius} />

      {shots.map((s) => {
        const line = lineFor(s.placement, radius);
        return (
          <View
            key={s.key}
            pointerEvents="none"
            className={`absolute ${TONE[toneFor(s.runsOffBat)]}`}
            style={{
              left: line.left,
              top: line.top,
              width: line.width,
              height: line.height,
              transform: [{ rotate: line.rotate }],
            }}
          />
        );
      })}

      {highlight ? <Marker placement={highlight} radius={radius} /> : null}
    </View>
  );

  if (!onPick) return field;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="The ground. Tap where the ball went."
      onPress={(e) => {
        const { locationX, locationY } = e.nativeEvent;
        const picked = placementFromTap(locationX, locationY, size);
        // A tap on the stumps has no direction — see `placementFromTap`.
        if (picked) onPick(picked);
      }}
      style={{ width: size, height: size }}
    >
      {field}
    </Pressable>
  );
}

/** The shot being placed: its line, drawn heavier, with a dot at the end. */
function Marker({ placement, radius }: { placement: Placement; radius: number }) {
  const line = lineFor(placement, radius, 2.5);
  const end = pointFor(placement, radius);
  const dot = 11;
  return (
    <>
      <View
        pointerEvents="none"
        className="bg-primary absolute"
        style={{
          left: line.left,
          top: line.top,
          width: line.width,
          height: line.height,
          transform: [{ rotate: line.rotate }],
        }}
      />
      <View
        pointerEvents="none"
        className="bg-primary border-background absolute border-2"
        style={{
          left: end.x - dot / 2,
          top: end.y - dot / 2,
          width: dot,
          height: dot,
          borderRadius: dot / 2,
        }}
      />
    </>
  );
}

/** What the colours mean. Shown beside a wheel that has anything on it. */
export function WagonWheelKey() {
  const items: { tone: ShotTone; label: string }[] = [
    { tone: 'six', label: 'Six' },
    { tone: 'four', label: 'Four' },
    { tone: 'run', label: 'Runs' },
  ];
  return (
    <View className="flex-row items-center gap-4">
      {items.map((i) => (
        <View key={i.tone} className="flex-row items-center gap-1.5">
          <View className={`h-0.5 w-4 ${TONE[i.tone]}`} />
          <Text className="font-heading text-[10.5px] uppercase tracking-[1.2px] text-neutral-700">
            {i.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

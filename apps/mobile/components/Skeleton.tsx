/**
 * The shape of what is coming, while it comes.
 *
 * Every screen in this app answered `isLoading` with `<LoadingScreen />` — a
 * centred spinner that replaces the entire UI and is then replaced by the
 * content, so the layout jumps twice and the reader is told nothing about what
 * they are waiting for.
 *
 * A skeleton holds the shape instead. The header stays where it is, the rows
 * appear where the rows will be, and when the data lands nothing moves. That
 * matters most on the screens a scorer opens at a ground on a slow connection,
 * which is all of them.
 *
 * ## Drawn, not filled
 *
 * The Industry system frames things with hairlines rather than grey blocks, so
 * these are outlined bars on the page ground rather than the solid grey
 * rectangles the pattern usually uses. They read as "a row will be here"
 * without pretending to be a row.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';

/**
 * A slow breath, unless the reader has asked for less motion.
 *
 * A skeleton that does not move reads as content that failed to load, which is
 * the opposite of what it is for. A skeleton that pulses hard is worse. This
 * is a shallow opacity cycle — enough to say "still working", not enough to
 * pull the eye off whatever else is on screen.
 */
function usePulse(): Animated.AnimatedInterpolation<number> | 1 {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [value] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setReduceMotion(on);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, value]);

  if (reduceMotion) return 1;
  return value.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] });
}

/** One bar, standing in for a line of type. */
export function SkeletonLine({
  width = 'w-full',
  height = 'h-4',
}: {
  width?: string;
  height?: string;
}) {
  const opacity = usePulse();
  return (
    <Animated.View
      // Not announced. A screen reader user is told the screen is busy by the
      // live region on the content that replaces this, and reading out four
      // placeholder bars is noise.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ opacity }}
      className={`border-border border bg-neutral-200 ${width} ${height}`}
    />
  );
}

/**
 * A list, before it is a list.
 *
 * `rows` should match what the screen is about to show — the point is that
 * nothing moves when the data arrives, and that only works if the placeholder
 * is the same height as the thing it is holding a place for.
 */
export function SkeletonRows({ rows = 4, tall = false }: { rows?: number; tall?: boolean }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading" className="gap-3 px-5 pt-2">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} className={`border-border gap-2.5 border p-4 ${tall ? 'pb-8' : ''}`}>
          <SkeletonLine width="w-1/3" height="h-3" />
          <SkeletonLine width={tall ? 'w-2/3' : 'w-4/5'} height={tall ? 'h-6' : 'h-4'} />
          {tall ? <SkeletonLine width="w-1/2" height="h-3" /> : null}
        </View>
      ))}
    </View>
  );
}

/** A screen with a title and a list under it — the commonest shape here. */
export function SkeletonScreen({ rows = 4, tall = false }: { rows?: number; tall?: boolean }) {
  return (
    <View className="flex-1">
      <View className="gap-2 px-5 pb-3 pt-4">
        <SkeletonLine width="w-2/5" height="h-7" />
        <SkeletonLine width="w-1/4" height="h-3" />
      </View>
      <SkeletonRows rows={rows} tall={tall} />
    </View>
  );
}

/**
 * The scoring console's own shape.
 *
 * The plate, the two batters, the bowler, the over strip and the keypad — in
 * that order and at those heights, so the screen it becomes is the screen it
 * was pretending to be.
 *
 * Worth having its own rather than reusing `SkeletonScreen`: this is the
 * screen most often opened on a ground's connection, and the one where a blank
 * frame is most alarming. A scorer who taps into a live match and sees nothing
 * does not know whether the match is still there.
 */
export function SkeletonConsole() {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading the match"
      className="bg-background flex-1"
    >
      {/* Match bar */}
      <View className="border-border gap-2 border-b px-4 py-3">
        <SkeletonLine width="w-1/2" height="h-4" />
      </View>

      {/* The plate is a filled field in both themes, so it is drawn as one. */}
      <View className="bg-scoreboard gap-3 px-4 pb-4 pt-4">
        <View className="bg-scoreboard-panel h-12 w-2/5" />
        <View className="bg-scoreboard-panel h-3 w-3/5" />
      </View>

      {/* Batters and bowler */}
      <View className="border-border gap-3 border-b px-4 py-3">
        <SkeletonLine width="w-full" height="h-4" />
        <SkeletonLine width="w-full" height="h-4" />
      </View>
      <View className="border-border border-b px-4 py-3">
        <SkeletonLine width="w-4/5" height="h-4" />
      </View>

      {/* Over strip */}
      <View className="flex-row gap-1.5 px-4 py-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonLine key={i} width="w-11" height="h-11" />
        ))}
      </View>

      {/* The keypad, pinned where the keypad is. */}
      <View className="mt-auto px-3 pb-3">
        <View className="border-border gap-2 border p-2.5">
          <View className="flex-row gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={i} className="flex-1">
                <SkeletonLine height="h-12" />
              </View>
            ))}
          </View>
          <SkeletonLine height="h-[116px]" />
        </View>
      </View>
    </View>
  );
}

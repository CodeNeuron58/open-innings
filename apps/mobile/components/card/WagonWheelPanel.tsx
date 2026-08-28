/**
 * An innings as a wagon wheel.
 *
 * Reads whatever placement the scorer captured and says plainly when there is
 * none, which for most matches is the honest answer: capturing a shot is a
 * hold on the runs key rather than a step in the flow, so a scorer who never
 * discovers it — or never wants it — records a perfectly good match with an
 * empty wheel. An empty diagram with no explanation reads as a bug.
 *
 * Filtered by batter, because eleven batters' shots on one ground is a
 * scribble. "All" is offered first and is what a match card is usually opened
 * for; the per-batter view is what a player actually wants to see.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { CardInnings } from '@open-innings/shared';
import { placementOf } from '../../lib/wagon-wheel';
import { WagonWheel, WagonWheelKey, type Shot } from '../WagonWheel';

const ALL = '__all__';

/** Every delivery in this innings that carries a placement. */
function shotsIn(innings: CardInnings): (Shot & { batsmanName: string })[] {
  return innings.deliveries.flatMap((d, i) => {
    const placement = placementOf(d);
    if (!placement) return [];
    return [
      {
        // Over and ball repeat across an innings once an over is re-bowled, so
        // the index is what actually distinguishes two deliveries here.
        key: `${d.overNumber}.${d.ballNumber}.${i}`,
        placement,
        runsOffBat: d.runsOffBat,
        batsmanName: d.batsmanName,
      },
    ];
  });
}

export function WagonWheelPanel({ innings }: { innings: CardInnings }) {
  const [batter, setBatter] = useState<string>(ALL);
  const all = shotsIn(innings);

  if (all.length === 0) {
    return (
      <View className="border-border border p-4">
        <Text className="text-foreground/75 font-sans text-[13.5px] leading-5">
          No shot placement recorded for this innings.
        </Text>
        <Text className="text-foreground/55 mt-2 font-sans text-[13px] leading-[19px]">
          While scoring, hold a runs key instead of tapping it to say where the ball went. A normal
          tap records the ball exactly as before.
        </Text>
      </View>
    );
  }

  // In the order they first appear, which is batting order.
  const batters = all.reduce<string[]>(
    (acc, s) => (acc.includes(s.batsmanName) ? acc : [...acc, s.batsmanName]),
    [],
  );
  const shown = batter === ALL ? all : all.filter((s) => s.batsmanName === batter);

  const runs = shown.reduce((n, s) => n + s.runsOffBat, 0);
  const fours = shown.filter((s) => s.runsOffBat === 4).length;
  const sixes = shown.filter((s) => s.runsOffBat >= 6).length;

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        {[ALL, ...batters].map((name) => {
          const on = batter === name;
          return (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setBatter(name)}
              className={`min-h-9 justify-center border px-3 py-1.5 active:opacity-70 ${
                on ? 'bg-primary border-primary' : 'border-border'
              }`}
            >
              <Text
                className={`font-heading text-[11.5px] uppercase tracking-[1.2px] ${
                  on ? 'text-primary-foreground' : 'text-foreground'
                }`}
              >
                {name === ALL ? 'All' : name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="border-border items-center border p-4">
        <WagonWheel shots={shown} size={260} />
      </View>

      <View className="flex-row items-center justify-between">
        <WagonWheelKey />
        <Text className="font-heading text-[10.5px] uppercase tracking-[1.2px] text-neutral-700">
          {shown.length} {shown.length === 1 ? 'shot' : 'shots'} · {runs} runs
        </Text>
      </View>

      {fours > 0 || sixes > 0 ? (
        <Text className="text-foreground/60 font-sans text-[12.5px]">
          {fours} four{fours === 1 ? '' : 's'} and {sixes} six{sixes === 1 ? '' : 'es'} placed.
        </Text>
      ) : null}

      {/*
        Said once, here, because a left-hander's wheel otherwise looks simply
        wrong to anyone who knows the player. See `lib/wagon-wheel.ts`.
      */}
      <Text className="text-foreground/55 font-sans text-[12px] leading-[17px]">
        Drawn from the striker&rsquo;s own point of view — the middle is the batter, the top is
        straight down the ground. Sides are not yet mirrored for left-handers.
      </Text>
    </View>
  );
}

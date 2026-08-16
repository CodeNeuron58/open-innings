/**
 * C3 — end of over.
 *
 * A full screen rather than the sheet this used to be. The bowler change is
 * the one moment in an over when the scorer has time and the captain is
 * deciding something, so it is worth showing the over that just went, the
 * figures of everyone who could bowl the next one, and how much each of them
 * has left. A list of eleven names in a modal answered none of that.
 *
 * Blocking by design: the engine cannot validate the next delivery until it
 * knows who is bowling, so there is no dismiss. "Undo last ball" is the way
 * out, because the usual reason to be here wrongly is a mis-recorded sixth
 * ball.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatOvers, type BallEvent, type BowlerStats } from '@open-innings/scoring';
import { Button } from '../ui';
import { BallChip } from './BallChip';

export type BowlerOption = {
  id: string;
  fullName: string;
  stats?: BowlerStats;
};

/**
 * How many overs one bowler may bowl.
 *
 * A fifth of the innings, rounded up — the near-universal limited-overs
 * playing condition (4 in a T20, 10 in a 50-over game).
 *
 * ⚠️ The engine does **not** enforce this; it is a playing condition, not a
 * Law, and `applyBall` will happily accept a fifth over from the same bowler.
 * So this figure is guidance the screen renders, and the block below is a
 * courtesy rather than a rule — see the note on `spent`.
 */
function quotaFor(oversPerInnings: number): number {
  return Math.max(1, Math.ceil(oversPerInnings / 5));
}

function economy(stats?: BowlerStats): string {
  if (!stats || stats.balls === 0) return '—';
  return ((stats.runs / stats.balls) * 6).toFixed(1);
}

function figures(stats?: BowlerStats): string {
  return `${formatOvers(stats?.balls ?? 0)}-${stats?.maidens ?? 0}-${stats?.runs ?? 0}-${
    stats?.wickets ?? 0
  }`;
}

export function EndOfOver({
  oversCompleted,
  oversPerInnings,
  runs,
  wickets,
  target,
  ballsRemaining,
  overBalls,
  lastBowlerId,
  lastBowlerName,
  lastBowlerStats,
  candidates,
  strikerName,
  strikerRuns,
  strikerBalls,
  onConfirm,
  onUndo,
  busy,
}: {
  /** Overs bowled so far — the one just finished is this number. */
  oversCompleted: number;
  oversPerInnings: number;
  runs: number;
  wickets: number;
  target?: number;
  ballsRemaining: number;
  overBalls: BallEvent[];
  lastBowlerId: string;
  lastBowlerName: string;
  lastBowlerStats?: BowlerStats;
  /** The whole bowling side, including the bowler who just finished. */
  candidates: BowlerOption[];
  strikerName: string;
  strikerRuns: number;
  strikerBalls: number;
  onConfirm: (bowlerId: string) => void;
  onUndo: () => void;
  busy: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  const nextOver = oversCompleted + 1;
  const quota = quotaFor(oversPerInnings);
  const runsThisOver = overBalls.reduce((sum, b) => sum + b.totalRuns, 0);
  const wicketsThisOver = overBalls.filter((b) => b.wicketType).length;

  const oversLeftFor = (o: BowlerOption) =>
    Math.max(0, quota - Math.ceil((o.stats?.balls ?? 0) / 6));

  // Law 16.2 — no bowler bowls two overs in succession. The engine enforces
  // this, so the screen must too: offering the name would produce a rejected
  // delivery and a scorer wondering what they did wrong.
  const eligible = candidates.filter((o) => o.id !== lastBowlerId);

  // The quota block is a courtesy, not a rule, so it must never be able to
  // leave a scorer with nobody to pick. In a game with four bowlers it stays
  // out of the way.
  const someoneHasOversLeft = eligible.some((o) => oversLeftFor(o) > 0);

  const chaseLine =
    target !== undefined
      ? `need ${Math.max(0, target - runs)} off ${ballsRemaining}`
      : `${oversPerInnings - oversCompleted} over${
          oversPerInnings - oversCompleted === 1 ? '' : 's'
        } left`;

  return (
    <Modal visible transparent={false} animationType="slide">
      <SafeAreaView className="bg-background flex-1">
        {/* The plate — the over that just went */}
        <View className="bg-scoreboard px-4 pb-3.5 pt-3.5">
          <View className="flex-row items-baseline justify-between gap-3">
            <Text className="text-scoreboard-muted font-heading shrink-0 text-[10px] uppercase tracking-[1.5px]">
              End of over {oversCompleted}
            </Text>
            <Text className="text-scoreboard-text font-heading shrink-0 text-[14px]">
              {runs}-{wickets}
              <Text className="text-scoreboard-muted"> · {chaseLine}</Text>
            </Text>
          </View>

          <View className="mt-2.5 flex-row flex-wrap gap-1.5">
            {overBalls.map((b, i) => (
              <BallChip key={`${b.ballNumber}-${i}`} ball={b} onDark />
            ))}
          </View>
        </View>

        <ScrollView contentContainerClassName="pb-3">
          {/* Who just bowled it */}
          <View className="border-border flex-row items-baseline gap-2 border-b px-4 py-3">
            <Text className="text-foreground min-w-0 shrink text-[14px]" numberOfLines={1}>
              <Text className="font-heading">{lastBowlerName}</Text> finished
            </Text>
            <Text className="text-foreground font-heading shrink-0 text-[14px]">
              {figures(lastBowlerStats)}
            </Text>
            <Text className="text-foreground/55 ml-auto shrink-0 text-[12px]">
              {runsThisOver} off the over
              {wicketsThisOver > 0
                ? `, ${wicketsThisOver} wkt${wicketsThisOver === 1 ? '' : 's'}`
                : ''}
            </Text>
          </View>

          <View className="px-4 pb-2 pt-3.5">
            <Text className="font-heading text-[9.5px] uppercase tracking-[1.5px] text-neutral-600">
              Bowler for over {nextOver}
            </Text>
          </View>

          {/* The bowler who just finished, shown and blocked. Leaving them out
              entirely reads as "we lost him"; struck through says why. */}
          <BowlerRow
            name={lastBowlerName}
            figures={figures(lastBowlerStats)}
            note="Bowled the last over"
            disabled
            selected={false}
            onPress={() => {}}
          />

          {eligible.map((o) => {
            const left = oversLeftFor(o);
            const spent = left === 0 && someoneHasOversLeft;
            return (
              <BowlerRow
                key={o.id}
                name={o.fullName}
                figures={figures(o.stats)}
                note={
                  spent
                    ? 'Quota bowled'
                    : `${left} over${left === 1 ? '' : 's'} left${
                        (o.stats?.balls ?? 0) > 0 ? ` · econ ${economy(o.stats)}` : ''
                      }`
                }
                disabled={spent || busy}
                selected={picked === o.id}
                onPress={() => setPicked(o.id)}
              />
            );
          })}

          {eligible.length === 0 ? (
            <View className="border-border mx-4 mt-2 border p-4">
              <Text className="text-foreground/70 text-[13.5px] leading-5">
                Nobody else in the squad can bowl this over. Add players to the bowling side, or
                undo the last ball if the over ended by mistake.
              </Text>
            </View>
          ) : null}

          <View className="border-border mx-4 mt-3 flex-row gap-2 border-t pt-3">
            <Text className="text-foreground/45 shrink-0 text-[12px]">ⓘ</Text>
            <Text className="text-foreground/55 min-w-0 flex-1 text-[12px] leading-[17px]">
              Law 16.2 — a bowler may not bowl two overs in succession. {lastBowlerName} is held out
              until this over is scored.
            </Text>
          </View>

          {/* Strike. Shown, not editable: the engine rotates the strike itself
              at the end of an over, and there is no event that would let the
              app override it. See docs/wiring.md for the swap-ends gap. */}
          <View className="border-border mx-4 mt-3 flex-row items-baseline justify-between gap-3 border-t pt-3">
            <Text className="font-heading shrink-0 text-[9.5px] uppercase tracking-[1.5px] text-neutral-600">
              On strike
            </Text>
            <Text className="text-foreground font-heading min-w-0 shrink text-[14px]">
              {strikerName}{' '}
              <Text className="text-foreground/55">
                {strikerRuns}({strikerBalls})
              </Text>
            </Text>
          </View>
        </ScrollView>

        <View className="px-4 pb-3 pt-1">
          <Button
            label={`Bowl over ${nextOver}`}
            disabled={!picked}
            loading={busy}
            onPress={() => picked && onConfirm(picked)}
          />
          <View className="mt-2">
            <Button label="Undo last ball" variant="ghost" onPress={onUndo} />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function BowlerRow({
  name,
  figures: fig,
  note,
  disabled,
  selected,
  onPress,
}: {
  name: string;
  figures: string;
  note: string;
  disabled: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${name}, ${fig}, ${note}`}
      onPress={onPress}
      disabled={disabled}
      className={`border-border flex-row items-center gap-2.5 border-b px-4 py-3 ${
        selected ? 'bg-steel-100 border-l-primary border-l-4 pl-3' : ''
      } ${disabled ? 'opacity-45' : 'active:opacity-70'}`}
    >
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-[15px]" numberOfLines={1}>
          {name}
        </Text>
        <Text
          className="font-heading mt-0.5 text-[9.5px] uppercase tracking-[1.4px] text-neutral-600"
          numberOfLines={1}
        >
          {note}
        </Text>
      </View>
      <Text className="text-foreground font-heading shrink-0 text-[14px]">{fig}</Text>
    </Pressable>
  );
}

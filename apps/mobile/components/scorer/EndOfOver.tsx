/**
 * End of over screen.
 * Shows the previous over, bowler figures, and remaining quotas. Blocking by design.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { formatOvers, type BallEvent, type BowlerStats } from '@open-innings/scoring';
import { tap } from '../../lib/haptics';
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
 * **The match decides this, not this screen.** It is a playing condition
 * rather than a Law — competitions differ and gully cricket ignores it — so it
 * is stored per match and the engine enforces it. `maxOversPerBowler` arrives
 * on the innings state; null means the match set no limit.
 *
 * This used to compute a fifth of the innings locally and its comment said the
 * engine "will happily accept a fifth over from the same bowler". That was
 * true when it was written and is not any more, which is the worse of the two
 * failures: a screen greying out a bowler for a rule nothing enforced, beside
 * a server that would now refuse one this screen had allowed.
 */
function quotaFrom(maxOversPerBowler: number | undefined): number | null {
  return maxOversPerBowler ?? null;
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
  maxOversPerBowler,
  runs,
  wickets,
  target,
  ballsRemaining,
  overBalls,
  lastBowlerId,
  lastBowlerName,
  lastBowlerStats,
  candidates,
  previousBowlerId,
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
  /** The match's per-bowler limit. Undefined when it set none. */
  maxOversPerBowler?: number;
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
  /**
   * Who bowled the over before last.
   *
   * Ends alternate, so the bowler of over N-2 was at the same end as the over
   * about to start — which in an ordinary rotation is exactly who bowls it.
   * The list used to be the whole side in roster order with no memory of the
   * rotation at all, so the commonest choice in cricket took as many taps as
   * the rarest.
   */
  previousBowlerId?: string | null;
  strikerName: string;
  strikerRuns: number;
  strikerBalls: number;
  onConfirm: (bowlerId: string) => void;
  onUndo: () => void;
  busy: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  const nextOver = oversCompleted + 1;
  const quota = quotaFrom(maxOversPerBowler);
  const runsThisOver = overBalls.reduce((sum, b) => sum + b.totalRuns, 0);
  const wicketsThisOver = overBalls.filter((b) => b.wicketType).length;

  /** Overs this bowler has left, or null when the match set no limit. */
  const oversLeftFor = (o: BowlerOption) =>
    quota === null ? null : Math.max(0, quota - Math.ceil((o.stats?.balls ?? 0) / 6));

  // Law 16.2 — no bowler bowls two overs in succession. The engine enforces
  // this, so the screen must too: offering the name would produce a rejected
  // delivery and a scorer wondering what they did wrong.
  const available = candidates.filter((o) => o.id !== lastBowlerId);

  /*
   * The likely one first, and already chosen.
   *
   * Most sides rotate five or six bowlers in a fixed pattern from two ends, so
   * the person who bowled two overs ago is the answer far more often than not.
   * Offering them at the top, selected, turns the commonest interaction in the
   * match from "read a list, tap a name, tap confirm" into one tap.
   *
   * It is a default, not a decision — everyone else is still one tap away
   * underneath, and a side that does not rotate that way loses nothing.
   */
  const eligible = [...available].sort((a, b) => {
    const likely = (o: BowlerOption) => (o.id === previousBowlerId ? 0 : 1);
    if (likely(a) !== likely(b)) return likely(a) - likely(b);
    // Then whoever has most left to give, so a spent bowler is never near the top.
    const left = (o: BowlerOption) => oversLeftFor(o) ?? Number.POSITIVE_INFINITY;
    return left(b) - left(a);
  });

  const suggested =
    previousBowlerId && available.some((o) => o.id === previousBowlerId && oversLeftFor(o) !== 0)
      ? previousBowlerId
      : null;

  const choice = picked ?? suggested;

  /*
   * A bowler out of overs is blocked, full stop.
   *
   * This used to be conditional on somebody else still having overs left, on
   * the reasoning that the quota was a courtesy the screen invented and must
   * never trap anyone. It is not a courtesy any more — the engine refuses the
   * delivery — so softening it here would only move the refusal from a greyed
   * row to a red banner after the tap.
   *
   * The deadlock that guard existed to prevent is now prevented where it
   * should be: the server only applies a default quota when the bowling side
   * can actually cover the innings under it.
   */
  const spentFor = (o: BowlerOption) => oversLeftFor(o) === 0;
  const nobodyLeft = eligible.length > 0 && eligible.every(spentFor);

  const chaseLine =
    target !== undefined
      ? `need ${Math.max(0, target - runs)} off ${ballsRemaining}`
      : `${oversPerInnings - oversCompleted} over${
          oversPerInnings - oversCompleted === 1 ? '' : 's'
        } left`;

  /*
   * A sheet over the console, not a screen instead of it.
   *
   * This was a full-screen `Modal` with `transparent={false}`, which in a T20
   * means forty complete takeovers of the app — one after every over. It had a
   * "Peek board" mode precisely because it had hidden the board, and that mode
   * is gone with it: the score plate is now four inches above this, where it
   * was the whole time.
   */
  return (
    <Modal visible transparent animationType="slide">
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-background border-border max-h-[80%] border-t-2">
          {/* The over that just went */}
          <View className="bg-scoreboard px-4 pb-3 pt-3">
            <View className="flex-row items-baseline justify-between gap-3">
              <Text className="text-scoreboard-muted font-heading shrink-0 text-[10.5px] uppercase tracking-[1.5px]">
                End of over {oversCompleted}
              </Text>
              <Text className="text-scoreboard-text font-heading shrink-0 text-[15px]">
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
              <Text className="text-foreground min-w-0 shrink text-[15px]" numberOfLines={1}>
                <Text className="font-heading">{lastBowlerName}</Text> finished
              </Text>
              <Text className="text-foreground font-heading shrink-0 text-[15px]">
                {figures(lastBowlerStats)}
              </Text>
              <Text className="text-foreground/70 ml-auto shrink-0 text-[13.5px]">
                {runsThisOver} off the over
                {wicketsThisOver > 0
                  ? `, ${wicketsThisOver} wkt${wicketsThisOver === 1 ? '' : 's'}`
                  : ''}
              </Text>
            </View>

            <View className="px-4 pb-2 pt-3.5">
              <Text className="font-heading text-[11px] uppercase tracking-[1.5px] text-neutral-700">
                Bowler for over {nextOver}
              </Text>
            </View>

            {/* The bowler who just finished, shown and blocked per Law 16.2. */}
            <BowlerRow
              name={lastBowlerName}
              figures={figures(lastBowlerStats)}
              note="Bowled previous over (Law 16.2 restriction)"
              disabled
              selected={false}
              onPress={() => {}}
            />

            {nobodyLeft ? (
              <View className="border-destructive/40 bg-destructive/5 mt-2 border p-3">
                <Text className="text-foreground text-[13.5px] leading-[19px]">
                  Every available bowler has bowled their {quota} over
                  {quota === 1 ? '' : 's'}. Undo the last ball, or end the innings from the next
                  batter sheet.
                </Text>
              </View>
            ) : null}

            {eligible.map((o) => {
              const left = oversLeftFor(o);
              const spent = spentFor(o);
              const econ = (o.stats?.balls ?? 0) > 0 ? ` · econ ${economy(o.stats)}` : '';
              return (
                <BowlerRow
                  key={o.id}
                  name={o.fullName}
                  figures={figures(o.stats)}
                  note={
                    spent
                      ? 'Quota bowled'
                      : o.id === suggested
                        ? 'Bowled from this end last over'
                        : left === null
                          ? // No limit on this match, so overs left is not a number
                            // that exists. Say what is known instead of inventing one.
                            `${o.stats?.balls ? formatOvers(o.stats.balls) : '0.0'} bowled${econ}`
                          : `${left} over${left === 1 ? '' : 's'} left${econ}`
                  }
                  disabled={spent || busy}
                  selected={choice === o.id}
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
              <Text className="text-foreground/60 shrink-0 text-[13.5px]">ⓘ</Text>
              <Text className="text-foreground/70 min-w-0 flex-1 text-[13.5px] leading-[17px]">
                Law 16.2 — a bowler may not bowl two overs in succession. {lastBowlerName} is held
                out until this over is scored.
              </Text>
            </View>

            {/* Strike. Shown, not editable: the engine rotates the strike itself
              at the end of an over, and there is no event that would let the
              app override it. See docs/wiring.md for the swap-ends gap. */}
            <View className="border-border mx-4 mt-3 flex-row items-baseline justify-between gap-3 border-t pt-3">
              <Text className="font-heading shrink-0 text-[11px] uppercase tracking-[1.5px] text-neutral-700">
                On strike
              </Text>
              <Text className="text-foreground font-heading min-w-0 shrink text-[15px]">
                {strikerName}{' '}
                <Text className="text-foreground/70">
                  {strikerRuns}({strikerBalls})
                </Text>
              </Text>
            </View>
          </ScrollView>

          <View className="border-border border-t px-4 pb-4 pt-3">
            <Button
              label={`Bowl over ${nextOver}`}
              disabled={!choice}
              loading={busy}
              onPress={() => choice && onConfirm(choice)}
            />
            <View className="mt-2">
              <Button label="Undo last ball" variant="ghost" onPress={onUndo} />
            </View>
          </View>
        </View>
      </View>
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
      onPress={() => {
        tap();
        onPress();
      }}
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
          className="font-heading mt-0.5 text-[11px] uppercase tracking-[1.4px] text-neutral-700"
          numberOfLines={1}
        >
          {note}
        </Text>
      </View>
      <Text className="text-foreground font-heading shrink-0 text-[15px]">{fig}</Text>
    </Pressable>
  );
}

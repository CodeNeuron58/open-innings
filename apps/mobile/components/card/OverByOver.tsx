/**
 * D2 — over by over.
 *
 * Newest over first, because during a match the only ball anyone wants is the
 * one that just happened, and afterwards everyone is scrolling regardless.
 *
 * The lines come from `describeBall` in the engine, which derives every clause
 * from the ball log and invents nothing. That is the point: this feed sits one
 * tab away from a scorecard people are checking against a paper book, and a
 * generated flourish about where a shot went would be a lie printed next to a
 * verified number.
 *
 * The chase equation ("20 needed became 16") is computed here rather than in
 * the engine, because it needs the running total and a single BallEvent does
 * not carry one.
 */
import { Text, View } from 'react-native';
import {
  describeBall,
  groupIntoOvers,
  ballInOverFor,
  asInningsId,
  asPlayerId,
  type BallEvent,
} from '@open-innings/scoring';
import type { CardDelivery, CardInnings } from '@open-innings/shared';
import { Kicker } from '../ui';

/**
 * The API sends deliveries with names already resolved; `describeBall` wants
 * engine events. This adapts one to the other.
 *
 * `id` carries the delivery's index in the original array. `groupIntoOvers`
 * reorders, and this is how a grouped ball finds the row it came from without
 * a linear search per render.
 */
function toBallEvent(d: CardDelivery, index: number): BallEvent {
  return {
    id: String(index),
    inningsId: asInningsId(''),
    overNumber: d.overNumber,
    ballNumber: d.ballNumber,
    eventType: d.eventType as BallEvent['eventType'],
    runsOffBat: d.runsOffBat,
    extraRuns: d.extraRuns,
    totalRuns: d.totalRuns,
    isLegalDelivery: d.isLegalDelivery,
    isFreeHit: false,
    // Placeholders: the names travelled with the row, so nothing downstream
    // resolves these. Branding them keeps the engine's types honest rather
    // than pretending we shipped ids we did not.
    batsmanId: asPlayerId(''),
    nonStrikerId: asPlayerId(''),
    bowlerId: asPlayerId(''),
    wicketType: (d.wicketType as BallEvent['wicketType']) ?? undefined,
    commentary: d.commentary ?? undefined,
  };
}

export function OverByOver({ innings }: { innings: CardInnings }) {
  if (innings.deliveries.length === 0) {
    return (
      <View className="border-border border p-4">
        <Text className="text-foreground/70 text-[13.5px] leading-5">
          No deliveries in this innings yet.
        </Text>
      </View>
    );
  }

  // Runs scored and legal balls bowled *before* each delivery, so the chase
  // equation can be stated at the point it changed. One pass, not a scan per
  // row.
  const runsBefore: number[] = [];
  const legalBefore: number[] = [];
  let runs = 0;
  let legal = 0;
  for (const d of innings.deliveries) {
    runsBefore.push(runs);
    legalBefore.push(legal);
    runs += d.totalRuns;
    if (d.isLegalDelivery) legal += 1;
  }

  const overs = groupIntoOvers(
    innings.deliveries.map(toBallEvent),
    // Bowler names already travelled with the rows; groupIntoOvers resolves
    // from the first ball of each over, so hand it that row's bowler.
    () => '',
  ).map((over) => ({
    ...over,
    bowlerName: innings.deliveries[Number(over.balls[0]?.id ?? 0)]?.bowlerName ?? '',
  }));

  const totalLegalBalls = legal;
  const { target } = innings;

  return (
    <View>
      {overs.map((over) => (
        <View key={over.overNumber} className="mb-4">
          <View className="border-border flex-row items-baseline justify-between gap-3 border-b pb-1.5">
            <Kicker>Over {over.overNumber}</Kicker>
            <Text
              className="font-heading min-w-0 shrink text-right text-[10px] uppercase tracking-[1.3px] text-neutral-600"
              numberOfLines={1}
            >
              {over.bowlerName} · {over.runs} run{over.runs === 1 ? '' : 's'}
              {over.wickets > 0 ? `, ${over.wickets} wkt${over.wickets === 1 ? '' : 's'}` : ''}
            </Text>
          </View>

          {/* Within an over, newest ball first too. */}
          {over.balls
            .map((ball, i) => ({ ball, i }))
            .reverse()
            .map(({ ball, i }) => {
              const source = innings.deliveries[Number(ball.id)];
              if (!source) return null;

              const before = runsBefore[Number(ball.id)] ?? 0;
              const needed = target !== null ? Math.max(0, target - before) : undefined;

              const line = describeBall(ball, {
                bowlerName: source.bowlerName,
                batterName: source.batsmanName,
                outBatterName: source.outBatterName ?? undefined,
                fielderName: source.fielderName ?? undefined,
                runsNeededBefore: needed,
                ballsRemainingBefore:
                  needed !== undefined
                    ? totalLegalBalls - (legalBefore[Number(ball.id)] ?? 0)
                    : undefined,
                // The chase was still live before this ball and is not after.
                endsMatch:
                  needed !== undefined && needed > 0 && before + ball.totalRuns >= (target ?? 0),
              });

              return (
                <View
                  key={ball.id}
                  className="border-border flex-row items-start gap-3 border-b py-2"
                >
                  <Text className="font-heading w-[30px] shrink-0 text-[11px] text-neutral-600">
                    {over.overNumber}.{ballInOverFor(over.balls, i)}
                  </Text>
                  <Text className="text-foreground min-w-0 flex-1 text-[13px] leading-[18px]">
                    {line}
                  </Text>
                </View>
              );
            })}
        </View>
      ))}
    </View>
  );
}

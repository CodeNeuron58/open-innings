/**
 * Correcting a delivery that has already been recorded.
 *
 * Undo only ever reached the last ball, so a scorer who noticed at the end of
 * the over that the third one was wrong had to undo four deliveries and
 * re-enter them from memory, in front of everyone, with the game waiting.
 * Tapping the chip and re-entering the one delivery is the whole feature.
 *
 * ## Two screens, and the second is the point
 *
 * A correction is not local. One run instead of two rotates the strike, so
 * every delivery after it was faced by the other batter — and the server says
 * exactly what moved. That has to be **shown and accepted**, not applied
 * silently: a card that rearranges itself while you watch is indistinguishable
 * from a bug, and a scorer who cannot tell the difference stops trusting the
 * app for the rest of the match.
 *
 * So: choose the delivery, send it, read what it did. The second screen is
 * not a success toast; it is the receipt.
 *
 * ## Why the batters are not offered
 *
 * Who was on strike is **derived** — the app fills it from engine state and
 * the scorer never picks it. Offering it here would invite somebody to
 * "correct" the consequence of the mistake instead of the mistake, and the
 * two disagree. The one case that genuinely needs a name — the wrong batter
 * sent in after a wicket — is the next-batter sheet's job, on the delivery
 * that actually recorded it.
 */
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { BallEvent } from '@open-innings/scoring';
import type { BallCorrectionChange, PatchBallInput } from '@open-innings/shared';
import { Button } from '../ui';

type Kind = { label: string; build: () => Omit<PatchBallInput, 'bowlerId'> };

/**
 * What one delivery can be corrected to.
 *
 * Runs and the four common extras. A **wicket** is deliberately absent: it
 * needs a dismissal type, a batter and often a fielder, which is the wicket
 * sheet's whole job — and half a wicket recorded from here would be worse
 * than the mistake being fixed. Removing a wicket is expressible (correct it
 * to whatever actually happened) and that is the direction people need.
 */
const KINDS: Kind[] = [
  { label: '•', build: () => ({ eventType: 'dot', runsOffBat: 0, extraRuns: 0 }) },
  { label: '1', build: () => ({ eventType: '1', runsOffBat: 1, extraRuns: 0 }) },
  { label: '2', build: () => ({ eventType: '2', runsOffBat: 2, extraRuns: 0 }) },
  { label: '3', build: () => ({ eventType: '3', runsOffBat: 3, extraRuns: 0 }) },
  { label: '4', build: () => ({ eventType: '4', runsOffBat: 4, extraRuns: 0 }) },
  { label: '6', build: () => ({ eventType: '6', runsOffBat: 6, extraRuns: 0 }) },
  { label: 'wd', build: () => ({ eventType: 'wide', runsOffBat: 0, extraRuns: 1 }) },
  { label: 'nb', build: () => ({ eventType: 'no_ball', runsOffBat: 0, extraRuns: 1 }) },
  { label: 'b', build: () => ({ eventType: 'bye', runsOffBat: 0, extraRuns: 1 }) },
  { label: 'lb', build: () => ({ eventType: 'leg_bye', runsOffBat: 0, extraRuns: 1 }) },
];

/** How the delivery currently reads, so the scorer can see what they are replacing. */
function currentLabel(ball: BallEvent): string {
  if (ball.wicketType) return `W (${ball.wicketType.replace(/_/g, ' ')})`;
  switch (ball.eventType) {
    case 'wide':
      return ball.totalRuns > 1 ? `wide + ${ball.totalRuns - 1}` : 'wide';
    case 'no_ball':
      return ball.totalRuns > 1 ? `no ball + ${ball.totalRuns - 1}` : 'no ball';
    case 'bye':
      return `${ball.totalRuns} bye${ball.totalRuns === 1 ? '' : 's'}`;
    case 'leg_bye':
      return `${ball.totalRuns} leg bye${ball.totalRuns === 1 ? '' : 's'}`;
    case 'dot':
      return 'dot ball';
    default:
      return `${ball.runsOffBat} off the bat`;
  }
}

export function CorrectBallSheet({
  ball,
  position,
  busy,
  error,
  changes,
  onCorrect,
  onDismiss,
}: {
  ball: BallEvent;
  /** `1.3`, as a scorer would call it. */
  position: string;
  busy: boolean;
  error: string | null;
  /** Non-null once the server has replied — switches this to the receipt. */
  changes: BallCorrectionChange[] | null;
  onCorrect: (patch: Omit<PatchBallInput, 'bowlerId'>) => void;
  onDismiss: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [extraRuns, setExtraRuns] = useState(1);

  const kind = picked === null ? null : KINDS[picked]!;
  const isExtra = kind ? ['wd', 'nb', 'b', 'lb'].includes(kind.label) : false;

  function confirm() {
    if (!kind) return;
    const base = kind.build();
    // A no-ball is the one extra that can also be struck, so its extra runs
    // stay the penalty and the rest goes off the bat.
    if (isExtra) {
      onCorrect({ ...base, extraRuns });
      return;
    }
    onCorrect(base);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDismiss}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-background border-border max-h-[88%] border-t-2 px-4 pb-4 pt-3.5">
          <View className="flex-row items-baseline justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-foreground font-heading text-[21px]">
                {changes ? 'Corrected' : `Correct ball ${position}`}
              </Text>
              <Text className="text-foreground/65 mt-0.5 text-[12.5px]">
                {changes
                  ? 'Everything the change moved, so you can check it.'
                  : `Recorded as ${currentLabel(ball)}.`}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={changes ? 'Done' : 'Cancel'}
              onPress={onDismiss}
              className="shrink-0 px-1 py-1 active:opacity-60"
            >
              <Text className="font-heading text-[11px] uppercase tracking-[1.4px] text-neutral-600">
                {changes ? 'Done' : 'Cancel'}
              </Text>
            </Pressable>
          </View>

          <ScrollView className="mt-4" contentContainerClassName="gap-4 pb-1">
            {error ? (
              <View className="border-wicket bg-wicket/10 border p-3">
                <Text className="text-foreground text-[13px] leading-[19px]">{error}</Text>
              </View>
            ) : null}

            {changes ? (
              <View>
                {changes.length === 0 ? (
                  <Text className="text-foreground/70 text-[13.5px] leading-5">
                    Nothing else moved. The delivery now reads the way you entered it and the rest
                    of the innings is unchanged.
                  </Text>
                ) : (
                  <View className="border-border border-t">
                    {changes.map((c, i) => (
                      <View
                        key={`${c.ballNumber}-${c.what}-${i}`}
                        className="border-border border-b py-2.5"
                      >
                        <Text className="font-heading text-[9px] uppercase tracking-[1.3px] text-neutral-600">
                          Ball {c.over}
                        </Text>
                        <Text className="text-foreground mt-0.5 text-[13.5px] leading-[19px]">
                          {c.detail}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <>
                <View>
                  <Text className="font-heading text-[9.5px] uppercase tracking-[1.5px] text-neutral-600">
                    It was actually
                  </Text>
                  <View className="mt-2 flex-row flex-wrap gap-1.5">
                    {KINDS.map((k, i) => (
                      <Pressable
                        key={k.label}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: picked === i }}
                        onPress={() => {
                          setPicked(i);
                          setExtraRuns(1);
                        }}
                        className={`h-11 w-[52px] items-center justify-center border ${
                          picked === i ? 'bg-scoreboard border-scoreboard' : 'border-input'
                        } active:opacity-70`}
                      >
                        <Text
                          className={`font-heading text-[14px] ${
                            picked === i ? 'text-scoreboard-text' : 'text-foreground'
                          }`}
                        >
                          {k.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {isExtra ? (
                  <View>
                    <Text className="font-heading text-[9.5px] uppercase tracking-[1.5px] text-neutral-600">
                      Runs
                    </Text>
                    <View className="mt-2 flex-row flex-wrap gap-1.5">
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <Pressable
                          key={n}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: extraRuns === n }}
                          onPress={() => setExtraRuns(n)}
                          className={`h-11 w-[52px] items-center justify-center border ${
                            extraRuns === n ? 'bg-scoreboard border-scoreboard' : 'border-input'
                          } active:opacity-70`}
                        >
                          <Text
                            className={`font-heading text-[14px] ${
                              extraRuns === n ? 'text-scoreboard-text' : 'text-foreground'
                            }`}
                          >
                            {n}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}

                {/*
                  Said before the tap, not after. Correcting a delivery in the
                  middle rewrites who faced everything after it, and a scorer
                  who learns that from the result is a scorer who has already
                  lost confidence in the card.
                */}
                <Text className="text-foreground/60 text-[12px] leading-[17px]">
                  Anything after this ball is re-checked against the laws. If the correction makes a
                  later delivery impossible, nothing is saved and you will be told which one.
                </Text>

                {busy ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" />
                    <Text className="font-heading text-[9.5px] uppercase tracking-[1.3px] text-neutral-600">
                      Replaying the innings
                    </Text>
                  </View>
                ) : (
                  <Button label="Correct it" disabled={picked === null} onPress={confirm} />
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

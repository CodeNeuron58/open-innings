/**
 * Correcting a delivery that has already been recorded.
 * Replaces a single delivery and shows the resulting changes to the innings.
 */
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { BallEvent } from '@open-innings/scoring';
import type { BallCorrectionChange, PatchBallInput } from '@open-innings/shared';
import { EXTRA_TOTALS, deliveryFor, type ExtraKind } from '../../lib/deliveries';
import { Button } from '../ui';

/**
 * What one delivery can be corrected to.
 *
 * Runs and the four common extras. A **wicket** is deliberately absent: it
 * needs a dismissal type, a batter and often a fielder, which is the wicket
 * sheet's whole job — and half a wicket recorded from here would be worse
 * than the mistake being fixed. Removing a wicket is expressible (correct it
 * to whatever actually happened) and that is the direction people need.
 *
 * The payloads come from `deliveryFor`, the same function the scorer's own
 * keypad uses. They were hand-written here first, and the no-ball case was
 * already wrong — see `lib/deliveries.ts`.
 */
type Choice =
  | { kind: 'runs'; runs: number; label: string }
  | { kind: 'extra'; extra: ExtraKind; label: string };

const CHOICES: Choice[] = [
  { kind: 'runs', runs: 0, label: '•' },
  { kind: 'runs', runs: 1, label: '1' },
  { kind: 'runs', runs: 2, label: '2' },
  { kind: 'runs', runs: 3, label: '3' },
  { kind: 'runs', runs: 4, label: '4' },
  { kind: 'runs', runs: 6, label: '6' },
  { kind: 'extra', extra: 'wide', label: 'wd' },
  { kind: 'extra', extra: 'no_ball', label: 'nb' },
  { kind: 'extra', extra: 'bye', label: 'b' },
  { kind: 'extra', extra: 'leg_bye', label: 'lb' },
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
  const [total, setTotal] = useState(1);

  const choice = picked === null ? null : CHOICES[picked]!;
  const isExtra = choice?.kind === 'extra';

  function confirm() {
    if (!choice) return;
    onCorrect(
      choice.kind === 'runs'
        ? deliveryFor({ kind: 'runs', runs: choice.runs })
        : deliveryFor({ kind: 'extra', extra: choice.extra, total }),
    );
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
                    {CHOICES.map((k, i) => (
                      <Pressable
                        key={k.label}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: picked === i }}
                        onPress={() => {
                          setPicked(i);
                          setTotal(1);
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

                {isExtra && choice.kind === 'extra' ? (
                  <View>
                    <Text className="font-heading text-[9.5px] uppercase tracking-[1.5px] text-neutral-600">
                      Total runs
                    </Text>
                    <View className="mt-2 flex-row flex-wrap gap-1.5">
                      {EXTRA_TOTALS[choice.extra].map((n) => (
                        <Pressable
                          key={n}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: total === n }}
                          onPress={() => setTotal(n)}
                          className={`h-11 w-[52px] items-center justify-center border ${
                            total === n ? 'bg-scoreboard border-scoreboard' : 'border-input'
                          } active:opacity-70`}
                        >
                          <Text
                            className={`font-heading text-[14px] ${
                              total === n ? 'text-scoreboard-text' : 'text-foreground'
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

/**
 * C4 — innings break.
 *
 * Two steps in one screen. The first is the only moment in a match where
 * everyone stops and looks at the phone, so it leads with the target and what
 * the innings actually was — top scorers with how they went, and who bowled
 * well — rather than going straight to a form. The second is that form.
 *
 * Splitting it this way also means the summary is worth sharing, which is the
 * point: an innings break is halfway through, and a link sent now brings
 * people to a match still being played.
 */
import { useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { buildScorecard, formatOvers, type MatchState } from '@open-innings/scoring';
import { shareUrls } from '../../lib/config';
import { Button, ErrorBanner, Kicker } from '../ui';

export function InningsBreak({
  matchId,
  state,
  battingTeamName,
  chasingTeamName,
  nameOf,
  battingSquad,
  bowlingSquad,
  watching,
  onStart,
  onUndo,
  busy,
  error,
}: {
  matchId: string;
  /** The first innings — at the break this is still what `/scorer` replays. */
  state: MatchState;
  battingTeamName: string;
  chasingTeamName: string;
  nameOf: (playerId: string) => string;
  battingSquad: { id: string; fullName: string }[];
  bowlingSquad: { id: string; fullName: string }[];
  /** Readers on the public scorecard right now. */
  watching: number;
  onStart: (openers: {
    openingStrikerId: string;
    openingNonStrikerId: string;
    openingBowlerId: string;
  }) => Promise<void>;
  onUndo: () => void;
  busy: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<'summary' | 'openers'>('summary');
  const [strikerId, setStrikerId] = useState<string | null>(null);
  const [nonStrikerId, setNonStrikerId] = useState<string | null>(null);
  const [bowlerId, setBowlerId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Not memoised: this folds at most a couple of hundred balls, and the
  // screen re-renders only when the scorer taps something. The React
  // Compiler handles it if it ever matters.
  const card = buildScorecard(state, nameOf);

  const inn = state.currentInnings;
  const target = inn.runs + 1;
  // The chase gets the innings' own length, not the match's — they differ for
  // a Super Over, and the asking rate is the number this screen exists to show.
  const ballsAvailable = (inn.oversPerInnings ?? state.match.oversPerInnings) * 6;
  const askingRate = ((target / ballsAvailable) * 6).toFixed(2);

  // Who is worth naming: the three biggest scores that were actually scores,
  // and the two best bowling figures. Everything else is on the full card.
  const topBatting = [...card.batting]
    .filter((b) => b.balls > 0)
    .sort((a, b) => b.runs - a.runs || a.balls - b.balls)
    .slice(0, 3);
  const topBowling = [...card.bowling]
    .filter((b) => b.wickets > 0 || b.runs > 0)
    .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)
    .slice(0, 2);

  async function share() {
    const line = `${battingTeamName} ${inn.runs}-${inn.wickets} (${formatOvers(
      inn.ballsBowled,
    )}). ${chasingTeamName} need ${target}.`;
    await Share.share({ message: `${line}\n${shareUrls.match(matchId)}` });
  }

  function begin() {
    setLocalError(null);
    if (!strikerId || !nonStrikerId || !bowlerId) {
      setLocalError('Pick both opening batters and the opening bowler.');
      return;
    }
    if (strikerId === nonStrikerId) {
      setLocalError('Striker and non-striker must be different players.');
      return;
    }
    void onStart({
      openingStrikerId: strikerId,
      openingNonStrikerId: nonStrikerId,
      openingBowlerId: bowlerId,
    });
  }

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ title: 'Innings break', headerShown: false }} />

      <View className="flex-row items-baseline justify-between px-4 pb-2 pt-3">
        <Kicker>Innings break</Kicker>
        {step === 'openers' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setStep('summary')}
            className="px-1 py-1 active:opacity-60"
          >
            <Text className="font-heading text-[10px] uppercase tracking-[1.4px] text-neutral-600">
              Back
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* The target plate. Reversed, like the score plate on the console —
          this is the number the rest of the match is about. */}
      <View className="bg-scoreboard mx-4 px-4 py-3.5">
        <View className="border-scoreboard-border flex-row items-baseline justify-between gap-3 border-b pb-2.5">
          <Text
            className="text-scoreboard-text font-heading min-w-0 shrink text-[15px]"
            numberOfLines={1}
          >
            {battingTeamName}
          </Text>
          <Text className="text-scoreboard-text font-heading shrink-0 text-[18px]">
            {inn.runs}-{inn.wickets}{' '}
            <Text className="text-scoreboard-muted text-[13px]">
              ({formatOvers(inn.ballsBowled)})
            </Text>
          </Text>
        </View>

        <Text
          className="text-scoreboard-muted font-heading mt-3 text-[9.5px] uppercase tracking-[1.5px]"
          numberOfLines={1}
        >
          {chasingTeamName} need
        </Text>
        <View className="flex-row items-end gap-2.5">
          <Text className="text-scoreboard-text font-heading shrink-0 text-[52px] leading-[52px]">
            {target}
          </Text>
          <Text className="text-scoreboard-muted min-w-0 shrink pb-1.5 text-[12.5px]">
            off {ballsAvailable} balls · {askingRate} an over
          </Text>
        </View>
      </View>

      {localError || error ? (
        <View className="px-4 pt-3">
          <ErrorBanner message={localError ?? error ?? ''} />
        </View>
      ) : null}

      {step === 'summary' ? (
        <>
          <ScrollView contentContainerClassName="px-4 pb-4">
            <View className="pb-2 pt-5">
              <Kicker>{battingTeamName}&rsquo;s innings</Kicker>
            </View>
            {topBatting.map((b) => (
              <View
                key={b.playerId}
                className="border-border flex-row items-baseline border-b py-2.5"
              >
                <View className="min-w-0 flex-1 pr-3">
                  <Text className="text-foreground text-[14.5px]" numberOfLines={1}>
                    {b.playerName}
                  </Text>
                  <Text className="text-foreground/55 mt-0.5 text-[11.5px]" numberOfLines={1}>
                    {b.isOut ? (b.dismissalText ?? 'out') : 'not out'}
                  </Text>
                </View>
                <Text className="text-foreground font-heading shrink-0 text-[16px]">
                  {b.runs}
                  {b.isOut ? '' : '*'}{' '}
                  <Text className="text-foreground/55 text-[12.5px]">({b.balls})</Text>
                </Text>
              </View>
            ))}

            {topBowling.length > 0 ? (
              <>
                <View className="pb-2 pt-5">
                  <Kicker>Best with the ball</Kicker>
                </View>
                {topBowling.map((b) => (
                  <View
                    key={b.playerId}
                    className="border-border flex-row items-baseline justify-between gap-3 border-b py-2.5"
                  >
                    <Text
                      className="text-foreground min-w-0 flex-1 text-[14.5px]"
                      numberOfLines={1}
                    >
                      {b.playerName}
                    </Text>
                    <Text className="text-foreground font-heading shrink-0 text-[14.5px]">
                      {b.overs}-{b.maidens}-{b.runs}-{b.wickets}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}

            {/*
              The design says "10 minute break · 24 people following this
              match". No break timer exists, and nobody follows anything — but
              people reading the scorecard right now is real, and it is the
              half of that line worth showing to someone who has just spent an
              hour tapping.
            */}
            {watching >= 2 ? (
              <Text className="text-steel-700 font-heading pt-6 text-[11px] uppercase tracking-[1.4px]">
                {watching} watching this match
              </Text>
            ) : null}
          </ScrollView>

          <View className="border-border border-t px-4 pb-3 pt-3">
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button
                  label="Full card"
                  variant="secondary"
                  onPress={() =>
                    router.push({ pathname: '/matches/[id]/card', params: { id: matchId } })
                  }
                />
              </View>
              <View className="flex-1">
                <Button label="Share innings" variant="secondary" onPress={() => void share()} />
              </View>
            </View>
            <View className="mt-2">
              <Button label="Start 2nd innings" onPress={() => setStep('openers')} />
            </View>
            {/* The usual reason to be here wrongly is a mis-recorded final ball. */}
            <View className="mt-1">
              <Button label="Undo last ball" variant="ghost" onPress={onUndo} />
            </View>
          </View>
        </>
      ) : (
        <>
          <ScrollView contentContainerClassName="px-4 pb-4 pt-5 gap-5">
            <OpenerPicker
              label="Striker"
              options={battingSquad}
              selected={strikerId}
              disabledId={nonStrikerId}
              onSelect={setStrikerId}
            />
            <OpenerPicker
              label="Non-striker"
              options={battingSquad}
              selected={nonStrikerId}
              disabledId={strikerId}
              onSelect={setNonStrikerId}
            />
            <OpenerPicker
              label="Opening bowler"
              options={bowlingSquad}
              selected={bowlerId}
              onSelect={setBowlerId}
            />
          </ScrollView>

          <View className="border-border border-t px-4 pb-3 pt-3">
            <Button label="Start the chase" onPress={begin} loading={busy} />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function OpenerPicker({
  label,
  options,
  selected,
  disabledId,
  onSelect,
}: {
  label: string;
  options: { id: string; fullName: string }[];
  selected: string | null;
  disabledId?: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <View className="gap-2">
      <Kicker>{label}</Kicker>
      <View className="flex-row flex-wrap gap-1.5">
        {options.map((p) => {
          const isSelected = p.id === selected;
          const isDisabled = p.id === disabledId;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, disabled: isDisabled }}
              disabled={isDisabled}
              onPress={() => onSelect(p.id)}
              className={`h-11 shrink-0 justify-center border px-3 ${
                isSelected ? 'bg-scoreboard border-scoreboard' : 'border-input'
              } ${isDisabled ? 'opacity-35' : 'active:opacity-70'}`}
            >
              <Text
                className={`font-heading text-[13px] ${
                  isSelected ? 'text-scoreboard-text' : 'text-foreground'
                }`}
              >
                {p.fullName}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

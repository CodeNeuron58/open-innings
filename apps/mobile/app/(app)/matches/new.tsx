/**
 * B2–B4 — Starting a match, in three steps.
 *
 * One screen rather than three routes: the draft has to survive every step and
 * a wizard is the one place where local state beats navigation params. Back
 * moves a step, not a screen.
 *
 *   B2  Format and toss
 *   B3  Pick the XI
 *   B4  Openers and the opening bowler
 *
 * `resolveBattingSides` comes from @open-innings/shared — the same function
 * the server uses — so the openers this screen asks for can never disagree
 * with the side the server decides is batting.
 */
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import {
  createMatchSchema,
  resolveBattingSides,
  type TeamListResponse,
  type TeamDetailResponse,
  type PlayerBrief,
} from '@open-innings/shared';
import { api } from '../../../lib/api';
import { battingLine, bowlingLine, usePlayerBriefs } from '../../../lib/briefs';
import { useApiQuery, useApiMutation } from '../../../lib/use-api';
import { Button, ErrorBanner, Kicker, LoadingScreen } from '../../../components/ui';

/**
 * The formats offered at the toss.
 *
 * `overs` is what the engine actually consumes; `stored` is the label the
 * match keeps, so its card can say "T20" rather than "20 overs". The
 * unsupported ones have no `stored` value because they can never be chosen.
 *
 * The ones marked unsupported
 * are shown but cannot be chosen: Tests need two innings a side with
 * declarations and a follow-on, the Hundred counts five-ball sets rather than
 * overs, and box cricket scores zone runs and negative runs. None of that is
 * in packages/scoring. Offering them and failing mid-match would be far worse
 * than saying so at the toss — see docs/wiring.md.
 */
const FORMATS = [
  {
    id: 'T20',
    overs: 20,
    stored: 't20' as const,
    note: 'Twenty overs a side. The plate shows target and required rate.',
  },
  { id: 'ODI', overs: 50, stored: 'odi' as const, note: 'Fifty overs a side.' },
  {
    id: 'Custom',
    overs: null,
    stored: 'club' as const,
    note: 'Set the overs yourself. Most club cricket is not 20 or 50.',
  },
  {
    id: 'Test',
    // No stored label: it can never be chosen, so it can never be recorded.
    stored: null,
    overs: null,
    note: 'Not supported yet — two innings a side and declarations.',
    unsupported: true,
  },
  {
    id: 'The Hundred',
    // No stored label: it can never be chosen, so it can never be recorded.
    stored: null,
    overs: null,
    note: 'Not supported yet — five-ball sets, not overs.',
    unsupported: true,
  },
  {
    id: 'Box',
    // No stored label: it can never be chosen, so it can never be recorded.
    stored: null,
    overs: 10,
    note: 'Not supported yet — zone runs and negative runs.',
    unsupported: true,
  },
  {
    id: 'Gully',
    overs: 8,
    stored: 'gully' as const,
    note: 'Short game, house rules. Set the overs to suit.',
  },
] as const;

type FormatId = (typeof FORMATS)[number]['id'];

/** The two answers to "how many overs may one bowler bowl". */
const STANDARD_QUOTA = 'Standard limit';
const NO_QUOTA = 'No limit';

/** Chip row used by format and by the toss. */
function Chips<T extends string>({
  options,
  value,
  onChange,
  disabled = [],
}: {
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  disabled?: readonly T[];
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((opt) => {
        const on = opt === value;
        const off = disabled.includes(opt);
        return (
          <Pressable
            key={opt}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: off }}
            disabled={off}
            onPress={() => onChange(opt)}
            className={`h-9 justify-center border px-3 ${
              on ? 'bg-primary border-primary' : 'border-border bg-transparent'
            } ${off ? 'opacity-35' : 'active:opacity-70'}`}
          >
            <Text
              className={`font-heading text-[13px] ${
                on ? 'text-primary-foreground' : 'text-foreground'
              }`}
            >
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StepHeader({ step, title, onBack }: { step: number; title: string; onBack: () => void }) {
  return (
    <View className="border-border flex-row items-center gap-2 border-b px-5 py-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        className="h-9 w-7 items-start justify-center"
      >
        <Text className="text-foreground/70 text-xl">‹</Text>
      </Pressable>
      <Text className="text-foreground font-heading flex-1 text-[19px]">{title}</Text>
      <Text className="font-heading text-[10px] uppercase tracking-[1.4px] text-neutral-600">
        Step {step} of 3
      </Text>
    </View>
  );
}

export default function NewMatch() {
  const router = useRouter();
  const teamsQuery = useApiQuery<TeamListResponse>((t, signal) => api.teams(t, signal));
  const mutation = useApiMutation();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [format, setFormat] = useState<FormatId>('T20');
  const [limitBowlers, setLimitBowlers] = useState(true);
  const [overs, setOvers] = useState(20);
  const [homeId, setHomeId] = useState<string | null>(null);
  const [awayId, setAwayId] = useState<string | null>(null);
  const [tossWinnerId, setTossWinnerId] = useState<string | null>(null);
  const [tossDecision, setTossDecision] = useState<'bat' | 'bowl' | null>(null);

  // Step 2
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // Step 3
  const [strikerId, setStrikerId] = useState<string | null>(null);
  const [nonStrikerId, setNonStrikerId] = useState<string | null>(null);
  const [bowlerId, setBowlerId] = useState<string | null>(null);

  const teams = teamsQuery.data?.teams ?? [];

  // Which side bats is the server's rule, not this screen's — same function.
  const sides = useMemo(() => {
    if (!homeId || !awayId) return null;
    return resolveBattingSides(
      homeId,
      awayId,
      tossWinnerId ?? undefined,
      tossDecision ?? undefined,
    );
  }, [homeId, awayId, tossWinnerId, tossDecision]);

  const battingTeamId = sides?.battingTeamId ?? null;
  const bowlingTeamId = sides?.bowlingTeamId ?? null;

  // useApiQuery has no 'enabled' flag, so the guard lives in the fetcher: it
  // resolves to null until the toss has decided who is batting.
  const battingSquad = useApiQuery<TeamDetailResponse | null>(
    async (t, signal) => (battingTeamId ? await api.team(t, battingTeamId, signal) : null),
    [battingTeamId],
  );
  const bowlingSquad = useApiQuery<TeamDetailResponse | null>(
    async (t, signal) => (bowlingTeamId ? await api.team(t, bowlingTeamId, signal) : null),
    [bowlingTeamId],
  );

  const battingPlayers = battingSquad.data?.members ?? [];
  const bowlingPlayers = bowlingSquad.data?.members ?? [];

  const nameOf = (id: string | null) => teams.find((t) => t.id === id)?.name ?? '';

  const activeFormat = FORMATS.find((f) => f.id === format);

  const canPickXI =
    Boolean(homeId && awayId && homeId !== awayId) &&
    // The toss is all-or-nothing, exactly as the server's schema requires.
    (tossWinnerId === null) === (tossDecision === null);

  const xi = battingPlayers.filter((p) => selected.has(p.id));

  /*
   * Re-read the squads whenever this screen comes back into focus.
   *
   * The only way to leave and return mid-wizard is via "add a player", and
   * coming back to a list that does not contain the person just added would
   * read as the add having failed. `refresh` is stable, so this does not loop.
   */
  useFocusEffect(
    useCallback(() => {
      void battingSquad.refresh();
      void bowlingSquad.refresh();
      // Depending on `.refresh` rather than the whole query object is
      // deliberate. `refresh` is a useCallback over `run` and is stable; the
      // query object around it is a fresh literal on every render, so taking
      // the dependency the rule asks for would re-run this on each one.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: refresh is stable, the object around it is not
    }, [battingSquad.refresh, bowlingSquad.refresh]),
  );

  // Both squads in one request. Asked for here rather than inside the picker
  // so the three pickers on step 3 share a single fetch.
  const briefs = usePlayerBriefs([
    ...battingPlayers.map((p) => p.id),
    ...bowlingPlayers.map((p) => p.id),
  ]);

  async function submit() {
    setError(null);
    const parsed = createMatchSchema.safeParse({
      oversPerInnings: overs,
      // The label, so the card can say "T20". Unsupported formats cannot be
      // selected, so `stored` is always present for whatever is chosen here.
      format: FORMATS.find((f) => f.id === format)?.stored ?? undefined,
      teamAId: homeId,
      teamBId: awayId,
      tossWinnerTeamId: tossWinnerId ?? undefined,
      tossDecision: tossDecision ?? undefined,
      openingStrikerId: strikerId,
      openingNonStrikerId: nonStrikerId,
      openingBowlerId: bowlerId,
      // Omitted means "the usual rule, if the side can cover it"; null means
      // no limit. The distinction is the server's to interpret — see
      // sizeBowlerQuota — so the client only says which of the two it wants.
      maxOversPerBowler: limitBowlers ? undefined : null,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the match details.');
      return;
    }

    const created = await mutation.run((t) => api.createMatch(t, parsed.data));
    if (created) router.replace(`/matches/${created.match.id}/score`);
  }

  if (teamsQuery.isLoading) return <LoadingScreen />;

  // ── Step 1 — format and toss ────────────────────────────────────────────
  if (step === 1) {
    return (
      <SafeAreaView className="bg-background flex-1">
        <Stack.Screen options={{ headerShown: false }} />
        <StepHeader step={1} title="New match" onBack={() => router.back()} />

        <ScrollView contentContainerClassName="px-5 pb-8 pt-5">
          <Kicker>Format</Kicker>
          <View className="mt-3">
            <Chips
              options={FORMATS.map((f) => f.id)}
              value={format}
              onChange={(id) => {
                setFormat(id);
                const f = FORMATS.find((x) => x.id === id);
                if (f?.overs) setOvers(f.overs);
              }}
              disabled={FORMATS.filter((f) => 'unsupported' in f && f.unsupported).map((f) => f.id)}
            />
          </View>
          <Text className="text-foreground/65 mt-3 text-[13px] leading-5">
            {activeFormat?.note}
          </Text>

          <View className="mt-6 flex-row gap-3">
            <View className="flex-1">
              <Text className="font-heading text-[11px] uppercase tracking-[1.6px] text-neutral-700">
                Overs per side
              </Text>
              <View className="border-input mt-1.5 h-12 flex-row items-center border bg-neutral-100">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Fewer overs"
                  onPress={() => setOvers((o) => Math.max(1, o - 1))}
                  className="h-full w-11 items-center justify-center active:opacity-60"
                >
                  <Text className="text-foreground font-heading text-[18px]">−</Text>
                </Pressable>
                <Text className="text-foreground font-heading flex-1 text-center text-[17px]">
                  {overs}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="More overs"
                  onPress={() => setOvers((o) => Math.min(200, o + 1))}
                  className="h-full w-11 items-center justify-center active:opacity-60"
                >
                  <Text className="text-foreground font-heading text-[18px]">+</Text>
                </Pressable>
              </View>
            </View>
            <View className="flex-1">
              <Text className="font-heading text-[11px] uppercase tracking-[1.6px] text-neutral-700">
                Balls per over
              </Text>
              {/*
                Fixed at six. BALLS_PER_OVER is a constant in the engine, not a
                setting — making it configurable means touching every over-based
                calculation. Shown because the design does, disabled because
                changing it here would be a lie.
              */}
              <View className="border-input mt-1.5 h-12 justify-center border bg-neutral-200 px-4">
                <Text className="text-foreground/55 font-heading text-[17px]">6</Text>
              </View>
            </View>
          </View>

          {/*
            The per-bowler limit.

            A playing condition rather than a Law, and the engine enforces it —
            so this is not decoration. Left alone, the server applies the usual
            fifth of the innings when the fielding side has enough bowlers to
            cover it. Turned off, nobody is capped, which is what gully and box
            cricket need and what a club with a different condition needs too.

            Worth being able to reach *before* the match rather than after: a
            scorer who finds out at the fifteenth over that their best bowler is
            blocked cannot change it from the console.
          */}
          <View className="mt-5">
            <Text className="font-heading text-[11px] uppercase tracking-[1.6px] text-neutral-700">
              Overs per bowler
            </Text>
            <View className="mt-1.5">
              <Chips
                options={[STANDARD_QUOTA, NO_QUOTA]}
                value={limitBowlers ? STANDARD_QUOTA : NO_QUOTA}
                onChange={(v) => setLimitBowlers(v === STANDARD_QUOTA)}
              />
            </View>
            <Text className="text-foreground/55 mt-1.5 text-[11.5px] leading-[16px]">
              {limitBowlers
                ? `A fifth of the innings — ${Math.max(1, Math.ceil(overs / 5))} over${
                    Math.max(1, Math.ceil(overs / 5)) === 1 ? '' : 's'
                  } each. Not applied if the side is too small to cover the innings.`
                : 'Anyone can bowl any number of overs.'}
            </Text>
          </View>

          <View className="mt-7">
            <Kicker>Teams</Kicker>
            <View className="mt-3 gap-4">
              <View>
                <Text className="font-heading text-[11px] uppercase tracking-[1.6px] text-neutral-700">
                  Home
                </Text>
                <View className="mt-1.5">
                  <Chips
                    options={teams.map((t) => t.name)}
                    value={nameOf(homeId) || null}
                    onChange={(name) => setHomeId(teams.find((t) => t.name === name)?.id ?? null)}
                    disabled={awayId ? [nameOf(awayId)] : []}
                  />
                </View>
              </View>
              <View>
                <Text className="font-heading text-[11px] uppercase tracking-[1.6px] text-neutral-700">
                  Away
                </Text>
                <View className="mt-1.5">
                  <Chips
                    options={teams.map((t) => t.name)}
                    value={nameOf(awayId) || null}
                    onChange={(name) => setAwayId(teams.find((t) => t.name === name)?.id ?? null)}
                    disabled={homeId ? [nameOf(homeId)] : []}
                  />
                </View>
              </View>
            </View>
          </View>

          {homeId && awayId ? (
            <View className="mt-7">
              <Kicker>Toss</Kicker>
              <View className="mt-3 gap-2">
                <Chips
                  options={[nameOf(homeId), nameOf(awayId)]}
                  value={nameOf(tossWinnerId) || null}
                  onChange={(name) =>
                    setTossWinnerId(teams.find((t) => t.name === name)?.id ?? null)
                  }
                />
                <Chips
                  options={['Elected to bat', 'Elected to bowl']}
                  value={
                    tossDecision === 'bat'
                      ? 'Elected to bat'
                      : tossDecision === 'bowl'
                        ? 'Elected to bowl'
                        : null
                  }
                  onChange={(v) => setTossDecision(v === 'Elected to bat' ? 'bat' : 'bowl')}
                />
              </View>
              {sides ? (
                <Text className="text-foreground/70 mt-3 text-[13px] leading-5">
                  {tossWinnerId
                    ? `${nameOf(tossWinnerId)} won the toss and elected to ${tossDecision ?? '…'}.`
                    : 'No toss recorded — the home side bats first.'}{' '}
                  <Text className="text-steel-700">{nameOf(battingTeamId)} bats.</Text>
                </Text>
              ) : null}
            </View>
          ) : null}

          {error ? (
            <View className="mt-5">
              <ErrorBanner message={error} />
            </View>
          ) : null}

          <View className="mt-8">
            <Button label="Pick the XI" disabled={!canPickXI} onPress={() => setStep(2)} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Step 2 — pick the XI ────────────────────────────────────────────────
  if (step === 2) {
    const filtered = battingPlayers.filter((p) =>
      p.fullName.toLowerCase().includes(search.trim().toLowerCase()),
    );
    // The captain and the keeper, named in the footer as the design does.
    const captain = battingPlayers.find((p) => p.isCaptain) ?? null;
    const keeper = battingPlayers.find((p) => p.isWicketkeeper) ?? null;

    return (
      <SafeAreaView className="bg-background flex-1">
        <Stack.Screen options={{ headerShown: false }} />
        <StepHeader step={2} title={nameOf(battingTeamId)} onBack={() => setStep(1)} />

        <View className="flex-row items-center gap-3 px-5 py-3">
          <Text className="text-foreground font-heading text-[24px]">{selected.size}</Text>
          <Text className="font-heading text-[10px] uppercase tracking-[1.4px] text-neutral-600">
            of {battingPlayers.length}
            {'\n'}named
          </Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search squad"
            placeholderTextColor="#98989b"
            accessibilityLabel="Search squad"
            className="text-foreground border-input ml-auto h-10 flex-1 border bg-neutral-100 px-3 font-sans text-[14px]"
          />
        </View>

        {battingSquad.isLoading ? (
          <LoadingScreen />
        ) : (
          <ScrollView contentContainerClassName="px-5 pb-6">
            {filtered.map((p, i) => {
              const on = selected.has(p.id);
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      return next;
                    })
                  }
                  className={`border-border flex-row items-center gap-3 border-b py-3 ${
                    on ? '' : 'opacity-45'
                  } active:opacity-70`}
                >
                  <View
                    className={`h-[18px] w-[18px] items-center justify-center border ${
                      on ? 'bg-primary border-primary' : 'border-input'
                    }`}
                  >
                    {on ? <Text className="text-primary-foreground text-[11px]">✓</Text> : null}
                  </View>
                  <Text className="text-foreground/50 font-heading w-6 text-[13px]">{i + 1}</Text>
                  <Text className="text-foreground flex-1 text-[15px]" numberOfLines={1}>
                    {p.fullName}
                    {/* (c) and † — the marks a scorer already reads on a
                        teamsheet, so no legend is needed. */}
                    {p.isCaptain ? <Text className="text-steel-700"> (c)</Text> : null}
                    {p.isWicketkeeper ? <Text className="text-steel-700"> †</Text> : null}
                  </Text>
                  {p.role ? (
                    <Text className="font-heading shrink-0 text-[10px] uppercase tracking-[1.2px] text-neutral-600">
                      {p.role.replace(/_/g, ' ')}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}

            {/*
              The design's "add a guest player".
              
              Sends you to the squad screen rather than creating someone
              inline, because that screen searches Open Innings first — and a
              "guest" who has played anywhere before should keep their career
              rather than start a second empty one. Coming back re-fetches the
              squad, so the new name is here.
            */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a player to this squad"
              onPress={() =>
                router.push({ pathname: '/teams/[id]/add', params: { id: battingTeamId ?? '' } })
              }
              className="border-input mt-4 h-11 items-center justify-center border border-dashed active:opacity-70"
            >
              <Text className="text-steel-700 font-heading text-[12px] uppercase tracking-[1.3px]">
                + Add a player to this squad
              </Text>
            </Pressable>
          </ScrollView>
        )}

        <View className="border-border border-t px-5 py-3">
          <Text
            className="font-heading mb-3 text-[10px] uppercase tracking-[1.4px] text-neutral-600"
            numberOfLines={1}
          >
            {[
              `${selected.size} named`,
              captain ? `${captain.fullName} (c)` : null,
              keeper ? `${keeper.fullName} †` : null,
            ]
              .filter(Boolean)
              .join('  ·  ')}
          </Text>
          <Button
            label="Openers & bowler"
            disabled={selected.size < 2}
            onPress={() => setStep(3)}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── Step 3 — who's on ───────────────────────────────────────────────────
  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />
      <StepHeader step={3} title="Who's on?" onBack={() => setStep(2)} />

      <ScrollView contentContainerClassName="px-5 pb-8 pt-4">
        <Kicker>On strike</Kicker>
        <View className="mt-2">
          <PlayerPicker
            players={xi}
            value={strikerId}
            onChange={setStrikerId}
            excludeId={nonStrikerId}
            briefs={briefs}
            kind="batting"
          />
        </View>

        <View className="mt-6">
          <Kicker>Non-striker</Kicker>
          <View className="mt-2">
            <PlayerPicker
              players={xi}
              value={nonStrikerId}
              onChange={setNonStrikerId}
              excludeId={strikerId}
              briefs={briefs}
              kind="batting"
            />
          </View>
        </View>

        <View className="mt-6">
          <Kicker>Opening bowler · {nameOf(bowlingTeamId)}</Kicker>
          <View className="mt-2">
            <PlayerPicker
              players={bowlingPlayers}
              value={bowlerId}
              onChange={setBowlerId}
              briefs={briefs}
              kind="bowling"
            />
          </View>
        </View>

        <Text className="text-foreground/65 mt-5 text-[13px] leading-5">
          Both ends are set at the toss. After that the app asks for a new bowler at the end of
          every over.
        </Text>

        {error || mutation.error ? (
          <View className="mt-5">
            <ErrorBanner message={error ?? mutation.error ?? ''} />
          </View>
        ) : null}

        <View className="mt-7">
          <Button
            label="Start innings"
            loading={mutation.busy}
            disabled={!strikerId || !nonStrikerId || !bowlerId}
            onPress={() => void submit()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * A list of players to choose one from, with the figures that inform the
 * choice.
 *
 * `kind` decides which end the context is read from: openers get a batting
 * line, the bowler gets an economy. Showing both on every row would be more
 * information and less help.
 */
function PlayerPicker({
  players,
  value,
  onChange,
  excludeId,
  briefs,
  kind,
}: {
  players: { id: string; fullName: string; role?: string | null }[];
  value: string | null;
  onChange: (id: string) => void;
  excludeId?: string | null;
  briefs: Map<string, PlayerBrief>;
  kind: 'batting' | 'bowling';
}) {
  return (
    <View className="border-border border-l border-t">
      {players.map((p) => {
        const on = p.id === value;
        const off = p.id === excludeId;
        const line =
          kind === 'batting' ? battingLine(briefs.get(p.id)) : bowlingLine(briefs.get(p.id));
        return (
          <Pressable
            key={p.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: off }}
            disabled={off}
            onPress={() => onChange(p.id)}
            className={`border-border flex-row items-center gap-3 border-b border-r px-3 py-3 ${
              on ? 'bg-steel-100' : ''
            } ${off ? 'opacity-35' : 'active:opacity-70'}`}
          >
            <View className="min-w-0 flex-1">
              <Text className="text-foreground text-[15px]" numberOfLines={1}>
                {p.fullName}
              </Text>
              {line ? (
                <Text
                  className="font-heading mt-0.5 text-[9px] uppercase tracking-[1.2px] text-neutral-600"
                  numberOfLines={1}
                >
                  {line}
                </Text>
              ) : null}
            </View>
            {p.role ? (
              <Text className="font-heading shrink-0 text-[10px] uppercase tracking-[1.2px] text-neutral-600">
                {p.role.replace(/_/g, ' ')}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

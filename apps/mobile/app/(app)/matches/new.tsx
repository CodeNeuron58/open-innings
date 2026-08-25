/**
 * Starting a match, in three steps: the match, the two XIs, and who's on.
 *
 * Draft lives in local state so backing out of a step keeps it.
 *
 * Step 2 used to name one side only — the batting one — and then throw the
 * answer away: `selected` filtered the pickers on step 3 and was never sent.
 * The server read the club's whole roster for both sides, which sized two
 * playing conditions from people who were not at the ground. Both XIs are now
 * named and both are sent. See migration 0018.
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
import { Button, ErrorBanner, Field, Kicker, LoadingScreen } from '../../../components/ui';

/**
 * The formats offered at the toss.
 *
 * Only the ones that work. Test, The Hundred and Box used to sit in this row
 * greyed out, which advertised three features that do not exist to everybody
 * who opened the screen — and they are the first thing a curious scorer taps.
 * They come back when their rules do.
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

type Option<T extends string> = { value: T; label: string };

/**
 * Chip row used by format, quota, teams and the toss.
 *
 * Carries values rather than labels. It used to take a bare `string[]` of
 * labels and resolve the choice back with `teams.find((t) => t.name === name)`,
 * so two teams with the same name — a club's XI and its 2nd XI, or the same
 * fixture twice in a season — both resolved to whichever came first.
 */
function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly Option<T>[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(opt.value)}
            className={`h-11 justify-center border px-3 ${
              on ? 'bg-primary border-primary' : 'border-border bg-transparent'
            } active:opacity-70`}
          >
            <Text
              className={`font-heading text-[13.5px] ${
                on ? 'text-primary-foreground' : 'text-foreground'
              }`}
            >
              {opt.label}
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
        className="h-11 w-11 items-start justify-center"
      >
        <Text className="text-foreground/70 text-xl">‹</Text>
      </Pressable>
      <Text className="text-foreground font-heading flex-1 text-[19px]">{title}</Text>
      <Text className="font-heading text-[10.5px] uppercase tracking-[1.4px] text-neutral-700">
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
  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [homeId, setHomeId] = useState<string | null>(null);
  const [awayId, setAwayId] = useState<string | null>(null);
  const [tossWinnerId, setTossWinnerId] = useState<string | null>(null);
  const [tossDecision, setTossDecision] = useState<'bat' | 'bowl' | null>(null);

  // Step 2 — one XI per side, and which of the two is on screen.
  const [squadHome, setSquadHome] = useState<Set<string>>(new Set());
  const [squadAway, setSquadAway] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState<'home' | 'away'>('home');
  const [search, setSearch] = useState('');

  // Step 3
  const [strikerId, setStrikerId] = useState<string | null>(null);
  const [nonStrikerId, setNonStrikerId] = useState<string | null>(null);
  const [bowlerId, setBowlerId] = useState<string | null>(null);

  const teams = teamsQuery.data?.teams ?? [];

  /** Everything downstream of the teams or the toss stops being valid. */
  const resetSelections = useCallback(() => {
    setSquadHome(new Set());
    setSquadAway(new Set());
    setStrikerId(null);
    setNonStrikerId(null);
    setBowlerId(null);
  }, []);

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

  /*
   * The two rosters, loaded per team rather than per role.
   *
   * These used to be keyed on batting/bowling, which meant neither could load
   * until the toss had been entered — and only one of them was ever shown. An
   * XI belongs to a side whatever the toss says, so they are keyed on the side.
   */
  const homeRoster = useApiQuery<TeamDetailResponse | null>(
    async (t, signal) => (homeId ? await api.team(t, homeId, signal) : null),
    [homeId],
  );
  const awayRoster = useApiQuery<TeamDetailResponse | null>(
    async (t, signal) => (awayId ? await api.team(t, awayId, signal) : null),
    [awayId],
  );

  const homePlayers = homeRoster.data?.members ?? [];
  const awayPlayers = awayRoster.data?.members ?? [];

  const nameOf = (id: string | null) => teams.find((t) => t.id === id)?.name ?? '';

  const activeFormat = FORMATS.find((f) => f.id === format);

  const canPickSquads = Boolean(homeId && awayId && homeId !== awayId);

  // The two XIs, resolved back to players. Which one bats is the toss's answer.
  const homeXI = homePlayers.filter((p) => squadHome.has(p.id));
  const awayXI = awayPlayers.filter((p) => squadAway.has(p.id));

  const battingXI = battingTeamId === homeId ? homeXI : awayXI;
  const bowlingXI = bowlingTeamId === homeId ? homeXI : awayXI;

  // A side of one cannot bat: somebody has to be at the other end.
  const squadsReady = homeXI.length >= 2 && awayXI.length >= 2;

  // Re-read squads on focus to include any newly added players.
  useFocusEffect(
    useCallback(() => {
      void homeRoster.refresh();
      void awayRoster.refresh();
      // Depending on `.refresh` rather than the whole query object is
      // deliberate. `refresh` is a useCallback over `run` and is stable; the
      // query object around it is a fresh literal on every render, so taking
      // the dependency the rule asks for would re-run this on each one.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: refresh is stable, the object around it is not
    }, [homeRoster.refresh, awayRoster.refresh]),
  );

  // Both XIs in one request, so the three pickers on step 3 share a fetch.
  const briefs = usePlayerBriefs([...homeXI.map((p) => p.id), ...awayXI.map((p) => p.id)]);

  async function submit() {
    setError(null);
    const parsed = createMatchSchema.safeParse({
      title: title.trim() || undefined,
      venue: venue.trim() || undefined,
      oversPerInnings: overs,
      // The label, so the card can say "T20".
      format: FORMATS.find((f) => f.id === format)?.stored,
      teamAId: homeId,
      teamBId: awayId,
      // The XIs, named per team. Which of them bats is the server's to work
      // out from the toss — it already does, and asking this screen to answer
      // it a second time is how the two would come to disagree.
      teamAPlayerIds: homeXI.map((p) => p.id),
      teamBPlayerIds: awayXI.map((p) => p.id),
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

  // ── Step 1 — the match ──────────────────────────────────────────────────
  if (step === 1) {
    return (
      <SafeAreaView className="bg-background flex-1">
        <Stack.Screen options={{ headerShown: false }} />
        <StepHeader step={1} title="New match" onBack={() => router.back()} />

        <ScrollView contentContainerClassName="px-5 pb-8 pt-5" keyboardShouldPersistTaps="handled">
          <Kicker>Format</Kicker>
          <View className="mt-3">
            <Chips
              options={FORMATS.map((f) => ({ value: f.id, label: f.id }))}
              value={format}
              onChange={(id) => {
                setFormat(id);
                const f = FORMATS.find((x) => x.id === id);
                if (f?.overs) setOvers(f.overs);
              }}
            />
          </View>
          <Text className="text-foreground/70 mt-3 text-[13.5px] leading-5">
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
                  className="h-full w-12 items-center justify-center active:opacity-60"
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
                  className="h-full w-12 items-center justify-center active:opacity-60"
                >
                  <Text className="text-foreground font-heading text-[18px]">+</Text>
                </Pressable>
              </View>
            </View>
            <View className="flex-1">
              <Text className="font-heading text-[11px] uppercase tracking-[1.6px] text-neutral-700">
                Balls per over
              </Text>
              {/* Fixed at six balls per over as required by the engine. */}
              <View className="border-input mt-1.5 h-12 justify-center border bg-neutral-200 px-4">
                <Text className="text-foreground/60 font-heading text-[17px]">6</Text>
              </View>
            </View>
          </View>

          {/* Configures per-bowler limit (usually 1/5th of innings) enforced by the engine. */}
          <View className="mt-5">
            <Text className="font-heading text-[11px] uppercase tracking-[1.6px] text-neutral-700">
              Overs per bowler
            </Text>
            <View className="mt-1.5">
              <Chips
                options={[
                  { value: STANDARD_QUOTA, label: STANDARD_QUOTA },
                  { value: NO_QUOTA, label: NO_QUOTA },
                ]}
                value={limitBowlers ? STANDARD_QUOTA : NO_QUOTA}
                onChange={(v) => setLimitBowlers(v === STANDARD_QUOTA)}
              />
            </View>
            <Text className="text-foreground/65 mt-1.5 text-[12.5px] leading-[17px]">
              {limitBowlers
                ? `A fifth of the innings — ${Math.max(1, Math.ceil(overs / 5))} over${
                    Math.max(1, Math.ceil(overs / 5)) === 1 ? '' : 's'
                  } each. Not applied if the side is too small to cover the innings.`
                : 'Anyone can bowl any number of overs.'}
            </Text>
          </View>

          <View className="mt-7">
            <Kicker>Teams</Kicker>

            {teams.length === 0 ? (
              /*
               * The dead end this screen used to walk into.
               *
               * With no teams the two chip rows rendered as nothing at all and
               * the primary button sat disabled, with no statement anywhere of
               * what was missing or where to get it.
               */
              <View className="border-border mt-3 border p-4">
                <Text className="text-foreground font-heading text-[15px]">
                  No teams on your books yet
                </Text>
                <Text className="text-foreground/70 mt-1.5 text-[13.5px] leading-[19px]">
                  A match is between two of them, so this is the first thing to set up. It takes a
                  name and a handful of players.
                </Text>
                <View className="mt-3.5">
                  <Button label="Set up a team" onPress={() => router.push('/teams')} />
                </View>
              </View>
            ) : (
              <View className="mt-3 gap-4">
                <View>
                  <Text className="font-heading text-[11px] uppercase tracking-[1.6px] text-neutral-700">
                    Home
                  </Text>
                  <View className="mt-1.5">
                    <Chips
                      options={teams
                        .filter((t) => t.id !== awayId)
                        .map((t) => ({ value: t.id, label: t.name }))}
                      value={homeId}
                      onChange={(id) => {
                        setHomeId(id);
                        if (tossWinnerId && tossWinnerId !== id && tossWinnerId !== awayId) {
                          setTossWinnerId(null);
                          setTossDecision(null);
                        }
                        resetSelections();
                      }}
                    />
                  </View>
                </View>
                <View>
                  <Text className="font-heading text-[11px] uppercase tracking-[1.6px] text-neutral-700">
                    Away
                  </Text>
                  <View className="mt-1.5">
                    <Chips
                      options={teams
                        .filter((t) => t.id !== homeId)
                        .map((t) => ({ value: t.id, label: t.name }))}
                      value={awayId}
                      onChange={(id) => {
                        setAwayId(id);
                        if (tossWinnerId && tossWinnerId !== homeId && tossWinnerId !== id) {
                          setTossWinnerId(null);
                          setTossDecision(null);
                        }
                        resetSelections();
                      }}
                    />
                  </View>
                </View>
              </View>
            )}
          </View>

          {homeId && awayId ? (
            <View className="mt-7">
              <Kicker>Toss</Kicker>
              <View className="mt-3 gap-2">
                <Chips
                  options={[
                    { value: homeId, label: nameOf(homeId) },
                    { value: awayId, label: nameOf(awayId) },
                    // "Nobody tossed" used to be expressed only by leaving two
                    // fields blank, which is not a control and reads as an
                    // unfinished form rather than a decision.
                    { value: 'none', label: 'No toss' },
                  ]}
                  value={tossWinnerId ?? 'none'}
                  onChange={(id) => {
                    setTossWinnerId(id === 'none' ? null : id);
                    if (id === 'none') setTossDecision(null);
                    resetSelections();
                  }}
                />
                {tossWinnerId ? (
                  <Chips
                    options={[
                      { value: 'bat', label: 'Elected to bat' },
                      { value: 'bowl', label: 'Elected to bowl' },
                    ]}
                    value={tossDecision}
                    onChange={(v) => {
                      setTossDecision(v);
                      resetSelections();
                    }}
                  />
                ) : null}
              </View>
              <Text className="text-foreground/75 mt-3 text-[13.5px] leading-5">
                {tossWinnerId
                  ? `${nameOf(tossWinnerId)} won the toss and elected to ${tossDecision ?? '…'}.`
                  : 'No toss recorded — the home side bats first.'}{' '}
                {battingTeamId ? (
                  <Text className="text-steel-700">{nameOf(battingTeamId)} bats.</Text>
                ) : null}
              </Text>
            </View>
          ) : null}

          {/* Optional, and asked for here rather than hidden behind a
              long-press on the match list — which is where they used to live,
              so every match in the list read "Match". */}
          <View className="mt-7 gap-4">
            <Kicker>Name it (optional)</Kicker>
            <Field
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Sunday League — Round 4"
              autoCapitalize="words"
            />
            <Field
              label="Ground"
              value={venue}
              onChangeText={setVenue}
              placeholder="e.g. Astoria Ground"
              autoCapitalize="words"
            />
          </View>

          {error ? (
            <View className="mt-5">
              <ErrorBanner message={error} />
            </View>
          ) : null}

          <View className="mt-8">
            <Button
              label="Pick the sides"
              disabled={!canPickSquads}
              onPress={() => {
                // The toss is all-or-nothing, exactly as the server's schema
                // requires — said here rather than by a disabled button that
                // does not explain itself.
                if (tossWinnerId && !tossDecision) {
                  setError('Say what the toss winner chose to do.');
                  return;
                }
                setError(null);
                setStep(2);
              }}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Step 2 — both XIs ───────────────────────────────────────────────────
  if (step === 2) {
    const onHome = picking === 'home';
    const teamId = onHome ? homeId : awayId;
    const roster = onHome ? homePlayers : awayPlayers;
    const chosen = onHome ? squadHome : squadAway;
    const setChosen = onHome ? setSquadHome : setSquadAway;
    const loading = onHome ? homeRoster.isLoading : awayRoster.isLoading;

    const filtered = roster.filter((p) =>
      p.fullName.toLowerCase().includes(search.trim().toLowerCase()),
    );

    const toggle = (playerId: string) =>
      setChosen((prev) => {
        const next = new Set(prev);
        if (next.has(playerId)) next.delete(playerId);
        else next.add(playerId);
        return next;
      });

    return (
      <SafeAreaView className="bg-background flex-1">
        <Stack.Screen options={{ headerShown: false }} />
        <StepHeader step={2} title="Who is playing" onBack={() => setStep(1)} />

        {/* Both sides at once, so the one still to do is never out of sight.
            This step used to show the batting side only — the fielding side
            was never picked at all, which is why the wicket sheet offered the
            whole club as fielders. */}
        <View className="flex-row gap-1.5 px-5 pb-1 pt-3">
          {(
            [
              ['home', homeId, homeXI.length],
              ['away', awayId, awayXI.length],
            ] as const
          ).map(([which, id, count]) => {
            const active = picking === which;
            return (
              <Pressable
                key={which}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${nameOf(id)} — ${count} named`}
                onPress={() => {
                  setPicking(which);
                  setSearch('');
                }}
                className={`h-12 flex-1 flex-row items-center justify-center gap-2 border px-2 ${
                  active ? 'bg-scoreboard border-scoreboard' : 'border-border'
                } active:opacity-80`}
              >
                <Text
                  className={`font-heading shrink text-[13.5px] ${
                    active ? 'text-scoreboard-text' : 'text-foreground'
                  }`}
                  numberOfLines={1}
                >
                  {nameOf(id)}
                </Text>
                <Text
                  className={`font-heading shrink-0 text-[13.5px] ${
                    active ? 'text-scoreboard-accent' : 'text-foreground/55'
                  }`}
                >
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="flex-row items-center gap-3 px-5 py-3">
          <Text className="text-foreground font-heading text-[24px]">{chosen.size}</Text>
          <Text className="font-heading text-[10.5px] uppercase tracking-[1.4px] text-neutral-700">
            of {roster.length}
            {'\n'}named
          </Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search squad"
            placeholderTextColor="#98989b"
            accessibilityLabel="Search squad"
            className="text-foreground border-input ml-auto h-11 flex-1 border bg-neutral-100 px-3 font-sans text-[14px]"
          />
        </View>

        {loading ? (
          <LoadingScreen />
        ) : (
          <ScrollView contentContainerClassName="px-5 pb-6" keyboardShouldPersistTaps="handled">
            {roster.length === 0 ? (
              <View className="border-border border p-4">
                <Text className="text-foreground font-heading text-[15px]">
                  {nameOf(teamId)} has nobody on its books
                </Text>
                <Text className="text-foreground/70 mt-1.5 text-[13.5px] leading-[19px]">
                  Add the players who turned out today and they stay on the club&rsquo;s roster for
                  next time.
                </Text>
              </View>
            ) : null}

            {filtered.map((p, i) => {
              const on = chosen.has(p.id);
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => toggle(p.id)}
                  className={`border-border min-h-12 flex-row items-center gap-3 border-b py-3 ${
                    on ? '' : 'opacity-60'
                  } active:opacity-80`}
                >
                  <View
                    className={`h-[20px] w-[20px] items-center justify-center border ${
                      on ? 'bg-primary border-primary' : 'border-input'
                    }`}
                  >
                    {on ? <Text className="text-primary-foreground text-[12px]">✓</Text> : null}
                  </View>
                  <Text className="text-foreground/55 font-heading w-6 text-[13.5px]">{i + 1}</Text>
                  <Text className="text-foreground flex-1 text-[15px]" numberOfLines={1}>
                    {p.fullName}
                    {/* Standard symbols for captain (c) and wicketkeeper (†). */}
                    {p.isCaptain ? <Text className="text-steel-700"> (c)</Text> : null}
                    {p.isWicketkeeper ? <Text className="text-steel-700"> †</Text> : null}
                  </Text>
                  {p.role ? (
                    <Text className="font-heading shrink-0 text-[10.5px] uppercase tracking-[1.2px] text-neutral-700">
                      {p.role.replace(/_/g, ' ')}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}

            {/* Routes to squad screen to search existing players before adding a new one. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add a player to ${nameOf(teamId)}`}
              onPress={() =>
                router.push({ pathname: '/teams/[id]/add', params: { id: teamId ?? '' } })
              }
              className="border-input mt-4 h-12 items-center justify-center border border-dashed active:opacity-70"
            >
              <Text className="text-steel-700 font-heading text-[12.5px] uppercase tracking-[1.3px]">
                + Add a player to {nameOf(teamId)}
              </Text>
            </Pressable>
          </ScrollView>
        )}

        <View className="border-border border-t px-5 py-3">
          <Text
            className="font-heading mb-3 text-[10.5px] uppercase tracking-[1.4px] text-neutral-700"
            numberOfLines={1}
          >
            {homeXI.length < 2 || awayXI.length < 2
              ? 'Each side needs at least two players'
              : `${nameOf(homeId)} ${homeXI.length}  ·  ${nameOf(awayId)} ${awayXI.length}`}
          </Text>
          <Button label="Openers & bowler" disabled={!squadsReady} onPress={() => setStep(3)} />
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
        <Kicker>On strike · {nameOf(battingTeamId)}</Kicker>
        <View className="mt-2">
          <PlayerPicker
            players={battingXI}
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
              players={battingXI}
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
              players={bowlingXI}
              value={bowlerId}
              onChange={setBowlerId}
              briefs={briefs}
              kind="bowling"
            />
          </View>
        </View>

        <Text className="text-foreground/70 mt-5 text-[13.5px] leading-5">
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

/** Player list with context-specific stats (batting line or economy). */
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
  /** Read-only: the hook returns a shared empty map when there is nothing to show. */
  briefs: ReadonlyMap<string, PlayerBrief>;
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
            className={`border-border min-h-12 flex-row items-center gap-3 border-b border-r px-3 py-3 ${
              on ? 'bg-steel-100' : ''
            } ${off ? 'opacity-40' : 'active:opacity-70'}`}
          >
            <View className="min-w-0 flex-1">
              <Text className="text-foreground text-[15px]" numberOfLines={1}>
                {p.fullName}
              </Text>
              {line ? (
                <Text
                  className="font-heading mt-0.5 text-[10px] uppercase tracking-[1.2px] text-neutral-700"
                  numberOfLines={1}
                >
                  {line}
                </Text>
              ) : null}
            </View>
            {p.role ? (
              <Text className="font-heading shrink-0 text-[10.5px] uppercase tracking-[1.2px] text-neutral-700">
                {p.role.replace(/_/g, ' ')}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

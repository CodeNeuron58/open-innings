/**
 * New match.
 *
 * The subtle part is opener filtering. Which side bats first depends on the
 * toss, so the striker and non-striker must come from one squad and the bowler
 * from the other — and that flips the moment the toss decision changes.
 *
 * `resolveBattingSides` is imported from @open-innings/shared, the same
 * function the server uses to decide who bats. Reimplementing it here is how
 * the dropdowns end up disagreeing with the scorecard.
 *
 * Squad membership is still re-checked server-side. This filtering is a
 * convenience, not a guarantee.
 */
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import {
  createMatchSchema,
  resolveBattingSides,
  type PlayerSummary,
  type TeamSummary,
} from '@open-innings/shared';
import { api } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { useApiQuery, useApiMutation } from '../../../lib/use-api';
import { Button, ErrorBanner, Field, LoadingScreen } from '../../../components/ui';

type TossDecision = 'bat' | 'bowl';

export default function NewMatch() {
  const router = useRouter();
  const { token } = useSession();
  const teams = useApiQuery((t, signal) => api.teams(t, signal));
  const mutation = useApiMutation();

  const [teamAId, setTeamAId] = useState<string | null>(null);
  const [teamBId, setTeamBId] = useState<string | null>(null);
  const [overs, setOvers] = useState('20');
  const [venue, setVenue] = useState('');

  const [tossWinnerTeamId, setTossWinnerTeamId] = useState<string | null>(null);
  const [tossDecision, setTossDecision] = useState<TossDecision | null>(null);

  const [strikerId, setStrikerId] = useState<string | null>(null);
  const [nonStrikerId, setNonStrikerId] = useState<string | null>(null);
  const [bowlerId, setBowlerId] = useState<string | null>(null);

  const [squads, setSquads] = useState<Record<string, PlayerSummary[]>>({});
  const [loadingSquads, setLoadingSquads] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Pull the squad for each chosen team. Both are needed before openers can
  // be filtered, and a team can be swapped at any point.
  useEffect(() => {
    if (!token) return;
    const wanted = [teamAId, teamBId].filter((id): id is string => Boolean(id));
    const missing = wanted.filter((id) => !squads[id]);
    if (missing.length === 0) return;

    let cancelled = false;
    setLoadingSquads(true);

    (async () => {
      const loaded: Record<string, PlayerSummary[]> = {};
      for (const id of missing) {
        try {
          const detail = await api.team(token, id);
          loaded[id] = detail.members;
        } catch {
          loaded[id] = [];
        }
      }
      if (!cancelled) {
        setSquads((current) => ({ ...current, ...loaded }));
        setLoadingSquads(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, teamAId, teamBId, squads]);

  const sides = useMemo(() => {
    if (!teamAId || !teamBId) return null;
    return resolveBattingSides(
      teamAId,
      teamBId,
      tossWinnerTeamId ?? undefined,
      tossDecision ?? undefined,
    );
  }, [teamAId, teamBId, tossWinnerTeamId, tossDecision]);

  const battingSquad = sides ? (squads[sides.battingTeamId] ?? []) : [];
  const bowlingSquad = sides ? (squads[sides.bowlingTeamId] ?? []) : [];

  // A toss change can flip the sides underneath an already-chosen opener.
  // Clear anyone who is no longer in the right squad rather than submitting
  // a selection the server will reject.
  useEffect(() => {
    if (!sides) return;
    const inBatting = (id: string | null) => id !== null && battingSquad.some((p) => p.id === id);
    const inBowling = (id: string | null) => id !== null && bowlingSquad.some((p) => p.id === id);

    if (strikerId && !inBatting(strikerId)) setStrikerId(null);
    if (nonStrikerId && !inBatting(nonStrikerId)) setNonStrikerId(null);
    if (bowlerId && !inBowling(bowlerId)) setBowlerId(null);
  }, [sides, battingSquad, bowlingSquad, strikerId, nonStrikerId, bowlerId]);

  const teamList = teams.data?.teams ?? [];

  async function submit() {
    setFormError(null);

    const parsed = createMatchSchema.safeParse({
      venue: venue.trim() || undefined,
      oversPerInnings: overs,
      teamAId,
      teamBId,
      tossWinnerTeamId: tossWinnerTeamId ?? undefined,
      tossDecision: tossDecision ?? undefined,
      openingStrikerId: strikerId,
      openingNonStrikerId: nonStrikerId,
      openingBowlerId: bowlerId,
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Check the match details');
      return;
    }

    const result = await mutation.run((t) => api.createMatch(t, parsed.data));
    if (result) router.replace('/matches');
  }

  if (teams.isLoading) return <LoadingScreen />;

  if (teamList.length < 2) {
    return (
      <SafeAreaView className="bg-background flex-1 justify-center p-6">
        <Stack.Screen options={{ title: 'New match' }} />
        <View className="border-border bg-card gap-3 rounded-2xl border p-6">
          <Text className="text-foreground text-lg font-semibold">You need two teams</Text>
          <Text className="text-muted-foreground text-sm">
            A match needs two teams with squads. You have {teamList.length}.
          </Text>
          <Button label="Go to teams" onPress={() => router.push('/teams')} />
          <Button label="Back" variant="ghost" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ title: 'New match' }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView contentContainerClassName="p-5 gap-6 pb-10">
          <Text className="text-foreground text-2xl font-bold">New match</Text>

          {formError || mutation.error ? (
            <ErrorBanner message={formError ?? mutation.error ?? ''} />
          ) : null}

          <Section title="Teams">
            <Picker
              label="Team A"
              options={teamList.map((t) => ({ id: t.id, label: t.name }))}
              selected={teamAId}
              disabledIds={teamBId ? [teamBId] : []}
              onSelect={setTeamAId}
            />
            <Picker
              label="Team B"
              options={teamList.map((t) => ({ id: t.id, label: t.name }))}
              selected={teamBId}
              disabledIds={teamAId ? [teamAId] : []}
              onSelect={setTeamBId}
            />
          </Section>

          <Section title="Format">
            <Field
              label="Overs per innings"
              value={overs}
              onChangeText={setOvers}
              keyboardType="number-pad"
              inputMode="numeric"
            />
            <Field
              label="Venue (optional)"
              value={venue}
              onChangeText={setVenue}
              placeholder="Ground name"
              autoCapitalize="words"
            />
          </Section>

          <Section
            title="Toss"
            hint="Record both, or neither — a winner without a decision doesn't say who bats."
          >
            <Picker
              label="Won by"
              options={teamList
                .filter((t) => t.id === teamAId || t.id === teamBId)
                .map((t) => ({ id: t.id, label: t.name }))}
              selected={tossWinnerTeamId}
              onSelect={(id) => setTossWinnerTeamId(id === tossWinnerTeamId ? null : id)}
            />
            <Picker
              label="Chose to"
              options={[
                { id: 'bat', label: 'Bat' },
                { id: 'bowl', label: 'Bowl' },
              ]}
              selected={tossDecision}
              onSelect={(id) => setTossDecision(id === tossDecision ? null : (id as TossDecision))}
            />
          </Section>

          {sides ? (
            <Section
              title="Openers"
              hint={
                loadingSquads
                  ? 'Loading squads…'
                  : `${teamName(teamList, sides.battingTeamId)} bat first.`
              }
            >
              <Picker
                label="Striker"
                options={battingSquad.map(toOption)}
                selected={strikerId}
                disabledIds={nonStrikerId ? [nonStrikerId] : []}
                onSelect={setStrikerId}
              />
              <Picker
                label="Non-striker"
                options={battingSquad.map(toOption)}
                selected={nonStrikerId}
                disabledIds={strikerId ? [strikerId] : []}
                onSelect={setNonStrikerId}
              />
              <Picker
                label="Opening bowler"
                options={bowlingSquad.map(toOption)}
                selected={bowlerId}
                onSelect={setBowlerId}
              />
            </Section>
          ) : null}

          <Button label="Start match" onPress={submit} loading={mutation.busy} />
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function toOption(player: PlayerSummary) {
  return { id: player.id, label: player.shortName ?? player.fullName };
}

function teamName(teams: TeamSummary[], id: string): string {
  return teams.find((t) => t.id === id)?.name ?? 'The batting side';
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-3">
      <View>
        <Text className="text-foreground text-base font-semibold">{title}</Text>
        {hint ? <Text className="text-muted-foreground text-xs">{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Picker({
  label,
  options,
  selected,
  disabledIds = [],
  onSelect,
}: {
  label: string;
  options: { id: string; label: string }[];
  selected: string | null;
  disabledIds?: string[];
  onSelect: (id: string) => void;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-foreground text-sm font-medium">{label}</Text>
      {options.length === 0 ? (
        <Text className="text-muted-foreground text-sm">Nobody available</Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {options.map((option) => {
            const isSelected = option.id === selected;
            const isDisabled = disabledIds.includes(option.id);
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, disabled: isDisabled }}
                disabled={isDisabled}
                onPress={() => onSelect(option.id)}
                className={`min-h-12 shrink-0 justify-center rounded-xl border px-4 ${
                  isSelected ? 'bg-primary border-primary' : 'border-border bg-card'
                } ${isDisabled ? 'opacity-40' : ''}`}
              >
                <Text
                  className={`text-sm ${
                    isSelected ? 'text-primary-foreground font-semibold' : 'text-foreground'
                  }`}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

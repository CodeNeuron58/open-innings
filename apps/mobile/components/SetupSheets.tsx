/**
 * Creating what a match needs, without leaving the match.
 *
 * The wizard could not create a team or a player. It had a "Set up a team"
 * button that navigated to `/teams`, and a "+ Add a player" that navigated to
 * `/teams/[id]/add` — so the answer to "I do not have that yet" was always
 * *leave, do it elsewhere, come back and find your place again*.
 *
 * That is the whole of the cold-start problem. A scorer installs the app ten
 * minutes before a match, opens New Match, and is sent to two other screens
 * before a ball can be tapped. It is also not a first-run problem, which is
 * why a guided first-match flow would have been the wrong fix: the same wall
 * is there next season the first time they play a club they have not played
 * before.
 *
 * So the wizard creates things where it needs them, and these are the two
 * places it needs.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { PlayerRole } from '@open-innings/shared';
import { MIN_QUERY, careerLine, usePlayerFinder } from '../lib/use-player-finder';
import { useTheme } from '../lib/use-theme';
import { Button, ErrorBanner, Kicker } from './ui';
import { SheetShell } from './scorer/Sheets';

/** The roles the design offers, plus the keeper-bat most club keepers are. */
const ROLES: { value: PlayerRole; label: string }[] = [
  { value: 'batsman', label: 'Top order' },
  { value: 'bowler', label: 'Bowler' },
  { value: 'all_rounder', label: 'All-rounder' },
  { value: 'wicket_keeper', label: 'Keeper' },
  { value: 'wicket_keeper_batsman', label: 'Keeper-bat' },
];

// ─── A team ──────────────────────────────────────────────────────────────────

export function NewTeamSheet({
  onCreate,
  onDismiss,
  busy,
  error,
}: {
  /** Resolves once the team exists; the wizard selects it. */
  onCreate: (name: string) => void;
  onDismiss: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [name, setName] = useState('');
  const theme = useTheme();

  return (
    <SheetShell
      title="New team"
      subtitle="A name is enough. The squad comes next."
      onDismiss={onDismiss}
    >
      <View className="gap-2">
        <Kicker>Team name</Kicker>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Belonia Strikers"
          placeholderTextColor={theme.placeholder}
          accessibilityLabel="Team name"
          autoCapitalize="words"
          autoFocus
          editable={!busy}
          returnKeyType="done"
          onSubmitEditing={() => name.trim() && onCreate(name.trim())}
          className="text-foreground border-input h-12 border bg-neutral-100 px-4 font-sans text-base"
        />
      </View>

      {error ? <ErrorBanner message={error} /> : null}

      <Button
        label={busy ? 'Creating…' : 'Create the team'}
        disabled={name.trim().length === 0 || busy}
        onPress={() => onCreate(name.trim())}
      />
    </SheetShell>
  );
}

// ─── A player ────────────────────────────────────────────────────────────────

export function AddPlayerSheet({
  teamId,
  teamName,
  squadIds,
  onAdded,
  onDismiss,
}: {
  teamId: string | null;
  teamName: string;
  /** Who is already on this club's books, so they are not offered again. */
  squadIds: ReadonlySet<string>;
  /** The player who was just attached. The wizard ticks them into the XI. */
  onAdded: (playerId: string) => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const [role, setRole] = useState<PlayerRole | null>(null);
  const finder = usePlayerFinder({ teamId, squadIds, onAdded });

  const typed = finder.search.trim();

  return (
    <SheetShell
      title={`Add to ${teamName}`}
      subtitle="Search first — a player who already exists keeps their career."
      onDismiss={onDismiss}
    >
      <TextInput
        value={finder.search}
        onChangeText={finder.setSearch}
        placeholder="Player name"
        placeholderTextColor={theme.placeholder}
        accessibilityLabel="Search for a player"
        autoCapitalize="words"
        autoFocus
        editable={!finder.busy}
        className="text-foreground border-input h-12 border bg-neutral-100 px-4 font-sans text-base"
      />

      {finder.error ? <ErrorBanner message={finder.error} /> : null}

      {typed.length > 0 && typed.length < MIN_QUERY ? (
        <Text className="text-foreground/70 text-[13.5px]">Keep typing — two letters or more.</Text>
      ) : null}

      {finder.searching ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" color={theme.primary} />
          <Text className="font-heading text-[11px] uppercase tracking-[1.3px] text-neutral-700">
            Looking
          </Text>
        </View>
      ) : null}

      {finder.matches.length > 0 ? (
        <View className="gap-2">
          <Kicker>Already on Open Innings</Kicker>
          <View className="border-border border-t">
            {finder.matches.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`Add ${p.fullName} — ${careerLine(p)}`}
                disabled={finder.busy}
                onPress={() => void finder.addExisting(p.id)}
                className={`border-border min-h-14 flex-row items-center gap-3 border-b py-3 ${
                  finder.busy ? 'opacity-45' : 'active:opacity-70'
                }`}
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-foreground text-[15px]" numberOfLines={1}>
                    {p.fullName}
                  </Text>
                  <Text
                    className="font-heading mt-0.5 text-[11px] uppercase tracking-[1.2px] text-neutral-700"
                    numberOfLines={1}
                  >
                    {careerLine(p)}
                  </Text>
                </View>
                <Text className="text-steel-700 font-heading shrink-0 text-[13.5px]">Add</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/*
        Offered only once the server has answered and found nobody. Offering it
        while a request is still out is how a second row for the same person
        gets made, and a split career cannot be rejoined without a merge.
      */}
      {finder.noMatches ? (
        <View className="border-border gap-3 border p-3.5">
          <Text className="text-foreground font-heading text-[15px]">
            Nobody found. Add “{typed}” as a new player?
          </Text>

          <View className="gap-2">
            <Kicker>What they do (optional)</Kicker>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-1.5">
                {ROLES.map((r) => (
                  <Pressable
                    key={r.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: role === r.value }}
                    onPress={() => setRole(role === r.value ? null : r.value)}
                    className={`h-11 shrink-0 justify-center border px-3 ${
                      role === r.value ? 'bg-scoreboard border-scoreboard' : 'border-input'
                    } active:opacity-70`}
                  >
                    <Text
                      className={`font-heading text-[13.5px] ${
                        role === r.value ? 'text-scoreboard-text' : 'text-foreground'
                      }`}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>

          <Button
            label={finder.busy ? 'Adding…' : `Add ${typed}`}
            disabled={finder.busy}
            onPress={() => void finder.createAndAdd(typed, role)}
          />
        </View>
      ) : null}
    </SheetShell>
  );
}

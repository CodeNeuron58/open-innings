/**
 * Rejoining a career that got written down twice.
 *
 * Two scorers at the same club add "V Kohli" and "Virat Kohli", and from then
 * on one man has two half-careers and neither is right. It is the most common
 * way this app's data goes wrong, because nothing about it looks like an error
 * at the time — both rows are perfectly valid players.
 *
 * `POST /api/players/[id]/merge` has always been able to fix it. Nothing in
 * the app called it, so the only cure was a database.
 *
 * The two slots mirror the endpoint rather than dressing it up: the player in
 * **Keep** survives and takes everything, the one in **Remove** is dissolved.
 * Which way round it goes matters — the surviving id is the one already shared
 * on a career link — so the screen says it in those words rather than asking
 * for "the duplicate" and deciding on the user's behalf.
 *
 * The server does the refusing. Only a duplicate you created can be dissolved,
 * and two players who appeared in the same innings are never the same person,
 * so that is refused too. Neither rule is restated here: this screen would be
 * a second opinion that could drift, and the one that matters is the one
 * holding the transaction.
 */
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import type { MergePlayersResponse, PlayerSummary } from '@open-innings/shared';
import { api } from '../lib/api';
import { useApiMutation } from '../lib/use-api';
import { tap } from '../lib/haptics';
import { SheetShell } from './scorer/Sheets';
import { Button, ErrorBanner } from './ui';

type Slot = 'keep' | 'remove';

/** "47 deliveries, 3 squads and 1 innings opening" — what actually moved. */
function movedSummary(moved: MergePlayersResponse['moved']): string {
  const parts = [
    moved.ballEvents === 1 ? '1 delivery' : `${moved.ballEvents} deliveries`,
    moved.squads === 1 ? '1 squad' : `${moved.squads} squads`,
    moved.inningsOpenings === 1 ? '1 innings opening' : `${moved.inningsOpenings} innings openings`,
  ];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** One of the two slots, drawn as a framed object you tap to fill. */
function SlotRow({
  label,
  hint,
  player,
  onPress,
}: {
  label: string;
  hint: string;
  player: PlayerSummary | null;
  onPress: () => void;
}) {
  return (
    <View>
      <Text className="font-heading text-[11px] uppercase tracking-[1.5px] text-neutral-700">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={player ? `${label}: ${player.fullName}. Change` : `Choose ${label}`}
        onPress={onPress}
        className="border-input mt-1.5 min-h-12 flex-row items-center justify-between gap-3 border px-4 py-2.5 active:opacity-70"
      >
        <Text
          className={`flex-1 text-[15.5px] ${player ? 'text-foreground' : 'text-foreground/45'}`}
          numberOfLines={1}
        >
          {player?.fullName ?? 'Choose a player'}
        </Text>
        <Text className="text-steel-700 font-heading shrink-0 text-[11px] uppercase tracking-[1.2px]">
          {player ? 'Change' : 'Pick'}
        </Text>
      </Pressable>
      <Text className="text-foreground/55 mt-1 font-sans text-[12.5px] leading-[18px]">{hint}</Text>
    </View>
  );
}

export function MergePlayers({
  players,
  onDismiss,
  onMerged,
}: {
  players: PlayerSummary[];
  onDismiss: () => void;
  /** Called after a successful merge so the list can reload. */
  onMerged: (summary: string) => void;
}) {
  const mutation = useApiMutation();
  const [keepId, setKeepId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [picking, setPicking] = useState<Slot | null>(null);

  const byId = (id: string | null) => players.find((p) => p.id === id) ?? null;
  const keep = byId(keepId);
  const remove = byId(removeId);
  const ready = keep !== null && remove !== null && keep.id !== remove.id;

  function choose(id: string) {
    tap();
    if (picking === 'keep') {
      setKeepId(id);
      // Choosing the same player for both is the one mistake the two slots
      // invite, so the other slot yields rather than the sheet complaining.
      if (removeId === id) setRemoveId(null);
    } else {
      setRemoveId(id);
      if (keepId === id) setKeepId(null);
    }
    setPicking(null);
  }

  async function merge() {
    if (!keep || !remove) return;
    const result = await mutation.run<MergePlayersResponse>((token) =>
      api.mergePlayer(token, keep.id, remove.id),
    );
    if (result) {
      tap('wicket');
      onMerged(`${remove.fullName} merged into ${keep.fullName} — ${movedSummary(result.moved)}.`);
    }
  }

  function confirm() {
    if (!keep || !remove) return;
    Alert.alert(
      'Merge these players?',
      `Everything ${remove.fullName} did becomes ${keep.fullName}'s. ${remove.fullName} is removed, and the ball log is rewritten. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Merge', style: 'destructive', onPress: () => void merge() },
      ],
    );
  }

  // The picker takes over the sheet rather than opening a second one on top of
  // it — a modal over a modal is where Android's back button stops being
  // predictable.
  if (picking !== null) {
    const other = picking === 'keep' ? removeId : keepId;
    return (
      <SheetShell
        title={picking === 'keep' ? 'Player to keep' : 'Player to remove'}
        subtitle={
          picking === 'keep'
            ? 'The record that survives, with both careers in it.'
            : 'The duplicate. Its matches move across, then it is gone.'
        }
        onDismiss={() => setPicking(null)}
      >
        <ScrollView className="mt-3 max-h-[420px]">
          {players.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={p.fullName}
              disabled={p.id === other}
              onPress={() => choose(p.id)}
              className={`border-border border-b py-4 active:opacity-70 ${
                p.id === other ? 'opacity-35' : ''
              }`}
            >
              <Text className="text-foreground text-[16px]">{p.fullName}</Text>
              {p.id === other ? (
                <Text className="text-foreground/55 mt-0.5 font-sans text-[12.5px]">
                  Already in the other slot
                </Text>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      </SheetShell>
    );
  }

  return (
    <SheetShell
      title="Merge duplicates"
      subtitle="Two records, one player. Their matches, squads and innings all move to the one you keep."
      onDismiss={onDismiss}
      footer={
        <Button
          label="Merge"
          variant="destructive"
          disabled={!ready || mutation.busy}
          loading={mutation.busy}
          onPress={confirm}
        />
      }
    >
      <View className="mt-4 gap-5">
        <SlotRow
          label="Keep"
          hint="Survives, and inherits everything. Its career link keeps working."
          player={keep}
          onPress={() => {
            tap();
            setPicking('keep');
          }}
        />
        <SlotRow
          label="Remove"
          hint="Dissolved into the one above. Nothing it did is lost."
          player={remove}
          onPress={() => {
            tap();
            setPicking('remove');
          }}
        />

        {mutation.error ? <ErrorBanner message={mutation.error} /> : null}

        {/*
          Said before the merge rather than only in the confirmation, because
          this is the fact that decides which name goes in which slot.
        */}
        <Text className="text-foreground/55 font-sans text-[12.5px] leading-[18px]">
          A merge rewrites the ball log and cannot be undone. Two players who batted in the same
          innings are not the same person, and that merge is refused.
        </Text>
      </View>
    </SheetShell>
  );
}

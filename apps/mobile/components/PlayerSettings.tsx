/**
 * Correcting or removing a player.
 *
 * A player was write-once until now: `api/players/[id]` had no route at all,
 * so a name typed wrong at the ground stayed wrong on a public career page,
 * and somebody added by mistake could not be taken back out.
 *
 * Delete is offered but rarely allowed, and that is the design rather than a
 * limitation. Anybody who has faced a ball is in matches other people scored,
 * and the server refuses to remove them — a scorecard with a hole in it is
 * worse than a duplicate name in a list. The refusal comes back as a sentence
 * naming **merge** as the thing that actually solves a duplicate, so it is
 * shown as it arrives rather than replaced with "could not delete".
 */
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { createPlayerSchema, type PlayerRole, type PlayerSummary } from '@open-innings/shared';
import { api } from '../lib/api';
import { useApiMutation } from '../lib/use-api';
import { tap } from '../lib/haptics';
import { SheetShell } from './scorer/Sheets';
import { Button, ErrorBanner, Field } from './ui';

/** The same labels and order the add-a-player screen uses. */
const ROLES: { value: PlayerRole; label: string }[] = [
  { value: 'batsman', label: 'Top order' },
  { value: 'bowler', label: 'Bowler' },
  { value: 'all_rounder', label: 'All-rounder' },
  { value: 'wicket_keeper', label: 'Keeper' },
  { value: 'wicket_keeper_batsman', label: 'Keeper-bat' },
];

export function PlayerSettings({
  player,
  onDone,
  onClose,
}: {
  player: PlayerSummary;
  /** Something changed — the list needs reloading. */
  onDone: () => void;
  onClose: () => void;
}) {
  const mutation = useApiMutation();
  const [fullName, setFullName] = useState(player.fullName);
  const [role, setRole] = useState<PlayerRole | null>(player.role ?? null);
  const [nameError, setNameError] = useState<string | null>(null);

  async function save() {
    setNameError(null);
    const parsed = createPlayerSchema.safeParse({ fullName, role: role ?? undefined });
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? 'Enter a name');
      return;
    }

    const result = await mutation.run((token) => api.updatePlayer(token, player.id, parsed.data));
    if (result) {
      tap();
      onDone();
    }
  }

  function confirmDelete() {
    Alert.alert(
      `Delete ${player.fullName}?`,
      'This removes the player and takes them out of every squad they are in. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const result = await mutation.run((token) => api.deletePlayer(token, player.id));
              if (result) {
                tap('wicket');
                onDone();
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <SheetShell
      title="Edit player"
      subtitle={player.fullName}
      onDismiss={onClose}
      footer={<Button label="Save" loading={mutation.busy} onPress={() => void save()} />}
    >
      <View className="mt-4 gap-5">
        <Field
          label="Full name"
          value={fullName}
          onChangeText={setFullName}
          error={nameError ?? mutation.fieldError?.message}
          autoCapitalize="words"
          editable={!mutation.busy}
        />

        <View>
          <Text className="font-heading text-[11px] uppercase tracking-[1.5px] text-neutral-700">
            What they do
          </Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {ROLES.map((r) => {
              const on = role === r.value;
              return (
                <Pressable
                  key={r.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  // Tapping the chosen one clears it. A role is optional, and a
                  // picker that can set a value and never unset it is how
                  // somebody stays a keeper because of one mis-tap.
                  onPress={() => {
                    tap();
                    setRole(on ? null : r.value);
                  }}
                  className={`min-h-11 justify-center border px-3.5 active:opacity-70 ${
                    on ? 'bg-primary border-primary' : 'border-border'
                  }`}
                >
                  <Text
                    className={`font-heading text-[12.5px] uppercase tracking-[1.2px] ${
                      on ? 'text-primary-foreground' : 'text-foreground'
                    }`}
                  >
                    {r.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {mutation.error ? <ErrorBanner message={mutation.error} /> : null}

        <View className="border-border border-t pt-4">
          <Button
            label="Delete player"
            variant="destructive"
            disabled={mutation.busy}
            onPress={confirmDelete}
          />
          <Text className="text-foreground/55 mt-2 font-sans text-[12.5px] leading-[18px]">
            Only possible for somebody who has never played. Once a player has faced a ball they are
            part of matches other people scored — merge a duplicate into the right player instead.
          </Text>
        </View>
      </View>
    </SheetShell>
  );
}

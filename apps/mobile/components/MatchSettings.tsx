/**
 * Match settings modal.
 * Allows updating details, abandoning, or deleting a match.
 */
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { MatchSummary } from '@open-innings/shared';
import { api } from '../lib/api';
import { useApiMutation } from '../lib/use-api';
import { Button, ErrorBanner, Field, Kicker } from './ui';

export function MatchSettings({
  match,
  onDone,
  onClose,
}: {
  match: MatchSummary;
  /** Something changed — the list needs reloading. */
  onDone: () => void;
  onClose: () => void;
}) {
  const mutation = useApiMutation();

  const [title, setTitle] = useState(match.title ?? '');
  const [venue, setVenue] = useState(match.venue ?? '');
  const [overs, setOvers] = useState(match.oversPerInnings);

  /*
   * The innings length is the one field here that is not cosmetic — the engine
   * ends an innings on it, so changing it re-decides whether an innings
   * already scored is over. The server replays the match and refuses the
   * change once a result exists; the screen says so rather than letting the
   * request come back rejected.
   */
  const inPlay = match.status === 'live' || match.status === 'scheduled';

  const dirty =
    title.trim() !== (match.title ?? '') ||
    venue.trim() !== (match.venue ?? '') ||
    overs !== match.oversPerInnings;

  async function save() {
    const saved = await mutation.run((t) =>
      api.updateMatch(t, match.id, {
        title: title.trim() || undefined,
        venue: venue.trim() || undefined,
        ...(inPlay && overs !== match.oversPerInnings ? { oversPerInnings: overs } : {}),
      }),
    );
    if (saved) onDone();
  }

  function confirmAbandon() {
    Alert.alert(
      'Abandon this match?',
      'It will be recorded as a no result — not a tie, and not a win. Everything scored so far is kept.',
      [
        { text: 'Keep playing', style: 'cancel' },
        {
          text: 'Abandon',
          style: 'destructive',
          onPress: async () => {
            const done = await mutation.run((t) => api.abandonMatch(t, match.id, 'Rain'));
            if (done) onDone();
          },
        },
      ],
    );
  }

  function confirmDelete() {
    Alert.alert(
      'Delete this match?',
      'Every ball, both scorecards and every career figure derived from them go with it. This cannot be undone.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const done = await mutation.run((t) => api.deleteMatch(t, match.id));
            if (done) onDone();
          },
        },
      ],
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-background border-border max-h-[88%] border-t-2 px-4 pb-4 pt-3.5">
          <View className="flex-row items-baseline justify-between gap-3">
            <Text className="text-foreground font-heading text-[21px]">Match settings</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              className="shrink-0 px-1 py-1 active:opacity-60"
            >
              <Text className="font-heading text-[11px] uppercase tracking-[1.4px] text-neutral-600">
                Close
              </Text>
            </Pressable>
          </View>

          <ScrollView className="mt-4" contentContainerClassName="gap-4 pb-1">
            <Field
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Sunday League — Round 4"
              autoCapitalize="words"
              editable={!mutation.busy}
            />
            <Field
              label="Venue"
              value={venue}
              onChangeText={setVenue}
              placeholder="e.g. Astoria Ground"
              autoCapitalize="words"
              editable={!mutation.busy}
            />

            <View>
              <Text className="font-heading text-[11px] uppercase tracking-[1.6px] text-neutral-700">
                Overs per side
              </Text>
              {inPlay ? (
                <View className="border-input mt-1.5 h-12 flex-row items-center border bg-neutral-100">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Fewer overs"
                    onPress={() => setOvers((o) => Math.max(1, o - 1))}
                    disabled={mutation.busy}
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
                    disabled={mutation.busy}
                    className="h-full w-11 items-center justify-center active:opacity-60"
                  >
                    <Text className="text-foreground font-heading text-[18px]">+</Text>
                  </Pressable>
                </View>
              ) : (
                <View className="border-input mt-1.5 h-12 justify-center border bg-neutral-200 px-4">
                  <Text className="text-foreground/55 font-heading text-[17px]">{overs}</Text>
                </View>
              )}
              {!inPlay ? (
                <Text className="text-foreground/55 mt-1.5 text-[11.5px] leading-[16px]">
                  Fixed once the match has a result — changing it would re-decide an innings that
                  has already been shared.
                </Text>
              ) : null}
            </View>

            {mutation.error ? <ErrorBanner message={mutation.error} /> : null}

            <Button
              label={mutation.busy ? 'Saving…' : 'Save changes'}
              disabled={!dirty || mutation.busy}
              onPress={() => void save()}
            />

            <View className="border-border border-t pt-4">
              <Kicker>Ending it</Kicker>

              {match.status === 'live' ? (
                <>
                  <Text className="text-foreground/70 mt-2 text-[12.5px] leading-[18px]">
                    Rain, a dispute, or a match started by mistake. A live match cannot be deleted
                    until it has ended.
                  </Text>
                  <View className="mt-3">
                    <Button
                      label="Abandon — no result"
                      variant="secondary"
                      disabled={mutation.busy}
                      onPress={confirmAbandon}
                    />
                  </View>
                </>
              ) : (
                <View className="mt-3">
                  <Button
                    label="Delete this match"
                    variant="secondary"
                    disabled={mutation.busy}
                    onPress={confirmDelete}
                  />
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

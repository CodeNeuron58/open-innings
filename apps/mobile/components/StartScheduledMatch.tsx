/**
 * Starting a match that was set up in advance.
 *
 * Everything else was decided when it was created — the two sides, both XIs,
 * the toss if one was made. The only thing missing is who opens, which is the
 * one question that genuinely could not be answered the night before.
 *
 * It fetches the squads rather than being handed them, because the match list
 * does not carry squads and loading every scheduled match's XI to render a
 * list would be a request per row for something nobody has asked to see yet.
 */
import { useState } from 'react';
import { Text, View } from 'react-native';
import type { ScorerResponse } from '@open-innings/shared';
import { api } from '../lib/api';
import { useApiQuery, useApiMutation } from '../lib/use-api';
import { checkOpeners, openersPayload } from '../lib/openers';
import { OpenersPicker } from './scorer/Openers';
import { SheetShell } from './scorer/Sheets';
import { Button, ErrorBanner } from './ui';
import { titleOf, whenOf, type MatchRow } from './MatchCard';

export function StartScheduledMatch({
  match,
  onStarted,
  onCancel,
}: {
  match: MatchRow;
  onStarted: () => void;
  onCancel: () => void;
}) {
  const mutation = useApiMutation();
  const [strikerId, setStrikerId] = useState<string | null>(null);
  const [nonStrikerId, setNonStrikerId] = useState<string | null>(null);
  const [bowlerId, setBowlerId] = useState<string | null>(null);

  /*
   * `/scorer` answers this even before an innings exists: it resolves the
   * sides from the toss and returns both XIs, which is exactly what has to be
   * chosen from here.
   */
  const squads = useApiQuery<ScorerResponse>(
    (t, signal) => api.scorer(t, match.id, signal),
    [match.id],
  );

  const draft = { strikerId, nonStrikerId, bowlerId };
  const { problem } = checkOpeners(draft);
  const payload = openersPayload(draft);

  async function start() {
    if (!payload) return;
    const started = await mutation.run((t) => api.startNextInnings(t, match.id, payload));
    if (started !== null) onStarted();
  }

  const when = whenOf(match);

  return (
    <SheetShell
      title={titleOf(match)}
      subtitle={when ? `${when} · who is opening?` : 'Who is opening?'}
      onDismiss={onCancel}
    >
      {squads.isLoading ? (
        <Text className="text-foreground/70 text-[13.5px]">Loading the squads…</Text>
      ) : squads.error || !squads.data ? (
        <ErrorBanner message={squads.error ?? 'Could not load this match.'} />
      ) : (
        <>
          <OpenersPicker
            battingSquad={squads.data.battingSquad}
            bowlingSquad={squads.data.bowlingSquad}
            strikerId={strikerId}
            nonStrikerId={nonStrikerId}
            bowlerId={bowlerId}
            onStriker={setStrikerId}
            onNonStriker={setNonStrikerId}
            onBowler={setBowlerId}
            bowlingLabel={`Opening bowler · ${squads.data.bowlingTeamName}`}
          />

          {mutation.error ? <ErrorBanner message={mutation.error} /> : null}

          {problem ? (
            <Text className="text-foreground/70 text-[13.5px] leading-[19px]">{problem}</Text>
          ) : null}

          <View className="pt-1">
            <Button
              label={mutation.busy ? 'Starting…' : 'Start the match'}
              disabled={!payload || mutation.busy}
              onPress={() => void start()}
            />
          </View>
        </>
      )}
    </SheetShell>
  );
}

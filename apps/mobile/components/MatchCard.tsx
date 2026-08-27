/**
 * A match, as a row in a list.
 *
 * Two lists show these now — the owner's own matches, and the public feed a
 * guest lands on — and they have to say the same thing. A live score written
 * two ways is two chances to be wrong about the same match, and the second
 * list would be the one nobody noticed had drifted.
 *
 * The owner's list passes `onOptions`; the public one does not, and the button
 * simply is not drawn. That is the only difference between them.
 */
import { Pressable, Text, View } from 'react-native';
import { formatOvers } from '@open-innings/scoring';
import type { MatchListResponse } from '@open-innings/shared';
import { formatLabel } from '../lib/formats';
import { Corners } from './ui';

/** `1st`, `2nd`, `3rd`, `4th` — the super over runs to four. */
function ordinalInnings(n: number): string {
  return ['', '1st', '2nd', '3rd', '4th'][n] ?? `${n}th`;
}

export type MatchRow = MatchListResponse['matches'][number];

export function isLive(m: MatchRow): boolean {
  return m.status === 'live' || m.status === 'in_progress';
}

/** Set up in advance and not started. See migration-free scheduling in B10. */
export function isScheduled(m: MatchRow): boolean {
  return m.status === 'scheduled';
}

/** "Saturday 30 August", or nothing if it has no date. */
export function whenOf(m: MatchRow): string | null {
  if (!m.scheduledAt) return null;
  const d = new Date(m.scheduledAt);
  if (Number.isNaN(d.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * A match that has its sides and is waiting to be played.
 *
 * Deliberately not a `LiveMatch` with a different label: it has no score, and
 * the only thing anybody wants from it is to start it. The card says when, who,
 * and offers the one action.
 */
export function ScheduledMatch({
  match,
  onStart,
  onOptions,
}: {
  match: MatchRow;
  onStart: () => void;
  onOptions?: () => void;
}) {
  const when = whenOf(match);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Start ${titleOf(match)}${when ? `, due ${when}` : ''}`}
      onPress={onStart}
      onLongPress={onOptions}
      className="border-input border border-dashed p-4 active:opacity-70"
    >
      <View className="flex-row items-center gap-2">
        <Text className="text-steel-700 font-heading text-[11px] uppercase tracking-[1.5px]">
          {when ?? 'Not started'}
        </Text>
        {onOptions ? (
          <MoreButton
            label={`Options for ${titleOf(match)}`}
            onPress={onOptions}
            className="ml-auto"
          />
        ) : null}
      </View>

      <Text className="text-foreground font-heading mt-3 text-[17px]" numberOfLines={1}>
        {titleOf(match)}
      </Text>

      <Text className="text-foreground/70 font-heading mt-2.5 text-[13.5px] uppercase tracking-[1.2px]">
        {[formatLabel(match.format), `${match.oversPerInnings} overs a side`, match.venue]
          .filter(Boolean)
          .join('  ·  ')}
      </Text>

      <Text className="text-steel-700 font-heading mt-3 text-[14px]">
        Tap to name the openers and start →
      </Text>
    </Pressable>
  );
}

/**
 * What to call a match that was never given a title.
 *
 * Every row used to read "Match", because the wizard had no field for a title
 * and the list had only team ids to work with. Both are fixed; this is the
 * fallback for the matches created in between, and for anyone who does not
 * want to name their Sunday friendly.
 */
export function titleOf(m: MatchRow): string {
  if (m.title) return m.title;
  if (m.teamAName && m.teamBName) return `${m.teamAName} v ${m.teamBName}`;
  return 'Match';
}

/** `142-6 (17.3)` — the innings, the way a scoreboard says it. */
export function lineOf(m: MatchRow, innings: MatchRow['innings'][number]): string {
  const name = innings.battingTeamId === m.teamAId ? (m.teamAName ?? '') : (m.teamBName ?? '');
  // `formatOvers`, not a local `Math.floor(balls / 6)` — the app has one way
  // of writing an over count and this is it.
  return `${name} ${innings.runs}-${innings.wickets} (${formatOvers(innings.ballsBowled)})`;
}

/** The side batting in a given innings. */
export function battingNameOf(m: MatchRow, innings: MatchRow['innings'][number]): string {
  return innings.battingTeamId === m.teamAId
    ? (m.teamAName ?? 'Team A')
    : (m.teamBName ?? 'Team B');
}

/**
 * `142-7 (20)` — the figures alone, without the side's name.
 *
 * All out drops the wicket count, because "138 all out" is written `138` on
 * every scoreboard there has ever been and `138-10` on none of them.
 */
export function scoreOf(innings: MatchRow['innings'][number]): string {
  const wickets = innings.wickets >= 10 ? '' : `-${innings.wickets}`;
  return `${innings.runs}${wickets} (${formatOvers(innings.ballsBowled)})`;
}

/**
 * Which side won, where one did.
 *
 * The list row carries `result` rather than a winning team id, so it is
 * derived. A tie returns null and neither side is emphasised, which is the
 * correct thing for a tie to look like.
 */
export function winnerIdOf(m: MatchRow): string | null {
  if (m.result === 'team_a_win') return m.teamAId;
  if (m.result === 'team_b_win') return m.teamBId;
  return null;
}

/**
 * One side's line: who, and what they made.
 *
 * The name goes left and the figures right, so a column of matches can be read
 * straight down without reading a word of it. `dim` is the losing side — the
 * result is legible from the weight of the type before the sentence under it
 * is reached.
 */
function ScoreLine({ name, score, dim }: { name: string; score: string; dim: boolean }) {
  const tone = dim ? 'text-foreground/50' : 'text-foreground font-heading';
  return (
    <View className="flex-row items-baseline gap-3">
      <Text className={`${tone} min-w-0 flex-1 text-[16px]`} numberOfLines={1}>
        {name}
      </Text>
      <Text className={`${tone} shrink-0 text-[16px]`}>{score}</Text>
    </View>
  );
}

/**
 * How far off the chase is, where there is one.
 *
 * The single most useful sentence about a live match, and the list had nowhere
 * to put it because it had no score to put it beside.
 */
export function chaseOf(m: MatchRow, innings: MatchRow['innings'][number]): string | null {
  if (innings.target === null || innings.status === 'completed') return null;
  const needed = Math.max(0, innings.target - innings.runs);
  const ballsLeft = Math.max(0, m.oversPerInnings * 6 - innings.ballsBowled);
  if (ballsLeft === 0) return null;
  return `Need ${needed} off ${ballsLeft}`;
}

/** Format date as "8 Aug" */
export function shortDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }).toUpperCase();
}

export function LiveMatch({
  match,
  onPress,
  onOptions,
}: {
  match: MatchRow;
  onPress: () => void;
  /** Omitted on a list of matches the reader does not own. */
  onOptions?: () => void;
}) {
  const innings = [...match.innings].sort((a, b) => a.inningsNumber - b.inningsNumber);
  // The innings being played now — the last one on the sheet.
  const current = innings[innings.length - 1] ?? null;
  const chase = current ? chaseOf(match, current) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        current
          ? `Resume ${titleOf(match)} — ${lineOf(match, current)}${chase ? `. ${chase}` : ''}`
          : `Resume ${titleOf(match)}`
      }
      accessibilityHint={onOptions ? 'Hold for options, or use the options button' : undefined}
      onPress={onPress}
      onLongPress={onOptions}
      className="border-border relative border p-4 active:opacity-70"
    >
      {/* The registration marks every framed object in this system carries.
          This card was drawn by hand and never had them. */}
      <Corners />

      <View className="flex-row items-center gap-2">
        <View className="bg-primary h-1.5 w-1.5" />
        <Text className="text-steel-700 font-heading text-[11px] uppercase tracking-[1.5px]">
          {current ? `Live · ${ordinalInnings(current.inningsNumber)} innings` : 'Live'}
        </Text>
        {/* Shows active watchers, hidden if < 2. */}
        {match.watching >= 2 ? (
          <Text className="text-foreground/70 font-heading ml-auto text-[11px] uppercase tracking-[1.3px]">
            {match.watching} watching
          </Text>
        ) : null}

        {/* Settings, edit, abandon and delete used to live *only* behind a
            long-press. That gesture is not discoverable — it was named in an
            accessibilityHint and nowhere a sighted user would find it — so a
            match started by mistake could not be got rid of. The hold still
            works; it is a shortcut now rather than the only door. */}
        {onOptions ? (
          <MoreButton
            label={`Options for ${titleOf(match)}`}
            onPress={onOptions}
            className={match.watching >= 2 ? '' : 'ml-auto'}
          />
        ) : null}
      </View>

      {/*
        Both innings, in the order they were played, with the side at the
        crease carrying the weight. A chase is two numbers compared — printing
        only the current one made the reader hold the other in their head.
      */}
      {innings.length > 0 ? (
        <View className="mt-3 gap-0.5">
          {innings.map((i) => (
            <ScoreLine
              key={i.inningsNumber}
              name={battingNameOf(match, i)}
              score={scoreOf(i)}
              dim={current !== null && i.inningsNumber !== current.inningsNumber}
            />
          ))}
        </View>
      ) : (
        <Text className="text-foreground font-heading mt-3 text-[16px]" numberOfLines={1}>
          {titleOf(match)}
        </Text>
      )}

      {chase ? (
        <Text className="text-foreground/70 font-heading mt-2 text-[11px] uppercase tracking-[1.2px]">
          {chase}
        </Text>
      ) : innings.length === 0 ? (
        <Text className="text-foreground/60 mt-2 text-[13.5px]">Not a ball bowled yet</Text>
      ) : null}
    </Pressable>
  );
}

export function FinishedMatch({
  match,
  onPress,
  onOptions,
}: {
  match: MatchRow;
  onPress: () => void;
  /** Omitted on a list of matches the reader does not own. */
  onOptions?: () => void;
}) {
  const winner = winnerIdOf(match);
  // Innings order is the order they were played, which is the order a
  // scorecard prints them.
  const innings = [...match.innings].sort((a, b) => a.inningsNumber - b.inningsNumber);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        titleOf(match),
        ...innings.map((i) => `${battingNameOf(match, i)} ${scoreOf(i)}`),
        match.summary,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={onOptions ? 'Hold for options, or use the options button' : undefined}
      onPress={onPress}
      onLongPress={onOptions}
      className="border-border border-b py-4 active:opacity-70"
    >
      {/*
        Both innings, not the fixture's name.

        This row used to read "Koramangala XI v HSR Strikers" and then the
        result in small caps — a match with no score on it, in a list whose
        whole job is scores. The figures were on the row all along; nothing
        drew them.
      */}
      <View className="flex-row items-start gap-2">
        <View className="min-w-0 flex-1 gap-0.5">
          {innings.length > 0 ? (
            innings.map((i) => (
              <ScoreLine
                key={i.inningsNumber}
                name={battingNameOf(match, i)}
                score={scoreOf(i)}
                dim={winner !== null && i.battingTeamId !== winner}
              />
            ))
          ) : (
            <Text className="text-foreground font-heading text-[16px]" numberOfLines={1}>
              {titleOf(match)}
            </Text>
          )}
        </View>
        {onOptions ? (
          <MoreButton label={`Options for ${titleOf(match)}`} onPress={onOptions} />
        ) : null}
      </View>

      <Text
        className="text-foreground/60 font-heading mt-2 text-[11px] uppercase tracking-[1.2px]"
        numberOfLines={1}
      >
        {[
          match.summary,
          formatLabel(match.format) ?? `${match.oversPerInnings} ov`,
          shortDate(match.startedAt ?? match.createdAt),
        ]
          .filter(Boolean)
          .join('  ·  ')}
      </Text>
    </Pressable>
  );
}

/**
 * The way in to a match's settings that does not require knowing a gesture.
 *
 * Sized to the kit's own 44pt minimum and given a real label, because "⋯"
 * tells a screen reader nothing on its own.
 */
function MoreButton({
  label,
  onPress,
  className = '',
}: {
  label: string;
  onPress: () => void;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      className={`border-border h-11 w-11 shrink-0 items-center justify-center border active:opacity-70 ${className}`}
    >
      <Text className="text-foreground font-heading text-[17px] leading-[17px]">⋯</Text>
    </Pressable>
  );
}

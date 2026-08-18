/**
 * The scorer's modal sheets.
 *
 * One of these is *mandatory* — after a wicket the engine cannot validate the
 * next delivery until it knows who is on strike, and guessing corrupts the
 * scorecard silently. That sheet has no dismiss button on purpose, and offers
 * "Undo last ball" instead, because the usual reason a scorer is stuck there
 * is that the previous ball was recorded wrongly.
 *
 * End-of-over lives in EndOfOver.tsx — it outgrew a sheet.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { WicketTypeValue } from '@open-innings/shared';
import { Button } from '../ui';

// ─── Shell ───────────────────────────────────────────────────────────────────

function SheetShell({
  title,
  subtitle,
  onDismiss,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Omit for mandatory sheets — there must be no way to tap past them. */
  onDismiss?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDismiss}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-background border-border max-h-[88%] border-t-2 px-4 pb-4 pt-3.5">
          <View className="flex-row items-baseline justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-foreground font-heading text-[21px]">{title}</Text>
              {subtitle ? (
                <Text className="text-foreground/65 mt-0.5 text-[12.5px]">{subtitle}</Text>
              ) : null}
            </View>
            {onDismiss ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={onDismiss}
                // A word, not an ✕. There is room for it, and a scorer who has
                // opened this by accident should not have to aim at a glyph.
                className="shrink-0 px-1 py-1 active:opacity-60"
              >
                <Text className="font-heading text-[11px] uppercase tracking-[1.4px] text-neutral-600">
                  Cancel
                </Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView className="mt-4" contentContainerClassName="gap-4 pb-1">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * A choice chip. Square, hairline, fills solid when chosen — the Industry
 * system has no rounded pills and no second colour to select with.
 */
function Chip({
  label,
  selected,
  onPress,
  grow = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Chips laid out on a grid rather than wrapped to their content. */
  grow?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`h-11 items-center justify-center border px-3 ${
        grow ? 'min-w-0 flex-1' : 'shrink-0'
      } ${selected ? 'bg-scoreboard border-scoreboard' : 'border-input bg-transparent'} active:opacity-70`}
    >
      <Text
        className={`font-heading text-[13px] ${
          selected ? 'text-scoreboard-text' : 'text-foreground'
        }`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text className="font-heading text-[9.5px] uppercase tracking-[1.5px] text-neutral-600">
      {children}
    </Text>
  );
}

// ─── Extras ──────────────────────────────────────────────────────────────────

export type ExtraKind = 'wide' | 'no_ball' | 'bye' | 'leg_bye';

/**
 * Total runs offered per extra.
 *
 * Wides and no-balls always carry their one-run penalty, so totals start at 1;
 * a no-ball can also have a six struck off it (1 + 6 = 7). Byes and leg-byes
 * have no penalty, so their minimum is a genuine run — a "0 bye" isn't a bye,
 * it's a dot ball.
 */
const EXTRA_RUNS: Record<ExtraKind, number[]> = {
  wide: [1, 2, 3, 4, 5, 6],
  no_ball: [1, 2, 3, 4, 5, 6, 7],
  bye: [1, 2, 3, 4, 5, 6],
  leg_bye: [1, 2, 3, 4, 5, 6],
};

const EXTRA_LABELS: Record<ExtraKind, string> = {
  wide: 'Wide',
  no_ball: 'No ball',
  bye: 'Bye',
  leg_bye: 'Leg bye',
};

export function ExtraRunsSheet({
  kind,
  onConfirm,
  onCancel,
}: {
  kind: ExtraKind;
  onConfirm: (totalRuns: number) => void;
  onCancel: () => void;
}) {
  return (
    <SheetShell
      title={EXTRA_LABELS[kind]}
      subtitle="How many runs in total, including the penalty?"
      onDismiss={onCancel}
    >
      <View className="border-border flex-row flex-wrap border-l border-t">
        {EXTRA_RUNS[kind].map((runs) => (
          <Pressable
            key={runs}
            accessibilityRole="button"
            accessibilityLabel={`${runs} run${runs === 1 ? '' : 's'} in total`}
            onPress={() => onConfirm(runs)}
            className="border-border h-14 w-1/4 items-center justify-center border-b border-r active:opacity-70"
          >
            <Text className="text-foreground font-heading text-[20px]">{runs}</Text>
          </Pressable>
        ))}
      </View>
    </SheetShell>
  );
}

// ─── Wicket ──────────────────────────────────────────────────────────────────

/**
 * Short labels, because these sit three to a row on a phone.
 *
 * All nine, not the six on the design. The three extra ones are rare, but a
 * scorer who needs "retired hurt" needs it on the day and has no other way to
 * record it — and dropping them from the sheet would not remove them from the
 * engine, it would just make them unreachable.
 */
const WICKET_TYPES: { value: WicketTypeValue; label: string }[] = [
  { value: 'bowled', label: 'Bowled' },
  { value: 'caught', label: 'Caught' },
  { value: 'lbw', label: 'LBW' },
  { value: 'run_out', label: 'Run out' },
  { value: 'stumped', label: 'Stumped' },
  { value: 'hit_wicket', label: 'Hit wkt' },
  { value: 'caught_behind', label: 'Ct behind' },
  { value: 'obstructing_field', label: 'Obstruct' },
  { value: 'hit_the_ball_twice', label: 'Hit twice' },
  { value: 'retired_hurt', label: 'Ret. hurt' },
  { value: 'retired_out', label: 'Ret. out' },
];

/**
 * Law 21.18 — on a free hit the striker can only go the ways a no-ball allows.
 *
 * Offering the rest would be offering a delivery the engine refuses: the tap
 * lands, the request fails, and the scorer is left reading an error about a
 * law instead of being shown it. Retirements are not outcomes of the delivery
 * at all, so they stay available.
 */
const FREE_HIT_ALLOWED: WicketTypeValue[] = [
  'run_out',
  'obstructing_field',
  'hit_the_ball_twice',
  'retired_hurt',
  'retired_out',
];

/** Dismissals where a fielder is credited. */
const NEEDS_FIELDER: WicketTypeValue[] = ['caught', 'caught_behind', 'stumped', 'run_out'];

/** Dismissals that can take the batter at the bowler's end. */
const CAN_DISMISS_NON_STRIKER: WicketTypeValue[] = ['run_out', 'retired_hurt', 'retired_out'];

export function WicketSheet({
  strikerId,
  strikerName,
  nonStrikerId,
  nonStrikerName,
  fielders,
  nextBatters,
  isFreeHit = false,
  onConfirm,
  onCancel,
}: {
  strikerId: string;
  strikerName: string;
  nonStrikerId: string;
  nonStrikerName: string;
  /** Law 21.18 narrows what this delivery can have produced. */
  isFreeHit?: boolean;
  /** The bowling side — only they can be credited with a catch or a run-out. */
  fielders: { id: string; fullName: string }[];
  /** Who can come in. Empty when the innings is about to end. */
  nextBatters: { id: string; fullName: string }[];
  onConfirm: (
    type: WicketTypeValue,
    outBatterId: string,
    fielderId?: string,
    nextBatterId?: string,
  ) => void;
  onCancel: () => void;
}) {
  const allowed = isFreeHit
    ? WICKET_TYPES.filter((w) => FREE_HIT_ALLOWED.includes(w.value))
    : WICKET_TYPES;

  const [type, setType] = useState<WicketTypeValue>(isFreeHit ? 'run_out' : 'bowled');
  const [outBatterId, setOutBatterId] = useState(strikerId);
  const [fielderId, setFielderId] = useState<string | null>(null);
  const [nextBatterId, setNextBatterId] = useState<string | null>(null);
  const [pickingOut, setPickingOut] = useState(false);
  const [pickingNext, setPickingNext] = useState(false);

  const needsFielder = NEEDS_FIELDER.includes(type);
  const canBeNonStriker = CAN_DISMISS_NON_STRIKER.includes(type);

  // Bowled, caught, LBW and the rest can only take the batter on strike. If
  // the scorer had chosen the non-striker for a run-out and then switched to
  // "bowled", the selection is now impossible — correct it rather than
  // recording a dismissal that cannot have happened.
  const effectiveOutId = canBeNonStriker ? outBatterId : strikerId;
  const outName = effectiveOutId === strikerId ? strikerName : nonStrikerName;
  const nextName = nextBatters.find((p) => p.id === nextBatterId)?.fullName;

  function choose(next: WicketTypeValue) {
    setType(next);
    if (!NEEDS_FIELDER.includes(next)) setFielderId(null);
    if (!CAN_DISMISS_NON_STRIKER.includes(next)) {
      setOutBatterId(strikerId);
      setPickingOut(false);
    }
  }

  return (
    <SheetShell
      title="Wicket"
      subtitle={
        isFreeHit
          ? 'Free hit — only a run out, obstruction or hitting the ball twice (Law 21.18)'
          : undefined
      }
      onDismiss={onCancel}
    >
      <View className="gap-2">
        <Label>How out</Label>
        <View className="flex-row flex-wrap gap-1.5">
          {allowed.map((w) => (
            <View key={w.value} className="w-[31.7%]">
              <Chip label={w.label} selected={type === w.value} onPress={() => choose(w.value)} />
            </View>
          ))}
        </View>
      </View>

      {needsFielder ? (
        <View className="gap-2">
          <Label>Fielder {type === 'run_out' ? '(who threw)' : '(optional)'}</Label>
          <View className="flex-row flex-wrap gap-1.5">
            {fielders.map((p) => (
              <Chip
                key={p.id}
                label={p.fullName}
                selected={fielderId === p.id}
                onPress={() => setFielderId(fielderId === p.id ? null : p.id)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/*
        Out, and who replaces them — one row, because they are one decision.
        Naming the incoming batter here is what stops a second mandatory sheet
        appearing the moment this one closes.
      */}
      <View className="border-border border-t pt-3.5">
        <View className="flex-row items-center gap-2">
          <Text className="font-heading shrink-0 text-[9.5px] uppercase tracking-[1.5px] text-neutral-600">
            Out
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Batter out: ${outName}. ${
              canBeNonStriker ? 'Tap to change.' : 'Only the striker can be out this way.'
            }`}
            onPress={() => canBeNonStriker && setPickingOut((v) => !v)}
            disabled={!canBeNonStriker}
            className="min-w-0 shrink"
          >
            <Text
              className={`font-heading text-[15px] ${
                canBeNonStriker ? 'text-steel-700' : 'text-foreground'
              }`}
              numberOfLines={1}
            >
              {outName}
              {canBeNonStriker ? ' ▾' : ''}
            </Text>
          </Pressable>

          <Text className="text-foreground/40 shrink-0 text-[15px]">→</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              nextName ? `Next batter: ${nextName}. Tap to change.` : 'Choose the next batter'
            }
            onPress={() => nextBatters.length > 0 && setPickingNext((v) => !v)}
            disabled={nextBatters.length === 0}
            className="min-w-0 flex-1"
          >
            <Text
              className={`font-heading text-[15px] ${
                nextName ? 'text-steel-700' : 'text-foreground/45'
              }`}
              numberOfLines={1}
            >
              {nextBatters.length === 0 ? 'Last wicket' : (nextName ?? 'Next batter ▾')}
              {nextName ? ' ▾' : ''}
            </Text>
          </Pressable>
        </View>

        {pickingOut ? (
          <View className="mt-2.5 flex-row gap-1.5">
            <Chip
              grow
              label={`${strikerName} *`}
              selected={effectiveOutId === strikerId}
              onPress={() => {
                setOutBatterId(strikerId);
                setPickingOut(false);
              }}
            />
            <Chip
              grow
              label={nonStrikerName}
              selected={effectiveOutId === nonStrikerId}
              onPress={() => {
                setOutBatterId(nonStrikerId);
                setPickingOut(false);
              }}
            />
          </View>
        ) : null}

        {pickingNext ? (
          <View className="mt-2.5 flex-row flex-wrap gap-1.5">
            {nextBatters.map((p) => (
              <Chip
                key={p.id}
                label={p.fullName}
                selected={nextBatterId === p.id}
                onPress={() => {
                  setNextBatterId(p.id);
                  setPickingNext(false);
                }}
              />
            ))}
          </View>
        ) : null}
      </View>

      <Button
        label="Record wicket"
        onPress={() =>
          onConfirm(
            type,
            effectiveOutId,
            needsFielder && fielderId ? fielderId : undefined,
            nextBatterId ?? undefined,
          )
        }
      />
    </SheetShell>
  );
}

// ─── Mandatory replacement sheet ─────────────────────────────────────────────

/**
 * Who comes in.
 *
 * Normally never seen: the wicket sheet asks for the replacement at the same
 * time as the dismissal. This is the fallback for when it was skipped — and
 * for a batter who retired hurt and is being replaced later.
 */
export function NextPlayerSheet({
  title,
  subtitle,
  candidates,
  emptyMessage,
  onSelect,
  onUndo,
  onEndInnings,
  onCancel,
}: {
  title: string;
  subtitle: string;
  candidates: { id: string; label: string; tag?: string }[];
  emptyMessage: string;
  onSelect: (id: string) => void;
  onUndo?: () => void;
  /** Only offered on the batter sheet — a short squad can't lose ten wickets. */
  onEndInnings?: () => void;
  /**
   * Makes the sheet dismissable.
   *
   * Omitted for the mandatory ones — after a wicket or an over the engine
   * cannot validate the next delivery until a replacement is named, so there
   * must be no way to tap past them. A mid-over bowler change is the opposite:
   * it is a correction the scorer chose to make and must be able to abandon.
   */
  onCancel?: () => void;
}) {
  return (
    <SheetShell title={title} subtitle={subtitle} onDismiss={onCancel}>
      {candidates.length === 0 ? (
        <Text className="text-foreground/70 text-[13.5px]">{emptyMessage}</Text>
      ) : (
        <View className="border-border border-t">
          {candidates.map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              onPress={() => onSelect(c.id)}
              className="border-border min-h-14 flex-row items-center justify-between border-b px-1 active:opacity-70"
            >
              <Text className="text-foreground min-w-0 flex-1 text-[15px]" numberOfLines={1}>
                {c.label}
              </Text>
              {c.tag ? (
                <Text className="font-heading shrink-0 text-[10px] uppercase tracking-[1.3px] text-neutral-600">
                  {c.tag}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}

      <View className="gap-2 pt-1">
        {onEndInnings ? (
          <Button label="End the innings" variant="secondary" onPress={onEndInnings} />
        ) : null}
        {/* The usual reason a scorer is stuck on a mandatory sheet is a
            mis-recorded previous ball, so undo is always within reach there.
            A dismissable sheet is a deliberate choice rather than a trap, and
            does not need the escape hatch. */}
        {onUndo ? <Button label="Undo last ball" variant="ghost" onPress={onUndo} /> : null}
      </View>
    </SheetShell>
  );
}

// ─── Openers ─────────────────────────────────────────────────────────────────

/**
 * The three players who open an innings.
 *
 * Built for the Super Over, which is the one innings that starts from a screen
 * with no picker on it — the result screen, after a tie. The innings break has
 * its own inline version; this one is a sheet because it opens on top of a
 * finished match rather than being the whole screen.
 *
 * The two batters cannot be the same person and the server refuses it, so the
 * chosen striker is removed from the non-striker's list rather than allowed
 * and then rejected.
 */
export function OpenersSheet({
  title,
  subtitle,
  battingSquad,
  bowlingSquad,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  subtitle: string;
  battingSquad: { id: string; fullName: string }[];
  bowlingSquad: { id: string; fullName: string }[];
  busy: boolean;
  error: string | null;
  onConfirm: (openers: {
    openingStrikerId: string;
    openingNonStrikerId: string;
    openingBowlerId: string;
  }) => void;
  onCancel: () => void;
}) {
  const [strikerId, setStrikerId] = useState<string | null>(null);
  const [nonStrikerId, setNonStrikerId] = useState<string | null>(null);
  const [bowlerId, setBowlerId] = useState<string | null>(null);

  const ready = strikerId !== null && nonStrikerId !== null && bowlerId !== null;

  return (
    <SheetShell title={title} subtitle={subtitle} onDismiss={onCancel}>
      <View className="gap-2">
        <Label>On strike</Label>
        <View className="flex-row flex-wrap gap-1.5">
          {battingSquad.map((p) => (
            <Chip
              key={p.id}
              label={p.fullName}
              selected={strikerId === p.id}
              onPress={() => {
                setStrikerId(p.id);
                if (nonStrikerId === p.id) setNonStrikerId(null);
              }}
            />
          ))}
        </View>
      </View>

      <View className="gap-2">
        <Label>At the other end</Label>
        <View className="flex-row flex-wrap gap-1.5">
          {battingSquad
            .filter((p) => p.id !== strikerId)
            .map((p) => (
              <Chip
                key={p.id}
                label={p.fullName}
                selected={nonStrikerId === p.id}
                onPress={() => setNonStrikerId(p.id)}
              />
            ))}
        </View>
      </View>

      <View className="gap-2">
        <Label>Opening bowler</Label>
        <View className="flex-row flex-wrap gap-1.5">
          {bowlingSquad.map((p) => (
            <Chip
              key={p.id}
              label={p.fullName}
              selected={bowlerId === p.id}
              onPress={() => setBowlerId(p.id)}
            />
          ))}
        </View>
      </View>

      {error ? (
        <View className="border-destructive/40 bg-destructive/5 border p-2.5">
          <Text className="text-foreground text-[12.5px]">{error}</Text>
        </View>
      ) : null}

      <Button
        label={busy ? 'Starting…' : 'Start'}
        disabled={!ready || busy}
        onPress={() =>
          ready &&
          onConfirm({
            openingStrikerId: strikerId,
            openingNonStrikerId: nonStrikerId,
            openingBowlerId: bowlerId,
          })
        }
      />
    </SheetShell>
  );
}

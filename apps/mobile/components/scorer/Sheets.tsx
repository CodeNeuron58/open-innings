/**
 * The scorer's modal sheets.
 *
 * Two of these are *mandatory* — after a wicket, and after a completed over,
 * scoring is blocked until the scorer names the replacement. That's not
 * pedantry: the engine needs to know who is on strike and who is bowling
 * before it can validate the next delivery, and guessing corrupts the
 * scorecard silently.
 *
 * Both mandatory sheets offer "Undo last ball" as the escape hatch, because
 * the usual reason a scorer is stuck here is that the previous ball was
 * recorded wrongly.
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
      <View className="flex-1 justify-end bg-black/60">
        <View className="bg-scoreboard-panel border-scoreboard-border max-h-[85%] rounded-t-3xl border-t p-5">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-scoreboard-text text-lg font-bold">{title}</Text>
              {subtitle ? (
                <Text className="text-scoreboard-muted mt-1 text-sm">{subtitle}</Text>
              ) : null}
            </View>
            {onDismiss ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={onDismiss}
                className="bg-scoreboard h-10 w-10 items-center justify-center rounded-full"
              >
                <Text className="text-scoreboard-muted text-lg">✕</Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView className="mt-4" contentContainerClassName="gap-4 pb-2">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Chip({
  label,
  selected,
  onPress,
  tone = 'default',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  tone?: 'default' | 'wicket';
}) {
  const selectedBg = tone === 'wicket' ? 'bg-wicket' : 'bg-primary';
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`min-h-12 justify-center rounded-xl px-4 ${
        selected ? selectedBg : 'bg-scoreboard border-scoreboard-border border'
      }`}
    >
      <Text className={`text-sm ${selected ? 'font-bold text-white' : 'text-scoreboard-text'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-scoreboard-muted text-xs font-bold uppercase tracking-wide">
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
      <View className="flex-row flex-wrap gap-2">
        {EXTRA_RUNS[kind].map((runs) => (
          <Pressable
            key={runs}
            accessibilityRole="button"
            onPress={() => onConfirm(runs)}
            className="bg-extra h-14 w-14 items-center justify-center rounded-xl"
          >
            <Text className="text-extra-foreground text-lg font-bold">{runs}</Text>
          </Pressable>
        ))}
      </View>
    </SheetShell>
  );
}

// ─── Wicket ──────────────────────────────────────────────────────────────────

const WICKET_TYPES: { value: WicketTypeValue; label: string }[] = [
  { value: 'bowled', label: 'Bowled' },
  { value: 'caught', label: 'Caught' },
  { value: 'caught_behind', label: 'Caught behind' },
  { value: 'lbw', label: 'LBW' },
  { value: 'run_out', label: 'Run out' },
  { value: 'stumped', label: 'Stumped' },
  { value: 'hit_wicket', label: 'Hit wicket' },
  { value: 'retired_hurt', label: 'Retired hurt' },
  { value: 'retired_out', label: 'Retired out' },
];

/** Dismissals where a fielder is credited. */
const NEEDS_FIELDER: WicketTypeValue[] = ['caught', 'caught_behind', 'stumped', 'run_out'];

export function WicketSheet({
  strikerId,
  strikerName,
  nonStrikerId,
  nonStrikerName,
  players,
  onConfirm,
  onCancel,
}: {
  strikerId: string;
  strikerName: string;
  nonStrikerId: string;
  nonStrikerName: string;
  players: { id: string; fullName: string }[];
  onConfirm: (type: WicketTypeValue, outBatterId: string, fielderId?: string) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<WicketTypeValue>('bowled');
  const [outBatterId, setOutBatterId] = useState(strikerId);
  const [fielderId, setFielderId] = useState<string | null>(null);

  const needsFielder = NEEDS_FIELDER.includes(type);

  return (
    <SheetShell title="Wicket" onDismiss={onCancel}>
      <View className="gap-2">
        <Label>How out</Label>
        <View className="flex-row flex-wrap gap-2">
          {WICKET_TYPES.map((w) => (
            <Chip
              key={w.value}
              label={w.label}
              tone="wicket"
              selected={type === w.value}
              onPress={() => setType(w.value)}
            />
          ))}
        </View>
      </View>

      <View className="gap-2">
        <Label>Batter out</Label>
        {/* A run-out can dismiss the non-striker — getting this wrong credits
            the dismissal to the wrong batter and corrupts the scorecard. */}
        <View className="flex-row flex-wrap gap-2">
          <Chip
            label={`${strikerName} (striker)`}
            tone="wicket"
            selected={outBatterId === strikerId}
            onPress={() => setOutBatterId(strikerId)}
          />
          <Chip
            label={`${nonStrikerName} (non-striker)`}
            tone="wicket"
            selected={outBatterId === nonStrikerId}
            onPress={() => setOutBatterId(nonStrikerId)}
          />
        </View>
      </View>

      {needsFielder ? (
        <View className="gap-2">
          <Label>Fielder (optional)</Label>
          <View className="flex-row flex-wrap gap-2">
            {players.map((p) => (
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

      <Button
        label="Record wicket"
        onPress={() =>
          onConfirm(type, outBatterId, needsFielder && fielderId ? fielderId : undefined)
        }
      />
    </SheetShell>
  );
}

// ─── Mandatory replacement sheets ────────────────────────────────────────────

export function NextPlayerSheet({
  title,
  subtitle,
  candidates,
  emptyMessage,
  onSelect,
  onUndo,
  onEndInnings,
}: {
  title: string;
  subtitle: string;
  candidates: { id: string; label: string; tag?: string }[];
  emptyMessage: string;
  onSelect: (id: string) => void;
  onUndo: () => void;
  /** Only offered on the batter sheet — a short squad can't lose ten wickets. */
  onEndInnings?: () => void;
}) {
  return (
    // No onDismiss: this sheet is mandatory. The engine cannot validate the
    // next ball until the replacement is named.
    <SheetShell title={title} subtitle={subtitle}>
      {candidates.length === 0 ? (
        <Text className="text-scoreboard-muted text-sm">{emptyMessage}</Text>
      ) : (
        <View className="gap-2">
          {candidates.map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              onPress={() => onSelect(c.id)}
              className="bg-scoreboard border-scoreboard-border min-h-14 flex-row items-center justify-between rounded-xl border px-4"
            >
              <Text className="text-scoreboard-text text-base font-medium">{c.label}</Text>
              {c.tag ? (
                <Text className="text-scoreboard-muted text-xs uppercase">{c.tag}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}

      <View className="border-scoreboard-border gap-2 border-t pt-4">
        {onEndInnings ? (
          <Button label="End the innings" variant="secondary" onPress={onEndInnings} />
        ) : null}
        {/* The usual reason a scorer is stuck here is a mis-recorded previous
            ball, so undo is always within reach. */}
        <Button label="Undo last ball" variant="ghost" onPress={onUndo} />
      </View>
    </SheetShell>
  );
}

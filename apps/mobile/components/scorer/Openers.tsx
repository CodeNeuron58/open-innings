/**
 * Who's on — the striker, the non-striker and the bowler.
 *
 * Two screens drew this as three rows of chips and drew them differently:
 * `InningsBreak` had `OpenerPicker`, `OpenersSheet` had its own inline copy,
 * and they disagreed about how the pair rule was enforced. One filtered the
 * striker out of the other list so the collision was impossible; the other
 * allowed it and complained afterwards.
 *
 * Neither is wrong on its own. Having both is, because the rule they were
 * expressing is the same rule and it now lives in `lib/openers.ts`.
 *
 * Match creation keeps its own presentation. It is a full screen with room for
 * a career line under each name, which is worth having when you are picking
 * openers before a match rather than between innings — but it takes the rule
 * from the same place.
 */
import { Pressable, Text, View } from 'react-native';
import { Kicker } from '../ui';

export type OpenerOption = { id: string; fullName: string };

function Row({
  label,
  options,
  selected,
  /** Already chosen at the other end, so not choosable at this one. */
  takenId,
  onSelect,
}: {
  label: string;
  options: OpenerOption[];
  selected: string | null;
  takenId?: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <View className="gap-2">
      <Kicker>{label}</Kicker>
      <View className="flex-row flex-wrap gap-1.5">
        {options.map((p) => {
          const isSelected = p.id === selected;
          const isTaken = p.id === takenId;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, disabled: isTaken }}
              accessibilityLabel={isTaken ? `${p.fullName} — already at the other end` : p.fullName}
              disabled={isTaken}
              onPress={() => onSelect(p.id)}
              className={`h-11 shrink-0 justify-center border px-3 ${
                isSelected ? 'bg-scoreboard border-scoreboard' : 'border-input'
              } ${isTaken ? 'opacity-35' : 'active:opacity-70'}`}
            >
              <Text
                className={`font-heading text-[13.5px] ${
                  isSelected ? 'text-scoreboard-text' : 'text-foreground'
                }`}
              >
                {p.fullName}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function OpenersPicker({
  battingSquad,
  bowlingSquad,
  strikerId,
  nonStrikerId,
  bowlerId,
  onStriker,
  onNonStriker,
  onBowler,
  /** Named where the two sides are not obvious from the screen around it. */
  bowlingLabel = 'Opening bowler',
}: {
  battingSquad: OpenerOption[];
  bowlingSquad: OpenerOption[];
  strikerId: string | null;
  nonStrikerId: string | null;
  bowlerId: string | null;
  onStriker: (id: string) => void;
  onNonStriker: (id: string) => void;
  onBowler: (id: string) => void;
  bowlingLabel?: string;
}) {
  return (
    <>
      <Row
        label="Striker"
        options={battingSquad}
        selected={strikerId}
        takenId={nonStrikerId}
        onSelect={onStriker}
      />
      <Row
        label="Non-striker"
        options={battingSquad}
        selected={nonStrikerId}
        takenId={strikerId}
        onSelect={onNonStriker}
      />
      <Row label={bowlingLabel} options={bowlingSquad} selected={bowlerId} onSelect={onBowler} />
    </>
  );
}

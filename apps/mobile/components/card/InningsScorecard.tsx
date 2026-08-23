/**
 * Traditional innings scorecard.
 * Prevents text wrapping in figure columns using shrink-0.
 */
import { Text, View } from 'react-native';
import type { CardInnings } from '@open-innings/shared';
import { Kicker } from '../ui';

/** Column widths, shared by the header and every row so they cannot drift. */
const BAT_COLS = ['w-[34px]', 'w-[30px]', 'w-[28px]', 'w-[28px]', 'w-[44px]'] as const;
const BOWL_COLS = ['w-[34px]', 'w-[26px]', 'w-[30px]', 'w-[26px]', 'w-[44px]'] as const;

function HeaderRow({
  label,
  heads,
  cols,
}: {
  label: string;
  heads: string[];
  cols: readonly string[];
}) {
  return (
    <View className="border-border flex-row border-b pb-1.5">
      <Text className="font-heading min-w-0 flex-1 text-[9px] uppercase tracking-[1.3px] text-neutral-600">
        {label}
      </Text>
      {heads.map((h, i) => (
        <Text
          key={h}
          className={`font-heading shrink-0 text-right text-[9px] uppercase tracking-[1.3px] text-neutral-600 ${cols[i]}`}
        >
          {h}
        </Text>
      ))}
    </View>
  );
}

function Figures({ values, cols }: { values: string[]; cols: readonly string[] }) {
  return (
    <>
      {values.map((v, i) => (
        <Text
          key={i}
          className={`font-heading shrink-0 text-right text-[13px] ${
            i === 0 ? 'text-foreground' : 'text-foreground/65'
          } ${cols[i]}`}
        >
          {v}
        </Text>
      ))}
    </>
  );
}

export function InningsScorecard({ innings }: { innings: CardInnings }) {
  const { extras } = innings;

  // Only the kinds that actually occurred. "wd 0, nb 0, b 0, lb 0" is four
  // pieces of noise standing in for one fact: there were no extras.
  const extraParts = [
    extras.wides > 0 ? `wd ${extras.wides}` : null,
    extras.noBalls > 0 ? `nb ${extras.noBalls}` : null,
    extras.byes > 0 ? `b ${extras.byes}` : null,
    extras.legByes > 0 ? `lb ${extras.legByes}` : null,
    (extras.penalty ?? 0) > 0 ? `pen ${extras.penalty}` : null,
  ].filter(Boolean);

  return (
    <View>
      <HeaderRow label="Batter" heads={['R', 'B', '4s', '6s', 'SR']} cols={BAT_COLS} />

      {innings.batting.map((b) => (
        <View key={b.playerId} className="border-border flex-row items-start border-b py-2.5">
          <View className="min-w-0 flex-1 pr-2">
            <Text className="text-foreground text-[14px]" numberOfLines={1}>
              {b.playerName}
            </Text>
            {/* How they went. A not-out batter gets the words, not a blank —
                the absence of a dismissal is information. */}
            <Text className="text-foreground/55 mt-0.5 text-[11px]" numberOfLines={1}>
              {b.isOut ? (b.dismissalText ?? 'out') : 'not out'}
            </Text>
          </View>
          <Figures
            values={[
              `${b.runs}${b.isOut ? '' : '*'}`,
              String(b.balls),
              String(b.fours),
              String(b.sixes),
              b.strikeRate,
            ]}
            cols={BAT_COLS}
          />
        </View>
      ))}

      <View className="border-border flex-row items-baseline justify-between gap-3 border-b py-2.5">
        <Text className="font-heading shrink-0 text-[9px] uppercase tracking-[1.3px] text-neutral-600">
          Extras
        </Text>
        <Text className="text-foreground/70 min-w-0 flex-1 text-right text-[12.5px]">
          {extras.total}
          {extraParts.length > 0 ? ` (${extraParts.join(', ')})` : ''}
        </Text>
      </View>

      <View className="flex-row items-baseline justify-between gap-3 py-2.5">
        <Text className="font-heading shrink-0 text-[9px] uppercase tracking-[1.3px] text-neutral-600">
          Total
        </Text>
        <Text className="text-foreground font-heading shrink-0 text-[16px]">
          {innings.runs}-{innings.wickets}{' '}
          <Text className="text-foreground/55 text-[12.5px]">({innings.overs} ov)</Text>
        </Text>
      </View>

      {innings.fallOfWickets.length > 0 ? (
        <View className="border-border mt-3 border-t pt-3">
          <Kicker>Fall of wickets</Kicker>
          <Text className="text-foreground/70 mt-1.5 text-[12px] leading-[19px]">
            {innings.fallOfWickets
              .map((f) => `${f.wicketNumber}–${f.runsAtFall} (${f.name}, ${f.oversAtFall})`)
              .join('  ·  ')}
          </Text>
        </View>
      ) : null}

      {innings.bowling.length > 0 ? (
        <View className="mt-5">
          <HeaderRow label="Bowler" heads={['O', 'M', 'R', 'W', 'Econ']} cols={BOWL_COLS} />
          {innings.bowling.map((b) => (
            <View key={b.playerId} className="border-border flex-row items-center border-b py-2.5">
              <Text className="text-foreground min-w-0 flex-1 pr-2 text-[14px]" numberOfLines={1}>
                {b.playerName}
              </Text>
              <Figures
                values={[b.overs, String(b.maidens), String(b.runs), String(b.wickets), b.economy]}
                cols={BOWL_COLS}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

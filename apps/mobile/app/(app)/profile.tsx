/**
 * Profile and cricket persona builder.
 * Allows the user to set their on-field role, batting/bowling style, and club.
 * Persists data to the player and team backend APIs and claims the player identity.
 */
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import type { BattingStyle, BowlingStyle, PlayerRole } from '@open-innings/shared';
import { api, ApiError, NetworkError } from '../../lib/api';
import { useSession } from '../../lib/session';
import { Button, ErrorBanner, Field, Kicker } from '../../components/ui';

const ROLES = [
  { label: 'Batter', value: 'batsman' as PlayerRole },
  { label: 'Bowler', value: 'bowler' as PlayerRole },
  { label: 'All-rounder', value: 'all_rounder' as PlayerRole },
  { label: 'Keeper', value: 'wicket_keeper' as PlayerRole },
] as const;

const HANDS = [
  { label: 'Right', value: 'right_hand' as BattingStyle },
  { label: 'Left', value: 'left_hand' as BattingStyle },
] as const;

const BOWLING_OPTIONS = [
  { label: 'Right-arm fast', value: 'right_arm_fast' as BowlingStyle },
  { label: 'Right-arm spin', value: 'right_arm_off_break' as BowlingStyle },
  { label: 'Left-arm fast', value: 'left_arm_fast' as BowlingStyle },
  { label: 'Left-arm spin', value: 'left_arm_orthodox' as BowlingStyle },
  { label: 'None', value: 'none' as BowlingStyle },
] as const;

/** A segmented choice with square hairline borders. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View className="gap-1.5">
      <Text className="font-heading text-[11px] uppercase tracking-[1.6px] text-neutral-700">
        {label}
      </Text>
      <View className="border-border flex-row flex-wrap border-l border-t">
        {options.map((opt) => {
          const on = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(opt.value)}
              className={`border-border h-10 min-w-[25%] flex-1 items-center justify-center border-b border-r px-2 ${
                on ? 'bg-primary' : 'bg-transparent'
              } active:opacity-70`}
            >
              <Text
                className={`font-heading text-[12px] ${
                  on ? 'text-primary-foreground' : 'text-foreground'
                }`}
                numberOfLines={1}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** "A. Menon" -> "a-menon". The shape the career URL takes. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function Profile() {
  const router = useRouter();
  const { user, token, refreshSession } = useSession();

  const [name, setName] = useState(user?.displayName ?? '');
  const [role, setRole] = useState<PlayerRole>('batsman');
  const [bats, setBats] = useState<BattingStyle>('right_hand');
  const [bowls, setBowls] = useState<BowlingStyle>('right_arm_fast');
  const [club, setClub] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = slugify(name || user?.displayName || 'your-name') || 'your-name';

  async function submit() {
    if (!token) {
      router.replace('/matches');
      return;
    }

    const playerName = name.trim() || user?.displayName || 'Cricketer';
    setBusy(true);
    setError(null);

    try {
      // 1. Create player profile
      const playerResult = await api.createPlayer(token, {
        fullName: playerName,
        role,
        battingStyle: bats,
        bowlingStyle: bowls,
      });

      const playerId = playerResult.player.id;

      // 2. Claim player identity for this account
      if (playerId) {
        await api.claimPlayer(token, playerId).catch(() => {});
      }

      // 3. Create club team if specified
      if (club.trim() && playerId) {
        await api
          .createTeam(token, {
            name: club.trim(),
            playerIds: [playerId],
          })
          .catch(() => {});
      }

      // 4. Refresh session to populate claimed playerId
      await refreshSession();

      router.replace('/matches');
    } catch (err) {
      if (err instanceof NetworkError || err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Could not save your profile. You can do this later from Settings.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerClassName="px-5 pb-6 pt-5 grow">
        <Kicker>Player Profile</Kicker>
        <Text className="text-foreground font-heading mt-2 text-[30px] leading-[34px]">
          Who are you{'\n'}on the field?
        </Text>
        <Text className="text-foreground/70 mt-3 text-[14px] leading-5">
          This builds your public career page. You can edit this anytime later.
        </Text>

        {error ? (
          <View className="mt-4">
            <ErrorBanner message={error} />
          </View>
        ) : null}

        <View className="mt-6 gap-5">
          <Field
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Rahul Dravid"
            editable={!busy}
          />

          <Segmented label="Player Role" options={ROLES} value={role} onChange={setRole} />

          <Segmented label="Batting Hand" options={HANDS} value={bats} onChange={setBats} />

          <Segmented
            label="Bowling Style"
            options={BOWLING_OPTIONS}
            value={bowls}
            onChange={setBowls}
          />

          <Field
            label="Club / Team Name (optional)"
            value={club}
            onChangeText={setClub}
            placeholder="e.g. Bangalore XI"
            editable={!busy}
          />
        </View>

        {/* Preview of the resulting career page URL */}
        <View className="border-border relative mt-6 border p-4">
          <Text className="font-heading text-[10px] uppercase tracking-[1.6px] text-neutral-600">
            Your public career page
          </Text>
          <Text className="text-steel-700 font-heading mt-1.5 text-[15px]">
            openinnings.com/p/{slug}
          </Text>
        </View>

        <View className="grow" />

        <View className="mt-8 gap-3">
          <Button label="Save profile" onPress={() => void submit()} loading={busy} />

          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/matches')}
            disabled={busy}
            className="items-center py-2 active:opacity-60"
          >
            <Text className="font-heading text-[11px] uppercase tracking-[1.4px] text-neutral-600">
              Do this later
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

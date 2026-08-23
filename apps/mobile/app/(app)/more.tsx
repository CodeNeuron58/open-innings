/**
 * F1 — More screen. Settings and account info.
 */
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { api } from '../../lib/api';
import { useApiQuery } from '../../lib/use-api';
import { useSession } from '../../lib/session';
import { useSettings } from '../../lib/settings';
import { useSupporter } from '../../lib/purchases';
import { Button, Kicker } from '../../components/ui';
import { DeleteAccount } from '../../components/DeleteAccount';

const REPO = 'https://github.com/CodeNeuron58/open-innings';

/** Initials for the avatar block. */
function initialsOf(name: string): string {
  const parts = name
    .replace(/[^\p{L}\s.]/gu, '')
    .split(/[\s.]+/)
    .filter(Boolean);
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase();
}

function Row({
  label,
  value,
  onPress,
  /** Reason for row being disabled. */
  disabledNote,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  disabledNote?: string;
}) {
  const inert = !onPress || disabledNote !== undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert }}
      accessibilityLabel={disabledNote ? `${label} — ${disabledNote}` : label}
      onPress={onPress}
      disabled={inert}
      className={`border-border flex-row items-center gap-3 border-b py-3.5 ${
        inert ? 'opacity-45' : 'active:opacity-60'
      }`}
    >
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-[15px]" numberOfLines={1}>
          {label}
        </Text>
        {disabledNote ? (
          <Text className="text-foreground/55 mt-0.5 text-[11px]" numberOfLines={1}>
            {disabledNote}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text className="font-heading shrink-0 text-[9.5px] uppercase tracking-[1.2px] text-neutral-600">
          {value}
        </Text>
      ) : null}
      {!inert ? <Text className="text-foreground/35 shrink-0 text-[16px]">›</Text> : null}
    </Pressable>
  );
}

/** A row that actually stores something. */
function ToggleRow({
  label,
  note,
  value,
  onChange,
}: {
  label: string;
  note?: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View className="border-border flex-row items-center gap-3 border-b py-2.5">
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-[15px]">{label}</Text>
        {note ? (
          <Text className="text-foreground/55 mt-0.5 text-[11px]" numberOfLines={2}>
            {note}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        // Use app accent color.
        trackColor={{ false: '#d4d4d7', true: '#5980a6' }}
        thumbColor="#f2f2f3"
      />
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="pt-6">
      <Kicker>{title}</Kicker>
      <View className="border-border mt-1.5 border-t">{children}</View>
    </View>
  );
}

export default function More() {
  const router = useRouter();
  const { user, token, isGuest, playerId, signOut } = useSession();

  // Email confirmation state.
  const [verifyState, setVerifyState] = useState<'idle' | 'sending' | 'sent' | 'unavailable'>(
    'idle',
  );

  async function resendVerification() {
    if (!token) return;
    setVerifyState('sending');
    try {
      const result = await api.sendVerification(token);
      if (!result.mailConfigured) {
        // Handle unavailable mail provider.
        setVerifyState('unavailable');
        return;
      }
      setVerifyState('idle');
      // Redirect to verification code input.
      router.push('/verify');
    } catch {
      setVerifyState('idle');
    }
  }
  const { isSupporter } = useSupporter();
  const { keepAwakeWhileScoring, set } = useSettings();

  const teams = useApiQuery((t, signal) => api.teams(t, signal));
  const clubCount = teams.data?.teams.length ?? 0;

  const displayName = user?.displayName ?? user?.email ?? (isGuest ? 'Guest' : 'Signed in');

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerClassName="px-4 pb-8 pt-4">
        {/* Account and associated player profile. */}
        <Pressable
          accessibilityRole={isGuest ? 'none' : 'button'}
          accessibilityLabel={playerId ? 'Your career page' : isGuest ? displayName : 'Set up your player profile'}
          onPress={
            isGuest
              ? undefined
              : playerId
                ? () => router.push({ pathname: '/players/[id]', params: { id: playerId } })
                : () => router.push('/profile')
          }
          disabled={isGuest}
          className="border-border flex-row items-center gap-3 border p-3 active:opacity-70"
        >
          <View className="border-border h-11 w-11 items-center justify-center border">
            <Text className="text-foreground font-heading text-[15px]">
              {initialsOf(displayName)}
            </Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-foreground font-heading text-[16px]" numberOfLines={1}>
              {displayName}
            </Text>
            <Text
              className="font-heading mt-0.5 text-[9px] uppercase tracking-[1.2px] text-neutral-600"
              numberOfLines={1}
            >
              {user?.email
                ? playerId
                  ? 'Player profile linked'
                  : 'Tap to set up player profile'
                : isGuest
                  ? 'Looking around · no account'
                  : 'No account'}
            </Text>
          </View>
          {!isGuest ? <Text className="text-foreground/35 shrink-0 text-[16px]">›</Text> : null}
        </Pressable>

        {/* Supporter plan pitch. */}
        {!isSupporter ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove ads — see the plans"
            onPress={() => router.push('/supporter')}
            className="border-steel-300 bg-steel-100 mt-3 flex-row items-center gap-3 border p-3.5 active:opacity-70"
          >
            <View className="min-w-0 flex-1">
              <Text className="text-steel-900 font-heading text-[15px]">Remove ads</Text>
              <Text className="text-steel-800/75 mt-0.5 text-[12px]">
                Everything else stays free
              </Text>
            </View>
            <Text className="text-steel-700 font-heading shrink-0 text-[9.5px] uppercase tracking-[1.3px]">
              See plan
            </Text>
          </Pressable>
        ) : null}

        {/* Guest signup pitch. */}
        {isGuest ? (
          <View className="border-border mt-3 border p-3.5">
            <Text className="text-foreground font-heading text-[15px]">Keep a record</Text>
            <Text className="text-foreground/70 mt-1 text-[12.5px] leading-[18px]">
              Reading is free and always will be. Scoring a match needs an account, because a
              scorebook has to belong to someone.
            </Text>
            <View className="mt-3">
              <Button label="Create an account" onPress={() => router.push('/signup')} />
            </View>
          </View>
        ) : null}

        {/* Email verification prompt for unverified accounts. */}
        {user && !isGuest && !user.emailVerifiedAt ? (
          <View className="border-steel-300 bg-steel-100 mb-5 border p-3.5">
            <Text className="text-steel-900 font-heading text-[13px] uppercase tracking-[1.2px]">
              Confirm your email
            </Text>
            <Text className="text-foreground/75 mt-1.5 text-[13px] leading-[19px]">
              {verifyState === 'sent'
                ? `Sent to ${user.email}.`
                : verifyState === 'unavailable'
                  ? 'This build has no mail provider configured, so nothing was sent. That is a setup gap, not a fault with your account.'
                  : `We have not confirmed ${user.email}. Nothing is locked — it is what lets us get you back in if you ever lose your password.`}
            </Text>
            {verifyState === 'sent' ? null : (
              <Pressable
                accessibilityRole="button"
                onPress={() => void resendVerification()}
                disabled={verifyState === 'sending'}
                className="border-steel-400 mt-3 self-start border px-3 py-2 active:opacity-70"
              >
                <Text className="text-steel-900 font-heading text-[10px] uppercase tracking-[1.3px]">
                  {verifyState === 'sending' ? 'Sending' : 'Send the code'}
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}

        <Group title="Cricket">
          <Row
            label="Teams & squads"
            value={
              isGuest
                ? undefined
                : clubCount > 0
                  ? `${clubCount} club${clubCount === 1 ? '' : 's'}`
                  : undefined
            }
            disabledNote={isGuest ? 'Needs an account' : undefined}
            onPress={() => router.push('/teams')}
          />
          {/* Link to claimed player profile if available, or setup wizard if unclaimed. */}
          {playerId ? (
            <Row
              label="My career"
              onPress={() => router.push({ pathname: '/players/[id]', params: { id: playerId } })}
            />
          ) : user && !isGuest ? (
            <Row
              label="Set up my player profile"
              value="Unclaimed"
              onPress={() => router.push('/profile')}
            />
          ) : null}
          <Row
            label="Players & careers"
            value={playerId ? undefined : isGuest ? undefined : 'Say which is you'}
            disabledNote={isGuest ? 'Needs an account' : undefined}
            onPress={() => router.push('/players')}
          />
          <Row label="Matches I follow" disabledNote="Following isn't built yet" value="Soon" />
          <Row label="Coach stats" disabledNote="Not built yet" value="Soon" />
        </Group>

        <Group title="Scoring">
          {/* Scorecards are always public by design. */}
          <Row label="Live match links" value="Always on" />
          <ToggleRow
            label="Keep screen awake"
            note="While you're on the scoring console"
            value={keepAwakeWhileScoring}
            onChange={(next) => set('keepAwakeWhileScoring', next)}
          />
          <Row label="Sound on each ball" disabledNote="Not built yet" value="Off" />
          {/* Export lives on the match card. */}
          <Row label="Export scorebook" value="CSV, JSON" onPress={() => router.push('/matches')} />
        </Group>

        <Group title="Open Innings">
          <Row label="Source on GitHub" onPress={() => void Linking.openURL(REPO)} />
          <Row
            label="Run your own copy"
            onPress={() => void Linking.openURL(`${REPO}#self-hosting`)}
          />
          <Row label={isGuest ? 'Leave guest mode' : 'Sign out'} onPress={() => void signOut()} />
        </Group>

        {/* Account deletion for signed-in users. */}
        {user && !isGuest && token ? (
          <DeleteAccount token={token} email={user.email} onDeleted={() => void signOut()} />
        ) : null}

        <Text className="text-foreground/50 pt-6 text-[11.5px] leading-[17px]">
          AGPL-3.0. Every figure in this app is derived from ball logs, so nothing is typed twice
          and a corrected ball corrects a career.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

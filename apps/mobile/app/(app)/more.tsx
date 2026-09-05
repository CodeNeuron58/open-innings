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
import { useSettings, THEME_CHOICES, type ThemeChoice } from '../../lib/settings';
import { useTheme } from '../../lib/use-theme';
import { useSupporter } from '../../lib/purchases';
import { Button, Kicker } from '../../components/ui';
import { legalUrls } from '../../lib/config';
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
      className={`border-border flex-row items-center gap-3 border-b py-4 ${
        inert ? 'opacity-45' : 'active:opacity-60'
      }`}
    >
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-[16px]" numberOfLines={1}>
          {label}
        </Text>
        {disabledNote ? (
          <Text className="text-foreground/70 mt-1 text-[13px]" numberOfLines={1}>
            {disabledNote}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text className="font-heading text-primary shrink-0 text-[11.5px] uppercase tracking-[1.4px]">
          {value}
        </Text>
      ) : null}
      {!inert ? <Text className="text-foreground/30 shrink-0 text-[18px]">›</Text> : null}
    </Pressable>
  );
}

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
  const theme = useTheme();
  return (
    <View className="border-border flex-row items-center gap-4 border-b py-4">
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-[16px]">{label}</Text>
        {note ? (
          <Text className="text-foreground/70 mt-1 text-[13px] leading-[18px]">{note}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        // The app's accent, from the palette rather than a copy of it — these
        // are props that take a value, so they cannot follow the theme the way
        // a className does.
        trackColor={{ false: theme.track, true: theme.primary }}
        thumbColor={theme.thumb}
      />
    </View>
  );
}

function ChoiceRow<T extends string>({
  label,
  note,
  value,
  options,
  onChange,
}: {
  label: string;
  note?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <View className="border-border border-b py-4">
      <Text className="text-foreground text-[16px]">{label}</Text>
      {note ? (
        <Text className="text-foreground/70 mt-1 text-[13px] leading-[18px]">{note}</Text>
      ) : null}
      <View className="mt-3.5 flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${label}: ${option.label}`}
              onPress={() => onChange(option.value)}
              className={`h-11 min-w-[90px] flex-1 justify-center border ${
                selected ? 'bg-primary border-primary' : 'border-input bg-transparent'
              } active:opacity-70`}
            >
              <Text
                className={`font-heading text-center text-[13px] uppercase tracking-[1.2px] ${
                  selected ? 'text-primary-foreground' : 'text-foreground'
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
  const { keepAwakeWhileScoring, theme, set } = useSettings();

  const teams = useApiQuery((t, signal) => api.teams(t, signal));
  const clubCount = teams.data?.teams.length ?? 0;

  const displayName = user?.displayName ?? user?.email ?? (isGuest ? 'Guest' : 'Signed in');

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="border-border flex-row items-center gap-3 border-b px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/matches'))}
          className="-ml-2 h-10 w-10 items-center justify-center"
        >
          <Text className="text-foreground/70 mb-1 text-2xl">‹</Text>
        </Pressable>
        <Text className="text-foreground font-heading text-xl">Settings & More</Text>
      </View>

      <ScrollView contentContainerClassName="px-4 pb-8 pt-4">
        {/* Account and associated player profile. */}
        <Pressable
          accessibilityRole={isGuest ? 'none' : 'button'}
          accessibilityLabel={
            playerId ? 'Your career page' : isGuest ? displayName : 'Set up your player profile'
          }
          onPress={
            isGuest
              ? undefined
              : playerId
                ? () => router.push({ pathname: '/players/[id]', params: { id: playerId } })
                : () => router.push('/profile')
          }
          disabled={isGuest}
          className="border-border flex-row items-center gap-4 border p-4 active:opacity-70"
        >
          <View className="bg-foreground h-14 w-14 items-center justify-center">
            <Text className="text-background font-heading text-[18px] tracking-[1px]">
              {initialsOf(displayName)}
            </Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-foreground font-heading text-[20px]" numberOfLines={1}>
              {displayName}
            </Text>
            <Text
              className="text-primary font-heading mt-0.5 text-[11px] uppercase tracking-[1.3px]"
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
          {!isGuest ? <Text className="text-foreground/30 shrink-0 text-[20px]">›</Text> : null}
        </Pressable>

        {/* Supporter plan status or pitch. */}
        {isSupporter ? (
          <View className="border-steel-300 bg-steel-100 mt-4 flex-row items-center justify-between border p-4">
            <View className="min-w-0 flex-1">
              <Text className="text-steel-900 font-heading text-[16px]">Supporter active</Text>
              <Text className="text-steel-800/75 mt-0.5 text-[13px]">
                Ads are disabled across the app
              </Text>
            </View>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Manage your subscription on Google Play"
              onPress={() =>
                void Linking.openURL('https://play.google.com/store/account/subscriptions')
              }
              className="border-steel-400 border px-3 py-2 active:opacity-60"
            >
              <Text className="text-steel-900 font-heading text-[11.5px] uppercase tracking-[1.4px]">
                Manage
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove ads — see the plans"
            onPress={() => router.push('/supporter')}
            className="border-steel-300 bg-steel-100 mt-4 flex-row items-center gap-3 border p-4 active:opacity-70"
          >
            <View className="min-w-0 flex-1">
              <Text className="text-steel-900 font-heading text-[16px]">Remove ads</Text>
              <Text className="text-steel-800/75 mt-0.5 text-[13px]">
                Everything else stays free
              </Text>
            </View>
            <Text className="text-steel-700 font-heading shrink-0 text-[11.5px] uppercase tracking-[1.4px]">
              See plan
            </Text>
          </Pressable>
        )}

        {/* Guest signup pitch. */}
        {isGuest ? (
          <View className="border-border mt-3 border p-3.5">
            <Text className="text-foreground font-heading text-[15px]">Keep a record</Text>
            <Text className="text-foreground/70 mt-1 text-[13.5px] leading-[18px]">
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
            <Text className="text-steel-900 font-heading text-[13.5px] uppercase tracking-[1.2px]">
              Confirm your email
            </Text>
            <Text className="text-foreground/75 mt-1.5 text-[13.5px] leading-[19px]">
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
                <Text className="text-steel-900 font-heading text-[11px] uppercase tracking-[1.3px]">
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
          {/* Link to claimed player profile if available. Unclaimed setup is handled by the main profile card at the top. */}
          {playerId ? (
            <Row
              label="My career"
              onPress={() => router.push({ pathname: '/players/[id]', params: { id: playerId } })}
            />
          ) : null}
          <Row
            label="Players & careers"
            value={playerId ? undefined : isGuest ? undefined : 'Say which is you'}
            disabledNote={isGuest ? 'Needs an account' : undefined}
            onPress={() => router.push('/players')}
          />
        </Group>

        {/*
          Four rows here used to advertise features that do not exist —
          "Matches I follow · Soon", "Coach stats · Soon", "Sound on each ball ·
          Not built yet" — and a fifth, "Live match links · Always on", was a
          statement of fact wearing the shape of a control.

          Half the list did nothing, which teaches people not to read the other
          half. They come back when they work; the one true thing among them is
          said as a sentence at the foot of the screen instead.
        */}
        <Group title="Appearance">
          <ChoiceRow<ThemeChoice>
            label="Theme"
            note="Light unless you say otherwise. System follows your phone."
            value={theme}
            options={THEME_CHOICES}
            onChange={(next) => set('theme', next)}
          />
        </Group>

        <Group title="Scoring">
          <ToggleRow
            label="Keep screen awake"
            note="While you're on the scoring console"
            value={keepAwakeWhileScoring}
            onChange={(next) => set('keepAwakeWhileScoring', next)}
          />
          {/* Export lives on the match card. */}
          <Row label="Export scorebook" value="CSV, JSON" onPress={() => router.push('/matches')} />
        </Group>

        <Group title="Open Innings">
          <Row label="Scoring help" onPress={() => router.push('/help')} />
          <Row label="Source on GitHub" onPress={() => void Linking.openURL(REPO)} />
          <Row
            label="Run your own copy"
            onPress={() => void Linking.openURL(`${REPO}#self-hosting`)}
          />
          <Row label="Privacy policy" onPress={() => void Linking.openURL(legalUrls.privacy)} />
          <Row label={isGuest ? 'Leave guest mode' : 'Sign out'} onPress={() => void signOut()} />
        </Group>

        {/* Account deletion for signed-in users. */}
        {user && !isGuest && token ? (
          <DeleteAccount token={token} email={user.email} onDeleted={() => void signOut()} />
        ) : null}

        <Text className="text-foreground/50 pb-4 pt-8 text-center text-[12.5px]">
          Released under the AGPL-3.0 license.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

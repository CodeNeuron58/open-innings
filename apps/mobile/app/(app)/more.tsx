/**
 * F1 — More.
 *
 * Settings, plus the one paid pitch. Grouped the way the design groups them:
 * who you are, then cricket, then how scoring behaves, then the project
 * itself — with the source repository given the same weight as everything
 * else, because "you can run your own copy" is a real answer here rather than
 * a footnote.
 *
 * Several rows in the design need a settings store that does not exist, and
 * they are drawn **disabled with the reason attached** rather than as live
 * toggles that remember nothing. A switch that flips back on next launch is a
 * bug report; a greyed row that says "not built yet" is information.
 */
import { Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { api } from '../../lib/api';
import { useApiQuery } from '../../lib/use-api';
import { useSession } from '../../lib/session';
import { useSettings } from '../../lib/settings';
import { useSupporter } from '../../lib/purchases';
import { Button, Kicker } from '../../components/ui';

const REPO = 'https://github.com/CodeNeuron58/open-innings';

/** Initials for the avatar block — "A. Menon" becomes "AM". */
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
  /** Why it does nothing. Present = the row is inert and looks it. */
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
        // The accent, not the platform default green — this system has one
        // colour and a stray hue on a settings screen is the loudest thing
        // in the app.
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
  const { user, isGuest, signOut } = useSession();
  const { isSupporter } = useSupporter();
  const { keepAwakeWhileScoring, set } = useSettings();

  const teams = useApiQuery((t, signal) => api.teams(t, signal));
  const clubCount = teams.data?.teams.length ?? 0;

  const displayName = user?.displayName ?? user?.email ?? (isGuest ? 'Guest' : 'Signed in');

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerClassName="px-4 pb-8 pt-4">
        {/*
          The account, not a career.

          The design shows this row as a link to openinnings.in/p/a-menon. A
          user account is not linked to a player row — there is no notion of
          "this account is this person on the field" — so it shows the account
          and does not promise a career page it cannot open. See
          docs/wiring.md.
        */}
        <View className="border-border flex-row items-center gap-3 border p-3">
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
              {user?.email ?? (isGuest ? 'Looking around · no account' : 'No account')}
            </Text>
          </View>
        </View>

        {/* The pitch. Inside the app, never in front of a feature. */}
        {!isSupporter ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove ads for ₹99 — see the plan"
            onPress={() => router.push('/supporter')}
            className="border-steel-300 bg-steel-100 mt-3 flex-row items-center gap-3 border p-3.5 active:opacity-70"
          >
            <View className="min-w-0 flex-1">
              <Text className="text-steel-900 font-heading text-[15px]">Remove ads ₹99</Text>
              <Text className="text-steel-800/75 mt-0.5 text-[12px]">
                Everything else stays free
              </Text>
            </View>
            <Text className="text-steel-700 font-heading shrink-0 text-[9.5px] uppercase tracking-[1.3px]">
              See plan
            </Text>
          </Pressable>
        ) : null}

        {/* The pitch, aimed at the one thing a guest cannot do. */}
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
          {/*
            "My career" needs to know which player this account is. It does
            not, so this opens the player list instead of guessing — which is
            also the only way to reach a career page today.
          */}
          <Row
            label="Players & careers"
            disabledNote={isGuest ? 'Needs an account' : undefined}
            onPress={() => router.push('/players')}
          />
          <Row label="Matches I follow" disabledNote="Following isn't built yet" value="Soon" />
          <Row label="Coach stats" disabledNote="Not built yet" value="Soon" />
        </Group>

        <Group title="Scoring">
          {/*
            Every scorecard is already public and permanent — that is the whole
            share loop — so this is a statement of fact, not a switch. Turning
            it off would mean private matches, which is a feature nobody has
            asked for and which would break every link already sent.
          */}
          <Row label="Live match links" value="Always on" />
          <ToggleRow
            label="Keep screen awake"
            note="While you're on the scoring console"
            value={keepAwakeWhileScoring}
            onChange={(next) => set('keepAwakeWhileScoring', next)}
          />
          <Row label="Sound on each ball" disabledNote="Not built yet" value="Off" />
          {/* Export is per match, not per account — a scorebook is a match.
              The action lives on that match's card. */}
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

        <Text className="text-foreground/50 pt-6 text-[11.5px] leading-[17px]">
          AGPL-3.0. Every figure in this app is derived from ball logs, so nothing is typed twice
          and a corrected ball corrects a career.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Confirming your email with a six-digit code.
 * Non-blocking screen (can be skipped) that enables password resets.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { api, ApiError } from '../../lib/api';
import { useSession } from '../../lib/session';
import { Button, ErrorBanner } from '../../components/ui';

const CODE_LENGTH = 6;

/** Resend cooldown to prevent rate-limiting and confusion over active codes. */
const RESEND_SECONDS = 30;

/** The drawn keypad. `⌫` sits under the 0, where a thumb expects it. */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

export default function VerifyEmail() {
  const router = useRouter();
  const { user, token, refreshSession } = useSession();

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  // A plain interval rather than a timestamp diff: this screen is short-lived
  // and foregrounded, so drift measured in a second or two does not matter.
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    timer.current = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const press = (key: string) => {
    if (key === '' || busy) return;
    setError(null);
    if (key === '⌫') {
      setCode((c) => c.slice(0, -1));
      return;
    }
    setCode((c) => (c.length < CODE_LENGTH ? c + key : c));
  };

  async function submit() {
    if (!token || code.length !== CODE_LENGTH) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await api.confirmEmail(token, code);
      // The session carries `emailVerifiedAt`, and the prompt in settings
      // reads it — so refreshing is what makes the banner disappear.
      await refreshSession();
      router.back();
    } catch (err) {
      // Forward the specific server error message directly.
      setError(err instanceof ApiError ? err.message : 'That did not go through. Try again.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!token || secondsLeft > 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.sendVerification(token);
      setNote(
        result.mailConfigured
          ? 'Sent. Check your inbox, and spam if it is not there.'
          : 'This build has no mail provider configured, so nothing was sent.',
      );
      setCode('');
      setSecondsLeft(RESEND_SECONDS);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send a new code.');
    } finally {
      setBusy(false);
    }
  }

  const complete = code.length === CODE_LENGTH;
  const mmss = `0:${String(secondsLeft).padStart(2, '0')}`;

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-1 px-5 pb-4 pt-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-10 w-10 items-start justify-center"
        >
          <Text className="text-foreground/70 text-xl">‹</Text>
        </Pressable>

        <Text className="text-foreground font-heading mt-3 text-[30px] leading-[34px]">
          Six digits
        </Text>
        <Text className="text-foreground/70 mt-2 text-[13.5px]">
          Sent to {user?.email ?? 'your email'}.
        </Text>

        {error ? (
          <View className="mt-3">
            <ErrorBanner message={error} />
          </View>
        ) : null}
        {note ? (
          <Text className="text-steel-700 mt-3 text-[13px] leading-[18px]">{note}</Text>
        ) : null}

        {/* The boxes. The one being typed into is outlined in the accent so
            the caret position is obvious without a real caret. */}
        <View
          className="mt-6 flex-row gap-2"
          accessibilityLabel={`Verification code, ${code.length} of ${CODE_LENGTH} digits entered`}
        >
          {Array.from({ length: CODE_LENGTH }).map((_, i) => {
            const active = i === code.length;
            return (
              <View
                key={i}
                className={`h-[52px] flex-1 items-center justify-center border ${
                  active ? 'border-primary border-2' : 'border-input'
                } bg-neutral-100`}
              >
                <Text className="text-foreground font-heading text-[22px]">{code[i] ?? ''}</Text>
              </View>
            );
          })}
        </View>

        <View className="mt-4 flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: secondsLeft > 0 || busy }}
            onPress={() => void resend()}
            disabled={secondsLeft > 0 || busy}
          >
            <Text
              className={`font-heading text-[11px] uppercase tracking-[1.4px] ${
                secondsLeft > 0 ? 'text-neutral-600' : 'text-steel-700'
              }`}
            >
              {secondsLeft > 0 ? `Resend in ${mmss}` : 'Resend code'}
            </Text>
          </Pressable>

          {/* Confirming gates nothing — it unlocks a password reset being able
              to reach you. Saying so, next to a way out, is what keeps that
              true rather than merely intended. */}
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <Text className="font-heading text-[11px] uppercase tracking-[1.4px] text-neutral-600">
              Do this later
            </Text>
          </Pressable>
        </View>

        <View className="mt-5">
          <Button
            label="Confirm"
            disabled={!complete || busy}
            loading={busy}
            onPress={() => void submit()}
          />
        </View>

        <View className="grow" />

        <View className="flex-row flex-wrap">
          {KEYS.map((k, i) => (
            <Pressable
              key={`${k}-${i}`}
              accessibilityRole="button"
              accessibilityLabel={k === '⌫' ? 'Delete' : k}
              onPress={() => press(k)}
              disabled={k === ''}
              className={`h-[58px] w-1/3 items-center justify-center ${
                k === '' ? '' : 'active:bg-neutral-200'
              }`}
            >
              <Text className="text-foreground font-heading text-[24px]">{k}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

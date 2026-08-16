/**
 * A4 — Verify the six-digit code.
 *
 * ⚠️ NOT WIRED. No code is sent and none is checked — see phone.tsx for why.
 * Any six digits advance to the profile step.
 *
 * The keypad is drawn rather than using the system keyboard. On a screen whose
 * only input is six digits, the OS keyboard covers half the display and shows
 * letters nobody can use; a fixed pad keeps the boxes, the resend timer and
 * the button all visible at once.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Button } from '../../components/ui';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 24;

/** The drawn keypad. `⌫` sits under the 0, where a thumb expects it. */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

export default function Verify() {
  const router = useRouter();
  const [code, setCode] = useState('');
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
    if (key === '') return;
    if (key === '⌫') {
      setCode((c) => c.slice(0, -1));
      return;
    }
    setCode((c) => (c.length < CODE_LENGTH ? c + key : c));
  };

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
          Sent to +91 98450 21174.{' '}
          <Text className="text-steel-700" onPress={() => router.back()}>
            Change
          </Text>
        </Text>

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
          <Text className="font-heading text-[11px] uppercase tracking-[1.4px] text-neutral-600">
            {secondsLeft > 0 ? `Resend in ${mmss}` : 'Resend code'}
          </Text>
          {/* Android can read an SMS code aloud for someone who cannot see the
              notification. Parked with the rest of the flow. */}
          <Text className="text-steel-700 font-heading text-[11px] uppercase tracking-[1.4px]">
            Read it for me
          </Text>
        </View>

        <View className="mt-5">
          <Button label="Verify" disabled={!complete} onPress={() => router.push('/profile')} />
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

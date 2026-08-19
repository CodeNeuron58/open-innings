/**
 * A3 — Sign in with a phone number.
 * ⚠️ NOT WIRED. The backend for phone + OTP is pending DLT registration.
 * Button is visibly disabled rather than failing silently.
 */
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useSession } from '../../lib/session';
import { Button } from '../../components/ui';

/** Ten digits, the length of an Indian mobile number. */
const LOCAL_NUMBER_LENGTH = 10;

function Checkbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      className="mt-4 flex-row items-start gap-2.5 active:opacity-70"
    >
      <View
        className={`mt-0.5 h-[18px] w-[18px] items-center justify-center border ${
          checked ? 'bg-primary border-primary' : 'border-input bg-transparent'
        }`}
      >
        {checked ? <Text className="text-primary-foreground text-[11px]">✓</Text> : null}
      </View>
      <Text className="text-foreground/75 flex-1 text-[13px] leading-5">{label}</Text>
    </Pressable>
  );
}

export default function PhoneSignIn() {
  const router = useRouter();
  const { continueAsGuest } = useSession();
  const [number, setNumber] = useState('');
  const [notify, setNotify] = useState(true);

  // "Send code" is disabled until DLT registration clears.

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerClassName="px-5 pb-6 pt-3 grow">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-10 w-10 items-start justify-center"
        >
          <Text className="text-foreground/70 text-xl">‹</Text>
        </Pressable>

        <Text className="text-foreground font-heading mt-3 text-[30px] leading-[34px]">
          Your number,{'\n'}your scorebook
        </Text>
        <Text className="text-foreground/70 mt-3 text-[14px] leading-5">
          Used to keep your matches on any phone and to hold your career page. Nothing else, and
          never sold.
        </Text>

        <View className="mt-7">
          <Text className="font-heading text-[11px] uppercase tracking-[1.6px] text-neutral-700">
            Mobile number
          </Text>
          <View className="mt-1.5 flex-row gap-2">
            {/* Fixed country code for India-first launch. */}
            <View className="border-input h-12 w-[62px] items-center justify-center border bg-neutral-100">
              <Text className="text-foreground font-heading text-[15px]">+91</Text>
            </View>
            <TextInput
              value={number}
              onChangeText={(t) => setNumber(t.replace(/\D/g, '').slice(0, LOCAL_NUMBER_LENGTH))}
              keyboardType="number-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              maxLength={LOCAL_NUMBER_LENGTH}
              accessibilityLabel="Mobile number"
              className="text-foreground border-input h-12 flex-1 border bg-neutral-100 px-4 font-sans text-base"
            />
          </View>

          <Checkbox
            checked={notify}
            onToggle={() => setNotify((v) => !v)}
            label="Send me a WhatsApp when a match I follow goes live."
          />
        </View>

        <View className="mt-6">
          {/* Button is disabled with inline explanation for missing SMS backend. */}
          <Button label="Send code" disabled onPress={() => undefined} />
          <Text className="text-foreground/60 mt-2 text-center text-[12px] leading-[17px]">
            Phone sign-in is not built yet — it needs DLT registration with TRAI before any SMS can
            reach an Indian number. Use email for now.
          </Text>
        </View>

        <View className="my-5 flex-row items-center gap-3">
          <View className="bg-border h-px flex-1" />
          <Text className="text-foreground/50 font-heading text-[11px] uppercase tracking-[1.4px]">
            or
          </Text>
          <View className="bg-border h-px flex-1" />
        </View>

        {/* Guest access allows reading public surfaces, scoring requires an account. */}
        <Button
          label="Look around first"
          variant="secondary"
          onPress={async () => {
            await continueAsGuest();
            router.replace('/browse');
          }}
        />

        <View className="grow" />

        <Text className="text-foreground/55 mt-8 text-[12px] leading-5">
          Local matches stay on this phone and can be exported. A career page needs a number.
        </Text>
        <Text className="text-foreground/55 mt-3 text-[12px] leading-5">
          By continuing you accept the terms. The source is on GitHub if you would rather read the
          code.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

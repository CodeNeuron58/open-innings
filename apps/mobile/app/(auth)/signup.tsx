import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signupSchema } from '@open-innings/shared';
import { useSession } from '../../lib/session';
import { ApiError, NetworkError } from '../../lib/api';
import { Button, ErrorBanner, Field, Kicker } from '../../components/ui';
import { legalUrls } from '../../lib/config';

export default function Signup() {
  const router = useRouter();
  const { signUp } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setErrors({});

    if (password !== confirmPassword) {
      setErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }

    const parsed = signupSchema.safeParse({
      email,
      password,
      displayName: displayName.trim() || undefined,
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setBusy(true);
    try {
      await signUp(parsed.data.email, parsed.data.password, parsed.data.displayName);
    } catch (err) {
      // Map server 409s to the specific input field instead of the global banner.
      if (err instanceof ApiError && err.field) {
        setErrors({ [err.field]: err.message });
      } else if (err instanceof NetworkError || err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="bg-background flex-1">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView contentContainerClassName="flex-grow px-6 pt-6 pb-10 gap-6">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            className="h-10 w-10 items-start justify-center"
          >
            <Text className="text-foreground/70 -mt-1 text-2xl leading-none">‹</Text>
          </Pressable>

          <View className="gap-2.5">
            <Kicker>Open Innings</Kicker>
            <Text className="text-foreground font-heading text-[40px] uppercase leading-[39px] tracking-[-1px]">
              Create an account
            </Text>
            <Text className="font-sans text-[14.5px] leading-[22px] text-neutral-700">
              Score your club&apos;s matches. No paywall, no ads for scorers.
            </Text>
          </View>

          {error ? <ErrorBanner message={error} /> : null}

          <View className="gap-4">
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
              placeholder="you@club.example"
              editable={!busy}
            />
            <Field
              label="Password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errors.password) setErrors((e) => ({ ...e, password: '' }));
              }}
              error={errors.password}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              editable={!busy}
              rightAccessory={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  onPress={() => setShowPassword((s) => !s)}
                  className="py-1"
                >
                  <Text className="font-heading text-[11px] uppercase tracking-[1px] text-neutral-600">
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </Pressable>
              }
            />
            {password.length > 0 && !errors.password ? (
              <Text
                className={`-mt-2.5 font-sans text-xs ${
                  password.length >= 8 ? 'text-emerald-700' : 'text-neutral-500'
                }`}
              >
                {password.length >= 8
                  ? '✓ Password length met'
                  : `At least 8 characters (${password.length}/8)`}
              </Text>
            ) : null}

            <Field
              label="Confirm password"
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                if (errors.confirmPassword) setErrors((e) => ({ ...e, confirmPassword: '' }));
              }}
              error={errors.confirmPassword}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              placeholder="Re-type your password"
              editable={!busy}
            />
            {confirmPassword.length > 0 && !errors.confirmPassword ? (
              <Text
                className={`-mt-2.5 font-sans text-xs ${
                  confirmPassword === password ? 'text-emerald-700' : 'text-destructive'
                }`}
              >
                {confirmPassword === password ? '✓ Passwords match' : 'Passwords do not match'}
              </Text>
            ) : null}
            <Field
              label="Display name (optional)"
              value={displayName}
              onChangeText={setDisplayName}
              error={errors.displayName}
              autoCapitalize="words"
              placeholder="How you appear to your club"
              editable={!busy}
              onSubmitEditing={submit}
              returnKeyType="go"
            />
          </View>

          <Button label="Create account" onPress={submit} loading={busy} />

          {/*
            Said at the point of consent, not only in settings. This screen is
            where an email address is actually handed over, and a policy linked
            three taps away under About is not shown to the person agreeing.
          */}
          <Text className="text-center font-sans text-[12.5px] leading-[18px] text-neutral-600">
            By creating an account you agree to our{' '}
            <Text
              accessibilityRole="link"
              className="text-steel-700 font-sans underline"
              onPress={() => void Linking.openURL(legalUrls.privacy)}
            >
              privacy policy
            </Text>
            .
          </Text>

          <View className="my-1 flex-row items-center gap-3">
            <View className="bg-border h-px flex-1" />
            <Text className="font-heading text-[12px] uppercase tracking-[1.5px] text-neutral-600">
              or
            </Text>
            <View className="bg-border h-px flex-1" />
          </View>

          <View className="flex-row items-center justify-center gap-2">
            <Text className="font-sans text-[14.5px] text-neutral-600">
              Already have an account?
            </Text>
            <Link href="/login" asChild>
              <Pressable className="py-2 active:opacity-60">
                <Text className="text-steel-700 font-heading text-[15px] uppercase tracking-[1px]">
                  Sign in
                </Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

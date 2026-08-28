import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loginSchema } from '@open-innings/shared';
import { useSession } from '../../lib/session';
import { ApiError, NetworkError } from '../../lib/api';
import { Button, ErrorBanner, Field, Kicker } from '../../components/ui';

export default function Login() {
  const router = useRouter();
  const { signIn } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setFieldError(null);

    // Validate with the server schema before network request.
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFieldError(issue?.path[0] === 'email' ? (issue?.message ?? null) : null);
      setError(issue?.path[0] === 'email' ? null : (issue?.message ?? 'Check your details'));
      return;
    }

    setBusy(true);
    try {
      await signIn(parsed.data.email, parsed.data.password);
      // Auth layout handles redirection once user is set.
    } catch (err) {
      if (err instanceof NetworkError) setError(err.message);
      else if (err instanceof ApiError) setError(err.message);
      else setError('Something went wrong. Try again.');
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
              Sign in
            </Text>
            <Text className="font-sans text-[14.5px] leading-[22px] text-neutral-700">
              Free cricket scoring. Forever.
            </Text>
          </View>

          {error ? <ErrorBanner message={error} /> : null}

          <View className="gap-4">
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              error={fieldError ?? undefined}
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
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="current-password"
              placeholder="••••••••"
              editable={!busy}
              onSubmitEditing={submit}
              returnKeyType="go"
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
          </View>

          <Button label="Sign in" onPress={submit} loading={busy} />

          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/reset' as any)}
            className="items-center py-2 active:opacity-60"
          >
            <Text className="font-sans text-[14.5px] text-neutral-600 underline">
              Forgot your password?
            </Text>
          </Pressable>

          <View className="my-1 flex-row items-center gap-3">
            <View className="bg-border h-px flex-1" />
            <Text className="font-heading text-[12px] uppercase tracking-[1.5px] text-neutral-600">
              or
            </Text>
            <View className="bg-border h-px flex-1" />
          </View>

          <View className="flex-row items-center justify-center gap-2">
            <Text className="font-sans text-[14.5px] text-neutral-600">No account yet?</Text>
            <Link href="/signup" asChild>
              <Pressable className="py-2 active:opacity-60">
                <Text className="text-steel-700 font-heading text-[15px] uppercase tracking-[1px]">
                  Create one
                </Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

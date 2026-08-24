import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { requestResetSchema } from '@open-innings/shared';
import { api, ApiError, NetworkError } from '../../lib/api';
import { Button, ErrorBanner, Field } from '../../components/ui';

export default function ResetPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setFieldError(null);

    const parsed = requestResetSchema.safeParse({ email });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFieldError(issue?.message ?? 'Enter a valid email');
      return;
    }

    setBusy(true);
    try {
      await api.requestPasswordReset(parsed.data.email);
      setSent(true);
    } catch (err) {
      if (err instanceof NetworkError || err instanceof ApiError) {
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
        <ScrollView contentContainerClassName="flex-grow justify-center p-6 gap-6">
          <View className="gap-1">
            <Text className="text-primary text-xs font-bold uppercase tracking-widest">
              Open Innings
            </Text>
            <Text className="text-foreground text-3xl font-bold">Reset password</Text>
            <Text className="text-muted-foreground text-sm">
              We&apos;ll send you a link to choose a new password.
            </Text>
          </View>

          {error ? <ErrorBanner message={error} /> : null}

          {sent ? (
            <View className="border-steel-300 bg-steel-100 gap-3 border p-4">
              <Text className="text-steel-900 font-heading text-[14px] font-semibold uppercase tracking-[1px]">
                Check your inbox
              </Text>
              <Text className="text-foreground/80 font-sans text-sm leading-5">
                If that address has an account, a reset link is on its way. It works once, and is
                valid for an hour.
              </Text>
              <View className="mt-2">
                <Button
                  label="Back to sign in"
                  variant="secondary"
                  onPress={() => router.replace('/login')}
                />
              </View>
            </View>
          ) : (
            <>
              <View className="gap-4">
                <Field
                  label="Email address"
                  value={email}
                  onChangeText={setEmail}
                  error={fieldError ?? undefined}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  inputMode="email"
                  placeholder="you@club.example"
                  editable={!busy}
                  onSubmitEditing={submit}
                  returnKeyType="go"
                />
              </View>

              <Button label="Send reset link" onPress={submit} loading={busy} />

              <View className="flex-row justify-center gap-1">
                <Text className="text-muted-foreground text-sm">Remember your password?</Text>
                <Text
                  accessibilityRole="link"
                  onPress={() => router.replace('/login')}
                  className="text-primary text-sm font-semibold"
                >
                  Sign in
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

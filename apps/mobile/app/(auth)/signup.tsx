import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signupSchema } from '@open-innings/shared';
import { useSession } from '../../lib/session';
import { ApiError, NetworkError } from '../../lib/api';
import { Button, ErrorBanner, Field } from '../../components/ui';

export default function Signup() {
  const { signUp } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setErrors({});

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
      // The server returns 409 with the field set for a duplicate email —
      // put that under the input it belongs to, not in a banner.
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
        <ScrollView contentContainerClassName="flex-grow justify-center p-6 gap-6">
          <View className="gap-1">
            <Text className="text-primary text-xs font-bold uppercase tracking-widest">
              Open Innings
            </Text>
            <Text className="text-foreground text-3xl font-bold">Create an account</Text>
            <Text className="text-muted-foreground text-sm">
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
              onChangeText={setPassword}
              error={errors.password}
              secureTextEntry
              autoComplete="new-password"
              placeholder="At least 8 characters"
              editable={!busy}
            />
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

          <View className="flex-row justify-center gap-1">
            <Text className="text-muted-foreground text-sm">Already have an account?</Text>
            <Link href="/login" className="text-primary text-sm font-semibold">
              Sign in
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

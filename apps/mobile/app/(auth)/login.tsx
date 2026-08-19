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
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loginSchema } from '@open-innings/shared';
import { useSession } from '../../lib/session';
import { ApiError, NetworkError } from '../../lib/api';
import { API_BASE } from '../../lib/config';
import { Button, ErrorBanner, Field } from '../../components/ui';

/** The host for the reset form. Derived from API_BASE to handle preview builds. */
const WEB_BASE = (API_BASE ?? 'https://openinnings.com').replace(/\/$/, '');

export default function Login() {
  const { signIn } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        <ScrollView contentContainerClassName="flex-grow justify-center p-6 gap-6">
          <View className="gap-1">
            <Text className="text-primary text-xs font-bold uppercase tracking-widest">
              Open Innings
            </Text>
            <Text className="text-foreground text-3xl font-bold">Sign in</Text>
            <Text className="text-muted-foreground text-sm">Free cricket scoring. Forever.</Text>
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
              secureTextEntry
              autoComplete="current-password"
              placeholder="••••••••"
              editable={!busy}
              onSubmitEditing={submit}
              returnKeyType="go"
            />
          </View>

          <Button label="Sign in" onPress={submit} loading={busy} />

          {/* Opens web reset flow rather than duplicating security forms natively. */}
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(`${WEB_BASE}/reset`)}
            className="items-center py-1 active:opacity-60"
          >
            <Text className="text-muted-foreground text-sm underline">Forgot your password?</Text>
          </Pressable>

          <View className="flex-row justify-center gap-1">
            <Text className="text-muted-foreground text-sm">No account yet?</Text>
            <Link href="/signup" className="text-primary text-sm font-semibold">
              Create one
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

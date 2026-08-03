/**
 * The Pavilion kit, mobile edition.
 *
 * Deliberately small — only what the auth and match screens need. The web's
 * components/ui.tsx is the reference for naming and visual weight, but the
 * implementations can't be shared: these render RN primitives, not DOM.
 *
 * Touch targets are 48pt minimum. This app is used one-handed, outdoors, in
 * sunlight, often by someone also watching the cricket.
 */
import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

// ─── Button ──────────────────────────────────────────────────────────────────

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
}: ButtonProps) {
  const isInert = disabled || loading;

  const surface = {
    primary: 'bg-primary',
    secondary: 'bg-secondary',
    ghost: 'bg-transparent',
  }[variant];

  const text = {
    primary: 'text-primary-foreground',
    secondary: 'text-secondary-foreground',
    ghost: 'text-primary',
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isInert, busy: loading }}
      onPress={onPress}
      disabled={isInert}
      className={`${surface} h-12 flex-row items-center justify-center rounded-xl px-5 ${
        isInert ? 'opacity-50' : 'active:opacity-80'
      }`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? 'white' : undefined} />
      ) : (
        <Text className={`${text} text-base font-semibold`}>{label}</Text>
      )}
    </Pressable>
  );
}

// ─── Field ───────────────────────────────────────────────────────────────────

type FieldProps = TextInputProps & {
  label: string;
  error?: string;
};

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, error, ...props },
  ref,
) {
  return (
    <View className="gap-1.5">
      <Text className="text-foreground text-sm font-medium">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor="hsl(160 8% 40%)"
        className={`text-foreground h-12 rounded-xl border bg-white px-4 text-base ${
          error ? 'border-destructive' : 'border-input'
        }`}
        {...props}
      />
      {error ? <Text className="text-destructive text-xs">{error}</Text> : null}
    </View>
  );
});

// ─── Feedback ────────────────────────────────────────────────────────────────

/** A failure the user can act on. Never render a raw exception here. */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <View
      accessibilityRole="alert"
      className="border-destructive/30 bg-destructive/10 rounded-xl border px-4 py-3"
    >
      <Text className="text-destructive text-sm">{message}</Text>
    </View>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <View className="border-border bg-card rounded-2xl border p-5">{children}</View>;
}

export function Screen({ children }: { children: React.ReactNode }) {
  return <View className="bg-background flex-1">{children}</View>;
}

/** Full-screen spinner, for the launch check before we know who's signed in. */
export function LoadingScreen() {
  return (
    <View className="bg-background flex-1 items-center justify-center">
      <ActivityIndicator size="large" />
    </View>
  );
}

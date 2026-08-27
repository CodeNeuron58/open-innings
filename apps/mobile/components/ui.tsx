/**
 * The Industry UI kit, mobile edition.
 * Features square-cornered hairline borders, Barlow Condensed for labels, and 48pt minimum touch targets.
 */
import { forwardRef } from 'react';
import { useTheme } from '../lib/use-theme';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

// ─── Blueprint frame ─────────────────────────────────────────────────────────

/**
 * The registration marks that sit at the corners of every framed object.
 *
 * The web draws these with `.corner` pseudo-elements; RN has none, so they are
 * four absolutely-positioned hairline crosses. The design system's readme says
 * twice not to drop them, so `Card` and the primary `Button` render them
 * automatically rather than leaving it to the caller.
 *
 * Exported for the framed objects that cannot be a `Card` because they are
 * pressable — the live match row is a `Pressable` with a border, and drawing
 * its own marks is the only way it gets them. The parent must be `relative`.
 */
export function Corners({ tone = 'border' }: { tone?: 'border' | 'inverse' }) {
  const color = tone === 'inverse' ? 'bg-background' : 'bg-neutral-400';
  const arm = `absolute ${color}`;
  return (
    <>
      {/* Each corner is a horizontal and a vertical arm crossing at the edge. */}
      <View pointerEvents="none" className={`${arm} -left-[3px] -top-px h-px w-[7px]`} />
      <View pointerEvents="none" className={`${arm} -left-px -top-[3px] h-[7px] w-px`} />
      <View pointerEvents="none" className={`${arm} -right-[3px] -top-px h-px w-[7px]`} />
      <View pointerEvents="none" className={`${arm} -right-px -top-[3px] h-[7px] w-px`} />
      <View pointerEvents="none" className={`${arm} -bottom-px -left-[3px] h-px w-[7px]`} />
      <View pointerEvents="none" className={`${arm} -bottom-[3px] -left-px h-[7px] w-px`} />
      <View pointerEvents="none" className={`${arm} -bottom-px -right-[3px] h-px w-[7px]`} />
      <View pointerEvents="none" className={`${arm} -bottom-[3px] -right-px h-[7px] w-px`} />
    </>
  );
}

// ─── Button ──────────────────────────────────────────────────────────────────

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
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
  const theme = useTheme();

  /*
   * Primary is the one filled object; secondary is outlined; ghost is bare.
   *
   * Destructive is filled too, in the wicket colour — the same one a fallen
   * wicket already uses across this app, so it reads as "this ends something"
   * to somebody who has been scoring for an hour. It exists for exactly one
   * button, account deletion, and a shared style is what stops the next
   * destructive action being drawn to look like an ordinary one.
   */
  const surface = {
    primary: 'bg-primary border-primary',
    secondary: 'bg-transparent border-border',
    ghost: 'bg-transparent border-transparent',
    destructive: 'bg-wicket border-wicket',
  }[variant];

  const text = {
    primary: 'text-primary-foreground',
    secondary: 'text-foreground',
    ghost: 'text-steel-700',
    destructive: 'text-wicket-foreground',
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isInert, busy: loading }}
      onPress={onPress}
      disabled={isInert}
      className={`${surface} h-12 flex-row items-center justify-center border px-5 ${
        isInert ? 'opacity-50' : 'active:opacity-80'
      }`}
    >
      {/*
        The same grey marks the `Card` draws, not white ones.

        These were `tone="inverse"`, which paints them in the page background —
        so on a filled button they showed as four white nicks, and the half of
        each cross that falls outside the button vanished into the page. The
        design draws one registration mark, in one colour, straddling the edge
        of whatever object it frames.
      */}
      {(variant === 'primary' || variant === 'destructive') && !isInert ? <Corners /> : null}
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'primary' || variant === 'destructive'
              ? theme.primaryForeground
              : theme.primary
          }
        />
      ) : (
        <Text className={`${text} font-heading shrink-0 text-[15px] uppercase tracking-[1.2px]`}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// ─── Field ───────────────────────────────────────────────────────────────────

type FieldProps = TextInputProps & {
  label: string;
  error?: string;
  rightAccessory?: React.ReactNode;
};

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, error, rightAccessory, ...props },
  ref,
) {
  const theme = useTheme();
  return (
    <View className="gap-1.5">
      <Text className="font-heading text-[11px] uppercase tracking-[1.6px] text-neutral-700">
        {label}
      </Text>
      <View className="relative justify-center">
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={theme.placeholder}
          className={`text-foreground h-12 border bg-neutral-100 px-4 ${
            rightAccessory ? 'pr-14' : ''
          } font-sans text-base ${error ? 'border-destructive' : 'border-input'}`}
          {...props}
        />
        {rightAccessory ? (
          <View className="absolute bottom-0 right-0 top-0 justify-center px-3">
            {rightAccessory}
          </View>
        ) : null}
      </View>
      {error ? <Text className="text-destructive font-sans text-xs">{error}</Text> : null}
    </View>
  );
});

// ─── Feedback ────────────────────────────────────────────────────────────────

/** A failure the user can act on. Never render a raw exception here. */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <View
      accessibilityRole="alert"
      className="border-destructive bg-destructive/10 border px-4 py-3"
    >
      <Text className="text-destructive font-sans text-sm">{message}</Text>
    </View>
  );
}

/**
 * A framed object. Transparent by design — in this system a card is a line
 * drawing, not a surface, so it takes the page ground and lets the hairline
 * border and the corner marks define it.
 */
export function Card({ children }: { children: React.ReactNode }) {
  return (
    <View className="border-border relative border p-5">
      <Corners />
      {children}
    </View>
  );
}

/** Section label — the kicker. Uppercase, tracked out, accent-coloured. */
export function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-steel-700 font-heading text-[11px] uppercase tracking-[1.8px]">
      {children}
    </Text>
  );
}

export function Screen({ children }: { children: React.ReactNode }) {
  return <View className="bg-background flex-1">{children}</View>;
}

/** Full-screen spinner, for the launch check before we know who's signed in. */
export function LoadingScreen() {
  const theme = useTheme();
  return (
    <View className="bg-background flex-1 items-center justify-center">
      <ActivityIndicator size="large" color={theme.primary} />
    </View>
  );
}

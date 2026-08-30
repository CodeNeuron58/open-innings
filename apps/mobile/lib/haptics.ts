/**
 * What the phone does when you tap something.
 *
 * There were four copies of this — `score.tsx`, `Sheets.tsx`, `EndOfOver.tsx`
 * and `CorrectBall.tsx` each held an identical `hapticFeedback()` over
 * `Vibration.vibrate` — and every one of them buzzed the same way for a dot
 * ball, a six and a wicket.
 *
 * That sameness is the thing worth fixing, not the duplication. A scorer
 * watching the cricket rather than the screen has exactly one channel telling
 * them the tap landed, and a uniform buzz says "something happened" when it
 * could say *what*. Getting a different answer for a wicket than for a single
 * is how a mis-tap gets noticed on the next ball instead of at the end of the
 * over.
 *
 * `expo-haptics` rather than `Vibration`, because the platforms disagree about
 * what a raw duration means — 12ms is a distinct tick on one Android and
 * nothing at all on another, and iOS ignores the pattern shape entirely. The
 * impact styles are the OS's own vocabulary for this and are consistent
 * across devices.
 */
import * as Haptics from 'expo-haptics';

/**
 * How much the phone should say.
 *
 * Named for what happened rather than for how strong it is, so a call site
 * says `tap('wicket')` and the weighting stays a decision made here.
 */
export type Feel =
  /** An ordinary control: a chip, a sheet opening, a cancel. */
  | 'light'
  /** A delivery recorded. The common case, and the one felt most often. */
  | 'ball'
  /** A boundary — worth being distinguishable from a single without looking. */
  | 'boundary'
  /** A wicket, or anything else that changes the shape of the innings. */
  | 'wicket'
  /** Something was refused, or taken back. */
  | 'undo'
  /** A fifty, a century, a hat-trick — the moments the ground notices. */
  | 'milestone';

const STYLE: Record<Feel, () => Promise<void>> = {
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  ball: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  boundary: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  wicket: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  undo: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  milestone: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
};

/**
 * Buzz, and never let it matter if it cannot.
 *
 * Haptics are unavailable on an emulator, on a device with the motor disabled,
 * and on web. None of that is worth an unhandled rejection in the middle of an
 * over, so every failure is swallowed — this is feedback, not a feature.
 */
export function tap(feel: Feel = 'light'): void {
  void STYLE[feel]().catch(() => {
    /* no motor, or the user turned it off */
  });
}

/**
 * The right feel for a delivery, from what the delivery was.
 *
 * Kept beside the vocabulary rather than at the call site so the console does
 * not grow its own opinion about which balls are worth a stronger buzz.
 */
export function feelForBall(runsOffBat: number, isWicket: boolean): Feel {
  if (isWicket) return 'wicket';
  return runsOffBat >= 4 ? 'boundary' : 'ball';
}

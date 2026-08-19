/**
 * Client-side gatekeeping for guest users.
 * Catches mutating actions before they become 401s and explains why sign-in is required.
 */
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from './session';

/**
 * Wraps an action that writes something.
 * Runs for signed-in users, prompts guests to sign in or create an account.
 */
export function useRequireAccount(): (what: string, action: () => void) => void {
  const { isGuest } = useSession();
  const router = useRouter();

  return useCallback(
    (what: string, action: () => void) => {
      if (!isGuest) {
        action();
        return;
      }

      Alert.alert(
        `Sign in to ${what}`,
        'Looking around needs no account. Keeping a record does — a match has to belong to someone, or nobody can correct it later.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Create an account', onPress: () => router.push('/signup') },
          { text: 'Sign in', onPress: () => router.push('/login') },
        ],
      );
    },
    [isGuest, router],
  );
}

/**
 * A shared Open Innings link, resolved to a match, player, or club.
 * Also accepts bare UUIDs as a fallback.
 */
export type ResolvedLink =
  { kind: 'match'; id: string } | { kind: 'player'; id: string } | { kind: 'club'; id: string };

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const PATTERNS: { kind: ResolvedLink['kind']; re: RegExp }[] = [
  // Longest paths first: /m/<id>/p/<id> is a player *within* a match and must
  // not be read as a match link with something trailing.
  { kind: 'player', re: new RegExp(`/m/${UUID}/p/(${UUID})`, 'i') },
  { kind: 'match', re: new RegExp(`/m/(${UUID})`, 'i') },
  { kind: 'player', re: new RegExp(`/p/(${UUID})`, 'i') },
  { kind: 'club', re: new RegExp(`/c/(${UUID})`, 'i') },
];

export function resolveLink(input: string): ResolvedLink | null {
  const text = input.trim();
  if (text.length === 0) return null;

  for (const { kind, re } of PATTERNS) {
    const id = re.exec(text)?.[1];
    if (id) return { kind, id };
  }

  // A bare id, pasted without the surrounding URL. It cannot say which kind
  // of thing it is, so it is treated as a match — the overwhelmingly common
  // case, and the screen says so rather than guessing silently.
  if (new RegExp(`^${UUID}$`, 'i').test(text)) return { kind: 'match', id: text };

  return null;
}

/**
 * The line between reading and writing.
 *
 * A guest can open any scorecard, career or club, because those are public to
 * anyone with the link whether or not they have the app. What a guest cannot
 * do is create: no match, no player, no team, no ball.
 *
 * **This is not the enforcement.** Every mutating endpoint requires a bearer
 * token and rejects a request without one, which is what actually stops a
 * guest writing. What lives here is the *manners*: catching the tap before it
 * becomes a 401, and explaining why, rather than letting someone fill in a
 * form and be told no at the end of it.
 */
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from './session';

/**
 * Wraps an action that writes something.
 *
 * For a signed-in user it runs. For a guest it explains and offers the way
 * out, naming the thing they were trying to do — "Sign in to score a match"
 * is an answer; "Sign in to continue" is a wall.
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
 * A shared Open Innings link, resolved to somewhere in the app.
 *
 * The only way a guest reaches anything: there is no public browse feed, and
 * building one would put every user's matches in front of strangers by
 * default. People arrive here because somebody sent them a scorecard, so
 * pasting that link is the door.
 *
 * Accepts the bare id too — someone copying from a message often catches only
 * part of the URL, and refusing that would be pedantry.
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

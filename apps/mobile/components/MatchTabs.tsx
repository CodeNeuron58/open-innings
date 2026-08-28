/**
 * Custom bottom tab bar for match navigation.
 * Renders the design and handles routing directly.
 */
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../lib/session';

export type MatchTab = 'matches' | 'score' | 'card' | 'more';

export function MatchTabs({
  matchId,
  active,
}: {
  /**
   * The match Score and Card point at.
   *
   * Null on the global list, which is about no match in particular. Those two
   * tabs then render without a handler, which this bar already draws as
   * dimmed and unpressable — the same treatment a guest's Score tab gets.
   * Passing the live match's id where there is one makes them work.
   */
  matchId: string | null;
  active: MatchTab;
}) {
  const router = useRouter();
  const { isGuest } = useSession();

  /*
   * A guest gets a different first tab and no Score.
   *
   * "Matches" is the list of matches *you created*, which for a guest is
   * empty — landing them there looks like the app lost their data. And Score
   * opens a console for a match they do not own, which the server would
   * refuse. Neither is a wall worth walking into to discover.
   */
  const items: { key: MatchTab; label: string; go?: () => void }[] = [
    isGuest
      ? { key: 'matches', label: 'Open', go: () => router.replace('/browse') }
      : { key: 'matches', label: 'Matches', go: () => router.replace('/matches') },
    isGuest || matchId === null
      ? { key: 'score', label: 'Score' }
      : {
          key: 'score',
          label: 'Score',
          go: () => router.replace({ pathname: '/matches/[id]/score', params: { id: matchId } }),
        },
    matchId === null
      ? { key: 'card', label: 'Card' }
      : {
          key: 'card',
          label: 'Card',
          go: () => router.replace({ pathname: '/matches/[id]/card', params: { id: matchId } }),
        },
    { key: 'more', label: 'More', go: () => router.replace('/more') },
  ];

  return (
    <View className="border-border flex-row border-t h-[52px]">
      {items.map((item) => {
        const isActive = item.key === active;
        const isDead = !item.go;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive, disabled: isDead }}
            onPress={item.go}
            disabled={isDead || isActive}
            className={`flex-1 items-center justify-center relative ${
              isDead ? 'opacity-35' : 'active:opacity-60'
            }`}
          >
            {isActive && (
              <View className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />
            )}
            <Text
              className={`font-heading text-[12px] uppercase tracking-[1px] ${
                isActive ? 'text-foreground' : 'text-neutral-600'
              }`}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

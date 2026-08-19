/**
 * Custom bottom tab bar for match navigation.
 * Renders the design and handles routing directly.
 */
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../lib/session';

export type MatchTab = 'matches' | 'score' | 'card' | 'more';

export function MatchTabs({ matchId, active }: { matchId: string; active: MatchTab }) {
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
    isGuest
      ? { key: 'score', label: 'Score' }
      : {
          key: 'score',
          label: 'Score',
          go: () => router.replace({ pathname: '/matches/[id]/score', params: { id: matchId } }),
        },
    {
      key: 'card',
      label: 'Card',
      go: () => router.replace({ pathname: '/matches/[id]/card', params: { id: matchId } }),
    },
    { key: 'more', label: 'More', go: () => router.replace('/more') },
  ];

  return (
    <View className="border-border flex-row border-t">
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
            className={`flex-1 items-center py-2.5 ${isDead ? 'opacity-35' : 'active:opacity-60'}`}
          >
            {/* The active mark is a rule above the label, not a filled pill —
                this system draws, it does not fill. */}
            <View className={`mb-1.5 h-0.5 w-8 ${isActive ? 'bg-primary' : 'bg-transparent'}`} />
            <Text
              className={`font-heading text-[10px] uppercase tracking-[1.3px] ${
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

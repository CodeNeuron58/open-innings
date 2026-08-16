/**
 * The bottom bar: Matches · Score · Card · More.
 *
 * A presentational strip that navigates, not an Expo Router `<Tabs>` layout.
 * Two of the four destinations are *match-scoped* — Score and Card only mean
 * anything with a match id — while Matches is global. A real tab navigator
 * would have to hold a match id in layout state and decide what its tabs point
 * at when there is no match, which is a routing problem invented to satisfy a
 * visual one.
 *
 * So: this renders the design, each item pushes, and the active tab is passed
 * in by the screen that knows which one it is.
 *
 * **More** is drawn and disabled — there is no settings screen yet. It is on
 * the design, so leaving it out would be as misleading as making it dead.
 */
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

export type MatchTab = 'matches' | 'score' | 'card' | 'more';

export function MatchTabs({ matchId, active }: { matchId: string; active: MatchTab }) {
  const router = useRouter();

  const items: { key: MatchTab; label: string; go?: () => void }[] = [
    { key: 'matches', label: 'Matches', go: () => router.replace('/matches') },
    {
      key: 'score',
      label: 'Score',
      go: () => router.replace({ pathname: '/matches/[id]/score', params: { id: matchId } }),
    },
    {
      key: 'card',
      label: 'Card',
      go: () => router.replace({ pathname: '/matches/[id]/card', params: { id: matchId } }),
    },
    // No destination — see the note above.
    { key: 'more', label: 'More' },
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

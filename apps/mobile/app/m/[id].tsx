/**
 * `openinnings.com/m/<id>` — a shared match link, opened in the app.
 *
 * Forwards to the card rather than the scorer: whoever followed this link is
 * almost never the person scoring, and the card is the public artifact the
 * link promised.
 */
import { useLocalSearchParams } from 'expo-router';
import { DeepLink } from '../../components/DeepLink';

export default function MatchLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DeepLink to={{ pathname: '/matches/[id]/card', params: { id } }} />;
}

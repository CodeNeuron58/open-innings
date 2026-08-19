/**
 * `openinnings.com/m/<id>` — a shared match link, opened in the app.
 * Forwards to the public match card.
 */
import { useLocalSearchParams } from 'expo-router';
import { DeepLink } from '../../components/DeepLink';

export default function MatchLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DeepLink to={{ pathname: '/matches/[id]/card', params: { id } }} />;
}

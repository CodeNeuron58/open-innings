/** `openinnings.com/p/<id>` — a shared career page, opened in the app. */
import { useLocalSearchParams } from 'expo-router';
import { DeepLink } from '../../components/DeepLink';

export default function PlayerLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DeepLink to={{ pathname: '/players/[id]', params: { id } }} />;
}

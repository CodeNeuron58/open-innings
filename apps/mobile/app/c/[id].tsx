/** `openinnings.com/c/<id>` — a shared club page, opened in the app. */
import { useLocalSearchParams } from 'expo-router';
import { DeepLink } from '../../components/DeepLink';

export default function ClubLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DeepLink to={{ pathname: '/teams/[id]', params: { id } }} />;
}

import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useCities } from '../hooks/useCities';
import { ComingSoon } from '../components/ComingSoon';

export function FeedPage() {
  const { session } = useAuth();
  const { data: profile } = useProfile(session?.user.id);
  const { data: cities } = useCities();

  const cityName = cities?.find((city) => city.id === profile?.city_id)?.name;

  return <ComingSoon title={cityName ? `${cityName} Feed` : 'Feed'} />;
}

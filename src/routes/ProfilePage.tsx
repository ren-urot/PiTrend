import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useCities } from '../hooks/useCities';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function ProfilePage() {
  const { session, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile(session?.user.id);
  const { data: cities } = useCities();
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const [updatingCity, setUpdatingCity] = useState(false);
  const [cityError, setCityError] = useState('');

  if (authLoading || profileLoading) {
    return <div className="p-6">Loading profile…</div>;
  }

  if (!profile) {
    if (!isOnline) {
      return (
        <div className="p-6 text-muted-foreground">
          You're offline and this profile hasn't been cached yet.
        </div>
      );
    }
    return <div className="p-6 text-destructive">Couldn't load your profile.</div>;
  }

  const profileUrl = `${window.location.origin}/u/${profile.username}`;

  async function handleCityChange(newCityId: string) {
    if (!session) return;
    setUpdatingCity(true);
    setCityError('');

    const { error } = await supabase
      .from('profiles')
      .update({ city_id: newCityId })
      .eq('id', session.user.id);

    if (error) {
      setCityError("Couldn't update your city. Please try again.");
      setUpdatingCity(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ['profile', session.user.id] });
    setUpdatingCity(false);
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      {profile.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt={profile.display_name}
          className="h-24 w-24 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted text-2xl">
          {profile.display_name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="text-center">
        <p className="text-lg font-semibold">{profile.display_name}</p>
        <p className="text-muted-foreground">@{profile.username}</p>
      </div>
      <div className="flex w-full max-w-sm flex-col items-center gap-2">
        <Select value={profile.city_id} onValueChange={handleCityChange} disabled={updatingCity}>
          <SelectTrigger>
            <SelectValue placeholder="Change city" />
          </SelectTrigger>
          <SelectContent>
            {cities?.map((city) => (
              <SelectItem key={city.id} value={city.id}>
                {city.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {cityError && <p className="text-sm text-destructive">{cityError}</p>}
      </div>
      <QRCodeSVG value={profileUrl} size={160} />
    </div>
  );
}

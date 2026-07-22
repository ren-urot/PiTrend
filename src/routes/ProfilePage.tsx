import { useRef, useState, type ChangeEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useCities } from '../hooks/useCities';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useUpdateAvatar } from '../hooks/useUpdateAvatar';
import { useConnections } from '../hooks/useConnections';
import { NodeAvatar } from '../components/NodeAvatar';
import { ConnectionsDialog } from '../components/connections/ConnectionsDialog';
import { groupCitiesByIslandGroup, ISLAND_GROUP_LABELS } from '../lib/cityDisplay';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function ProfilePage() {
  const { session, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile(session?.user.id);
  const { data: cities } = useCities();
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const updateAvatar = useUpdateAvatar();
  const { data: connections } = useConnections(session?.user.id);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [updatingCity, setUpdatingCity] = useState(false);
  const [cityError, setCityError] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [networkOpen, setNetworkOpen] = useState(false);

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

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !session) return;

    setAvatarError('');
    try {
      await updateAvatar.mutateAsync({ userId: session.user.id, file });
    } catch {
      setAvatarError("Couldn't update your photo. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <div className="relative">
        <NodeAvatar name={profile.display_name} avatarUrl={profile.avatar_url} size={96} />
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          aria-label="Change profile photo"
          className="hidden"
          onChange={handleAvatarChange}
        />
        <button
          type="button"
          aria-label="Edit profile photo"
          disabled={updateAvatar.isPending}
          className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground disabled:opacity-50"
          onClick={() => avatarInputRef.current?.click()}
        >
          <Camera size={16} />
        </button>
      </div>
      {avatarError && <p className="text-sm text-destructive">{avatarError}</p>}
      <div className="text-center">
        <p className="text-lg font-semibold">{profile.display_name}</p>
        <p className="text-muted-foreground">@{profile.username}</p>
      </div>
      <button
        type="button"
        onClick={() => setNetworkOpen(true)}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        <span className="font-semibold text-foreground">{connections?.length ?? 0}</span> Connections
      </button>
      <ConnectionsDialog userId={session?.user.id} open={networkOpen} onOpenChange={setNetworkOpen} />
      <div className="flex w-full max-w-sm flex-col items-center gap-2">
        <Select value={profile.city_id} onValueChange={handleCityChange} disabled={updatingCity}>
          <SelectTrigger>
            <SelectValue placeholder="Change city" />
          </SelectTrigger>
          <SelectContent>
            {groupCitiesByIslandGroup(cities ?? []).map(({ group, cities: groupCities }) => (
              <SelectGroup key={group}>
                <SelectLabel>{ISLAND_GROUP_LABELS[group]}</SelectLabel>
                {groupCities.map((city) => (
                  <SelectItem key={city.id} value={city.id}>
                    {city.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        {cityError && <p className="text-sm text-destructive">{cityError}</p>}
      </div>
      <QRCodeSVG value={profileUrl} size={160} />
    </div>
  );
}

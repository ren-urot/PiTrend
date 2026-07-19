import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function ProfilePage() {
  const { session, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile(session?.user.id);
  const isOnline = useOnlineStatus();

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
      <QRCodeSVG value={profileUrl} size={160} />
    </div>
  );
}

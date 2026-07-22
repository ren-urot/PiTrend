import { Navigate, Outlet } from 'react-router-dom';
import { useIsRestoring } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';

export function ProtectedLayout() {
  const { session, loading: authLoading } = useAuth();
  // While the persisted query cache is still restoring from IndexedDB,
  // useProfile reports isLoading:false with data:undefined (fetching is
  // paused during restore, so isPending && isFetching is false) — without
  // this guard that reads as "no profile yet", bouncing every protected
  // route through /username-setup and back to /feed on every hard reload.
  const isRestoring = useIsRestoring();
  const { data: profile, isLoading: profileLoading } = useProfile(session?.user.id);

  if (authLoading || isRestoring) {
    return <div className="flex h-screen items-center justify-center">Loading…</div>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (profileLoading) {
    return <div className="flex h-screen items-center justify-center">Loading…</div>;
  }
  if (!profile) {
    return <Navigate to="/username-setup" replace />;
  }

  return <Outlet />;
}

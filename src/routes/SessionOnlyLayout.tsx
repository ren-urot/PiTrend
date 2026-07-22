import { Navigate, Outlet } from 'react-router-dom';
import { useIsRestoring } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';

export function SessionOnlyLayout() {
  const { session, loading: authLoading } = useAuth();
  // See ProtectedLayout for why this guard is needed: without it, a
  // still-restoring profile query reads as "no profile", which is the
  // correct state for /username-setup — the bug this guards against is
  // the opposite direction (a profile that DOES exist not being visible
  // yet), but gating on the same signal keeps both layouts consistent.
  const isRestoring = useIsRestoring();
  const { data: profile, isLoading: profileLoading } = useProfile(session?.user.id);

  if (authLoading || isRestoring) {
    return <div className="flex h-screen items-center justify-center">Loading…</div>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (!profileLoading && profile) {
    return <Navigate to="/feed" replace />;
  }

  return <Outlet />;
}

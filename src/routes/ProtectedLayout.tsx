import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';

export function ProtectedLayout() {
  const { session, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile(session?.user.id);

  if (authLoading) {
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

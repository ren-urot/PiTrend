import { NavLink, Outlet } from 'react-router-dom';
import { Newspaper, MessageCircle, Store, Rss, User, Hash, Search } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useProfile } from '../../hooks/useProfile';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { useUnreadCount } from '../../hooks/useUnreadCount';
import { NodeAvatar } from '../NodeAvatar';
import piTrendLogo from '../../assets/pi-trend-logo.svg';

const tabs = [
  { to: '/feed', label: 'Feed', icon: Rss },
  { to: '/channels', label: 'Channels', icon: Hash },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/marketplace', label: 'Marketplace', icon: Store },
  { to: '/news', label: 'News', icon: Newspaper },
  { to: '/profile', label: 'Profile', icon: User },
];

function NavItems({ orientation, unreadCount }: { orientation: 'horizontal' | 'vertical'; unreadCount: number }) {
  return (
    <nav
      className={
        orientation === 'horizontal'
          ? 'flex justify-around border-t bg-background'
          : 'flex flex-col gap-1 p-4'
      }
    >
      {tabs.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              isActive ? 'font-medium text-primary' : 'text-muted-foreground'
            } ${orientation === 'horizontal' ? 'flex-col text-xs' : ''}`
          }
        >
          <span className="relative">
            <Icon size={20} />
            {to === '/messages' && unreadCount > 0 && (
              <span className="absolute -right-2 -top-1 rounded-full bg-destructive px-1 text-[10px] leading-tight text-destructive-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </span>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  useOfflineSync();
  const { session } = useAuth();
  const { data: profile } = useProfile(session?.user.id);
  const { data: unreadCount } = useUnreadCount(session?.user.id);

  return (
    <div className="flex h-screen flex-col md:flex-row">
      <aside className="hidden border-r md:block md:w-56">
        <div className="flex items-center justify-between p-4">
          <img src={piTrendLogo} alt="Pi Trend" className="h-16 w-auto" />
          <NavLink to="/search" aria-label="Search" className="text-muted-foreground">
            <Search size={22} />
          </NavLink>
        </div>
        <NavItems orientation="vertical" unreadCount={unreadCount ?? 0} />
      </aside>
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
        <NavLink to="/profile" aria-label="Profile">
          <NodeAvatar name={profile?.display_name ?? '?'} avatarUrl={profile?.avatar_url} size={32} />
        </NavLink>
        <img src={piTrendLogo} alt="Pi Trend" className="absolute left-1/2 h-12 w-auto -translate-x-1/2" />
        <NavLink to="/search" aria-label="Search" className="text-muted-foreground">
          <Search size={22} />
        </NavLink>
      </header>
      <main className="flex-1 overflow-y-auto pb-16 pt-14 md:pb-0 md:pt-0">
        <Outlet />
      </main>
      <div className="fixed bottom-0 left-0 right-0 md:hidden">
        <NavItems orientation="horizontal" unreadCount={unreadCount ?? 0} />
      </div>
    </div>
  );
}

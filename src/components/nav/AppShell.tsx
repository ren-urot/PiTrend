import { NavLink, Outlet } from 'react-router-dom';
import { Newspaper, MessageCircle, Store, Rss, User } from 'lucide-react';

const tabs = [
  { to: '/feed', label: 'Feed', icon: Rss },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/marketplace', label: 'Marketplace', icon: Store },
  { to: '/news', label: 'News', icon: Newspaper },
  { to: '/profile', label: 'Profile', icon: User },
];

function NavItems({ orientation }: { orientation: 'horizontal' | 'vertical' }) {
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
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  return (
    <div className="flex h-screen flex-col md:flex-row">
      <aside className="hidden border-r md:block md:w-56">
        <div className="p-4 text-xl font-bold">PiMesh</div>
        <NavItems orientation="vertical" />
      </aside>
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <Outlet />
      </main>
      <div className="fixed bottom-0 left-0 right-0 md:hidden">
        <NavItems orientation="horizontal" />
      </div>
    </div>
  );
}

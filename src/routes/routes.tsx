import { Navigate, type RouteObject } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { UsernameSetupPage } from './UsernameSetupPage';
import { ProtectedLayout } from './ProtectedLayout';
import { SessionOnlyLayout } from './SessionOnlyLayout';
import { AppShell } from '../components/nav/AppShell';
import { FeedPage } from './FeedPage';
import { ChannelsPage } from './ChannelsPage';
import { ChannelPage } from './ChannelPage';
import { MessagesPage } from './MessagesPage';
import { ConversationPage } from './ConversationPage';
import { MarketplacePage } from './MarketplacePage';
import { NewsPage } from './NewsPage';
import { ProfilePage } from './ProfilePage';
import { PublicProfilePage } from './PublicProfilePage';

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/u/:username', element: <PublicProfilePage /> },
  {
    element: <SessionOnlyLayout />,
    children: [{ path: '/username-setup', element: <UsernameSetupPage /> }],
  },
  {
    element: <ProtectedLayout />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/feed" replace /> },
          { path: '/feed', element: <FeedPage /> },
          { path: '/channels', element: <ChannelsPage /> },
          { path: '/channels/:slug', element: <ChannelPage /> },
          { path: '/messages', element: <MessagesPage /> },
          { path: '/messages/:conversationId', element: <ConversationPage /> },
          { path: '/marketplace', element: <MarketplacePage /> },
          { path: '/news', element: <NewsPage /> },
          { path: '/profile', element: <ProfilePage /> },
        ],
      },
    ],
  },
];

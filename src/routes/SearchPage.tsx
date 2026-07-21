import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search as SearchIcon } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useSearchProfiles } from '../hooks/useSearchProfiles';
import { NodeAvatar } from '../components/NodeAvatar';
import { Input } from '@/components/ui/input';

export function SearchPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const { data: results, isLoading } = useSearchProfiles(query, session?.user.id ?? '');

  const hasQuery = query.trim().length > 0;

  return (
    <div className="mx-auto max-w-xl p-4">
      <div className="mb-4 flex items-center gap-3">
        <button type="button" aria-label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft size={22} />
        </button>
        <h1 className="font-display text-base font-semibold md:text-xl">Search</h1>
      </div>

      <div className="relative mb-4">
        <SearchIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="rounded-full bg-muted pl-9"
          autoFocus
        />
      </div>

      {hasQuery && isLoading && <p className="text-muted-foreground">Searching…</p>}
      {hasQuery && !isLoading && results?.length === 0 && (
        <p className="text-muted-foreground">No users found.</p>
      )}

      <div className="flex flex-col">
        {hasQuery &&
          results?.map((profile) => (
            <Link key={profile.id} to={`/u/${profile.username}`} className="flex items-center gap-3 py-3">
              <NodeAvatar name={profile.display_name} avatarUrl={profile.avatar_url} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{profile.username}</p>
                <p className="truncate text-sm text-muted-foreground">{profile.display_name}</p>
              </div>
            </Link>
          ))}
      </div>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useCities } from '../hooks/useCities';
import { groupCitiesByIslandGroup, ISLAND_GROUP_LABELS } from '../lib/cityDisplay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function UsernameSetupPage() {
  const { session } = useAuth();
  const { data: cities } = useCities();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [cityId, setCityId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session || !cityId) return;
    setSubmitting(true);
    setError('');

    const { error: insertError } = await supabase.from('profiles').insert({
      id: session.user.id,
      username,
      display_name: displayName || username,
      city_id: cityId,
    });

    setSubmitting(false);

    if (insertError) {
      setError(
        insertError.code === '23505' ? 'That username is already taken.' : insertError.message
      );
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ['profile', session.user.id] });
    navigate('/feed', { replace: true });
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Choose a username</h1>
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <Input
          placeholder="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.trim().toLowerCase())}
          pattern="[a-z0-9_]{3,20}"
          title="3-20 characters: lowercase letters, numbers, underscore"
          required
        />
        <Input
          placeholder="display name (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Select value={cityId} onValueChange={setCityId}>
          <SelectTrigger>
            <SelectValue placeholder="Select your city" />
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
        <Button type="submit" disabled={submitting || !cityId}>
          {submitting ? 'Saving…' : 'Continue'}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </div>
  );
}

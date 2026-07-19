# Identity & City Communities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add city communities to PiMesh — every user joins one Philippine city at onboarding, can change it later from their profile, and the Feed tab shows which city they're in (still a placeholder for real content).

**Architecture:** A new `cities` reference table (public read, seeded with the PRD's initial city list) and two new columns on the existing `profiles` table (`city_id`, `reputation_score`). A new `useCities()` TanStack Query hook feeds a shadcn `Select` component used in both the onboarding flow (`UsernameSetupPage`) and a new city switcher (`ProfilePage`). `FeedPage` resolves the current user's city name to replace its generic "Coming soon" placeholder with a city-scoped one.

**Tech Stack:** Same as the Foundation phase (Vite, React, TypeScript, Tailwind v3, shadcn/ui, React Router, @tanstack/react-query, @supabase/supabase-js, Vitest) — see `docs/superpowers/plans/2026-07-19-foundation.md`'s Tech Stack section for exact versions. This plan adds one new shadcn component (`select`); no other new dependencies.

## Global Constraints

- `city_id` on `profiles` is `not null` — every profile must have a city, enforced by requiring selection before the onboarding form can submit.
- The live Supabase project already has exactly 1 row in `profiles` (confirmed via the REST API before this plan was written) — the `profiles` migration in this plan MUST backfill that row before adding the `not null` constraint, not assume the table is empty.
- Cities are public reference data — RLS allows `anon` and `authenticated` SELECT, no restriction.
- Reputation score in this phase is a static `0`-default field only — no scoring logic, no task in this plan computes or updates it.
- Every task that adds runtime logic ships with a Vitest test; migration tasks verify via the Supabase dashboard + a REST API check (same pattern as the Foundation phase's `profiles` migration).
- Manual Supabase-dashboard steps (applying migrations) require the user's action — the implementer cannot apply SQL to the live project directly.

---

### Task 1: Cities table migration

**Files:**
- Create: `supabase/migrations/0003_create_cities.sql`

**Interfaces:**
- Produces: `public.cities` table (`id uuid PK`, `name text`, `slug text unique`, `country text`, `created_at timestamptz`), seeded with 10 rows, relied on by Tasks 3, 6, 7, 8.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0003_create_cities.sql`:

```sql
create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  country text not null default 'Philippines',
  created_at timestamptz not null default now()
);

alter table public.cities enable row level security;

create policy "Anyone can read cities"
  on public.cities for select
  to anon, authenticated
  using (true);

insert into public.cities (name, slug) values
  ('Cebu City', 'cebu-city'),
  ('Mandaue City', 'mandaue-city'),
  ('Lapu-Lapu City', 'lapu-lapu-city'),
  ('Talisay', 'talisay'),
  ('Manila', 'manila'),
  ('Davao', 'davao'),
  ('Iloilo', 'iloilo'),
  ('Bacolod', 'bacolod'),
  ('Baguio', 'baguio'),
  ('General Santos', 'general-santos');
```

- [ ] **Step 2: Apply it to the Supabase project (manual dashboard step)**

Open the Supabase dashboard for `https://puqakbajkmlwohuznxut.supabase.co` → SQL Editor → paste the contents of `supabase/migrations/0003_create_cities.sql` → Run.

- [ ] **Step 3: Verify the table and seed data**

In the same SQL Editor, run:

```sql
select count(*) from public.cities;
```

Expected: `10`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_create_cities.sql
git commit -m "feat: add cities table migration"
```

---

### Task 2: Add city_id and reputation_score to profiles

**Files:**
- Create: `supabase/migrations/0004_add_city_to_profiles.sql`

**Interfaces:**
- Produces: `profiles.city_id` (uuid, not null, FK → `cities.id`) and `profiles.reputation_score` (integer, not null, default 0), relied on by Tasks 5, 6, 7, 8.
- Consumes: `public.cities` from Task 1 (must be applied first — this migration's backfill step queries it).

- [ ] **Step 1: Write the migration**

The live `profiles` table already has 1 existing row (confirmed via a REST API check before this plan was written), so `city_id` cannot be added as `not null` directly — it needs a backfill first. Create `supabase/migrations/0004_add_city_to_profiles.sql`:

```sql
alter table public.profiles
  add column city_id uuid references public.cities(id),
  add column reputation_score integer not null default 0;

update public.profiles
  set city_id = (select id from public.cities where slug = 'cebu-city')
  where city_id is null;

alter table public.profiles
  alter column city_id set not null;
```

- [ ] **Step 2: Apply it to the Supabase project (manual dashboard step)**

Open the Supabase dashboard SQL Editor → paste the contents of `supabase/migrations/0004_add_city_to_profiles.sql` → Run. This must run AFTER Task 1's migration (it references `public.cities`).

- [ ] **Step 3: Verify the columns and backfill**

In the same SQL Editor, run:

```sql
select id, username, city_id, reputation_score from public.profiles;
```

Expected: the existing row has a non-null `city_id` (pointing at the Cebu City row) and `reputation_score` of `0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_add_city_to_profiles.sql
git commit -m "feat: add city_id and reputation_score to profiles"
```

---

### Task 3: City type + useCities hook

**Files:**
- Create: `src/types/city.ts`, `src/hooks/useCities.ts`
- Test: `src/hooks/useCities.test.tsx`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`; `public.cities` schema from Task 1.
- Produces: `City` type (`{ id: string; name: string; slug: string; country: string }`) and `useCities()` (a `useQuery` result keyed `['cities']`, returning `City[]`), consumed by Tasks 6, 7, 8.

- [ ] **Step 1: Define the `City` type**

Create `src/types/city.ts`:

```ts
export interface City {
  id: string;
  name: string;
  slug: string;
  country: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/hooks/useCities.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCities } from './useCities';

const mockOrder = vi.fn();
const mockSelect = vi.fn(() => ({ order: mockOrder }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: mockSelect }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCities', () => {
  it('returns cities ordered by name', async () => {
    mockOrder.mockResolvedValue({
      data: [
        { id: 'c1', name: 'Cebu City', slug: 'cebu-city', country: 'Philippines' },
        { id: 'c2', name: 'Manila', slug: 'manila', country: 'Philippines' },
      ],
      error: null,
    });

    const { result } = renderHook(() => useCities(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(mockSelect).toHaveBeenCalledWith('id, name, slug, country');
    expect(mockOrder).toHaveBeenCalledWith('name', { ascending: true });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- src/hooks/useCities.test.tsx`
Expected: FAIL — `src/hooks/useCities.ts` doesn't exist yet.

- [ ] **Step 4: Implement `useCities`**

Create `src/hooks/useCities.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { City } from '../types/city';

export function useCities() {
  return useQuery({
    queryKey: ['cities'],
    queryFn: async (): Promise<City[]> => {
      const { data, error } = await supabase
        .from('cities')
        .select('id, name, slug, country')
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 60 * 1000,
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/hooks/useCities.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/city.ts src/hooks/useCities.ts src/hooks/useCities.test.tsx
git commit -m "feat: add useCities query hook"
```

---

### Task 4: shadcn Select component

**Files:**
- Create: `src/components/ui/select.tsx` (generated by shadcn CLI)

**Interfaces:**
- Produces: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` importable from `@/components/ui/select`, used by Tasks 6 and 8.

- [ ] **Step 1: Add the component**

```bash
npx shadcn@latest add select -y
```

If prompted interactively despite `-y`, accept the default answer for each prompt. The project's shadcn theme tokens and Tailwind v3 setup already exist from the Foundation phase (Task 3 of that plan) — this should be a straightforward addition with no theme-token gap this time, but verify per Step 3 below regardless.

- [ ] **Step 2: Verify the build still succeeds**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Verify no Tailwind version or theme regression**

Run: `grep tailwindcss package.json`
Expected: still shows `^3.x` (the CLI should not have upgraded it — this exact regression happened during the Foundation phase's shadcn setup, so double-check it didn't recur).

- [ ] **Step 4: Verify the generated file exists**

Run: `ls src/components/ui/select.tsx`
Expected: file exists.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add shadcn Select component"
```

---

### Task 5: Extend Profile type and useProfile with city_id and reputation_score

**Files:**
- Modify: `src/types/profile.ts`, `src/hooks/useProfile.ts`, `src/hooks/useProfile.test.tsx`

**Interfaces:**
- Consumes: `profiles.city_id` / `profiles.reputation_score` from Task 2.
- Produces: `Profile` type gains `city_id: string` and `reputation_score: number`; `useProfile`'s Supabase `select()` column list picks up both. Existing consumers (`ProtectedLayout`, `SessionOnlyLayout`, `ProfilePage`) are unaffected since they only destructure fields they already use — this is a pure additive extension.

- [ ] **Step 1: Extend the failing test first**

Modify `src/hooks/useProfile.test.tsx` — replace its mock setup and test with:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useProfile } from './useProfile';

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: mockSelect }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useProfile', () => {
  it('returns profile data on success, including city_id and reputation_score', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'u1',
        username: 'renz',
        display_name: 'Ren',
        avatar_url: null,
        city_id: 'city-1',
        reputation_score: 0,
        created_at: '2026-01-01',
      },
      error: null,
    });

    const { result } = renderHook(() => useProfile('u1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.username).toBe('renz');
    expect(result.current.data?.city_id).toBe('city-1');
    expect(result.current.data?.reputation_score).toBe(0);
    expect(mockSelect).toHaveBeenCalledWith(
      'id, username, display_name, avatar_url, city_id, reputation_score, created_at'
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/hooks/useProfile.test.tsx`
Expected: FAIL — the current `select()` call string doesn't include `city_id`/`reputation_score`, so the `mockSelect` assertion fails.

- [ ] **Step 3: Extend the `Profile` type**

Modify `src/types/profile.ts`:

```ts
export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  city_id: string;
  reputation_score: number;
  created_at: string;
}
```

- [ ] **Step 4: Extend `useProfile`'s select list**

Modify `src/hooks/useProfile.ts` — change the `.select(...)` call:

```ts
.select('id, username, display_name, avatar_url, city_id, reputation_score, created_at')
```

(Only this line changes; the rest of the hook is unchanged.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/hooks/useProfile.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full suite to confirm no regressions in existing consumers**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0. (`ProtectedLayout`, `SessionOnlyLayout`, `ProfilePage` all consume `useProfile` but don't reference the new fields yet, so they should be unaffected.)

- [ ] **Step 7: Commit**

```bash
git add src/types/profile.ts src/hooks/useProfile.ts src/hooks/useProfile.test.tsx
git commit -m "feat: add city_id and reputation_score to Profile type and useProfile"
```

---

### Task 6: City picker in onboarding

**Files:**
- Modify: `src/routes/UsernameSetupPage.tsx`, `src/routes/UsernameSetupPage.test.tsx`

**Interfaces:**
- Consumes: `useCities()` from Task 3; `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem` from Task 4.
- Produces: the profile insert payload gains `city_id`, sourced from the new picker; submission is disabled until a city is chosen.

- [ ] **Step 1: Extend the failing test first**

Modify `src/routes/UsernameSetupPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UsernameSetupPage } from './UsernameSetupPage';

const mockInsert = vi.fn().mockResolvedValue({ error: null });

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useCities', () => ({
  useCities: () => ({
    data: [{ id: 'city-1', name: 'Cebu City', slug: 'cebu-city', country: 'Philippines' }],
    isLoading: false,
  }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ insert: mockInsert }),
  },
}));

function renderPage() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UsernameSetupPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('UsernameSetupPage', () => {
  it('requires a city to be selected before the form can submit', async () => {
    renderPage();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('username'), 'renz');

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('submits the chosen username, display name, and city', async () => {
    renderPage();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('username'), 'renz');
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Cebu City' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(mockInsert).toHaveBeenCalledWith({
        id: 'user-1',
        username: 'renz',
        display_name: 'renz',
        city_id: 'city-1',
      })
    );
  });

  it('shows a friendly message when the username is already taken', async () => {
    mockInsert.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } });
    renderPage();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('username'), 'renz');
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Cebu City' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(screen.getByText('That username is already taken.')).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/routes/UsernameSetupPage.test.tsx`
Expected: FAIL — no city picker exists yet, so `getByRole('combobox')` finds nothing and the button isn't disabled without one.

- [ ] **Step 3: Implement the city picker**

Replace `src/routes/UsernameSetupPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useCities } from '../hooks/useCities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
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
            {cities?.map((city) => (
              <SelectItem key={city.id} value={city.id}>
                {city.name}
              </SelectItem>
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/routes/UsernameSetupPage.test.tsx`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes/UsernameSetupPage.tsx src/routes/UsernameSetupPage.test.tsx
git commit -m "feat: add city picker to onboarding"
```

---

### Task 7: City-aware Feed placeholder

**Files:**
- Modify: `src/routes/FeedPage.tsx`
- Test: `src/routes/FeedPage.test.tsx` (new)

**Interfaces:**
- Consumes: `useAuth()`, `useProfile()`, `useCities()`, `ComingSoon` (existing component, unchanged).
- Produces: `FeedPage` now shows `"{City} Feed — coming soon."` once the user's profile and the cities list have both loaded, falling back to the existing generic `"Feed — coming soon."` while either is still loading.

- [ ] **Step 1: Write the failing test**

Create `src/routes/FeedPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeedPage } from './FeedPage';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useProfile', () => ({
  useProfile: () => ({
    data: {
      id: 'user-1',
      username: 'renz',
      display_name: 'Ren',
      avatar_url: null,
      city_id: 'city-1',
      reputation_score: 0,
      created_at: '2026-01-01',
    },
    isLoading: false,
  }),
}));

vi.mock('../hooks/useCities', () => ({
  useCities: () => ({
    data: [{ id: 'city-1', name: 'Cebu City', slug: 'cebu-city', country: 'Philippines' }],
    isLoading: false,
  }),
}));

describe('FeedPage', () => {
  it('shows the coming-soon message scoped to the user\'s city', () => {
    render(<FeedPage />);
    expect(screen.getByText('Cebu City Feed — coming soon.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/routes/FeedPage.test.tsx`
Expected: FAIL — `FeedPage` currently renders the generic `"Feed — coming soon."` with no city name.

- [ ] **Step 3: Implement the city-aware Feed**

Replace `src/routes/FeedPage.tsx`:

```tsx
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useCities } from '../hooks/useCities';
import { ComingSoon } from '../components/ComingSoon';

export function FeedPage() {
  const { session } = useAuth();
  const { data: profile } = useProfile(session?.user.id);
  const { data: cities } = useCities();

  const cityName = cities?.find((city) => city.id === profile?.city_id)?.name;

  return <ComingSoon title={cityName ? `${cityName} Feed` : 'Feed'} />;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/routes/FeedPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/FeedPage.tsx src/routes/FeedPage.test.tsx
git commit -m "feat: make Feed placeholder city-aware"
```

---

### Task 8: City display and switcher on the profile page

**Files:**
- Modify: `src/routes/ProfilePage.tsx`, `src/routes/ProfilePage.test.tsx`

**Interfaces:**
- Consumes: `useCities()` from Task 3; `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem` from Task 4; `supabase` from `src/lib/supabase.ts`.
- Produces: the profile page shows the user's current city name and a switcher that updates `profiles.city_id` and invalidates `['profile', userId]`.

- [ ] **Step 1: Extend the failing test first**

Modify `src/routes/ProfilePage.test.tsx` — add to the existing mocks and add a new test:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfilePage } from './ProfilePage';
import { useAuth } from '../hooks/useAuth';

vi.mock('../hooks/useAuth');

const mockUseAuth = vi.mocked(useAuth);

const mockEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn(() => ({ eq: mockEq }));

beforeEach(() => {
  mockUseAuth.mockReturnValue({
    session: { user: { id: 'user-1' } } as any,
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  });
  mockEq.mockClear();
  mockUpdate.mockClear();
});

vi.mock('../hooks/useCities', () => ({
  useCities: () => ({
    data: [
      { id: 'city-1', name: 'Cebu City', slug: 'cebu-city', country: 'Philippines' },
      { id: 'city-2', name: 'Manila', slug: 'manila', country: 'Philippines' },
    ],
    isLoading: false,
  }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: {
                id: 'user-1',
                username: 'renz',
                display_name: 'Ren',
                avatar_url: null,
                city_id: 'city-1',
                reputation_score: 0,
                created_at: '2026-01-01',
              },
              error: null,
            }),
        }),
      }),
      update: mockUpdate,
    }),
  },
}));

function renderPage() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ProfilePage />
    </QueryClientProvider>
  );
}

describe('ProfilePage', () => {
  it('renders the current user profile and a QR code', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Ren')).toBeInTheDocument());
    expect(screen.getByText('@renz')).toBeInTheDocument();
  });

  it('shows a loading state while auth is still resolving, not an error', () => {
    mockUseAuth.mockReturnValue({
      session: null as any,
      loading: true,
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Loading profile…')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your profile.")).not.toBeInTheDocument();
  });

  it('shows the current city and updates it when a new one is chosen', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Cebu City')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Manila' }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({ city_id: 'city-2' })
    );
    expect(mockEq).toHaveBeenCalledWith('id', 'user-1');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/routes/ProfilePage.test.tsx`
Expected: FAIL — no city name or switcher rendered yet.

- [ ] **Step 3: Implement the city display and switcher**

Replace `src/routes/ProfilePage.tsx`:

```tsx
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useCities } from '../hooks/useCities';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function ProfilePage() {
  const { session, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile(session?.user.id);
  const { data: cities } = useCities();
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const [updatingCity, setUpdatingCity] = useState(false);

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
  const currentCity = cities?.find((city) => city.id === profile.city_id);

  async function handleCityChange(newCityId: string) {
    if (!session) return;
    setUpdatingCity(true);
    await supabase.from('profiles').update({ city_id: newCityId }).eq('id', session.user.id);
    await queryClient.invalidateQueries({ queryKey: ['profile', session.user.id] });
    setUpdatingCity(false);
  }

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
      <div className="flex w-full max-w-sm flex-col items-center gap-2">
        {currentCity && <p className="text-sm text-muted-foreground">{currentCity.name}</p>}
        <Select value={profile.city_id} onValueChange={handleCityChange} disabled={updatingCity}>
          <SelectTrigger>
            <SelectValue placeholder="Change city" />
          </SelectTrigger>
          <SelectContent>
            {cities?.map((city) => (
              <SelectItem key={city.id} value={city.id}>
                {city.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <QRCodeSVG value={profileUrl} size={160} />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/routes/ProfilePage.test.tsx`
Expected: PASS (all three tests).

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/routes/ProfilePage.tsx src/routes/ProfilePage.test.tsx
git commit -m "feat: add city display and switcher to profile page"
```

---

## Self-Review Notes

- **Spec coverage:** cities table + seed (Task 1), profile schema extension with safe backfill (Task 2), `useCities` hook (Task 3), Select component (Task 4), `Profile`/`useProfile` extension (Task 5), onboarding city picker (Task 6), city-aware Feed (Task 7), profile city switcher (Task 8) — every design-doc goal is covered. Real feed content, marketplace, chat, merchant directory, events, city news, reputation scoring logic, multi-city membership, and city moderator roles are all confirmed out of scope and have no tasks here, matching the design doc's Non-Goals.
- **Type consistency verified:** `City` type fields (`id`, `name`, `slug`, `country`) match the `cities` table columns from Task 1 and are used identically in Tasks 3, 6, 7, 8. The extended `Profile` type's `city_id`/`reputation_score` match the `profiles` migration from Task 2 and are used identically in Tasks 5, 6, 7, 8. `useCities()`'s return shape (`{ data, isLoading }`, a `useQuery` result) is used identically everywhere it's consumed.
- **Backfill correctness:** Task 2's migration was written against the live database's actual current state (1 existing row, confirmed via REST API), not an assumption — the `update ... where city_id is null` step is unconditionally safe whether 0 or more rows exist at apply time.
- **No placeholders remain.**

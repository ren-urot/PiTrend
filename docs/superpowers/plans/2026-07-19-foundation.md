# PiMesh Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an installable, offline-capable PWA shell for PiMesh — scaffold, Supabase-backed magic-link auth, a `profiles` table, and a navigable app shell with placeholder screens — that later PiMesh sub-projects (city communities, feed, messaging, marketplace, news, notifications/search, moderation) build their real features into.

**Architecture:** Vite + React + TypeScript SPA styled with Tailwind CSS and shadcn/ui, backed by an existing Supabase project (Postgres + Auth). React Router drives navigation with two guard layouts (session-only, fully-protected). TanStack Query wraps all Supabase reads, its cache persisted to IndexedDB via Dexie so the last-known data renders instantly offline. `vite-plugin-pwa` (Workbox) handles the installable manifest and app-shell precaching. Deployed to Vercel.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS, shadcn/ui, React Router v6, @tanstack/react-query, @tanstack/react-query-persist-client, Dexie.js, @supabase/supabase-js, qrcode.react, vite-plugin-pwa, Vitest, @testing-library/react.

## Global Constraints

- Backend is Supabase project at `https://puqakbajkmlwohuznxut.supabase.co` — already created; do not create a new project.
- Supabase credentials live only in `.env.local` (gitignored) as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — never commit them, never hardcode them into source files.
- Auth is magic-link (email) only — no password field, no phone number field anywhere in this phase.
- Username is a public handle stored in `profiles`, separate from the private login email.
- Every screen outside Login/Profile is an explicit placeholder ("Coming soon") in this phase — no real feed/message/marketplace/news content.
- Every task that adds runtime logic (hooks, components with conditional rendering) ships with a Vitest test; pure config/scaffolding tasks verify via a successful `npm run build`.
- Deploying to Vercel / pushing to a remote / creating GitHub repos are **not** part of this plan's automated steps — Task 17 stops at a locally-verified production build and documents the manual deployment steps for the user to run themselves.

---

### Task 1: Project scaffold (Vite + React + TypeScript + Tailwind)

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `postcss.config.js`, `tailwind.config.ts`, `src/main.tsx`, `src/index.css`, `.gitignore`
- Test: none (scaffolding task — verified via build)

**Interfaces:**
- Produces: a working Vite dev/build pipeline that every later task's `npm run build` / `npm test` relies on.

- [ ] **Step 1: Scaffold into a temp directory and merge into the repo root**

```bash
npm create vite@latest pimesh-scaffold -- --template react-ts
cp -r pimesh-scaffold/. .
rm -rf pimesh-scaffold
```

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

- [ ] **Step 3: Add Tailwind CSS**

Pin to Tailwind v3 — this plan's config files (`tailwind.config.ts`, `postcss.config.js`, `@tailwind` directives) use v3's JS-config model, which v4 does not use the same way:

```bash
npm install -D tailwindcss@^3 postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 4: Replace the generated `tailwind.config.js` with `tailwind.config.ts`**

```bash
rm tailwind.config.js
```

Create `tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 5: Replace `src/index.css` with Tailwind directives**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: Strip the generated boilerplate from `src/App.tsx` and `src/main.tsx`**

Delete `src/App.tsx` and `src/App.css` — this plan builds routing directly in `src/main.tsx` (Task 11 replaces its contents). For now, reduce `src/main.tsx` to:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="p-6">PiMesh scaffold OK</div>
  </StrictMode>
);
```

- [ ] **Step 7: Verify the production build succeeds**

Run: `npm run build`
Expected: exits 0, prints a `dist/` build summary ending in something like `✓ built in ...`, and `dist/index.html` exists.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TypeScript + Tailwind project"
```

---

### Task 2: Path alias + Vitest infrastructure

**Files:**
- Modify: `vite.config.ts`, `tsconfig.app.json`
- Create: `src/test/setup.ts`
- Test: `src/test/sanity.test.ts`

**Interfaces:**
- Produces: `@/*` import alias resolving to `src/*`; `npm test` running Vitest in a jsdom environment with `@testing-library/jest-dom` matchers and `fake-indexeddb` globally available.

- [ ] **Step 1: Install test dependencies**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @types/node fake-indexeddb
```

- [ ] **Step 2: Write the failing sanity test**

Create `src/test/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: Run it to confirm the test runner isn't wired up yet**

Run: `npx vitest run`
Expected: FAILS to start (no `test` script / no vitest config resolved yet), or errors — confirms we still need Step 4.

- [ ] **Step 4: Wire Vitest into `vite.config.ts` with the path alias**

Replace `vite.config.ts` with:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
```

- [ ] **Step 5: Add the matching path in `tsconfig.app.json`**

Open `tsconfig.app.json` and add inside `compilerOptions`:

```json
"baseUrl": ".",
"paths": {
  "@/*": ["./src/*"]
}
```

- [ ] **Step 6: Create the test setup file**

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
```

- [ ] **Step 7: Add the `test` script to `package.json`**

In `package.json`, add under `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 8: Run the sanity test and confirm it passes**

Run: `npm test`
Expected: PASS — `vitest setup > runs a basic assertion`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: add Vitest infrastructure and @/ path alias"
```

---

### Task 3: shadcn/ui base components

**Files:**
- Create: `components.json`, `src/lib/utils.ts` (generated by shadcn CLI), `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/avatar.tsx`, `src/components/ui/tabs.tsx` (all generated by shadcn CLI)
- Modify: `tailwind.config.ts`, `src/index.css` (updated by shadcn CLI with theme tokens)

**Interfaces:**
- Produces: `Button`, `Input`, `Dialog`, `Avatar`, `Tabs` importable from `@/components/ui/*`, used by Tasks 9, 10, 13.

- [ ] **Step 1: Create `components.json` so the CLI runs non-interactively**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

- [ ] **Step 2: Add the base components**

```bash
npx shadcn@latest add button input dialog avatar tabs -y
```

If prompted interactively despite `-y`, accept the default answer for each prompt. If the resolved `class-variance-authority` / `lucide-react` dependencies aren't installed automatically by the CLI, install them directly: `npm install class-variance-authority lucide-react`. If the `@/` alias isn't picked up because the CLI doesn't follow this project's split `tsconfig.app.json`/`tsconfig.node.json` project references, add `baseUrl`/`paths` directly to the root `tsconfig.json` per shadcn's Vite setup docs.

- [ ] **Step 2b: Add the shadcn theme CSS variables (current CLI versions don't inject these for Tailwind v3 via `add`)**

As of the CLI version available when this plan was written, `shadcn add` generates component files but does not inject the CSS variable theme tokens (`bg-primary`, `bg-background`, `border-input`, etc.) into `tailwind.config.ts` / `src/index.css` for Tailwind v3 projects — that only happens through `init`, which targets a v4-oriented preset this project isn't using. Without this step the components build but render unstyled. Add the standard shadcn "zinc" base-color theme manually.

Replace `src/index.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

Replace `tailwind.config.ts` with:

```ts
import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
```

Install the animation plugin the generated `dialog.tsx` depends on: `npm install -D tailwindcss-animate`.

Verify the tokens are actually emitted (a successful build alone doesn't prove this, since Tailwind silently omits unmatched utility classes rather than erroring):

```bash
npm run build
grep -c -- "--background" dist/assets/*.css
grep -c "\.bg-primary" dist/assets/*.css
```

Both counts must be greater than 0.

- [ ] **Step 3: Verify the build still succeeds**

Run: `npm run build`
Expected: exits 0. Confirms the CLI's edits to `tailwind.config.ts` / `src/index.css` didn't break the build.

- [ ] **Step 4: Verify the generated files exist**

Run: `ls src/components/ui/`
Expected: lists `button.tsx`, `input.tsx`, `dialog.tsx`, `avatar.tsx`, `tabs.tsx`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add shadcn/ui base components"
```

---

### Task 4: Supabase client

**Files:**
- Create: `.env.local`, `.env.example`, `src/lib/supabase.ts`
- Test: `src/lib/supabase.test.ts`

**Interfaces:**
- Produces: `supabase` (a configured `SupabaseClient`) exported from `src/lib/supabase.ts`, imported by every later task that talks to the backend.

- [ ] **Step 1: Install the Supabase client**

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: Create the local env file (gitignored — do not commit)**

Create `.env.local`:

```
VITE_SUPABASE_URL=https://puqakbajkmlwohuznxut.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1cWFrYmFqa21sd29odXpueHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0NTY1NjAsImV4cCI6MjEwMDAzMjU2MH0.NmPf5OXUQ8Q6vw8f8Vr-SlMgS59_xKVOmCyn4Whr8PM
```

- [ ] **Step 3: Create the example env file (committed, no real values)**

Create `.env.example`:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 4: Confirm `.env.local` is gitignored**

Run: `git check-ignore -v .env.local`
Expected: prints a match (Vite's default `.gitignore` already includes `*.local`). If it prints nothing, add `.env.local` to `.gitignore` manually and re-run.

- [ ] **Step 5: Write the failing test**

In this project's Vite/Vitest version, `import.meta.env` in `test` mode still picks up `.env.local` — the classic "`.env.local` is skipped in test mode" behavior does not hold here, so the test needs to actively clear the vars rather than relying on them being absent by default. Create `src/lib/supabase.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('supabase client', () => {
  it('throws when required env vars are missing', async () => {
    const originalUrl = import.meta.env.VITE_SUPABASE_URL;
    const originalKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    try {
      delete (import.meta.env as Record<string, string | undefined>).VITE_SUPABASE_URL;
      delete (import.meta.env as Record<string, string | undefined>).VITE_SUPABASE_ANON_KEY;

      vi.resetModules();

      await expect(import('./supabase')).rejects.toThrow(
        'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables'
      );
    } finally {
      if (originalUrl !== undefined) (import.meta.env as Record<string, string | undefined>).VITE_SUPABASE_URL = originalUrl;
      if (originalKey !== undefined) (import.meta.env as Record<string, string | undefined>).VITE_SUPABASE_ANON_KEY = originalKey;
    }
  });
});
```

This needs `vi` imported alongside the other test utilities: `import { describe, it, expect, vi } from 'vitest';`.

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- src/lib/supabase.test.ts`
Expected: FAIL — `src/lib/supabase.ts` doesn't exist yet.

- [ ] **Step 7: Implement the client**

Create `src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- src/lib/supabase.test.ts`
Expected: PASS. The `delete` + `vi.resetModules()` force the module to re-evaluate with the vars genuinely absent, so the throw is real, not mocked.

- [ ] **Step 9: Commit**

```bash
git add .env.example src/lib/supabase.ts src/lib/supabase.test.ts .gitignore
git commit -m "feat: add Supabase client"
```

Confirm `.env.local` is NOT in the `git status` output before committing — it must stay untracked.

---

### Task 5: `profiles` table migration

**Files:**
- Create: `supabase/migrations/0001_create_profiles.sql`

**Interfaces:**
- Produces: `public.profiles` table (`id uuid PK`, `username text unique`, `display_name text`, `avatar_url text`, `created_at timestamptz`) with RLS enabled, relied on by Tasks 7, 10, 13.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0001_create_profiles.sql`:

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Authenticated users can read all profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
```

- [ ] **Step 2: Apply it to the Supabase project (manual dashboard step)**

Open the Supabase dashboard for `https://puqakbajkmlwohuznxut.supabase.co` → SQL Editor → paste the contents of `supabase/migrations/0001_create_profiles.sql` → Run.

- [ ] **Step 3: Verify the table exists**

In the same SQL Editor, run:

```sql
select column_name, data_type from information_schema.columns where table_name = 'profiles';
```

Expected: rows for `id`, `username`, `display_name`, `avatar_url`, `created_at`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_create_profiles.sql
git commit -m "feat: add profiles table migration"
```

---

### Task 6: Auth context (`useAuth`)

**Files:**
- Create: `src/hooks/useAuth.tsx`
- Test: `src/hooks/useAuth.test.tsx`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts` (Task 4).
- Produces: `AuthProvider` (React component) and `useAuth(): { session: Session | null; loading: boolean; signInWithEmail: (email: string) => Promise<{ error: string | null }>; signOut: () => Promise<void> }`, consumed by Tasks 7, 9, 10, 11, 13.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useAuth.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './useAuth';

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signInWithOtp: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

function TestComponent() {
  const { session, loading } = useAuth();
  if (loading) return <div>loading</div>;
  return <div>{session ? 'signed-in' : 'signed-out'}</div>;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('renders signed-out state once the initial session check resolves', async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    expect(screen.getByText('loading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/hooks/useAuth.test.tsx`
Expected: FAIL — `src/hooks/useAuth.tsx` doesn't exist yet.

- [ ] **Step 3: Implement `useAuth`**

Create `src/hooks/useAuth.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signInWithEmail: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signInWithEmail(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error: error ? error.message : null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, loading, signInWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/hooks/useAuth.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAuth.tsx src/hooks/useAuth.test.tsx
git commit -m "feat: add auth context with magic-link sign-in"
```

---

### Task 7: TanStack Query client + `useProfile`

**Files:**
- Create: `src/types/profile.ts`, `src/hooks/useProfile.ts`
- Test: `src/hooks/useProfile.test.tsx`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts` (Task 4); `profiles` table shape from Task 5.
- Produces: `Profile` type (`{ id: string; username: string; display_name: string; avatar_url: string | null; created_at: string }`) and `useProfile(userId: string | undefined)` (a `useQuery` result keyed `['profile', userId]`), consumed by Tasks 11, 13.

- [ ] **Step 1: Install TanStack Query**

```bash
npm install @tanstack/react-query
```

- [ ] **Step 2: Define the `Profile` type**

Create `src/types/profile.ts`:

```ts
export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}
```

- [ ] **Step 3: Write the failing test**

Create `src/hooks/useProfile.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useProfile } from './useProfile';

const mockMaybeSingle = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useProfile', () => {
  it('returns profile data on success', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'u1',
        username: 'renz',
        display_name: 'Ren',
        avatar_url: null,
        created_at: '2026-01-01',
      },
      error: null,
    });

    const { result } = renderHook(() => useProfile('u1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.username).toBe('renz');
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- src/hooks/useProfile.test.tsx`
Expected: FAIL — `src/hooks/useProfile.ts` doesn't exist yet.

- [ ] **Step 5: Implement `useProfile`**

Create `src/hooks/useProfile.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/profile';

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async (): Promise<Profile | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, created_at')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/hooks/useProfile.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/profile.ts src/hooks/useProfile.ts src/hooks/useProfile.test.tsx
git commit -m "feat: add useProfile query hook"
```

---

### Task 8: Dexie DB + TanStack Query persister

**Files:**
- Create: `src/lib/db.ts`, `src/lib/persister.ts`
- Test: `src/lib/persister.test.ts`

**Interfaces:**
- Produces: `db` (a `Dexie` instance with a `queryCache` table) and `dexiePersister` (a `Persister` implementing `persistClient` / `restoreClient` / `removeClient`), consumed by Task 11's `main.tsx`.

- [ ] **Step 1: Install Dexie and the persist-client package**

```bash
npm install dexie @tanstack/react-query-persist-client
```

- [ ] **Step 2: Define the Dexie database**

Create `src/lib/db.ts`:

```ts
import Dexie, { type Table } from 'dexie';

export interface CachedQueryClient {
  key: string;
  value: string;
}

export class PiMeshDB extends Dexie {
  queryCache!: Table<CachedQueryClient, string>;

  constructor() {
    super('pimesh');
    this.version(1).stores({
      queryCache: 'key',
    });
  }
}

export const db = new PiMeshDB();
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/persister.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { dexiePersister } from './persister';
import { db } from './db';
import type { PersistedClient } from '@tanstack/react-query-persist-client';

const snapshot: PersistedClient = {
  clientState: { queries: [], mutations: [] },
  timestamp: Date.now(),
  buster: '',
};

describe('dexiePersister', () => {
  beforeEach(async () => {
    await db.queryCache.clear();
  });

  it('persists and restores a client snapshot', async () => {
    await dexiePersister.persistClient(snapshot);
    const restored = await dexiePersister.restoreClient();
    expect(restored).toEqual(snapshot);
  });

  it('removes a persisted client', async () => {
    await dexiePersister.persistClient(snapshot);
    await dexiePersister.removeClient();
    const restored = await dexiePersister.restoreClient();
    expect(restored).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- src/lib/persister.test.ts`
Expected: FAIL — `src/lib/persister.ts` doesn't exist yet.

- [ ] **Step 5: Implement the persister**

Create `src/lib/persister.ts`:

```ts
import type { Persister } from '@tanstack/react-query-persist-client';
import { db } from './db';

const CACHE_KEY = 'react-query-cache';

export const dexiePersister: Persister = {
  persistClient: async (client) => {
    await db.queryCache.put({ key: CACHE_KEY, value: JSON.stringify(client) });
  },
  restoreClient: async () => {
    const record = await db.queryCache.get(CACHE_KEY);
    return record ? JSON.parse(record.value) : undefined;
  },
  removeClient: async () => {
    await db.queryCache.delete(CACHE_KEY);
  },
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/lib/persister.test.ts`
Expected: PASS. (`fake-indexeddb/auto`, loaded globally in `src/test/setup.ts` from Task 2, gives Dexie a working IndexedDB in jsdom.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/db.ts src/lib/persister.ts src/lib/persister.test.ts
git commit -m "feat: add Dexie-backed TanStack Query persister"
```

---

### Task 9: Login page

**Files:**
- Create: `src/routes/LoginPage.tsx`
- Test: `src/routes/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 6), `Button`/`Input` from `@/components/ui/*` (Task 3).
- Produces: `LoginPage` component, consumed by Task 11's router config.

- [ ] **Step 1: Write the failing test**

Create `src/routes/LoginPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';

const mockSignInWithEmail = vi.fn().mockResolvedValue({ error: null });

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: null,
    loading: false,
    signInWithEmail: mockSignInWithEmail,
    signOut: vi.fn(),
  }),
}));

describe('LoginPage', () => {
  it('sends a magic link and shows a confirmation', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('you@example.com'), 'ren@example.com');
    await user.click(screen.getByRole('button', { name: 'Send magic link' }));

    await waitFor(() => expect(screen.getByText('Check your email')).toBeInTheDocument());
    expect(mockSignInWithEmail).toHaveBeenCalledWith('ren@example.com');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/routes/LoginPage.test.tsx`
Expected: FAIL — `src/routes/LoginPage.tsx` doesn't exist yet.

- [ ] **Step 3: Implement `LoginPage`**

Create `src/routes/LoginPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function LoginPage() {
  const { session, loading, signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  if (!loading && session) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus('sending');
    const { error } = await signInWithEmail(email);
    if (error) {
      setErrorMessage(error);
      setStatus('error');
      return;
    }
    setStatus('sent');
  }

  if (status === 'sent') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-lg font-semibold">Check your email</p>
        <p className="text-muted-foreground">We sent a login link to {email}.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">PiMesh</h1>
      <p className="text-muted-foreground">Your Pi Community, Anywhere.</p>
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <Input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send magic link'}
        </Button>
        {status === 'error' && <p className="text-sm text-destructive">{errorMessage}</p>}
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/routes/LoginPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/LoginPage.tsx src/routes/LoginPage.test.tsx
git commit -m "feat: add login page with magic-link sign-in"
```

---

### Task 10: Username setup page

**Files:**
- Create: `src/routes/UsernameSetupPage.tsx`
- Test: `src/routes/UsernameSetupPage.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 6), `supabase` (Task 4), `useQueryClient` from `@tanstack/react-query`, `Button`/`Input` (Task 3).
- Produces: `UsernameSetupPage` component, consumed by Task 11's router config.

- [ ] **Step 1: Write the failing test**

Create `src/routes/UsernameSetupPage.test.tsx`:

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
  it('submits the chosen username and display name', async () => {
    renderPage();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('username'), 'renz');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(mockInsert).toHaveBeenCalledWith({
        id: 'user-1',
        username: 'renz',
        display_name: 'renz',
      })
    );
  });

  it('shows a friendly message when the username is already taken', async () => {
    mockInsert.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } });
    renderPage();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('username'), 'renz');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(screen.getByText('That username is already taken.')).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/routes/UsernameSetupPage.test.tsx`
Expected: FAIL — `src/routes/UsernameSetupPage.tsx` doesn't exist yet.

- [ ] **Step 3: Implement `UsernameSetupPage`**

Create `src/routes/UsernameSetupPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function UsernameSetupPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setSubmitting(true);
    setError('');

    const { error: insertError } = await supabase.from('profiles').insert({
      id: session.user.id,
      username,
      display_name: displayName || username,
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
        <Button type="submit" disabled={submitting}>
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
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/UsernameSetupPage.tsx src/routes/UsernameSetupPage.test.tsx
git commit -m "feat: add username setup page"
```

---

### Task 11: Router, route guards, and placeholder pages

**Files:**
- Create: `src/components/ComingSoon.tsx`, `src/routes/FeedPage.tsx`, `src/routes/MessagesPage.tsx`, `src/routes/MarketplacePage.tsx`, `src/routes/NewsPage.tsx`, `src/routes/ProtectedLayout.tsx`, `src/routes/SessionOnlyLayout.tsx`, `src/routes/routes.tsx`, `src/router.tsx`
- Modify: `src/main.tsx`
- Test: `src/routes/routes.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 6), `useProfile()` (Task 7), `LoginPage` (Task 9), `UsernameSetupPage` (Task 10).
- Produces: `routes: RouteObject[]` (exported from `src/routes/routes.tsx`, reused by tests via `createMemoryRouter`) and `router` (exported from `src/router.tsx`, a `createBrowserRouter` instance used by `main.tsx`). `AppShell` (built in Task 12) is referenced here as a layout route — stub it minimally in Step 3 below; Task 12 replaces the stub.

- [ ] **Step 1: Install React Router**

```bash
npm install react-router-dom
```

- [ ] **Step 2: Create the placeholder pages**

Create `src/components/ComingSoon.tsx`:

```tsx
export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-muted-foreground">
      {title} — coming soon.
    </div>
  );
}
```

Create `src/routes/FeedPage.tsx`:

```tsx
import { ComingSoon } from '../components/ComingSoon';

export function FeedPage() {
  return <ComingSoon title="Feed" />;
}
```

Create `src/routes/MessagesPage.tsx`:

```tsx
import { ComingSoon } from '../components/ComingSoon';

export function MessagesPage() {
  return <ComingSoon title="Messages" />;
}
```

Create `src/routes/MarketplacePage.tsx`:

```tsx
import { ComingSoon } from '../components/ComingSoon';

export function MarketplacePage() {
  return <ComingSoon title="Marketplace" />;
}
```

Create `src/routes/NewsPage.tsx`:

```tsx
import { ComingSoon } from '../components/ComingSoon';

export function NewsPage() {
  return <ComingSoon title="News" />;
}
```

- [ ] **Step 3: Stub `AppShell` (Task 12 replaces this with the real nav)**

Create `src/components/nav/AppShell.tsx`:

```tsx
import { Outlet } from 'react-router-dom';

export function AppShell() {
  return <Outlet />;
}
```

- [ ] **Step 4: Implement the route guard layouts**

Create `src/routes/ProtectedLayout.tsx`:

```tsx
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
```

Create `src/routes/SessionOnlyLayout.tsx`:

```tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';

export function SessionOnlyLayout() {
  const { session, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile(session?.user.id);

  if (authLoading) {
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
```

- [ ] **Step 5: Write the failing route-guard test**

Create `src/routes/routes.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../hooks/useAuth';
import { routes } from './routes';

let currentSession: { user: { id: string } } | null = null;
let currentProfile: {
  id: string;
  username: string;
  display_name: string;
  avatar_url: null;
  created_at: string;
} | null = null;

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: currentSession } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn(),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: currentProfile, error: null }),
        }),
      }),
      insert: (row: { id: string; username: string; display_name: string }) => {
        currentProfile = { ...row, avatar_url: null, created_at: '2026-01-01' };
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

function renderApp() {
  const queryClient = new QueryClient();
  const router = createMemoryRouter(routes, { initialEntries: ['/feed'] });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe('app routing', () => {
  beforeEach(() => {
    currentSession = null;
    currentProfile = null;
  });

  it('routes an unauthenticated user to login', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText('PiMesh')).toBeInTheDocument());
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
  });

  it('routes an authenticated user without a profile to username setup, then to the shell', async () => {
    currentSession = { user: { id: 'user-1' } };
    renderApp();

    await waitFor(() => expect(screen.getByText('Choose a username')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('username'), 'renz');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByText('Feed — coming soon.')).toBeInTheDocument());
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- src/routes/routes.test.tsx`
Expected: FAIL — `src/routes/routes.tsx` doesn't exist yet.

- [ ] **Step 7: Implement the route table**

Create `src/routes/routes.tsx`:

```tsx
import { Navigate, type RouteObject } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { UsernameSetupPage } from './UsernameSetupPage';
import { ProtectedLayout } from './ProtectedLayout';
import { SessionOnlyLayout } from './SessionOnlyLayout';
import { AppShell } from '../components/nav/AppShell';
import { FeedPage } from './FeedPage';
import { MessagesPage } from './MessagesPage';
import { MarketplacePage } from './MarketplacePage';
import { NewsPage } from './NewsPage';
import { ProfilePage } from './ProfilePage';
import { PublicProfilePage } from './PublicProfilePage';

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
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
          { path: '/messages', element: <MessagesPage /> },
          { path: '/marketplace', element: <MarketplacePage /> },
          { path: '/news', element: <NewsPage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/u/:username', element: <PublicProfilePage /> },
        ],
      },
    ],
  },
];
```

This references `ProfilePage` and `PublicProfilePage`, which Task 13 creates. Stub them now so `routes.tsx` compiles:

Create `src/routes/ProfilePage.tsx`:

```tsx
export function ProfilePage() {
  return <div className="p-6">Profile (Task 13 implements this)</div>;
}
```

Create `src/routes/PublicProfilePage.tsx`:

```tsx
export function PublicProfilePage() {
  return <div className="p-6">Public profile (Task 13 implements this)</div>;
}
```

- [ ] **Step 8: Create the browser router and wire `main.tsx`**

Create `src/router.tsx`:

```tsx
import { createBrowserRouter } from 'react-router-dom';
import { routes } from './routes/routes';

export const router = createBrowserRouter(routes);
```

Replace `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AuthProvider } from './hooks/useAuth';
import { dexiePersister } from './lib/persister';
import { router } from './router';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: dexiePersister }}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </PersistQueryClientProvider>
  </StrictMode>
);
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test -- src/routes/routes.test.tsx`
Expected: PASS.

- [ ] **Step 10: Run the full test suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add router, route guards, and placeholder pages"
```

---

### Task 12: `AppShell` responsive navigation

**Files:**
- Modify: `src/components/nav/AppShell.tsx` (replacing the Task 11 stub)
- Test: `src/components/nav/AppShell.test.tsx`

**Interfaces:**
- Produces: the real `AppShell` layout component, replacing the stub referenced by `src/routes/routes.tsx` (Task 11).

- [ ] **Step 1: Write the failing test**

Create `src/components/nav/AppShell.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('renders all five nav tabs and the active route content', () => {
    const router = createMemoryRouter(
      [
        {
          element: <AppShell />,
          children: [{ path: '/feed', element: <div>Feed content</div> }],
        },
      ],
      { initialEntries: ['/feed'] }
    );

    render(<RouterProvider router={router} />);

    expect(screen.getAllByText('Feed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Messages').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Marketplace').length).toBeGreaterThan(0);
    expect(screen.getAllByText('News').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Profile').length).toBeGreaterThan(0);
    expect(screen.getByText('Feed content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/components/nav/AppShell.test.tsx`
Expected: FAIL — the Task 11 stub renders only `<Outlet />`, no nav labels.

- [ ] **Step 3: Implement the real `AppShell`**

```bash
npm install lucide-react
```

(Skip this install if Task 3's shadcn CLI already added `lucide-react` — check `package.json` first with `grep lucide-react package.json`.)

Replace `src/components/nav/AppShell.tsx`:

```tsx
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/nav/AppShell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/nav/AppShell.tsx src/components/nav/AppShell.test.tsx package.json package-lock.json
git commit -m "feat: add responsive AppShell navigation"
```

---

### Task 13: Profile page, public profile page, and QR code

**Files:**
- Modify: `src/routes/ProfilePage.tsx`, `src/routes/PublicProfilePage.tsx` (replacing the Task 11 stubs)
- Create: `src/hooks/useOnlineStatus.ts`
- Test: `src/hooks/useOnlineStatus.test.ts`, `src/routes/ProfilePage.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 6), `useProfile()` (Task 7), `Profile` type (Task 7).
- Produces: `useOnlineStatus(): boolean`, consumed by `ProfilePage` here and available to later phases.

- [ ] **Step 1: Install the QR code library**

```bash
npm install qrcode.react
```

- [ ] **Step 2: Write the failing `useOnlineStatus` test**

Create `src/hooks/useOnlineStatus.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from './useOnlineStatus';

describe('useOnlineStatus', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('reflects browser offline/online events', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- src/hooks/useOnlineStatus.test.ts`
Expected: FAIL — `src/hooks/useOnlineStatus.ts` doesn't exist yet.

- [ ] **Step 4: Implement `useOnlineStatus`**

Create `src/hooks/useOnlineStatus.ts`:

```ts
import { useEffect, useState } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/hooks/useOnlineStatus.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing `ProfilePage` test**

Create `src/routes/ProfilePage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfilePage } from './ProfilePage';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
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
                created_at: '2026-01-01',
              },
              error: null,
            }),
        }),
      }),
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
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm test -- src/routes/ProfilePage.test.tsx`
Expected: FAIL — the Task 11 stub only renders placeholder text.

- [ ] **Step 8: Implement `ProfilePage`**

Replace `src/routes/ProfilePage.tsx`:

```tsx
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function ProfilePage() {
  const { session } = useAuth();
  const { data: profile, isLoading } = useProfile(session?.user.id);
  const isOnline = useOnlineStatus();

  if (isLoading) {
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
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test -- src/routes/ProfilePage.test.tsx`
Expected: PASS.

- [ ] **Step 10: Implement `PublicProfilePage`**

Replace `src/routes/PublicProfilePage.tsx`:

```tsx
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/profile';

export function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['public-profile', username],
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, created_at')
        .eq('username', username)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!username,
  });

  if (isLoading) return <div className="p-6">Loading…</div>;
  if (!profile) return <div className="p-6">No profile found for @{username}.</div>;

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <p className="text-lg font-semibold">{profile.display_name}</p>
      <p className="text-muted-foreground">@{profile.username}</p>
    </div>
  );
}
```

- [ ] **Step 11: Run the full test suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: add profile page with QR code and public profile page"
```

---

### Task 14: PWA manifest and service worker

**Files:**
- Modify: `vite.config.ts`
- Create: `public/icons/icon.svg`

**Interfaces:**
- Produces: an installable PWA — manifest + Workbox-precached service worker generated at build time by `vite-plugin-pwa`.

- [ ] **Step 1: Install `vite-plugin-pwa`**

```bash
npm install -D vite-plugin-pwa
```

- [ ] **Step 2: Add a placeholder app icon**

A single scalable SVG icon is simplest and most portable for a placeholder (no PNG-encoding tooling required); replace it with real branded icons in a later phase.

```bash
mkdir -p public/icons
```

Create `public/icons/icon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#7c3aed"/>
  <text x="256" y="300" font-family="sans-serif" font-size="220" font-weight="700"
        fill="#ffffff" text-anchor="middle">P</text>
</svg>
```

Verify it was created:

```bash
file public/icons/icon.svg
```

Expected: reports as `SVG Scalable Vector Graphics image` (or similar XML/SVG description).

- [ ] **Step 3: Configure `vite-plugin-pwa`**

Update `vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'PiMesh',
        short_name: 'PiMesh',
        description: 'Your Pi Community, Anywhere.',
        theme_color: '#7c3aed',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
```

- [ ] **Step 4: Verify the build produces a manifest and service worker**

Run: `npm run build`
Expected: exits 0, and:

```bash
ls dist/manifest.webmanifest dist/sw.js
```

both print the file paths (i.e. both files exist).

- [ ] **Step 5: Run the full test suite to confirm nothing regressed**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts public/icons/icon.svg package.json package-lock.json
git commit -m "feat: add PWA manifest and service worker via vite-plugin-pwa"
```

---

### Task 15: Vercel deployment config

**Files:**
- Create: `vercel.json`

**Interfaces:**
- Produces: SPA rewrite config so client-side routes (e.g. `/profile`, `/u/renz`) resolve correctly when Vercel serves the built app.

- [ ] **Step 1: Create the rewrite config**

Create `vercel.json`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 2: Verify the production build still succeeds**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore: add Vercel SPA rewrite config"
```

- [ ] **Step 4: Stop here — do not deploy**

Deploying to Vercel, connecting a GitHub remote, and pushing code all affect shared/external state and are **not** part of this plan's automated steps. When you're ready to go live, this is the manual sequence:

1. Push this repo to a GitHub remote (or run `npx vercel` directly from this directory).
2. Import the project in the Vercel dashboard (or accept `vercel`'s prompts).
3. In the Vercel project's Environment Variables settings, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same values from `.env.local`.
4. Once deployed, copy the Vercel deployment URL and add it under Supabase Dashboard → Authentication → URL Configuration → Redirect URLs, so magic-link emails redirect back to the live app instead of only `localhost`.

---

## Self-Review Notes

- **Spec coverage:** scaffold (Task 1), Supabase wiring (Task 4), username-based auth decoupled from email (Tasks 5, 6, 9, 10), installable PWA + offline shell caching (Task 14), offline data layer / cached reads (Tasks 7, 8), navigable shell with placeholder screens (Tasks 11, 12), profile with QR code (Task 13), deployment config (Task 15) — all Foundation-phase design sections are covered. Real feed/messaging/marketplace/news content, push notifications, search, moderation, E2E encryption, and P2P/mesh are confirmed out of scope per the design doc and intentionally have no tasks here.
- **Type consistency verified:** `useProfile(userId: string | undefined)` signature and its `{ data, isLoading }` shape are used identically in `ProtectedLayout`, `SessionOnlyLayout`, and `ProfilePage`. `Profile` type fields (`id`, `username`, `display_name`, `avatar_url`, `created_at`) match the `profiles` table columns from Task 5 and are used identically in Tasks 7 and 13. `dexiePersister`'s `Persister` interface (`persistClient`/`restoreClient`/`removeClient`) matches what `PersistQueryClientProvider` expects in Task 11's `main.tsx`.
- **No placeholders remain** other than the explicitly-scoped "Coming soon" UI text, which is a Foundation-phase design requirement, not an unfinished plan step.

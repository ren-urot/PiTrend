import { describe, it, expect, vi } from 'vitest';

describe('supabase client', () => {
  it('throws when required env vars are missing', async () => {
    // Save original values
    const originalUrl = import.meta.env.VITE_SUPABASE_URL;
    const originalKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    try {
      // Clear env vars
      delete (import.meta.env as any).VITE_SUPABASE_URL;
      delete (import.meta.env as any).VITE_SUPABASE_ANON_KEY;

      // Reset modules to force re-import with missing env vars
      vi.resetModules();

      // Now import should fail
      await expect(import('./supabase')).rejects.toThrow(
        'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables'
      );
    } finally {
      // Restore original values
      if (originalUrl) (import.meta.env as any).VITE_SUPABASE_URL = originalUrl;
      if (originalKey) (import.meta.env as any).VITE_SUPABASE_ANON_KEY = originalKey;
    }
  });
});

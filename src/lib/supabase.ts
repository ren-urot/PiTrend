import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables'
  );
}

// Implicit flow (not the default PKCE flow): PKCE requires a code_verifier
// stored in the initiating browser's localStorage before the link is ever
// clicked, which breaks any magic link opened somewhere that never made
// the original signInWithOtp call from this app — including links sent to
// a different device/browser than the one that requested them, and
// admin-generated links (Supabase Admin API's generate_link) used for
// manual testing. Implicit flow puts the session tokens directly in the
// redirect URL's hash fragment, which detectSessionInUrl (on by default)
// picks up regardless of which browser/session requested the link.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: 'implicit' },
});

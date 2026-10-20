import { createClient } from '@supabase/supabase-js';

/*
  Supabase connection. Values come from environment variables:
    - locally: a `.env.local` file in the project root (never committed)
    - on Vercel: Project Settings → Environment Variables
*/
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/*
  Login session rules (decided 19 Oct 2026):
    - The session is remembered on this computer, so a module opened from
      the Portal in a new tab doesn't ask for the password again.
    - HARD LIMIT: 12 hours after signing in, the person is signed out of
      this app on this computer, whether tabs are open or closed.
    - "Sign out" ends it immediately.
  Every app (Portal and each module) is a separate web address, so each
  keeps its own session and its own 12-hour clock.
  All storage access is wrapped because browser storage can be blocked.
*/
export const SESSION_LIMIT_MS = 12 * 60 * 60 * 1000;
const SIGNED_IN_AT_KEY = 'powerant-signed-in-at';
// Fallback when browser storage is blocked: the clock lives in memory for this tab.
let signedInAtMemory: number | null = null;

function tryGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function trySet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — session lasts until refresh.
  }
}
function tryRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}

/** Record the moment of a password sign-in (starts the 12-hour clock). */
export function markSignedIn(): void {
  signedInAtMemory = Date.now();
  trySet(SIGNED_IN_AT_KEY, String(signedInAtMemory));
}

export function clearSignedIn(): void {
  signedInAtMemory = null;
  tryRemove(SIGNED_IN_AT_KEY);
}

/**
 * True when the 12 hours are up — or when no sign-in time is recorded
 * (e.g. a session from before this rule existed), which forces a fresh sign-in.
 */
export function sessionLimitReached(): boolean {
  const at = Number(tryGet(SIGNED_IN_AT_KEY)) || signedInAtMemory;
  return !at || Date.now() - at >= SESSION_LIMIT_MS;
}

const sessionStore = {
  getItem: tryGet,
  setItem: trySet,
  removeItem: tryRemove,
};

export const supabase = createClient(
  SUPABASE_URL ?? 'http://localhost:54321',
  SUPABASE_KEY ?? 'missing-key',
  {
    auth: {
      storage: sessionStore,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

/** Shortcut for the `portal` schema (profiles, permissions, activity log). */
export const portal = () => supabase.schema('portal');

/** Turns any thrown/returned error into a readable sentence. */
export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: unknown }).message);
    if (msg) return msg;
  }
  return 'Something went wrong. Please try again.';
}

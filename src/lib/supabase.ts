import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

/**
 * SECURITY: session-scoped auth storage.
 *
 * Previously the client used supabase-js defaults (localStorage), so the
 * access/refresh token survived tab/browser/PWA restarts and users stayed
 * signed in indefinitely.
 *
 * Now the client persists the session in `sessionStorage`, which the browser
 * clears when the tab/app session ends — no beforeunload/unload handlers
 * (unreliable on mobile) required. In-app navigation and same-tab reloads
 * keep working because sessionStorage survives those; a closed tab, closed
 * browser, or fresh PWA launch starts with no session, so ProtectedRoute
 * sends the user to /login.
 */

function resolveSessionStorage(): Storage {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      // Probe: throws in some locked-down private modes.
      window.sessionStorage.getItem('__ft_probe__');
      return window.sessionStorage;
    }
  } catch {
    // fall through to in-memory fallback below
  }
  // In-memory fallback: session-scoped (or stricter), never persistent.
  const mem = new Map<string, string>();
  return {
    get length() {
      return mem.size;
    },
    clear: () => mem.clear(),
    getItem: (key: string) => (mem.has(key) ? (mem.get(key) as string) : null),
    key: (index: number) => Array.from(mem.keys())[index] ?? null,
    removeItem: (key: string) => {
      mem.delete(key);
    },
    setItem: (key: string, value: string) => {
      mem.set(key, value);
    },
  } as Storage;
}

/**
 * Remove Supabase auth tokens from a Web Storage object. Matches the
 * supabase-js v2 key shape (`sb-<project-ref>-auth-token` plus helpers
 * such as `...-code-verifier`).
 */
function clearSupabaseKeysFrom(storage: Storage | null | undefined) {
  if (!storage) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith('sb-') && key.includes('auth-token')) {
        doomed.push(key);
      }
    }
    doomed.forEach((key) => storage.removeItem(key));
  } catch {
    // Storage access can throw (private mode); nothing to clear then.
  }
}

/**
 * One-time cleanup of tokens persisted by older app versions that used
 * localStorage. Without this, a stale localStorage token would linger on
 * disk after the upgrade (the new client no longer reads it, but removing
 * it avoids any chance of resurrection and reduces token residue).
 */
function clearLegacyLocalStorageAuth() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      clearSupabaseKeysFrom(window.localStorage);
    }
  } catch {
    // ignore
  }
}

clearLegacyLocalStorageAuth();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: resolveSessionStorage(),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Immediately wipe local Supabase auth state (used on explicit sign-out). */
export function clearSupabaseAuthStorage() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      clearSupabaseKeysFrom(window.sessionStorage);
    }
  } catch {
    // ignore
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      clearSupabaseKeysFrom(window.localStorage);
    }
  } catch {
    // ignore
  }
}

// Secondary client without session persistence, used for admin-initiated
// worker sign-ups so the current admin session is not overwritten.
// Uses the anon key only (no service_role required).
export function createEphemeralClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}
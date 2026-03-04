import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// iOS Safari in private browsing throws SecurityError on any localStorage access.
// This safe adapter silently falls back to an in-memory store so the app
// continues to work — the session just won't persist across page reloads.
function makeSafeStorage(): Storage {
  try {
    localStorage.setItem("__sb_test__", "1");
    localStorage.removeItem("__sb_test__");
    return localStorage;
  } catch {
    const store = new Map<string, string>();
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    } as Storage;
  }
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: makeSafeStorage(),
    persistSession: true,
    autoRefreshToken: true,
  },
});

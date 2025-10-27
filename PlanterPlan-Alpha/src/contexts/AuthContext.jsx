import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { log, error } from '../utils/logger.js';

const AuthContext = createContext({
  session: null,
  user: null,
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialSession() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }

        if (!isMounted) return;
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
        log(
          '[AuthProvider] Loaded session for user',
          data.session?.user?.id ?? null,
        );
      } catch (err) {
        error('[AuthProvider] Failed to load initial session', err);
      }
    }

    loadInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      log('[AuthProvider] Auth state changed', nextSession?.user?.id ?? null);
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
      log('[AuthProvider] Unsubscribed from auth changes');
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user,
    }),
    [session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return ctx;
}

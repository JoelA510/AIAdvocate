import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { log, warn, error } from '../utils/logger.js';
import { useAuthContext } from '../contexts/AuthContext.jsx';

export function useProfile() {
  const { user } = useAuthContext();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function fetchProfile() {
      if (!user) {
        warn('[useProfile] Skipping fetch - no user session');
        setProfile(null);
        return;
      }

      setLoading(true);
      try {
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (fetchError) {
          throw fetchError;
        }

        if (!active) {
          return;
        }

        setProfile(data ?? null);
        log('[useProfile] Loaded profile for user', user.id);
      } catch (err) {
        error('[useProfile] Failed to load profile', err);
        if (active) {
          setProfile(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchProfile();

    return () => {
      active = false;
    };
  }, [user]);

  return { profile, loading };
}

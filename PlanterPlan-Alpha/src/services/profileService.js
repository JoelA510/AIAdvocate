import { supabase } from '../supabaseClient.js';
import { log, error } from '../utils/logger.js';

export async function upsertProfile(profile) {
  log('[profileService] Upserting profile', profile?.id ?? 'anonymous');
  const { data, error: upsertError } = await supabase
    .from('profiles')
    .upsert(profile)
    .select()
    .single();

  if (upsertError) {
    error('[profileService] Failed to upsert profile', upsertError);
    throw upsertError;
  }

  log('[profileService] Profile upsert succeeded', data?.id ?? 'unknown');
  return data;
}

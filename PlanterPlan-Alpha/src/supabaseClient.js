import { createClient } from '@supabase/supabase-js';
import { error } from './utils/logger.js';

const supabaseUrl =
  import.meta.env?.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  import.meta.env?.VITE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  error('Missing VITE_SUPABASE_URL environment variable.');
  throw new Error('VITE_SUPABASE_URL is not defined');
}

if (!supabaseAnonKey) {
  error('Missing VITE_SUPABASE_ANON_KEY environment variable.');
  throw new Error('VITE_SUPABASE_ANON_KEY is not defined');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

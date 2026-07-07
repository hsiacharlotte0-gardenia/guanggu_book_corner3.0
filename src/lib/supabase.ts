import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || 'https://dabfrdnhwymclbokeigd.supabase.co';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_owiRdRdjrCImgHBbSDm9dg_-D5eurZp';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);


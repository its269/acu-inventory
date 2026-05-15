import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log("[Supabase Config]", { 
    urlFound: !!supabaseUrl, 
    keyFound: !!supabaseAnonKey,
    nodeEnv: process.env.NODE_ENV 
});

if (!supabaseUrl || !supabaseAnonKey) {
    // Return a dummy client or throw a more descriptive error during dev
    if (process.env.NODE_ENV === 'development') {
        console.warn("⚠️ SUPABASE CREDENTIALS MISSING. Check your .env.local file and RESTART your terminal.");
    }
}

export const supabase = (supabaseUrl && supabaseAnonKey) 
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

export const supabase = (supabaseUrl && supabaseAnonKey) 
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export const supabaseAdmin = (supabaseUrl && (supabaseSecretKey || supabaseAnonKey))
    ? createClient(supabaseUrl, supabaseSecretKey || supabaseAnonKey)
    : null;

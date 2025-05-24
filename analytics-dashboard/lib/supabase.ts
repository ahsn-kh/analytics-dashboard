// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Ensure these environment variables are set in your .env.local file
const supabaseUrl = process.env.NEXT_PUBLIC_SUPA_URL; // No '!' if you want TypeScript to allow undefined
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPA_KEY; // No '!' if you want TypeScript to allow undefined

// Add checks to ensure the environment variables are defined
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and Anon Key are required environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
// src/lib/supabase.ts
// Supabase client for Astro on Netlify
// Environment variables are set in Netlify dashboard

import { createClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';

// These environment variables are set in Netlify
const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check Netlify dashboard.');
}

// Basic client for general use
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client with cookie management for SSR
export function createServerClient(cookies: AstroCookies) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
    },
    global: {
      headers: {
        'x-client-info': 'astro-netlify',
      },
    },
  });
}

// Get session from cookies
export async function getSession(cookies: AstroCookies) {
  const accessToken = cookies.get('sb-access-token')?.value;
  const refreshToken = cookies.get('sb-refresh-token')?.value;

  if (!accessToken || !refreshToken) {
    return null;
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    return null;
  }

  return data.session;
}

// Check if user is admin
export async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('admins')
    .select('id')
    .eq('auth_id', userId)
    .single();

  return !error && !!data;
}

// Check if user is creator
export async function isCreator(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('creators')
    .select('id')
    .eq('id', userId)
    .single();

  return !error && !!data;
}

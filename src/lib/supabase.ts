// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';

const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
}

// --------------------------------------------------
// Clients
// --------------------------------------------------

// Public client (RLS enforced)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client (bypasses RLS – SERVER ONLY)
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : supabase;

// --------------------------------------------------
// Auth Helpers
// --------------------------------------------------

export async function getSession(cookies: AstroCookies) {
  const accessToken = cookies.get('sb-access-token')?.value;
  const refreshToken = cookies.get('sb-refresh-token')?.value;

  if (!accessToken || !refreshToken) return null;

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    console.error('Session error:', error.message);
    return null;
  }

  return data.session;
}

export function setAuthCookies(
  cookies: AstroCookies,
  accessToken: string,
  refreshToken: string
) {
  const options = {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7,
  };

  cookies.set('sb-access-token', accessToken, options);
  cookies.set('sb-refresh-token', refreshToken, options);
}

export function clearAuthCookies(cookies: AstroCookies) {
  cookies.delete('sb-access-token', { path: '/' });
  cookies.delete('sb-refresh-token', { path: '/' });
}

// --------------------------------------------------
// Admin Access Check (SERVICE ROLE)
// --------------------------------------------------

export async function hasAdminAccess(userId: string): Promise<{
  isAdmin: boolean;
  isModerator: boolean;
  profile: any;
}> {
  // Admins table (service role)
  const { data: adminRecord, error: adminError } = await supabaseAdmin
    .from('admins')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (adminError) {
    console.error('Admin table error:', adminError.message);
  }

  // Profile (service role)
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profileError) {
    console.error('Profile fetch error:', profileError.message);
  }

  const isAdmin = !!adminRecord || profile?.role === 'admin';
  const isModerator = profile?.role === 'moderator';

  return { isAdmin, isModerator, profile };
}

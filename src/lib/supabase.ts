// src/lib/supabase.ts
// Supabase client for Astro on Netlify
// Role-based access via profiles.role (NO admins / creators tables)

import { createClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';

// Environment variables (Netlify)
const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
}

// --------------------------------------------------
// Clients
// --------------------------------------------------

// Public client (respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client (bypasses RLS – use ONLY server-side)
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
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };

  cookies.set('sb-access-token', accessToken, options);
  cookies.set('sb-refresh-token', refreshToken, options);
}

export function clearAuthCookies(cookies: AstroCookies) {
  cookies.delete('sb-access-token', { path: '/' });
  cookies.delete('sb-refresh-token', { path: '/' });
}

// --------------------------------------------------
// Profile & Role Helpers (SOURCE OF TRUTH)
// --------------------------------------------------

export async function getUserProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Profile fetch error:', error.message);
    return null;
  }

  return data;
}

// --------------------------------------------------
// Role Checks (NO extra tables)
// --------------------------------------------------

export async function isAdmin(userId: string): Promise<boolean> {
  const profile = await getUserProfile(userId);
  return profile?.role === 'admin';
}

export async function isManager(userId: string): Promise<boolean> {
  const profile = await getUserProfile(userId);
  return profile?.role === 'manager' || profile?.role === 'admin';
}

export async function isModerator(userId: string): Promise<boolean> {
  const profile = await getUserProfile(userId);
  return profile?.role === 'moderator' || profile?.role === 'admin';
}

export async function isCreator(userId: string): Promise<boolean> {
  const profile = await getUserProfile(userId);
  return profile?.role === 'creator';
}

// --------------------------------------------------
// Admin Portal Access Check (combines admins table + profile role)
// --------------------------------------------------
export async function hasAdminAccess(userId: string): Promise<{ 
  isAdmin: boolean; 
  isModerator: boolean; 
  profile: any;
}> {
  // Check admins table
  const { data: adminRecord } = await supabase
    .from('admins')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  // Get profile
  const profile = await getUserProfile(userId);

  const isAdmin = !!adminRecord || profile?.role === 'admin';
  const isModerator = profile?.role === 'moderator';

  return { isAdmin, isModerator, profile };
}

// src/lib/auth.ts
// Authentication helpers for Astro on Netlify

import { supabase } from './supabase';
import type { AstroCookies } from 'astro';

export interface User {
  id: string;
  email: string;
  name?: string;
}

export interface AuthSession {
  user: User;
  isAdmin: boolean;
  isCreator: boolean;
}

/**
 * Get current session from cookies
 */
export async function getSessionFromCookies(cookies: AstroCookies): Promise<AuthSession | null> {
  const accessToken = cookies.get('sb-access-token')?.value;
  const refreshToken = cookies.get('sb-refresh-token')?.value;

  if (!accessToken || !refreshToken) {
    return null;
  }

  try {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      return null;
    }

    const user = data.session.user;

    // Check if admin
    const { data: adminData } = await supabase
      .from('admins')
      .select('id')
      .eq('auth_id', user.id)
      .single();

    // Check if creator
    const { data: creatorData } = await supabase
      .from('creators')
      .select('id')
      .eq('id', user.id)
      .single();

    return {
      user: {
        id: user.id,
        email: user.email || '',
        name: user.user_metadata?.name,
      },
      isAdmin: !!adminData,
      isCreator: !!creatorData,
    };
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
}

/**
 * Require authentication - redirect if not logged in
 */
export async function requireAuth(cookies: AstroCookies, redirectTo: string = '/login') {
  const session = await getSessionFromCookies(cookies);
  
  if (!session) {
    return { redirect: redirectTo };
  }
  
  return { session };
}

/**
 * Require admin - redirect if not admin
 */
export async function requireAdmin(cookies: AstroCookies, redirectTo: string = '/') {
  const session = await getSessionFromCookies(cookies);
  
  if (!session || !session.isAdmin) {
    return { redirect: redirectTo };
  }
  
  return { session };
}

/**
 * Require creator - redirect if not creator
 */
export async function requireCreator(cookies: AstroCookies, redirectTo: string = '/login') {
  const session = await getSessionFromCookies(cookies);
  
  if (!session || !session.isCreator) {
    return { redirect: redirectTo };
  }
  
  return { session };
}

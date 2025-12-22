// src/lib/auth.ts
import type { AstroCookies } from 'astro';
import { supabase } from './supabase'; // ensure this path is correct

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
 * Check if a user is an admin
 */
export async function isAdmin(userId: string): Promise<boolean> {
  if (!userId) return false;

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data) return false;

  return data.role === 'admin';
}

/**
 * Check if a user is a creator
 */
export async function isCreator(userId: string): Promise<boolean> {
  if (!userId) return false;

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data) return false;

  return data.role === 'creator';
}

/**
 * Get current authenticated session from cookies
 */
export async function getAuthSession(cookies: AstroCookies): Promise<AuthSession | null> {
  // Replace with your actual Supabase auth session retrieval
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const user = session.user;

  const [adminCheck, creatorCheck] = await Promise.all([
    isAdmin(user.id),
    isCreator(user.id),
  ]);

  return {
    user: {
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.name,
    },
    isAdmin: adminCheck,
    isCreator: creatorCheck,
  };
}

/**
 * Alias for backwards compatibility
 */
export const getSessionFromCookies = getAuthSession;

/**
 * Require authentication - returns session or throws
 */
export async function requireAuth(cookies: AstroCookies): Promise<AuthSession> {
  const session = await getAuthSession(cookies);
  if (!session) throw new Error('Unauthorized');
  return session;
}

/**
 * Require admin role
 */
export async function requireAdmin(cookies: AstroCookies): Promise<AuthSession> {
  const session = await getAuthSession(cookies);
  if (!session || !session.isAdmin) throw new Error('Unauthorized');
  return session;
}

/**
 * Require creator role
 */
export async function requireCreator(cookies: AstroCookies): Promise<AuthSession> {
  const session = await getAuthSession(cookies);
  if (!session || !session.isCreator) throw new Error('Unauthorized');
  return session;
}

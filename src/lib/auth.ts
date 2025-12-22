// src/lib/auth.ts
// Authentication helpers for Astro pages

import type { AstroCookies } from 'astro';
import { supabase } from './supabase'; // make sure the path is correct

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
export const getSessionFromCookies = getAuthSession;

/**
 * Get current authenticated session from cookies
 */
export async function getAuthSession(cookies: AstroCookies): Promise<AuthSession | null> {
  // Replace with your actual getSession logic
  const session = await supabase.auth.getSession(); // or your wrapper
  if (!session) return null;

  const user = session.user;
  const [adminCheck, creatorCheck] = await Promise.all([
    isAdmin(user.id),
    isCreator(user.id),
  ]);

  return {
    user: { id: user.id, email: user.email || '', name: user.user_metadata?.name },
    isAdmin: adminCheck,
    isCreator: creatorCheck,
  };
}

/**
 * Require authentication
 */
export async function requireAuth(cookies: AstroCookies): Promise<AuthSession> {
  const session = await getAuthSession(cookies);
  if (!session) throw new Error('Unauthorized'); // page handles redirect
  return session;
}

/**
 * Require admin role
 */
export async function requireAdminRole(cookies: AstroCookies): Promise<AuthSession> {
  const session = await getAuthSession(cookies);
  if (!session || !session.isAdmin) throw new Error('Unauthorized');
  return session;
}

/**
 * Require creator role
 */
export async function requireCreatorRole(cookies: AstroCookies): Promise<AuthSession> {
  const session = await getAuthSession(cookies);
  if (!session || !session.isCreator) throw new Error('Unauthorized');
  return session;
}

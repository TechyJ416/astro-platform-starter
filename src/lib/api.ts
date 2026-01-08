// src/lib/api.ts
// Core API utilities for Banity
// Deploy to: src/lib/api.ts

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { APIContext } from 'astro';

// ============================================================================
// TYPES
// ============================================================================

export interface ApiUser {
  id: string;
  email: string;
  role: 'creator' | 'manager' | 'admin' | 'moderator';
  full_name?: string;
  creator_level?: number;
  payment_multiplier?: number;
}

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ============================================================================
// SUPABASE CLIENTS
// ============================================================================

let supabaseClient: SupabaseClient | null = null;
let supabaseAdmin: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(
      import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return supabaseClient;
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(
      import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.SUPABASE_SERVICE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return supabaseAdmin;
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

export function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export function error(message: string, status = 400): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const unauthorized = (msg = 'Unauthorized') => error(msg, 401);
export const forbidden = (msg = 'Forbidden') => error(msg, 403);
export const notFound = (msg = 'Not found') => error(msg, 404);
export const badRequest = (msg = 'Bad request') => error(msg, 400);
export const serverError = (msg = 'Server error') => error(msg, 500);

// ============================================================================
// AUTHENTICATION
// ============================================================================

export async function getUser(context: APIContext): Promise<ApiUser | null> {
  const supabase = getSupabase();
  const admin = getSupabaseAdmin();
  
  // Try Authorization header first (API calls)
  const authHeader = context.request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (user && !authError) {
      const { data: profile } = await admin
        .from('profiles')
        .select('id, email, role, full_name, creator_level, payment_multiplier')
        .eq('id', user.id)
        .is('deleted_at', null)
        .single();
      if (profile) return profile as ApiUser;
    }
  }
  
  // Try cookies (SSR pages)
  const accessToken = context.cookies.get('sb-access-token')?.value;
  const refreshToken = context.cookies.get('sb-refresh-token')?.value;
  
  if (accessToken) {
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (user && !authError) {
      const { data: profile } = await admin
        .from('profiles')
        .select('id, email, role, full_name, creator_level, payment_multiplier')
        .eq('id', user.id)
        .is('deleted_at', null)
        .single();
      if (profile) return profile as ApiUser;
    }
    
    // Try refresh
    if (refreshToken) {
      const { data: session } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (session?.user) {
        const { data: profile } = await admin
          .from('profiles')
          .select('id, email, role, full_name, creator_level, payment_multiplier')
          .eq('id', session.user.id)
          .is('deleted_at', null)
          .single();
        if (profile) return profile as ApiUser;
      }
    }
  }
  
  return null;
}

export async function requireAuth(context: APIContext): Promise<ApiUser | Response> {
  const user = await getUser(context);
  return user || unauthorized();
}

export async function requireAdmin(context: APIContext): Promise<ApiUser | Response> {
  const user = await getUser(context);
  if (!user) return unauthorized();
  if (user.role !== 'admin') return forbidden('Admin access required');
  return user;
}

export async function requireRole(context: APIContext, roles: string[]): Promise<ApiUser | Response> {
  const user = await getUser(context);
  if (!user) return unauthorized();
  if (!roles.includes(user.role)) return forbidden(`Required role: ${roles.join(' or ')}`);
  return user;
}

export async function requireManager(context: APIContext): Promise<ApiUser | Response> {
  return requireRole(context, ['manager', 'admin']);
}

export async function requireCreator(context: APIContext): Promise<ApiUser | Response> {
  return requireRole(context, ['creator', 'admin']);
}

// ============================================================================
// REQUEST PARSING
// ============================================================================

export async function parseBody<T>(request: Request): Promise<T | null> {
  try {
    const text = await request.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function getParams(context: APIContext): Record<string, string> {
  return context.params as Record<string, string>;
}

export function getQuery(context: APIContext): URLSearchParams {
  return new URL(context.request.url).searchParams;
}

// ============================================================================
// VALIDATION
// ============================================================================

export function validateRequired(obj: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = obj[field];
    if (value === undefined || value === null || value === '') {
      return `Missing required field: ${field}`;
    }
  }
  return null;
}

export function validateUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateUrl(url: string): boolean {
  try { new URL(url); return true; } catch { return false; }
}

export function detectPlatform(url: string): string {
  const u = url.toLowerCase();
  if (u.includes('instagram.com') || u.includes('instagr.am')) return 'instagram';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
  if (u.includes('facebook.com') || u.includes('fb.com')) return 'facebook';
  if (u.includes('linkedin.com')) return 'linkedin';
  return 'other';
}

export function extractPostId(url: string, platform: string): string | null {
  try {
    const u = new URL(url);
    const path = u.pathname;
    switch (platform) {
      case 'instagram':
        const igMatch = path.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
        return igMatch ? igMatch[2] : null;
      case 'tiktok':
        const ttMatch = path.match(/\/video\/(\d+)/);
        return ttMatch ? ttMatch[1] : null;
      case 'youtube':
        if (u.hostname === 'youtu.be') return path.slice(1);
        return u.searchParams.get('v');
      case 'twitter':
        const twMatch = path.match(/\/status\/(\d+)/);
        return twMatch ? twMatch[1] : null;
      default:
        return null;
    }
  } catch { return null; }
}

// ============================================================================
// PAGINATION
// ============================================================================

export function getPagination(context: APIContext, defaultLimit = 20, maxLimit = 100): PaginationParams {
  const query = getQuery(context);
  const page = Math.max(1, parseInt(query.get('page') || '1'));
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.get('limit') || String(defaultLimit))));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function paginate<T>(items: T[], total: number, params: PaginationParams): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / params.limit);
  return {
    items,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1
    }
  };
}

// ============================================================================
// JOB QUEUE
// ============================================================================

export type JobType = 'capture_submission' | 'monitor_submission' | 'send_email' | 'send_push' | 'process_payment';

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  options?: { priority?: number; scheduledFor?: Date }
): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data, error: err } = await admin
    .from('job_queue')
    .insert({
      job_type: type,
      payload,
      priority: options?.priority || 0,
      scheduled_for: options?.scheduledFor?.toISOString() || new Date().toISOString()
    })
    .select('id')
    .single();
  
  if (err) { console.error('Failed to enqueue job:', err); return null; }
  return data.id;
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export type NotificationType = 'application_received' | 'application_accepted' | 'application_rejected' | 
  'submission_received' | 'submission_approved' | 'submission_rejected' | 'payment_sent' | 'level_up';

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body?: string,
  data?: Record<string, unknown>,
  actionUrl?: string
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  
  const { error: err } = await admin
    .from('notifications')
    .insert({ user_id: userId, type, title, body, data: data || {}, action_url: actionUrl });
  
  if (err) { console.error('Failed to create notification:', err); return false; }
  
  // Queue push if user has token
  const { data: profile } = await admin
    .from('profiles')
    .select('push_token, push_enabled')
    .eq('id', userId)
    .single();
  
  if (profile?.push_token && profile?.push_enabled) {
    await enqueueJob('send_push', { userId, token: profile.push_token, title, body, data });
  }
  
  return true;
}

// ============================================================================
// LEVEL SYSTEM
// ============================================================================

export async function addCreatorExp(userId: string, amount: number, reason: string): Promise<void> {
  const admin = getSupabaseAdmin();
  
  const { data: profile } = await admin
    .from('profiles')
    .select('creator_exp, creator_level')
    .eq('id', userId)
    .single();
  
  if (!profile) return;
  
  const oldLevel = profile.creator_level || 1;
  const newExp = (profile.creator_exp || 0) + amount;
  
  await admin.from('profiles').update({ creator_exp: newExp }).eq('id', userId);
  
  // Check for level up
  const { data: newProfile } = await admin
    .from('profiles')
    .select('creator_level')
    .eq('id', userId)
    .single();
  
  if (newProfile && newProfile.creator_level > oldLevel) {
    const { data: levelInfo } = await admin
      .from('level_titles')
      .select('title')
      .eq('level', newProfile.creator_level)
      .single();
    
    await createNotification(
      userId, 'level_up', 'Level Up!',
      `Congratulations! You've reached ${levelInfo?.title || `Level ${newProfile.creator_level}`}`,
      { new_level: newProfile.creator_level }
    );
  }
}

// ============================================================================
// SANITIZATION
// ============================================================================

export function sanitizeString(str: string, maxLength = 1000): string {
  return str.trim().slice(0, maxLength).replace(/<[^>]*>/g, '');
}

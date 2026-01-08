// src/pages/api/v1/campaigns/index.ts
// Deploy to: src/pages/api/v1/campaigns/index.ts

import type { APIContext } from 'astro';
import {
  requireAuth, requireManager, json, error, badRequest,
  getSupabaseAdmin, parseBody, validateRequired,
  getPagination, paginate, getQuery, sanitizeString
} from '../../../../lib/api';

export const prerender = false;

// GET /api/v1/campaigns - List campaigns
export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  
  const supabase = getSupabaseAdmin();
  const query = getQuery(context);
  const pagination = getPagination(context);
  
  const status = query.get('status');
  const platform = query.get('platform');
  const search = query.get('search');
  
  let dbQuery = supabase
    .from('campaigns')
    .select(`
      id, title, description, platform, content_type,
      budget_total, budget_per_creator,
      start_date, end_date, application_deadline,
      status, max_creators, filled_slots, cover_image,
      created_at, published_at,
      manager:profiles!campaigns_manager_id_fkey(id, full_name, username, avatar_url)
    `, { count: 'exact' });
  
  // Role-based visibility
  if (auth.role === 'creator') {
    // Creators see active campaigns or ones they applied to
    const { data: appliedIds } = await supabase
      .from('applications')
      .select('campaign_id')
      .eq('creator_id', auth.id);
    
    const ids = appliedIds?.map(a => a.campaign_id) || [];
    if (ids.length > 0) {
      dbQuery = dbQuery.or(`status.eq.active,id.in.(${ids.join(',')})`);
    } else {
      dbQuery = dbQuery.eq('status', 'active');
    }
  } else if (auth.role === 'manager') {
    dbQuery = dbQuery.eq('manager_id', auth.id);
  }
  // Admins see all
  
  if (status) dbQuery = dbQuery.eq('status', status);
  if (platform) dbQuery = dbQuery.contains('platform', [platform]);
  if (search) dbQuery = dbQuery.ilike('title', `%${search}%`);
  
  dbQuery = dbQuery
    .order('created_at', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);
  
  const { data: campaigns, error: err, count } = await dbQuery;
  
  if (err) return error(err.message, 500);
  return json(paginate(campaigns || [], count || 0, pagination));
}

// POST /api/v1/campaigns - Create campaign
export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireManager(context);
  if (auth instanceof Response) return auth;
  
  const body = await parseBody<{
    title: string;
    description?: string;
    brief?: string;
    platform?: string[];
    content_type?: string;
    budget_total?: number;
    budget_per_creator?: number;
    start_date?: string;
    end_date?: string;
    application_deadline?: string;
    max_creators?: number;
    cover_image?: string;
  }>(context.request);
  
  if (!body) return badRequest('Invalid request body');
  
  const validationError = validateRequired(body, ['title']);
  if (validationError) return badRequest(validationError);
  
  const supabase = getSupabaseAdmin();
  
  const { data: campaign, error: err } = await supabase
    .from('campaigns')
    .insert({
      manager_id: auth.id,
      title: sanitizeString(body.title, 200),
      description: body.description ? sanitizeString(body.description, 2000) : null,
      brief: body.brief ? sanitizeString(body.brief, 10000) : null,
      platform: body.platform || [],
      content_type: body.content_type || 'any',
      budget_total: body.budget_total,
      budget_per_creator: body.budget_per_creator,
      start_date: body.start_date,
      end_date: body.end_date,
      application_deadline: body.application_deadline,
      max_creators: body.max_creators || 10,
      cover_image: body.cover_image,
      status: 'draft'
    })
    .select()
    .single();
  
  if (err) return error(err.message, 500);
  return json(campaign, 201);
}

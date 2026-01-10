// src/pages/api/v1/applications/index.ts
import type { APIContext } from 'astro';
import {
  requireAuth, json, error, badRequest, notFound,
  getSupabaseAdmin, parseBody, validateRequired,
  getPagination, paginate, getQuery, createNotification
} from '../../../../lib/api';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  
  const supabase = getSupabaseAdmin();
  const query = getQuery(context);
  const pagination = getPagination(context);
  
  let dbQuery = supabase
    .from('applications')
    .select(`*, campaign:campaigns(id, title), creator:profiles!applications_creator_id_fkey(id, full_name, username, avatar_url)`, { count: 'exact' });
  
  if (auth.role === 'creator') {
    dbQuery = dbQuery.eq('creator_id', auth.id);
  } else if (auth.role === 'manager') {
    const { data: campaigns } = await supabase.from('campaigns').select('id').eq('manager_id', auth.id);
    const ids = campaigns?.map(c => c.id) || [];
    if (ids.length > 0) {
      dbQuery = dbQuery.in('campaign_id', ids);
    } else {
      return json(paginate([], 0, pagination));
    }
  }
  
  const campaignId = query.get('campaign_id');
  if (campaignId) dbQuery = dbQuery.eq('campaign_id', campaignId);
  
  const status = query.get('status');
  if (status) dbQuery = dbQuery.eq('status', status);
  
  dbQuery = dbQuery.order('created_at', { ascending: false }).range(pagination.offset, pagination.offset + pagination.limit - 1);
  
  const { data, error: err, count } = await dbQuery;
  if (err) return error(err.message, 500);
  
  return json(paginate(data || [], count || 0, pagination));
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  
  if (auth.role !== 'creator' && auth.role !== 'admin') {
    return error('Only creators can apply', 403);
  }
  
  const body = await parseBody<{ campaign_id: string; pitch?: string; proposed_content?: string; proposed_rate?: number }>(context.request);
  if (!body) return badRequest('Invalid body');
  
  const validationError = validateRequired(body, ['campaign_id']);
  if (validationError) return badRequest(validationError);
  
  const supabase = getSupabaseAdmin();
  
  const { data: campaign } = await supabase.from('campaigns').select('id, manager_id, status, title').eq('id', body.campaign_id).single();
  if (!campaign) return notFound('Campaign not found');
  if (campaign.status !== 'active') return badRequest('Campaign not active');
  
  // Check existing application
  const { data: existing } = await supabase.from('applications').select('id').eq('campaign_id', body.campaign_id).eq('creator_id', auth.id).single();
  if (existing) return badRequest('Already applied');
  
  const { data, error: err } = await supabase
    .from('applications')
    .insert({
      campaign_id: body.campaign_id,
      creator_id: auth.id,
      pitch: body.pitch,
      proposed_content: body.proposed_content,
      proposed_rate: body.proposed_rate,
      status: 'pending'
    })
    .select()
    .single();
  
  if (err) return error(err.message, 500);
  
  await createNotification(campaign.manager_id, 'application_received', 'New Application', `New application for "${campaign.title}"`);
  
  return json(data, 201);
}

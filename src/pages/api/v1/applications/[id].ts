// src/pages/api/v1/applications/[id].ts
import type { APIContext } from 'astro';
import {
  requireAuth, json, error, badRequest, notFound, forbidden,
  getSupabaseAdmin, parseBody, validateUUID, getParams,
  createNotification, addCreatorExp
} from '../../../../lib/api';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  
  const { id } = getParams(context);
  if (!validateUUID(id)) return badRequest('Invalid ID');
  
  const supabase = getSupabaseAdmin();
  const { data: app, error: err } = await supabase
    .from('applications')
    .select(`*, campaign:campaigns(id, title, manager_id), creator:profiles!applications_creator_id_fkey(id, full_name, username, avatar_url, creator_level)`)
    .eq('id', id)
    .single();
  
  if (err || !app) return notFound('Not found');
  
  const canAccess = app.creator_id === auth.id || app.campaign.manager_id === auth.id || auth.role === 'admin';
  if (!canAccess) return forbidden();
  
  return json(app);
}

export async function PUT(context: APIContext): Promise<Response> {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  
  const { id } = getParams(context);
  if (!validateUUID(id)) return badRequest('Invalid ID');
  
  const body = await parseBody<{ status?: string; rejection_reason?: string }>(context.request);
  if (!body) return badRequest('Invalid body');
  
  const supabase = getSupabaseAdmin();
  const { data: app } = await supabase.from('applications').select('*, campaign:campaigns(id, title, manager_id)').eq('id', id).single();
  
  if (!app) return notFound('Not found');
  
  const canUpdate = app.campaign.manager_id === auth.id || auth.role === 'admin';
  if (!canUpdate) return forbidden();
  
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  
  if (body.status === 'accepted') {
    update.status = 'accepted';
    update.reviewed_at = new Date().toISOString();
    update.reviewed_by = auth.id;
    
    await createNotification(app.creator_id, 'application_accepted', 'Application Accepted!', `Your application for "${app.campaign.title}" was accepted`);
    await addCreatorExp(app.creator_id, 25);
    
    // Update campaign filled slots
    const { data: campaign } = await supabase.from('campaigns').select('filled_slots').eq('id', app.campaign_id).single();
    if (campaign) {
      await supabase.from('campaigns').update({ filled_slots: (campaign.filled_slots || 0) + 1 }).eq('id', app.campaign_id);
    }
  }
  
  if (body.status === 'rejected') {
    update.status = 'rejected';
    update.rejection_reason = body.rejection_reason || 'Not accepted';
    update.reviewed_at = new Date().toISOString();
    update.reviewed_by = auth.id;
    
    await createNotification(app.creator_id, 'application_rejected', 'Application Not Accepted', `Your application for "${app.campaign.title}" was not accepted`);
  }
  
  const { data, error: err } = await supabase.from('applications').update(update).eq('id', id).select().single();
  if (err) return error(err.message, 500);
  
  return json(data);
}

// src/pages/api/v1/submissions/index.ts
// Deploy to: src/pages/api/v1/submissions/index.ts

import type { APIContext } from 'astro';
import {
  requireAuth, requireCreator, json, error, badRequest, notFound,
  getSupabaseAdmin, parseBody, validateRequired, validateUrl,
  detectPlatform, extractPostId, getPagination, paginate, getQuery,
  enqueueJob, createNotification, addCreatorExp
} from '../../../../lib/api';

export const prerender = false;

// GET /api/v1/submissions - List submissions
export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  
  const supabase = getSupabaseAdmin();
  const query = getQuery(context);
  const pagination = getPagination(context);
  
  const campaignId = query.get('campaign_id');
  const status = query.get('status');
  const platform = query.get('platform');
  
  let dbQuery = supabase
    .from('submissions')
    .select(`
      id, platform, url, post_id, content_type, status,
      payment_status, payment_amount,
      latest_views, latest_likes, latest_comments, latest_shares,
      submitted_at, created_at,
      campaign:campaigns(id, title),
      creator:profiles!submissions_creator_id_fkey(id, full_name, username, avatar_url)
    `, { count: 'exact' });
  
  // Role-based filtering
  if (auth.role === 'creator') {
    dbQuery = dbQuery.eq('creator_id', auth.id);
  } else if (auth.role === 'manager') {
    // Get manager's campaign IDs
    const { data: managerCampaigns } = await supabase
      .from('campaigns')
      .select('id')
      .eq('manager_id', auth.id);
    
    const campaignIds = managerCampaigns?.map(c => c.id) || [];
    if (campaignIds.length > 0) {
      dbQuery = dbQuery.in('campaign_id', campaignIds);
    } else {
      return json(paginate([], 0, pagination));
    }
  }
  // Admins see all
  
  if (campaignId) dbQuery = dbQuery.eq('campaign_id', campaignId);
  if (status) dbQuery = dbQuery.eq('status', status);
  if (platform) dbQuery = dbQuery.eq('platform', platform);
  
  dbQuery = dbQuery
    .order('created_at', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);
  
  const { data: submissions, error: err, count } = await dbQuery;
  
  if (err) return error(err.message, 500);
  return json(paginate(submissions || [], count || 0, pagination));
}

// POST /api/v1/submissions - Create submission (submit content link)
export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;
  
  const body = await parseBody<{
    campaign_id: string;
    url: string;
    content_type?: string;
    caption?: string;
  }>(context.request);
  
  if (!body) return badRequest('Invalid request body');
  
  const validationError = validateRequired(body, ['campaign_id', 'url']);
  if (validationError) return badRequest(validationError);
  
  if (!validateUrl(body.url)) return badRequest('Invalid URL');
  
  const supabase = getSupabaseAdmin();
  
  // Verify campaign exists and is active
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, manager_id, status, title')
    .eq('id', body.campaign_id)
    .single();
  
  if (!campaign) return notFound('Campaign not found');
  if (campaign.status !== 'active') return badRequest('Campaign is not active');
  
  // Verify creator has accepted application
  const { data: application } = await supabase
    .from('applications')
    .select('id, status')
    .eq('campaign_id', body.campaign_id)
    .eq('creator_id', auth.id)
    .single();
  
  if (!application || application.status !== 'accepted') {
    return badRequest('You must have an accepted application to submit content');
  }
  
  // Detect platform and extract post ID
  const platform = detectPlatform(body.url);
  const postId = extractPostId(body.url, platform);
  
  // Create submission
  const { data: submission, error: err } = await supabase
    .from('submissions')
    .insert({
      campaign_id: body.campaign_id,
      creator_id: auth.id,
      application_id: application.id,
      platform,
      url: body.url,
      post_id: postId,
      content_type: body.content_type || 'post',
      caption: body.caption,
      status: 'pending'
    })
    .select()
    .single();
  
  if (err) return error(err.message, 500);
  
  // Create monitoring schedule (30 days)
  await supabase
    .from('monitoring_schedule')
    .insert({
      submission_id: submission.id,
      next_check_at: new Date().toISOString(),
      check_interval_hours: 24,
      checks_remaining: 30
    });
  
  // Queue capture job
  await enqueueJob('capture_submission', {
    submission_id: submission.id,
    url: body.url,
    platform,
    capture_type: 'initial'
  }, { priority: 10 });
  
  // Notify manager
  await createNotification(
    campaign.manager_id,
    'submission_received',
    'New Submission',
    `A creator submitted content for "${campaign.title}"`,
    { campaign_id: campaign.id, submission_id: submission.id },
    `/manager/campaigns/${campaign.id}/submissions`
  );
  
  // Award EXP
  await addCreatorExp(auth.id, 10, 'Content submission');
  
  return json(submission, 201);
}

// src/pages/api/v1/submissions/[id].ts
// Deploy to: src/pages/api/v1/submissions/[id].ts

import type { APIContext } from 'astro';
import {
  requireAuth, json, error, badRequest, notFound, forbidden,
  getSupabaseAdmin, parseBody, validateUUID, getParams,
  createNotification, addCreatorExp, enqueueJob
} from '../../../../lib/api';

export const prerender = false;

// GET /api/v1/submissions/:id - Get single submission
export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  
  const { id } = getParams(context);
  if (!id || !validateUUID(id)) return badRequest('Invalid submission ID');
  
  const supabase = getSupabaseAdmin();
  
  const { data: submission, error: err } = await supabase
    .from('submissions')
    .select(`
      *,
      campaign:campaigns(id, title, manager_id, budget_per_creator),
      creator:profiles!submissions_creator_id_fkey(id, full_name, username, avatar_url),
      captures:submission_captures(
        id, capture_type, screenshot_url, thumbnail_url,
        views, likes, comments, shares, saves, is_live, captured_at
      ),
      metrics:submission_metrics(views, likes, comments, shares, recorded_at)
    `)
    .eq('id', id)
    .single();
  
  if (err || !submission) return notFound('Submission not found');
  
  // Check access
  const isOwner = submission.creator_id === auth.id;
  const isManager = submission.campaign.manager_id === auth.id;
  const isAdmin = auth.role === 'admin';
  
  if (!isOwner && !isManager && !isAdmin) {
    return forbidden('You do not have access to this submission');
  }
  
  return json(submission);
}

// PUT /api/v1/submissions/:id - Update submission (approve/reject)
export async function PUT(context: APIContext): Promise<Response> {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  
  const { id } = getParams(context);
  if (!id || !validateUUID(id)) return badRequest('Invalid submission ID');
  
  const body = await parseBody<{
    status?: 'approved' | 'rejected' | 'in_review';
    rejection_reason?: string;
    payment_amount?: number;
  }>(context.request);
  
  if (!body) return badRequest('Invalid request body');
  
  const supabase = getSupabaseAdmin();
  
  // Get submission with campaign
  const { data: submission } = await supabase
    .from('submissions')
    .select('*, campaign:campaigns(id, title, manager_id, budget_per_creator)')
    .eq('id', id)
    .single();
  
  if (!submission) return notFound('Submission not found');
  
  // Check permissions
  const isManager = submission.campaign.manager_id === auth.id;
  const isAdmin = auth.role === 'admin';
  
  if (!isManager && !isAdmin) {
    return forbidden('Only the campaign manager can update submissions');
  }
  
  // Build update
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  
  if (body.status) {
    updateData.status = body.status;
    
    if (body.status === 'approved') {
      updateData.verified_at = new Date().toISOString();
      updateData.verified_by = auth.id;
      updateData.payment_status = 'approved';
      updateData.payment_amount = body.payment_amount || submission.campaign.budget_per_creator;
      
      // Notify creator
      await createNotification(
        submission.creator_id, 'submission_approved', 'Submission Approved!',
        `Your submission for "${submission.campaign.title}" has been approved.`,
        { submission_id: id, campaign_id: submission.campaign_id },
        `/creator/submissions/${id}`
      );
      
      await addCreatorExp(submission.creator_id, 50, 'Submission approved');
      
      // Queue payment
      await enqueueJob('process_payment', {
        submission_id: id,
        creator_id: submission.creator_id,
        amount: updateData.payment_amount
      });
      
      // Stop monitoring
      await supabase
        .from('monitoring_schedule')
        .update({ is_active: false })
        .eq('submission_id', id);
    }
    
    if (body.status === 'rejected') {
      updateData.rejection_reason = body.rejection_reason || 'No reason provided';
      updateData.verified_at = new Date().toISOString();
      updateData.verified_by = auth.id;
      
      await createNotification(
        submission.creator_id, 'submission_rejected', 'Submission Rejected',
        `Your submission for "${submission.campaign.title}" was not approved. Reason: ${updateData.rejection_reason}`,
        { submission_id: id, campaign_id: submission.campaign_id },
        `/creator/submissions/${id}`
      );
      
      await supabase
        .from('monitoring_schedule')
        .update({ is_active: false })
        .eq('submission_id', id);
    }
  }
  
  const { data: updated, error: updateErr } = await supabase
    .from('submissions')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();
  
  if (updateErr) return error(updateErr.message, 500);
  return json(updated);
}

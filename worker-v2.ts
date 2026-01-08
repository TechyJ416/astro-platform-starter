// workers/src/index.ts
// Cloudflare Worker for Banity background jobs

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SCREENSHOT_API_KEY: string;
  SCREENSHOT_API_URL: string;
}

interface Job {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

// Simple Supabase client for Workers (no external deps needed)
function createSupabaseClient(url: string, key: string) {
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  return {
    from: (table: string) => ({
      select: async (columns = '*', options?: { count?: string }) => {
        const params = new URLSearchParams();
        params.set('select', columns);
        const res = await fetch(`${url}/rest/v1/${table}?${params}`, { headers });
        const data = await res.json();
        return { data, error: res.ok ? null : data };
      },
      insert: async (record: Record<string, unknown>) => {
        const res = await fetch(`${url}/rest/v1/${table}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(record)
        });
        const data = await res.json();
        return { data: Array.isArray(data) ? data[0] : data, error: res.ok ? null : data };
      },
      update: async (record: Record<string, unknown>) => ({
        eq: async (column: string, value: string) => {
          const res = await fetch(`${url}/rest/v1/${table}?${column}=eq.${value}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(record)
          });
          const data = await res.json();
          return { data: Array.isArray(data) ? data[0] : data, error: res.ok ? null : data };
        },
        match: async (conditions: Record<string, string>) => {
          const params = Object.entries(conditions).map(([k, v]) => `${k}=eq.${v}`).join('&');
          const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(record)
          });
          const data = await res.json();
          return { data, error: res.ok ? null : data };
        }
      }),
      delete: async () => ({
        eq: async (column: string, value: string) => {
          const res = await fetch(`${url}/rest/v1/${table}?${column}=eq.${value}`, {
            method: 'DELETE',
            headers
          });
          return { error: res.ok ? null : await res.json() };
        },
        in: async (column: string, values: string[]) => {
          const res = await fetch(`${url}/rest/v1/${table}?${column}=in.(${values.join(',')})`, {
            method: 'DELETE',
            headers
          });
          return { error: res.ok ? null : await res.json() };
        },
        lt: async (column: string, value: string) => {
          const res = await fetch(`${url}/rest/v1/${table}?${column}=lt.${value}`, {
            method: 'DELETE',
            headers
          });
          return { error: res.ok ? null : await res.json() };
        }
      })
    }),
    // Custom query method for complex queries
    query: async (table: string, params: string) => {
      const res = await fetch(`${url}/rest/v1/${table}?${params}`, { headers });
      return res.json();
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, data: ArrayBuffer, options: { contentType: string }) => {
          const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
            method: 'POST',
            headers: {
              'apikey': key,
              'Authorization': `Bearer ${key}`,
              'Content-Type': options.contentType
            },
            body: data
          });
          return { error: res.ok ? null : await res.json() };
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `${url}/storage/v1/object/public/${bucket}/${path}` }
        })
      })
    }
  };
}

export default {
  // Cron triggers
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Cron triggered: ${event.cron}`);
    
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    
    try {
      if (event.cron === '* * * * *') {
        await processJobQueue(supabase, env);
      } else if (event.cron === '*/5 * * * *') {
        await processMonitoringSchedule(supabase, env);
      } else if (event.cron === '0 0 * * *') {
        await cleanupOldJobs(supabase);
      }
    } catch (err) {
      console.error('Cron error:', err);
    }
  },
  
  // HTTP endpoint
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ 
        status: 'ok', 
        timestamp: new Date().toISOString() 
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname === '/trigger' && request.method === 'POST') {
      const auth = request.headers.get('Authorization');
      if (auth !== `Bearer ${env.SUPABASE_SERVICE_KEY}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      
      const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      
      try {
        const processed = await processJobQueue(supabase, env);
        return new Response(JSON.stringify({ success: true, processed }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: err instanceof Error ? err.message : 'Unknown error' 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

// ============================================================================
// JOB PROCESSOR
// ============================================================================

async function processJobQueue(supabase: ReturnType<typeof createSupabaseClient>, env: Env): Promise<number> {
  const workerId = crypto.randomUUID().slice(0, 8);
  let processed = 0;
  
  // Get pending jobs
  const jobs = await supabase.query('job_queue', 
    `status=eq.pending&scheduled_for=lte.${new Date().toISOString()}&locked_by=is.null&order=priority.desc,scheduled_for.asc&limit=10`
  );
  
  if (!Array.isArray(jobs) || jobs.length === 0) {
    console.log('No pending jobs');
    return 0;
  }
  
  console.log(`Found ${jobs.length} pending jobs`);
  
  for (const job of jobs as Job[]) {
    // Lock the job
    const lockResult = await supabase.from('job_queue').update({
      locked_by: workerId,
      locked_at: new Date().toISOString(),
      status: 'processing',
      attempts: job.attempts + 1
    }).eq('id', job.id);
    
    if (lockResult.error) {
      console.log(`Failed to lock job ${job.id}`);
      continue;
    }
    
    try {
      console.log(`Processing job ${job.id}: ${job.job_type}`);
      await executeJob(job, supabase, env);
      
      await supabase.from('job_queue').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        locked_by: null
      }).eq('id', job.id);
      
      processed++;
      console.log(`Completed job ${job.id}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Job ${job.id} failed:`, errorMessage);
      
      if (job.attempts + 1 >= job.max_attempts) {
        await supabase.from('job_queue').update({
          status: 'failed',
          error_message: errorMessage,
          locked_by: null
        }).eq('id', job.id);
      } else {
        const backoffMs = Math.pow(2, job.attempts) * 5 * 60000;
        await supabase.from('job_queue').update({
          status: 'pending',
          scheduled_for: new Date(Date.now() + backoffMs).toISOString(),
          error_message: errorMessage,
          locked_by: null
        }).eq('id', job.id);
      }
    }
  }
  
  return processed;
}

async function executeJob(job: Job, supabase: ReturnType<typeof createSupabaseClient>, env: Env): Promise<void> {
  const payload = job.payload;
  
  switch (job.job_type) {
    case 'capture_submission':
    case 'monitor_submission':
      await captureSubmission(payload, supabase, env);
      break;
    
    case 'send_email':
      console.log('Email job (not implemented):', payload);
      break;
    
    case 'send_push':
      console.log('Push job (not implemented):', payload);
      break;
    
    case 'process_payment':
      console.log('Payment job (not implemented):', payload);
      break;
    
    default:
      console.log('Unknown job type:', job.job_type);
  }
}

// ============================================================================
// MEDIA CAPTURE
// ============================================================================

async function captureSubmission(
  payload: Record<string, unknown>,
  supabase: ReturnType<typeof createSupabaseClient>,
  env: Env
): Promise<void> {
  const submissionId = payload.submission_id as string;
  const url = payload.url as string;
  const platform = payload.platform as string;
  const captureType = payload.capture_type as string;
  
  console.log(`Capturing submission ${submissionId}: ${url}`);
  
  // Update status to capturing
  await supabase.from('submissions').update({ status: 'capturing' }).eq('id', submissionId);
  
  try {
    // Take screenshot
    const screenshot = await captureScreenshot(url, env);
    console.log(`Screenshot taken: ${screenshot.byteLength} bytes`);
    
    // Upload to storage
    const filename = `submissions/${submissionId}/${Date.now()}.png`;
    const uploadResult = await supabase.storage.from('captures').upload(filename, screenshot, {
      contentType: 'image/png'
    });
    
    if (uploadResult.error) {
      throw new Error(`Upload failed: ${JSON.stringify(uploadResult.error)}`);
    }
    
    const publicUrl = supabase.storage.from('captures').getPublicUrl(filename).data.publicUrl;
    console.log(`Uploaded to: ${publicUrl}`);
    
    // Create capture record
    await supabase.from('submission_captures').insert({
      submission_id: submissionId,
      capture_type: captureType,
      screenshot_url: publicUrl,
      raw_metadata: { url, platform, captured_at: new Date().toISOString() },
      is_live: true
    });
    
    // Update submission status
    await supabase.from('submissions').update({ status: 'monitoring' }).eq('id', submissionId);
    
    console.log(`Capture complete for ${submissionId}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Capture failed';
    console.error(`Capture failed for ${submissionId}:`, errorMessage);
    
    // Record failed capture
    await supabase.from('submission_captures').insert({
      submission_id: submissionId,
      capture_type: captureType,
      is_live: false,
      error_message: errorMessage
    });
    
    // Still set to monitoring so we can retry
    if (captureType === 'initial') {
      await supabase.from('submissions').update({ status: 'monitoring' }).eq('id', submissionId);
    }
    
    throw err;
  }
}

async function captureScreenshot(url: string, env: Env): Promise<ArrayBuffer> {
  // Check if screenshot API is configured
  if (!env.SCREENSHOT_API_URL || !env.SCREENSHOT_API_KEY) {
    throw new Error('Screenshot API not configured');
  }
  
  console.log(`Taking screenshot of: ${url}`);
  
  const response = await fetch(env.SCREENSHOT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.SCREENSHOT_API_KEY}`
    },
    body: JSON.stringify({
      url,
      options: {
        fullPage: false,
        type: 'png',
        viewport: { width: 1280, height: 800 }
      }
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Screenshot API error: ${response.status} - ${errorText}`);
  }
  
  return response.arrayBuffer();
}

// ============================================================================
// MONITORING SCHEDULER
// ============================================================================

async function processMonitoringSchedule(supabase: ReturnType<typeof createSupabaseClient>, env: Env): Promise<void> {
  console.log('Processing monitoring schedule');
  
  // Get due schedules
  const schedules = await supabase.query('monitoring_schedule',
    `is_active=eq.true&checks_remaining=gt.0&next_check_at=lte.${new Date().toISOString()}&limit=20`
  );
  
  if (!Array.isArray(schedules) || schedules.length === 0) {
    console.log('No submissions due for monitoring');
    return;
  }
  
  console.log(`Found ${schedules.length} submissions to monitor`);
  
  for (const schedule of schedules) {
    // Get submission details
    const submissions = await supabase.query('submissions', `id=eq.${schedule.submission_id}`);
    const submission = Array.isArray(submissions) ? submissions[0] : null;
    
    if (!submission || submission.status === 'rejected' || submission.status === 'approved' || submission.status === 'completed') {
      // Deactivate monitoring
      await supabase.from('monitoring_schedule').update({ is_active: false }).eq('id', schedule.id);
      continue;
    }
    
    // Queue monitoring job
    await supabase.from('job_queue').insert({
      job_type: 'monitor_submission',
      payload: {
        submission_id: schedule.submission_id,
        url: submission.url,
        platform: submission.platform,
        capture_type: 'scheduled'
      },
      priority: 5
    });
    
    // Update schedule for next check
    const nextCheck = new Date();
    nextCheck.setHours(nextCheck.getHours() + (schedule.check_interval_hours || 24));
    
    await supabase.from('monitoring_schedule').update({
      next_check_at: nextCheck.toISOString(),
      checks_remaining: schedule.checks_remaining - 1,
      last_checked_at: new Date().toISOString(),
      total_checks: (schedule.total_checks || 0) + 1
    }).eq('id', schedule.id);
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

async function cleanupOldJobs(supabase: ReturnType<typeof createSupabaseClient>): Promise<void> {
  console.log('Cleaning up old jobs');
  
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  
  // Delete completed/failed jobs older than 7 days
  await supabase.from('job_queue').delete().lt('created_at', cutoff.toISOString());
  
  console.log('Cleanup complete');
}

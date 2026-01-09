// src/index.ts
// Banity Background Worker for Cloudflare
// Copy this entire file to: banity-worker/src/index.ts

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

// ============================================================================
// SUPABASE CLIENT (lightweight, no dependencies)
// ============================================================================

function createSupabaseClient(url: string, key: string) {
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  return {
    from: (table: string) => ({
      select: async (columns = '*') => {
        const res = await fetch(`${url}/rest/v1/${table}?select=${columns}`, { headers });
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
      update: (record: Record<string, unknown>) => ({
        eq: async (column: string, value: string) => {
          const res = await fetch(`${url}/rest/v1/${table}?${column}=eq.${value}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(record)
          });
          const data = await res.json();
          return { data: Array.isArray(data) ? data[0] : data, error: res.ok ? null : data };
        }
      }),
      delete: () => ({
        lt: async (column: string, value: string) => {
          const params = `${column}=lt.${value}&status=in.(completed,failed)`;
          const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
            method: 'DELETE',
            headers
          });
          return { error: res.ok ? null : await res.json() };
        }
      })
    }),
    query: async (table: string, params: string) => {
      const res = await fetch(`${url}/rest/v1/${table}?${params}`, { headers });
      if (!res.ok) return [];
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

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

// ============================================================================
// MAIN WORKER EXPORT
// ============================================================================

export default {
  // HTTP requests (health check, manual trigger)
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        configured: {
          supabase: !!env.SUPABASE_URL,
          screenshot: !!env.SCREENSHOT_API_URL
        }
      });
    }

    // Manual job trigger (for testing)
    if (url.pathname === '/trigger' && request.method === 'POST') {
      const auth = request.headers.get('Authorization');
      if (auth !== `Bearer ${env.SUPABASE_SERVICE_KEY}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      try {
        const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
        const processed = await processJobQueue(supabase, env);
        return Response.json({ success: true, processed });
      } catch (err) {
        return Response.json({
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error'
        }, { status: 500 });
      }
    }

    // Root endpoint - show info
    if (url.pathname === '/') {
      return Response.json({
        name: 'Banity Background Worker',
        endpoints: {
          '/health': 'Health check',
          '/trigger': 'Manual job trigger (POST, requires auth)'
        },
        crons: [
          '* * * * * - Process job queue',
          '*/5 * * * * - Check monitoring schedule',
          '0 0 * * * - Cleanup old jobs'
        ]
      });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },

  // Scheduled cron triggers
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[CRON] Triggered: ${event.cron} at ${new Date().toISOString()}`);

    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

    try {
      switch (event.cron) {
        case '* * * * *':
          // Every minute - process job queue
          const processed = await processJobQueue(supabase, env);
          console.log(`[CRON] Processed ${processed} jobs`);
          break;

        case '*/5 * * * *':
          // Every 5 minutes - check monitoring schedule
          await processMonitoringSchedule(supabase, env);
          break;

        case '0 0 * * *':
          // Daily - cleanup old jobs
          await cleanupOldJobs(supabase);
          break;

        default:
          console.log(`[CRON] Unknown cron: ${event.cron}`);
      }
    } catch (err) {
      console.error(`[CRON] Error:`, err instanceof Error ? err.message : err);
    }
  }
};

// ============================================================================
// JOB QUEUE PROCESSOR
// ============================================================================

async function processJobQueue(supabase: SupabaseClient, env: Env): Promise<number> {
  const workerId = crypto.randomUUID().slice(0, 8);
  let processed = 0;

  // Get pending jobs
  const jobs = await supabase.query('job_queue',
    `status=eq.pending&scheduled_for=lte.${new Date().toISOString()}&locked_by=is.null&order=priority.desc,scheduled_for.asc&limit=10`
  ) as Job[];

  if (!jobs || jobs.length === 0) {
    return 0;
  }

  console.log(`[JOBS] Found ${jobs.length} pending jobs`);

  for (const job of jobs) {
    // Try to lock the job
    const lockResult = await supabase.from('job_queue').update({
      locked_by: workerId,
      locked_at: new Date().toISOString(),
      status: 'processing',
      attempts: job.attempts + 1
    }).eq('id', job.id);

    if (lockResult.error) {
      console.log(`[JOBS] Failed to lock job ${job.id}`);
      continue;
    }

    try {
      console.log(`[JOBS] Processing: ${job.job_type} (${job.id})`);
      await executeJob(job, supabase, env);

      // Mark as completed
      await supabase.from('job_queue').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        locked_by: null
      }).eq('id', job.id);

      processed++;
      console.log(`[JOBS] Completed: ${job.id}`);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[JOBS] Failed: ${job.id} - ${errorMessage}`);

      if (job.attempts + 1 >= job.max_attempts) {
        // Max retries reached - mark as failed
        await supabase.from('job_queue').update({
          status: 'failed',
          error_message: errorMessage,
          locked_by: null
        }).eq('id', job.id);
      } else {
        // Retry with exponential backoff
        const backoffMs = Math.pow(2, job.attempts) * 60000; // 1min, 2min, 4min...
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

// ============================================================================
// JOB EXECUTOR
// ============================================================================

async function executeJob(job: Job, supabase: SupabaseClient, env: Env): Promise<void> {
  const payload = job.payload;

  switch (job.job_type) {
    case 'capture_submission':
    case 'monitor_submission':
      await captureSubmission(payload, supabase, env);
      break;

    case 'send_email':
      console.log(`[EMAIL] Would send email:`, payload);
      // TODO: Implement with SendGrid/Resend
      break;

    case 'send_push':
      console.log(`[PUSH] Would send push:`, payload);
      // TODO: Implement with FCM
      break;

    case 'process_payment':
      console.log(`[PAYMENT] Would process payment:`, payload);
      // TODO: Implement with Stripe
      break;

    default:
      console.log(`[JOBS] Unknown job type: ${job.job_type}`);
  }
}

// ============================================================================
// MEDIA CAPTURE
// ============================================================================

async function captureSubmission(
  payload: Record<string, unknown>,
  supabase: SupabaseClient,
  env: Env
): Promise<void> {
  const submissionId = payload.submission_id as string;
  const url = payload.url as string;
  const platform = payload.platform as string;
  const captureType = payload.capture_type as string;

  console.log(`[CAPTURE] Starting: ${submissionId}`);
  console.log(`[CAPTURE] URL: ${url}`);

  // Update status to capturing
  await supabase.from('submissions').update({
    status: 'capturing'
  }).eq('id', submissionId);

  try {
    // Check if screenshot service is configured
    if (!env.SCREENSHOT_API_URL || !env.SCREENSHOT_API_KEY) {
      throw new Error('Screenshot service not configured. Set SCREENSHOT_API_URL and SCREENSHOT_API_KEY secrets.');
    }

    // Take screenshot
    const screenshot = await captureScreenshot(url, env);
    console.log(`[CAPTURE] Screenshot taken: ${screenshot.byteLength} bytes`);

    // Upload to Supabase Storage
    const filename = `submissions/${submissionId}/${Date.now()}.png`;
    const uploadResult = await supabase.storage.from('captures').upload(filename, screenshot, {
      contentType: 'image/png'
    });

    if (uploadResult.error) {
      throw new Error(`Storage upload failed: ${JSON.stringify(uploadResult.error)}`);
    }

    const publicUrl = supabase.storage.from('captures').getPublicUrl(filename).data.publicUrl;
    console.log(`[CAPTURE] Uploaded: ${publicUrl}`);

    // Create capture record
    await supabase.from('submission_captures').insert({
      submission_id: submissionId,
      capture_type: captureType,
      screenshot_url: publicUrl,
      raw_metadata: {
        url,
        platform,
        captured_at: new Date().toISOString()
      },
      is_live: true
    });

    // Update submission status to monitoring
    await supabase.from('submissions').update({
      status: 'monitoring'
    }).eq('id', submissionId);

    console.log(`[CAPTURE] Complete: ${submissionId}`);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Capture failed';
    console.error(`[CAPTURE] Failed: ${submissionId} - ${errorMessage}`);

    // Record the failed capture attempt
    await supabase.from('submission_captures').insert({
      submission_id: submissionId,
      capture_type: captureType,
      is_live: false,
      error_message: errorMessage
    });

    // Still set to monitoring so scheduled retries can work
    if (captureType === 'initial') {
      await supabase.from('submissions').update({
        status: 'monitoring'
      }).eq('id', submissionId);
    }

    throw err;
  }
}

async function captureScreenshot(url: string, env: Env): Promise<ArrayBuffer> {
  console.log(`[SCREENSHOT] Requesting: ${url}`);

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
        viewport: {
          width: 1280,
          height: 800
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Screenshot API error (${response.status}): ${errorText}`);
  }

  return response.arrayBuffer();
}

// ============================================================================
// MONITORING SCHEDULER
// ============================================================================

async function processMonitoringSchedule(supabase: SupabaseClient, env: Env): Promise<void> {
  console.log(`[MONITOR] Checking schedule...`);

  // Get submissions due for monitoring
  const schedules = await supabase.query('monitoring_schedule',
    `is_active=eq.true&checks_remaining=gt.0&next_check_at=lte.${new Date().toISOString()}&limit=20`
  ) as Array<{
    id: string;
    submission_id: string;
    check_interval_hours: number;
    checks_remaining: number;
    total_checks: number;
  }>;

  if (!schedules || schedules.length === 0) {
    console.log(`[MONITOR] No submissions due`);
    return;
  }

  console.log(`[MONITOR] Found ${schedules.length} submissions to check`);

  for (const schedule of schedules) {
    // Get submission details
    const submissions = await supabase.query('submissions',
      `id=eq.${schedule.submission_id}`
    ) as Array<{ id: string; url: string; platform: string; status: string }>;

    const submission = submissions?.[0];

    if (!submission || ['rejected', 'approved', 'completed'].includes(submission.status)) {
      // Deactivate monitoring for finished submissions
      await supabase.from('monitoring_schedule').update({
        is_active: false
      }).eq('id', schedule.id);
      console.log(`[MONITOR] Deactivated: ${schedule.submission_id} (status: ${submission?.status})`);
      continue;
    }

    // Queue a monitoring job
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

    // Schedule next check
    const nextCheck = new Date();
    nextCheck.setHours(nextCheck.getHours() + (schedule.check_interval_hours || 24));

    await supabase.from('monitoring_schedule').update({
      next_check_at: nextCheck.toISOString(),
      checks_remaining: schedule.checks_remaining - 1,
      last_checked_at: new Date().toISOString(),
      total_checks: (schedule.total_checks || 0) + 1
    }).eq('id', schedule.id);

    console.log(`[MONITOR] Queued check for: ${schedule.submission_id}`);
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

async function cleanupOldJobs(supabase: SupabaseClient): Promise<void> {
  console.log(`[CLEANUP] Starting...`);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  // Delete completed/failed jobs older than 7 days
  const result = await supabase.from('job_queue').delete().lt('created_at', cutoff.toISOString());

  if (result.error) {
    console.error(`[CLEANUP] Error:`, result.error);
  } else {
    console.log(`[CLEANUP] Complete`);
  }
}

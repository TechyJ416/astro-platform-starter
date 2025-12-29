// src/pages/api/admin/impersonate.ts
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  // Check admin access
  const isMasterKeySession = locals.isMasterKeySession || false;
  const profile = locals.profile;
  
  const isAdmin = isMasterKeySession || profile?.role === 'admin';
  
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const { action, userId } = body;

    if (action === 'start' && userId) {
      // Verify user exists
      const supabase = createClient(
        import.meta.env.SUPABASE_URL,
        import.meta.env.SUPABASE_SERVICE_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      const { data: targetUser, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .eq('id', userId)
        .single();

      if (error || !targetUser) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Set cookie using native Set-Cookie header
      const isProduction = import.meta.env.PROD;
      const cookieValue = `impersonate_id=${targetUser.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${isProduction ? '; Secure' : ''}`;

      return new Response(JSON.stringify({ 
        success: true, 
        message: `Now viewing as ${targetUser.full_name || targetUser.email}`,
        user: targetUser
      }), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Set-Cookie': cookieValue
        }
      });

    } else if (action === 'stop') {
      // Clear cookie by setting expired date
      const clearCookies = [
        'impersonate_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
        'impersonate_user_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
        'impersonate_user=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      ];

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Impersonation ended'
      }), {
        status: 200,
        headers: [
          ['Content-Type', 'application/json'],
          ['Set-Cookie', clearCookies[0]],
          ['Set-Cookie', clearCookies[1]],
          ['Set-Cookie', clearCookies[2]],
        ]
      });

    } else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

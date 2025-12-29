// src/pages/api/admin/impersonate.ts
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

// Helper to encode/decode cookie value
function encodeCookieValue(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  // Check admin access
  const isMasterKeySession = locals.isMasterKeySession || false;
  const session = locals.session;
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

      // Set impersonation cookie with base64 encoded value
      const cookieValue = encodeCookieValue({
        id: targetUser.id,
        email: targetUser.email,
        full_name: targetUser.full_name,
        role: targetUser.role,
      });
      
      cookies.set('impersonate_user', cookieValue, {
        path: '/',
        httpOnly: true,
        secure: import.meta.env.PROD,
        sameSite: 'lax',
        maxAge: 60 * 60, // 1 hour
      });

      return new Response(JSON.stringify({ 
        success: true, 
        message: `Now viewing as ${targetUser.full_name || targetUser.email}`,
        user: targetUser
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } else if (action === 'stop') {
      // Clear impersonation cookie
      cookies.delete('impersonate_user', { path: '/' });

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Impersonation ended'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
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

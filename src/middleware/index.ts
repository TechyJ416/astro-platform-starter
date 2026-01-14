// src/middleware/index.ts
import { defineMiddleware } from 'astro:middleware';
import { createClient } from '@supabase/supabase-js';

export const onRequest = defineMiddleware(async (context, next) => {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_KEY;

  // Skip auth for static assets and API routes that handle their own auth
  const pathname = context.url.pathname;
  if (
    pathname.startsWith('/_') ||
    pathname.startsWith('/api/') ||
    pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2)$/)
  ) {
    return next();
  }

  // Initialize locals
  context.locals.session = null;
  context.locals.profile = null;
  context.locals.user = null;

  // Check for master key session (admin backdoor)
  const masterKeyCookie = context.cookies.get('admin_master_key');
  if (masterKeyCookie?.value === import.meta.env.ADMIN_MASTER_KEY && import.meta.env.ADMIN_MASTER_KEY) {
    context.locals.isMasterKeySession = true;
    context.locals.profile = {
      id: 'master-admin',
      email: 'admin@system',
      role: 'admin',
      full_name: 'System Admin',
      username: 'admin'
    };
    return next();
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables');
    return next();
  }

  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    }
  });

  // Try to get session from cookies
  const accessToken = context.cookies.get('sb-access-token')?.value;
  const refreshToken = context.cookies.get('sb-refresh-token')?.value;

  let session = null;
  let user = null;

  if (accessToken) {
    // Try to get user with access token
    const { data: { user: authUser }, error: userError } = await supabase.auth.getUser(accessToken);
    
    if (authUser && !userError) {
      user = authUser;
      session = { user: authUser, access_token: accessToken };
    } else if (refreshToken) {
      // Try to refresh the session
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
        refresh_token: refreshToken
      });

      if (refreshData?.session && !refreshError) {
        session = refreshData.session;
        user = refreshData.session.user;

        // Update cookies with new tokens
        const cookieOptions = {
          path: '/',
          httpOnly: true,
          secure: import.meta.env.PROD,
          sameSite: 'lax' as const,
          maxAge: 60 * 60 * 24 * 7 // 7 days
        };

        context.cookies.set('sb-access-token', refreshData.session.access_token, cookieOptions);
        context.cookies.set('sb-refresh-token', refreshData.session.refresh_token, cookieOptions);
      }
    }
  }

  // If we have a user, get their profile
  if (user) {
    const adminClient = supabaseServiceKey 
      ? createClient(supabaseUrl, supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        })
      : supabase;

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profile && !profileError) {
      context.locals.session = session;
      context.locals.user = user;
      context.locals.profile = profile;
    } else {
      // Profile doesn't exist - might be first login, create one
      const newProfile = {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
        username: user.email?.split('@')[0] || null,
        avatar_url: user.user_metadata?.avatar_url || null,
        role: 'creator',
        created_at: new Date().toISOString()
      };

      if (supabaseServiceKey) {
        const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        
        const { data: createdProfile } = await adminClient
          .from('profiles')
          .upsert(newProfile, { onConflict: 'id' })
          .select()
          .single();

        if (createdProfile) {
          context.locals.session = session;
          context.locals.user = user;
          context.locals.profile = createdProfile;
        }
      }
    }
  }

  return next();
});

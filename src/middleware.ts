import { defineMiddleware } from "astro:middleware";
import { createClient } from "@supabase/supabase-js";

export const onRequest = defineMiddleware(async (context, next) => {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  const masterKey = import.meta.env.ADMIN_MASTER_KEY;

  const pathname = context.url.pathname;
  
  // Public routes
  const publicRoutes = ['/admin/login', '/admin/setup', '/api/auth', '/clips', '/'];
  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  );
  
  if (isPublicRoute || !pathname.startsWith('/admin')) {
    return next();
  }

  // Check master key session first
  const masterSession = context.cookies.get('admin-master-session')?.value;
  if (masterKey && masterSession === masterKey) {
    context.locals.isMasterKeySession = true;
    return next();
  }

  // Check Supabase session
  if (!supabaseUrl || !supabaseAnonKey) {
    return context.redirect('/admin/login');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const accessToken = context.cookies.get("sb-access-token")?.value;
  const refreshToken = context.cookies.get("sb-refresh-token")?.value;

  let session = null;
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (!error) session = data.session;
  }

  if (!session) {
    return context.redirect('/admin/login');
  }

  // Verify admin status
  const { data: adminRecord } = await supabase
    .from("admins")
    .select("id")
    .eq("id", session.user.id)
    .maybeSingle();

  if (!adminRecord) {
    return context.redirect('/unauthorized');
  }

  context.locals.session = session;
  return next();
});

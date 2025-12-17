// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { supabase, getSession, getUserProfile } from "./lib/supabase";

export const onRequest = defineMiddleware(async (context, next) => {
  const masterKey = import.meta.env.ADMIN_MASTER_KEY;
  const pathname = context.url.pathname;
  
  // Public routes - no auth required
  const publicRoutes = [
    '/admin/login',
    '/admin/setup',
    '/api/auth',
    '/clips',
    '/',
  ];
  
  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  );
  
  // Skip middleware for public routes and non-admin pages
  if (isPublicRoute || !pathname.startsWith('/admin')) {
    return next();
  }

  // Check for master key session first (bypasses all other auth)
  const masterSession = context.cookies.get('admin-master-session')?.value;
  
  if (masterKey && masterSession === masterKey) {
    // Master key session is valid - grant full admin access
    context.locals.isMasterKeySession = true;
    context.locals.session = null;
    context.locals.isAdmin = true;
    return next();
  }

  // Normal authentication using lib/supabase helpers
  const session = await getSession(context.cookies);

  if (!session) {
    return context.redirect('/admin/login');
  }

  // Get user profile and check admin status
  const profile = await getUserProfile(session.user.id);
  
  // Check if user is in admins table
  const { data: adminRecord } = await supabase
    .from("admins")
    .select("id")
    .eq("id", session.user.id)
    .maybeSingle();

  const isAdmin = !!adminRecord || profile?.role === "admin";
  const isModerator = profile?.role === "moderator";

  // Admin-only routes
  const adminOnlyRoutes = ['/admin/users', '/admin/settings', '/admin/messages'];
  const isAdminOnlyRoute = adminOnlyRoutes.some(route => pathname.startsWith(route));

  // Moderator-accessible routes  
  const modRoutes = ['/admin/review'];
  const isModRoute = modRoutes.some(route => pathname.startsWith(route));

  if (isAdminOnlyRoute && !isAdmin) {
    return context.redirect('/unauthorized');
  }

  if (isModRoute && !isAdmin && !isModerator) {
    return context.redirect('/unauthorized');
  }

  // For general admin routes, require admin or moderator
  if (!isAdmin && !isModerator) {
    return context.redirect('/unauthorized');
  }

  // Store in locals for page access
  context.locals.session = session;
  context.locals.profile = profile;
  context.locals.isAdmin = isAdmin;
  context.locals.isModerator = isModerator;
  context.locals.isMasterKeySession = false;

  return next();
});

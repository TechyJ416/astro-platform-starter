// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { getSession, hasAdminAccess } from './lib/supabase';

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = context.url.pathname;
  const masterKey = import.meta.env.ADMIN_MASTER_KEY;

  // ----------------------------------
  // Public admin routes (NO AUTH)
  // ----------------------------------
  const publicAdminRoutes = [
    '/admin/login',
    '/admin/setup',
  ];

  const isPublicAdminRoute = publicAdminRoutes.some(
    route => pathname === route || pathname.startsWith(route + '/')
  );

  if (isPublicAdminRoute) {
    return next();
  }

  // Non-admin routes
  if (!pathname.startsWith('/admin')) {
    return next();
  }

  // ----------------------------------
  // Master Key Session (bypass)
  // ----------------------------------
  const masterSession = context.cookies.get('admin-master-session')?.value;

  if (masterKey && masterSession === masterKey) {
    context.locals.isMasterKeySession = true;
    context.locals.session = null;
    context.locals.profile = null;
    context.locals.isAdmin = true;
    context.locals.isModerator = false;
    return next();
  }

  // ----------------------------------
  // Normal Auth
  // ----------------------------------
  const session = await getSession(context.cookies);

  if (!session) {
    return context.redirect('/admin/login');
  }

  // ----------------------------------
  // Role Check (SERVICE ROLE)
  // ----------------------------------
  let access;

  try {
    access = await hasAdminAccess(session.user.id);
  } catch (err) {
    console.error('Admin access check failed:', err);
    return context.redirect('/admin/login?error=access_failed');
  }

  const { isAdmin, isModerator, profile } = access;

  // ----------------------------------
  // Route Guards
  // ----------------------------------
  const adminOnlyRoutes = [
    '/admin/users',
    '/admin/settings',
    '/admin/messages',
  ];

  const modRoutes = [
    '/admin/review',
    '/admin/campaigns',
    '/admin/communities',
  ];

  if (adminOnlyRoutes.some(r => pathname.startsWith(r)) && !isAdmin) {
    return context.redirect('/unauthorized');
  }

  if (modRoutes.some(r => pathname.startsWith(r)) && !isAdmin && !isModerator) {
    return context.redirect('/unauthorized');
  }

  if (!isAdmin && !isModerator) {
    return context.redirect('/unauthorized');
  }

  // ----------------------------------
  // Locals
  // ----------------------------------
  context.locals.session = session;
  context.locals.profile = profile;
  context.locals.isAdmin = isAdmin;
  context.locals.isModerator = isModerator;
  context.locals.isMasterKeySession = false;

  return next();
});

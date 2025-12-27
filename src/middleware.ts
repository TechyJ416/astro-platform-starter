// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { supabase } from "./lib/supabase";

export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, url, redirect, locals } = context;
  const path = url.pathname;

  // ============================================================
  // STEP 1: IMMEDIATELY SKIP THESE ROUTES - NO PROCESSING AT ALL
  // ============================================================
  if (
    path === '/admin/login' ||
    path === '/admin/setup' ||
    path === '/login' ||
    path === '/signup' ||
    path === '/logout' ||
    path === '/maintenance' ||
    path === '/unauthorized' ||
    path === '/'
  ) {
    // Set default locals and continue - NO REDIRECTS
    locals.session = null;
    locals.profile = null;
    locals.isAdmin = false;
    locals.isModerator = false;
    locals.isMasterKeySession = false;
    return next();
  }

  // Skip static assets
  if (path.startsWith('/_') || path.includes('.')) {
    return next();
  }

  // ============================================================
  // STEP 2: INITIALIZE LOCALS
  // ============================================================
  locals.session = null;
  locals.profile = null;
  locals.isAdmin = false;
  locals.isModerator = false;
  locals.isMasterKeySession = false;

  // ============================================================
  // STEP 3: CHECK AUTHENTICATION
  // ============================================================
  
  // Check master key first
  const masterKeySession = cookies.get("master_key_session")?.value;
  const adminMasterKey = import.meta.env.ADMIN_MASTER_KEY;

  if (masterKeySession && adminMasterKey && masterKeySession === adminMasterKey) {
    locals.isMasterKeySession = true;
    locals.isAdmin = true;
    locals.isModerator = true;
  } else {
    // Check Supabase session
    const accessToken = cookies.get("sb-access-token")?.value;
    const refreshToken = cookies.get("sb-refresh-token")?.value;

    if (accessToken && refreshToken) {
      try {
        const { data: sessionData, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          cookies.delete("sb-access-token", { path: "/" });
          cookies.delete("sb-refresh-token", { path: "/" });
        } else if (sessionData.session) {
          locals.session = sessionData.session;

          // Refresh tokens if needed
          if (sessionData.session.access_token !== accessToken) {
            cookies.set("sb-access-token", sessionData.session.access_token, {
              path: "/",
              httpOnly: true,
              secure: import.meta.env.PROD,
              sameSite: "lax",
              maxAge: 60 * 60 * 24 * 7,
            });
            cookies.set("sb-refresh-token", sessionData.session.refresh_token, {
              path: "/",
              httpOnly: true,
              secure: import.meta.env.PROD,
              sameSite: "lax",
              maxAge: 60 * 60 * 24 * 30,
            });
          }

          // Get profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", sessionData.session.user.id)
            .single();

          if (profile) {
            locals.profile = profile;
            locals.isAdmin = profile.role === "admin";
            locals.isModerator = profile.role === "moderator" || profile.role === "admin";
          }
        }
      } catch (e) {
        console.error("Auth error:", e);
      }
    }
  }

  // ============================================================
  // STEP 4: PROTECT ROUTES
  // ============================================================

  // Admin routes (except login/setup which are handled above)
  if (path.startsWith("/admin")) {
    if (!locals.isMasterKeySession && !locals.session) {
      return redirect("/admin/login");
    }
    if (!locals.isAdmin && !locals.isModerator && !locals.isMasterKeySession) {
      return redirect("/unauthorized");
    }
  }

  // Dashboard routes
  if (path.startsWith("/dashboard")) {
    if (!locals.session && !locals.isMasterKeySession) {
      return redirect("/login?redirect=" + encodeURIComponent(path));
    }
  }

  return next();
});

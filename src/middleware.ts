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
    locals.isImpersonating = false;
    locals.impersonatedUser = null;
    locals.realAdmin = null;
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
  locals.isImpersonating = false;
  locals.impersonatedUser = null;
  locals.realAdmin = null;

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
  // STEP 4: CHECK IMPERSONATION (Admin feature)
  // ============================================================
  // Look for new format (just ID) or old format (JSON)
  const impersonateUserId = cookies.get("impersonate_user_id")?.value;
  const oldImpersonateCookie = cookies.get("impersonate_user")?.value;
  
  // Clear old format cookie if it exists
  if (oldImpersonateCookie) {
    cookies.delete("impersonate_user", { path: "/" });
  }
  
  if (impersonateUserId && (locals.isAdmin || locals.isMasterKeySession)) {
    try {
      // Fetch the impersonated user's profile
      const { data: impersonatedProfile } = await supabase
        .from("profiles")
        .select("id, email, full_name, role")
        .eq("id", impersonateUserId)
        .single();
      
      if (!impersonatedProfile) {
        // Invalid user ID, clear the cookie
        cookies.delete("impersonate_user_id", { path: "/" });
        return next();
      }
      
      const impersonatedUser = {
        id: impersonatedProfile.id,
        email: impersonatedProfile.email,
        full_name: impersonatedProfile.full_name,
        role: impersonatedProfile.role,
      };
      
      // Only apply impersonation on non-admin pages
      if (!path.startsWith("/admin") && !path.startsWith("/api/admin")) {
        locals.isImpersonating = true;
        locals.impersonatedUser = impersonatedUser;
        
        // Store real admin info for the banner
        locals.realAdmin = {
          isMasterKey: locals.isMasterKeySession,
          profile: locals.profile,
        };
        
        // Override profile with impersonated user for dashboard pages
        if (path.startsWith("/dashboard")) {
          // Fetch full profile for impersonated user
          const { data: fullProfile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", impersonatedUser.id)
            .single();
          
          if (fullProfile) {
            locals.profile = fullProfile;
            // Create a fake session for the impersonated user
            locals.session = {
              user: { id: impersonatedUser.id, email: impersonatedUser.email },
            } as any;
          }
        }
      } else {
        // On admin pages, just track that impersonation is active
        locals.isImpersonating = true;
        locals.impersonatedUser = impersonatedUser;
      }
    } catch (e) {
      // Error fetching user, clear cookie
      cookies.delete("impersonate_user_id", { path: "/" });
      console.error("Impersonation error:", e);
    }
  }

  // ============================================================
  // STEP 5: PROTECT ROUTES
  // ============================================================

  // Admin routes (except login/setup which are handled above)
  if (path.startsWith("/admin")) {
    if (!locals.isMasterKeySession && !locals.session) {
      return redirect("/admin/login");
    }
    // Check real admin status (not impersonated)
    const realProfile = locals.realAdmin?.profile || locals.profile;
    const realIsAdmin = locals.isMasterKeySession || realProfile?.role === 'admin' || realProfile?.role === 'moderator';
    if (!realIsAdmin && !locals.isMasterKeySession) {
      return redirect("/unauthorized");
    }
  }

  // Dashboard routes - check for pending/denied accounts
  if (path.startsWith("/dashboard")) {
    // Allow if impersonating (admin viewing as user)
    if (locals.isImpersonating) {
      return next();
    }
    
    if (!locals.session && !locals.isMasterKeySession) {
      return redirect("/login?redirect=" + encodeURIComponent(path));
    }
    
    // Check if user account is pending or denied
    if (locals.profile) {
      if (locals.profile.status === 'pending') {
        return redirect("/login?status=pending");
      }
      if (locals.profile.status === 'denied') {
        return redirect("/login?status=denied");
      }
      if (!locals.profile.is_active) {
        return redirect("/login?status=suspended");
      }
    }
  }

  // Campaign application routes - require approved account
  if (path.startsWith("/campaigns/") && path.includes("/apply")) {
    if (!locals.session) {
      return redirect("/login?redirect=" + encodeURIComponent(path));
    }
    if (locals.profile?.status !== 'active' || !locals.profile?.is_active) {
      return redirect("/login?status=pending");
    }
  }

  // Community interaction routes - require approved account
  if (path.startsWith("/community/") && (path.includes("/join") || path.includes("/post"))) {
    if (!locals.session) {
      return redirect("/login?redirect=" + encodeURIComponent(path));
    }
    if (locals.profile?.status !== 'active' || !locals.profile?.is_active) {
      return redirect("/login?status=pending");
    }
  }

  return next();
});

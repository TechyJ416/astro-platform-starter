// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { supabase } from "./lib/supabase";

// Helper to parse cookies from raw header (bypasses Astro's strict validation)
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  
  try {
    const pairs = cookieHeader.split(';');
    for (const pair of pairs) {
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const name = pair.substring(0, idx).trim();
        const value = pair.substring(idx + 1).trim();
        // Only store if it looks like a valid value (skip JSON objects)
        if (name && value && !/^[{"\[]/.test(value)) {
          cookies[name] = value;
        }
      }
    }
  } catch (e) {
    console.error("Cookie parse error:", e);
  }
  return cookies;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, url, redirect, locals, request } = context;
  const path = url.pathname;

  // Parse cookies from raw header to avoid Astro's strict validation
  const rawCookies = parseCookies(request.headers.get('cookie') || '');

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
    path === '/legal' ||
    path === '/about' ||
    path === '/contact' ||
    path === '/creators' ||
    path === '/privacy' ||
    path === '/terms' ||
    path === '/'
  ) {
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
  // STEP 3: CHECK AUTHENTICATION (using raw parsed cookies)
  // ============================================================
  
  const masterKeySession = rawCookies["master_key_session"];
  const adminMasterKey = import.meta.env.ADMIN_MASTER_KEY;

  if (masterKeySession && adminMasterKey && masterKeySession === adminMasterKey) {
    locals.isMasterKeySession = true;
    locals.isAdmin = true;
    locals.isModerator = true;
  } else {
    const accessToken = rawCookies["sb-access-token"];
    const refreshToken = rawCookies["sb-refresh-token"];

    if (accessToken && refreshToken) {
      try {
        const { data: sessionData, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          try {
            cookies.delete("sb-access-token", { path: "/" });
            cookies.delete("sb-refresh-token", { path: "/" });
          } catch (e) { /* ignore */ }
        } else if (sessionData.session) {
          locals.session = sessionData.session;

          if (sessionData.session.access_token !== accessToken) {
            try {
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
            } catch (e) {
              console.error("Cookie set error:", e);
            }
          }

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
  // STEP 4: CHECK IMPERSONATION (using raw parsed cookies)
  // ============================================================
  const impersonateId = rawCookies["impersonate_id"];
  
  if (impersonateId && (locals.isAdmin || locals.isMasterKeySession)) {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (uuidRegex.test(impersonateId)) {
      try {
        const { data: impersonatedProfile } = await supabase
          .from("profiles")
          .select("id, email, full_name, role")
          .eq("id", impersonateId)
          .single();
        
        if (impersonatedProfile) {
          const impersonatedUser = {
            id: impersonatedProfile.id,
            email: impersonatedProfile.email,
            full_name: impersonatedProfile.full_name,
            role: impersonatedProfile.role,
          };
          
          if (!path.startsWith("/admin") && !path.startsWith("/api/admin")) {
            locals.isImpersonating = true;
            locals.impersonatedUser = impersonatedUser;
            locals.realAdmin = {
              isMasterKey: locals.isMasterKeySession,
              profile: locals.profile,
            };
            
            if (path.startsWith("/dashboard")) {
              const { data: fullProfile } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", impersonatedUser.id)
                .single();
              
              if (fullProfile) {
                locals.profile = fullProfile;
                locals.session = {
                  user: { id: impersonatedUser.id, email: impersonatedUser.email },
                } as any;
              }
            }
          } else {
            locals.isImpersonating = true;
            locals.impersonatedUser = impersonatedUser;
          }
        }
      } catch (e) {
        console.error("Impersonation error:", e);
      }
    }
  }

  // ============================================================
  // STEP 5: PROTECT ROUTES
  // ============================================================

  if (path.startsWith("/admin")) {
    if (!locals.isMasterKeySession && !locals.session) {
      return redirect("/admin/login");
    }
    const realProfile = locals.realAdmin?.profile || locals.profile;
    const realIsAdmin = locals.isMasterKeySession || realProfile?.role === 'admin' || realProfile?.role === 'moderator';
    if (!realIsAdmin && !locals.isMasterKeySession) {
      return redirect("/unauthorized");
    }
  }

  if (path.startsWith("/dashboard")) {
    if (locals.isImpersonating) {
      return next();
    }
    
    if (!locals.session && !locals.isMasterKeySession) {
      return redirect("/login?redirect=" + encodeURIComponent(path));
    }
    
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

  if (path.startsWith("/campaigns/") && path.includes("/apply")) {
    if (!locals.session) {
      return redirect("/login?redirect=" + encodeURIComponent(path));
    }
    if (locals.profile?.status !== 'active' || !locals.profile?.is_active) {
      return redirect("/login?status=pending");
    }
  }

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

// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { createClient } from "@supabase/supabase-js";

export const onRequest = defineMiddleware(async (context, next) => {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  // Skip if Supabase is not configured
  if (!supabaseUrl || !supabaseAnonKey) {
    return next();
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Get session from cookies
  const accessToken = context.cookies.get("sb-access-token")?.value;
  const refreshToken = context.cookies.get("sb-refresh-token")?.value;

  let session = null;

  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (!error) {
      session = data.session;
    }
  }

  const pathname = context.url.pathname;
  const isAdminRoute = pathname.startsWith("/admin");
  const isAdminLogin = pathname === "/admin/login";

  // Admin route protection
  if (isAdminRoute && !isAdminLogin) {
    if (!session) {
      return context.redirect("/admin/login");
    }

    // Check if user is admin
    const { data: adminRecord } = await supabase
      .from("admins")
      .select("id")
      .eq("id", session.user.id)
      .maybeSingle();

    // Also check if user has admin role or moderator role (for review access)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();

    const isAdmin = !!adminRecord || profile?.role === "admin";
    const isModerator = profile?.role === "moderator";

    // /admin/review is accessible to moderators too
    if (pathname.startsWith("/admin/review") && (isAdmin || isModerator)) {
      // Allow access
    } else if (!isAdmin) {
      return context.redirect("/unauthorized");
    }
  }

  // Store session in locals for page access
  context.locals.session = session;
  context.locals.supabase = supabase;

  return next();
});

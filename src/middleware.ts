import { defineMiddleware } from "astro/middleware";
import { getSupabase } from "@supabase/auth-helpers-astro";

export const onRequest = defineMiddleware(async (context, next) => {
  const { supabase, session } = await getSupabase(context);

  const adminRoute = context.url.pathname.startsWith("/admin");

  if (adminRoute) {
    if (!session) {
      return context.redirect("/login");
    }

    // Check if the user is in the admins table
    const { data: adminRecord } = await supabase
      .from("admins")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();

    if (!adminRecord) {
      return context.redirect("/unauthorized");
    }
  }

  return next();
});

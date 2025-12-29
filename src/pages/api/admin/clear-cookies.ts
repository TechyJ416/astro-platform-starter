// src/pages/api/admin/clear-cookies.ts
// Simple endpoint to clear all bad cookies
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const headers = new Headers();
  headers.set('Content-Type', 'text/html');
  
  // Clear ALL potentially bad cookies
  headers.append('Set-Cookie', 'impersonate_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  headers.append('Set-Cookie', 'impersonate_user_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  headers.append('Set-Cookie', 'impersonate_user=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');

  return new Response(`
    <!DOCTYPE html>
    <html>
      <head><title>Cookies Cleared</title></head>
      <body style="font-family: system-ui; padding: 2rem; text-align: center;">
        <h1>✅ Cookies Cleared!</h1>
        <p>All impersonation cookies have been cleared.</p>
        <p><a href="/admin/users">← Back to Admin Users</a></p>
        <script>
          // Also try to clear from JS side
          document.cookie = "impersonate_id=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;";
          document.cookie = "impersonate_user_id=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;";
          document.cookie = "impersonate_user=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;";
        </script>
      </body>
    </html>
  `, {
    status: 200,
    headers
  });
};

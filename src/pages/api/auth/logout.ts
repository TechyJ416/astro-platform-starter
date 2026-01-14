// src/pages/api/auth/logout.ts
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  // Clear all auth cookies
  cookies.delete('sb-access-token', { path: '/' });
  cookies.delete('sb-refresh-token', { path: '/' });
  cookies.delete('admin_master_key', { path: '/' });

  return redirect('/login?logged_out=true');
};

// Also support GET for convenience
export const GET: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete('sb-access-token', { path: '/' });
  cookies.delete('sb-refresh-token', { path: '/' });
  cookies.delete('admin_master_key', { path: '/' });

  return redirect('/login?logged_out=true');
};

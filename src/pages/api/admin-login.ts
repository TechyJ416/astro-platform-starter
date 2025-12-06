// src/pages/api/auth/admin-login.ts
// Admin login endpoint for Astro on Netlify

import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const formData = await request.formData();
    const email = formData.get('email')?.toString();
    const password = formData.get('password')?.toString();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email and password are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      return new Response(
        JSON.stringify({ success: false, error: authError.message }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is an admin (auth_id links to auth.users.id UUID)
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('id, email, name')
      .eq('auth_id', authData.user.id)
      .single();

    if (adminError || !adminData) {
      await supabase.auth.signOut();
      return new Response(
        JSON.stringify({ success: false, error: 'Access denied. Not an admin account.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Set auth cookies
    const { access_token, refresh_token } = authData.session;
    cookies.set('sb-access-token', access_token, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    cookies.set('sb-refresh-token', refresh_token, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });

    return new Response(
      JSON.stringify({
        success: true,
        admin: adminData,
        redirectTo: '/admin/dashboard',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Admin login error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'An unexpected error occurred' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

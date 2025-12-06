// src/pages/api/auth/creator-signup.ts
// Creator signup endpoint for Astro on Netlify

import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const email = formData.get('email')?.toString();
    const password = formData.get('password')?.toString();
    const name = formData.get('name')?.toString() || '';

    if (!email || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email and password are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ success: false, error: 'Password must be at least 6 characters' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Sign up with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (authError) {
      return new Response(
        JSON.stringify({ success: false, error: authError.message }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // If email confirmation is required
    if (authData.user && !authData.session) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Please check your email to confirm your account.',
          requiresEmailConfirmation: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // If auto-confirmed, the database trigger will create the profile
    // Return success
    return new Response(
      JSON.stringify({
        success: true,
        user: authData.user,
        message: 'Account created successfully!',
        redirectTo: '/creator/dashboard',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Creator signup error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'An unexpected error occurred' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

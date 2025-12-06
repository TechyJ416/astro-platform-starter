// src/pages/api/messages/dismiss.ts
// Dismiss message endpoint for Astro on Netlify

import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { messageId, hashedIdentifier } = body;

    if (!messageId || !hashedIdentifier) {
      return new Response(
        JSON.stringify({ success: false, error: 'messageId and hashedIdentifier are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { error } = await supabase
      .from('message_dismissals')
      .insert({
        message_id: messageId,
        hashed_identifier: hashedIdentifier,
      });

    if (error) {
      // Ignore duplicate key errors
      if (error.code === '23505') {
        return new Response(
          JSON.stringify({ success: true, alreadyDismissed: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Dismiss message error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to dismiss message' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

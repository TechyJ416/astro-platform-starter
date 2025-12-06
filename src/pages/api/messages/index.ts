// src/pages/api/messages/index.ts
// Server messages endpoint for Astro on Netlify

import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

export const prerender = false;

// GET - Fetch active server messages
export const GET: APIRoute = async ({ url }) => {
  try {
    const hashedIdentifier = url.searchParams.get('hid');

    // Get all active messages
    const { data: messages, error: messagesError } = await supabase
      .from('server_messages')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (messagesError) {
      return new Response(
        JSON.stringify({ success: false, error: messagesError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // If no hashed identifier, return all active messages
    if (!hashedIdentifier) {
      return new Response(
        JSON.stringify({ success: true, messages }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get user's dismissed messages
    const { data: dismissals } = await supabase
      .from('message_dismissals')
      .select('message_id')
      .eq('hashed_identifier', hashedIdentifier);

    // Filter out dismissed messages
    const dismissedIds = new Set(dismissals?.map(d => d.message_id) || []);
    const undismissedMessages = messages?.filter(m => !dismissedIds.has(m.id)) || [];

    return new Response(
      JSON.stringify({ success: true, messages: undismissedMessages }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Get messages error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to fetch messages' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

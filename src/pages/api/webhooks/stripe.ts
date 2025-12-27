// src/pages/api/webhooks/stripe.ts
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const STRIPE_SECRET_KEY = import.meta.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = import.meta.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = import.meta.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = import.meta.env.SUPABASE_SERVICE_KEY;

// Create Supabase client with service key for admin operations
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Stripe signature verification
async function verifyStripeSignature(payload: string, signature: string): Promise<any> {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.warn('STRIPE_WEBHOOK_SECRET not set, skipping verification');
    return JSON.parse(payload);
  }

  const crypto = await import('crypto');
  
  const signatureHeader = signature;
  const elements = signatureHeader.split(',');
  
  let timestamp = '';
  let v1Signature = '';
  
  for (const element of elements) {
    const [key, value] = element.split('=');
    if (key === 't') timestamp = value;
    if (key === 'v1') v1Signature = value;
  }
  
  if (!timestamp || !v1Signature) {
    throw new Error('Invalid signature format');
  }
  
  // Check timestamp is within tolerance (5 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  if (currentTime - parseInt(timestamp) > 300) {
    throw new Error('Webhook timestamp too old');
  }
  
  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', STRIPE_WEBHOOK_SECRET)
    .update(signedPayload)
    .digest('hex');
  
  if (v1Signature !== expectedSignature) {
    throw new Error('Invalid signature');
  }
  
  return JSON.parse(payload);
}

export const POST: APIRoute = async ({ request }) => {
  if (!STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'Stripe not configured' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const payload = await request.text();
    const signature = request.headers.get('stripe-signature') || '';
    
    let event;
    try {
      event = await verifyStripeSignature(payload, signature);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('Processing Stripe event:', event.type);

    // Handle different event types
    switch (event.type) {
      // ===========================================
      // PAYMENT INTENT EVENTS
      // ===========================================
      
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        const paymentId = paymentIntent.metadata?.payment_id;
        
        if (paymentId) {
          // Update payment record
          await supabase
            .from('payments')
            .update({
              status: 'completed',
              stripe_payment_intent_id: paymentIntent.id,
              completed_at: new Date().toISOString(),
            })
            .eq('id', paymentId);
          
          // Update campaign budget spent
          const { data: payment } = await supabase
            .from('payments')
            .select('campaign_id, amount')
            .eq('id', paymentId)
            .single();
          
          if (payment?.campaign_id) {
            const { data: campaign } = await supabase
              .from('campaigns')
              .select('budget_spent')
              .eq('id', payment.campaign_id)
              .single();
            
            await supabase
              .from('campaigns')
              .update({
                budget_spent: (campaign?.budget_spent || 0) + payment.amount
              })
              .eq('id', payment.campaign_id);
          }
          
          console.log('Payment completed:', paymentId);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        const paymentId = paymentIntent.metadata?.payment_id;
        
        if (paymentId) {
          await supabase
            .from('payments')
            .update({
              status: 'failed',
              stripe_payment_intent_id: paymentIntent.id,
            })
            .eq('id', paymentId);
          
          console.log('Payment failed:', paymentId);
        }
        break;
      }

      // ===========================================
      // STRIPE CONNECT ACCOUNT EVENTS
      // ===========================================
      
      case 'account.updated': {
        const account = event.data.object;
        const creatorId = account.metadata?.creator_id;
        
        if (creatorId) {
          const isOnboardingComplete = 
            account.charges_enabled && 
            account.payouts_enabled &&
            account.details_submitted;
          
          await supabase
            .from('creator_payment_profiles')
            .update({
              stripe_account_status: account.charges_enabled ? 'active' : 'pending',
              stripe_onboarding_complete: isOnboardingComplete,
              updated_at: new Date().toISOString(),
            })
            .eq('creator_id', creatorId);
          
          console.log('Account updated for creator:', creatorId);
        }
        break;
      }

      case 'account.application.deauthorized': {
        const account = event.data.object;
        
        // Find creator by Stripe account ID and disconnect
        await supabase
          .from('creator_payment_profiles')
          .update({
            stripe_account_id: null,
            stripe_account_status: 'disconnected',
            stripe_onboarding_complete: false,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_account_id', account.id);
        
        console.log('Account deauthorized:', account.id);
        break;
      }

      // ===========================================
      // PAYOUT EVENTS (for creator payouts)
      // ===========================================
      
      case 'transfer.created': {
        const transfer = event.data.object;
        const paymentId = transfer.metadata?.payment_id;
        
        if (paymentId) {
          await supabase
            .from('payments')
            .update({
              status: 'processing',
            })
            .eq('id', paymentId);
          
          console.log('Transfer created for payment:', paymentId);
        }
        break;
      }

      case 'transfer.paid': {
        const transfer = event.data.object;
        const paymentId = transfer.metadata?.payment_id;
        
        if (paymentId) {
          await supabase
            .from('payments')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            .eq('id', paymentId);
          
          // Update creator's total paid out
          const { data: payment } = await supabase
            .from('payments')
            .select('creator_id, amount')
            .eq('id', paymentId)
            .single();
          
          if (payment?.creator_id) {
            const { data: profile } = await supabase
              .from('creator_payment_profiles')
              .select('total_paid_out')
              .eq('creator_id', payment.creator_id)
              .single();
            
            await supabase
              .from('creator_payment_profiles')
              .update({
                total_paid_out: (profile?.total_paid_out || 0) + payment.amount,
                updated_at: new Date().toISOString(),
              })
              .eq('creator_id', payment.creator_id);
          }
          
          console.log('Transfer paid for payment:', paymentId);
        }
        break;
      }

      case 'transfer.failed': {
        const transfer = event.data.object;
        const paymentId = transfer.metadata?.payment_id;
        
        if (paymentId) {
          await supabase
            .from('payments')
            .update({
              status: 'failed',
            })
            .eq('id', paymentId);
          
          console.log('Transfer failed for payment:', paymentId);
        }
        break;
      }

      // ===========================================
      // CHECKOUT SESSION EVENTS
      // ===========================================
      
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        // Handle completed checkout sessions (if using Stripe Checkout)
        console.log('Checkout session completed:', session.id);
        break;
      }

      // ===========================================
      // INVOICE EVENTS (for subscriptions/recurring)
      // ===========================================
      
      case 'invoice.paid': {
        const invoice = event.data.object;
        console.log('Invoice paid:', invoice.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.log('Invoice payment failed:', invoice.id);
        break;
      }

      // ===========================================
      // DISPUTE EVENTS
      // ===========================================
      
      case 'charge.dispute.created': {
        const dispute = event.data.object;
        
        // Log dispute for admin attention
        await supabase.from('messages').insert({
          name: 'System',
          email: 'system@banity.com',
          subject: `⚠️ Payment Dispute Created`,
          body: `A payment dispute has been created.\n\nDispute ID: ${dispute.id}\nAmount: $${(dispute.amount / 100).toFixed(2)}\nReason: ${dispute.reason}\n\nPlease review in your Stripe dashboard.`,
          is_read: false,
          is_announcement: false,
        });
        
        console.log('Dispute created:', dispute.id);
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Webhook handler failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Only allow POST requests
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
};

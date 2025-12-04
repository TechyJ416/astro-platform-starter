// netlify/functions/tiktok-webhook.js
/**
 * TikTok Webhook Handler
 * 
 * Receives and processes webhooks from TikTok API
 * Examples: user authentication, video publish events, etc.
 */

const { withTikTokVerification } = require('./utils/tiktok-signature');

async function handleTikTokWebhook(event, context) {
  try {
    // Parse webhook payload
    const payload = JSON.parse(event.body);
    
    // Log webhook event (for development)
    console.log('TikTok Webhook Received:', {
      type: payload.type,
      timestamp: new Date().toISOString(),
      data: payload
    });
    
    // Handle different webhook types
    switch (payload.type) {
      case 'user.authorization.revoked':
        await handleAuthRevoked(payload);
        break;
        
      case 'video.publish':
        await handleVideoPublish(payload);
        break;
        
      case 'user.data.requested':
        await handleDataRequest(payload);
        break;
        
      default:
        console.log(`Unhandled webhook type: ${payload.type}`);
    }
    
    // Always return 200 to acknowledge receipt
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        received: true
      })
    };
    
  } catch (error) {
    console.error('Error processing TikTok webhook:', error);
    
    // Still return 200 to prevent TikTok from retrying
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: false,
        error: 'Internal error'
      })
    };
  }
}

async function handleAuthRevoked(payload) {
  // Handle user revoking authorization
  console.log('User revoked authorization:', payload.data.user_id);
  
  // TODO: Update database - mark user as unauthorized
  // await db.query('UPDATE creators SET tiktok_authorized = false WHERE tiktok_user_id = $1', [payload.data.user_id]);
}

async function handleVideoPublish(payload) {
  // Handle new video published
  console.log('Video published:', payload.data.video_id);
  
  // TODO: Store video metadata, notify admins
  // await notifyAdmins('New video published', payload.data);
}

async function handleDataRequest(payload) {
  // Handle GDPR data request
  console.log('Data request received for user:', payload.data.user_id);
  
  // TODO: Generate user data export
  // await generateUserDataExport(payload.data.user_id);
}

// Export with signature verification middleware
exports.handler = withTikTokVerification(handleTikTokWebhook);

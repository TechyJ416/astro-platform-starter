// netlify/functions/utils/tiktok-signature.js
/**
 * TikTok Webhook Signature Verification
 * 
 * Verifies webhook signatures from TikTok API to ensure requests are authentic
 * 
 * Documentation: https://developers.tiktok.com/doc/webhooks-signature-verification
 */

const crypto = require('crypto');

/**
 * Verifies TikTok webhook signature
 * 
 * @param {string} signatureHeader - The x-tiktok-signature header value
 * @param {string} rawBody - The raw request body as string
 * @param {string} clientSecret - Your TikTok app client secret
 * @param {number} toleranceSeconds - Max age of webhook (default: 300 seconds = 5 minutes)
 * @returns {object} { valid: boolean, error: string|null }
 */
function verifyTikTokSignature(signatureHeader, rawBody, clientSecret, toleranceSeconds = 300) {
  try {
    // Step 1: Extract timestamp and signatures from the header
    const elements = signatureHeader.split(',');
    let timestamp = null;
    const signatures = [];
    
    for (const element of elements) {
      const [prefix, value] = element.split('=');
      
      if (prefix === 't') {
        timestamp = value;
      } else if (prefix === 's') {
        signatures.push(value);
      }
    }
    
    if (!timestamp) {
      return {
        valid: false,
        error: 'Missing timestamp in signature header'
      };
    }
    
    if (signatures.length === 0) {
      return {
        valid: false,
        error: 'Missing signature in header'
      };
    }
    
    // Step 2: Generate signature
    // signed_payload = timestamp + "." + raw_body
    const signedPayload = `${timestamp}.${rawBody}`;
    
    // Compute HMAC with SHA256
    const expectedSignature = crypto
      .createHmac('sha256', clientSecret)
      .update(signedPayload)
      .digest('hex');
    
    // Step 3: Compare signatures and check timestamp
    // Use constant-time comparison to prevent timing attacks
    let signatureMatched = false;
    for (const signature of signatures) {
      if (crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )) {
        signatureMatched = true;
        break;
      }
    }
    
    if (!signatureMatched) {
      return {
        valid: false,
        error: 'Signature verification failed'
      };
    }
    
    // Check timestamp tolerance
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const webhookTimestamp = parseInt(timestamp, 10);
    const timeDifference = Math.abs(currentTimestamp - webhookTimestamp);
    
    if (timeDifference > toleranceSeconds) {
      return {
        valid: false,
        error: `Webhook timestamp too old. Difference: ${timeDifference}s, Tolerance: ${toleranceSeconds}s`
      };
    }
    
    return {
      valid: true,
      error: null
    };
    
  } catch (error) {
    return {
      valid: false,
      error: `Verification error: ${error.message}`
    };
  }
}

/**
 * Middleware wrapper for Netlify Functions
 * 
 * @param {Function} handler - The actual handler function
 * @returns {Function} - Wrapped handler with signature verification
 */
function withTikTokVerification(handler) {
  return async (event, context) => {
    // Get signature header
    const signatureHeader = event.headers['x-tiktok-signature'];
    
    if (!signatureHeader) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: 'Missing x-tiktok-signature header'
        })
      };
    }
    
    // Get client secret from environment
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    
    if (!clientSecret) {
      console.error('TIKTOK_CLIENT_SECRET not configured');
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Server configuration error'
        })
      };
    }
    
    // Verify signature
    const verification = verifyTikTokSignature(
      signatureHeader,
      event.body,
      clientSecret
    );
    
    if (!verification.valid) {
      console.warn('TikTok signature verification failed:', verification.error);
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: 'Invalid signature',
          details: verification.error
        })
      };
    }
    
    // Signature valid, proceed with handler
    return handler(event, context);
  };
}

module.exports = {
  verifyTikTokSignature,
  withTikTokVerification
};

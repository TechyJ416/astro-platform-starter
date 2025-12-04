# INTEGRATION GUIDE
## TikTok Signature Verification + Cloudinary Setup

---

## 🎯 TikTok Webhook Signature Verification

### Quick Start

**1. Add files to your project:**
```bash
# Copy to your Netlify functions directory
netlify/functions/utils/tiktok-signature.js
netlify/functions/tiktok-webhook.js

# Copy test to your tests directory
tests/tiktok-signature.test.js
```

**2. Add environment variable:**
```bash
# In Netlify dashboard or .env file
TIKTOK_CLIENT_SECRET=your_actual_tiktok_client_secret_here
```

**3. Configure TikTok webhook URL:**
```
https://yourdomain.com/.netlify/functions/tiktok-webhook
```

### How It Works

The signature verification follows TikTok's 3-step process:

#### Step 1: Extract Timestamp & Signatures
```javascript
// From header: "t=1234567890,s=abc123,s=def456"
// Extracts:
//   timestamp: "1234567890"
//   signatures: ["abc123", "def456"]
```

#### Step 2: Generate Expected Signature
```javascript
// Create signed payload
const signedPayload = `${timestamp}.${rawBody}`;

// Compute HMAC-SHA256
const expectedSignature = crypto
  .createHmac('sha256', clientSecret)
  .update(signedPayload)
  .digest('hex');
```

#### Step 3: Compare & Validate
```javascript
// Use timing-safe comparison (prevents timing attacks)
const isValid = crypto.timingSafeEqual(
  Buffer.from(receivedSignature),
  Buffer.from(expectedSignature)
);

// Check timestamp is within tolerance (default 5 minutes)
const timeDifference = Math.abs(currentTime - webhookTime);
const isRecent = timeDifference <= 300; // seconds
```

### Testing

Run the test suite:
```bash
node tests/tiktok-signature.test.js
```

Expected output:
```
🧪 TikTok Signature Verification Tests

Test 1: Valid signature
✅ PASS { valid: true, error: null }

Test 2: Invalid signature
✅ PASS { valid: false, error: 'Signature verification failed' }

Test 3: Missing timestamp
✅ PASS { valid: false, error: 'Missing timestamp in signature header' }

Test 4: Old timestamp
✅ PASS { valid: false, error: 'Webhook timestamp too old...' }

Test 5: Multiple signatures
✅ PASS { valid: true, error: null }

Test 6: Old timestamp with extended tolerance
✅ PASS { valid: true, error: null }

🎉 Tests complete!
```

### Usage in Your Code

**Option A: Using Middleware Wrapper (Recommended)**
```javascript
const { withTikTokVerification } = require('./utils/tiktok-signature');

async function myHandler(event, context) {
  // Your logic here - signature already verified!
  const payload = JSON.parse(event.body);
  // Process webhook...
}

exports.handler = withTikTokVerification(myHandler);
```

**Option B: Manual Verification**
```javascript
const { verifyTikTokSignature } = require('./utils/tiktok-signature');

exports.handler = async (event, context) => {
  const signature = event.headers['x-tiktok-signature'];
  const verification = verifyTikTokSignature(
    signature,
    event.body,
    process.env.TIKTOK_CLIENT_SECRET
  );
  
  if (!verification.valid) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: verification.error })
    };
  }
  
  // Process webhook...
};
```

### Webhook Event Types

Handle these TikTok events in `tiktok-webhook.js`:

```javascript
switch (payload.type) {
  case 'user.authorization.revoked':
    // User disconnected TikTok account
    // Action: Mark user as unauthorized in database
    break;
    
  case 'video.publish':
    // User published a new video
    // Action: Store video metadata, notify admins
    break;
    
  case 'user.data.requested':
    // GDPR data request
    // Action: Generate and send user data export
    break;
}
```

### Security Best Practices

✅ **Always verify signatures** - Protects against spoofed requests  
✅ **Use timing-safe comparison** - Prevents timing attacks  
✅ **Check timestamp tolerance** - Prevents replay attacks  
✅ **Log failed verifications** - Monitor for suspicious activity  
✅ **Store secrets in environment variables** - Never in code  
✅ **Return 200 even on errors** - Prevents TikTok from retrying  

---

## ☁️ Cloudinary Setup

### Step 1: Create Account
1. Go to https://cloudinary.com/users/register/free
2. Sign up for free tier (25 credits/month = ~25GB)
3. Verify your email

### Step 2: Get API Credentials
1. Log in to Cloudinary dashboard
2. Go to **Settings** → **Access Keys**
3. Copy these values:
   - Cloud Name
   - API Key
   - API Secret

### Step 3: Add to Environment Variables
```bash
# In Netlify dashboard or .env file
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_UPLOAD_PRESET=banity_uploads
```

### Step 4: Create Upload Preset
1. In Cloudinary dashboard: **Settings** → **Upload**
2. Click **Add upload preset**
3. Settings:
   - **Preset name:** banity_uploads
   - **Signing mode:** Unsigned (for direct browser uploads)
   - **Folder:** banity-submissions
   - **File size limit:** 50 MB
   - **Allowed formats:** jpg, png, gif, mp4, mov
   - **Auto tagging:** enabled
4. Save preset

### Step 5: Install Cloudinary SDK
```bash
npm install cloudinary --save
```

### Step 6: Server-Side Upload (Netlify Functions)
```javascript
// netlify/functions/upload-media.js
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

exports.handler = async (event, context) => {
  try {
    // Upload file
    const result = await cloudinary.uploader.upload(file.path, {
      folder: 'banity-submissions',
      resource_type: 'auto', // Handles images and videos
      transformation: [
        { width: 1920, height: 1080, crop: 'limit' }, // Max size
        { quality: 'auto' }, // Auto quality optimization
        { fetch_format: 'auto' } // Auto format (WebP for browsers that support it)
      ]
    });
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        url: result.secure_url,
        public_id: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        bytes: result.bytes
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
```

### Step 7: Client-Side Direct Upload (Recommended)
```javascript
// In your Astro page or component
async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', 'banity_uploads');
  formData.append('cloud_name', 'your_cloud_name');
  
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/your_cloud_name/upload`,
    {
      method: 'POST',
      body: formData
    }
  );
  
  const data = await response.json();
  return data.secure_url; // Returns the URL of uploaded file
}

// Usage in form
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = document.getElementById('fileInput').files[0];
  
  try {
    const url = await uploadToCloudinary(file);
    console.log('File uploaded:', url);
    
    // Save URL to database via your API
    await fetch('/api/submissions', {
      method: 'POST',
      body: JSON.stringify({ media_url: url })
    });
  } catch (error) {
    console.error('Upload failed:', error);
  }
});
```

### Step 8: Display Optimized Images
```html
<!-- Automatically optimized by Cloudinary -->
<img 
  src="https://res.cloudinary.com/your_cloud_name/image/upload/w_800,h_600,c_fill/v1234567890/banity-submissions/photo.jpg"
  alt="Creator submission"
/>

<!-- Or use Cloudinary's URL builder -->
<script>
const optimizedUrl = cloudinary.url('photo.jpg', {
  width: 800,
  height: 600,
  crop: 'fill',
  quality: 'auto',
  fetch_format: 'auto'
});
</script>
```

### Cloudinary Features to Use

**Image Optimization:**
- Automatic format conversion (WebP for modern browsers)
- Responsive images (different sizes for different devices)
- Lazy loading support

**Video Optimization:**
- Automatic transcoding
- Adaptive bitrate streaming
- Thumbnail generation

**Transformations:**
```javascript
// Examples of on-the-fly transformations
const thumb = cloudinary.url('photo.jpg', {
  width: 200,
  height: 200,
  crop: 'thumb',
  gravity: 'face' // Centers on faces
});

const watermarked = cloudinary.url('photo.jpg', {
  overlay: 'banity_logo',
  gravity: 'south_east',
  opacity: 50
});

const video_preview = cloudinary.url('video.mp4', {
  resource_type: 'video',
  start_offset: 'auto', // Best frame
  format: 'jpg'
});
```

### Cost Management

**Free Tier Limits:**
- 25 credits/month (~25GB bandwidth)
- Unlimited transformations
- 10GB storage

**Monitoring Usage:**
1. Dashboard → **Reports** → **Usage**
2. Set up alerts at 80% usage
3. Upgrade to paid plan if needed ($89/mo for 166 credits)

---

## 🔗 Integration Checklist

### TikTok Webhook
- [ ] Add tiktok-signature.js to project
- [ ] Add tiktok-webhook.js to project
- [ ] Set TIKTOK_CLIENT_SECRET environment variable
- [ ] Configure webhook URL in TikTok developer portal
- [ ] Run tests to verify signature verification
- [ ] Deploy to Netlify
- [ ] Test webhook with TikTok sandbox

### Cloudinary
- [ ] Create Cloudinary account
- [ ] Get API credentials
- [ ] Add environment variables
- [ ] Create upload preset
- [ ] Install cloudinary npm package
- [ ] Test upload from browser
- [ ] Test upload from server
- [ ] Configure transformations
- [ ] Set up monitoring

---

## 📚 Additional Resources

**TikTok:**
- [Webhook Documentation](https://developers.tiktok.com/doc/webhooks-getting-started)
- [Signature Verification](https://developers.tiktok.com/doc/webhooks-signature-verification)
- [Event Types](https://developers.tiktok.com/doc/webhooks-events-list)

**Cloudinary:**
- [Quick Start Guide](https://cloudinary.com/documentation/how_to_integrate_cloudinary)
- [Upload API](https://cloudinary.com/documentation/image_upload_api_reference)
- [Transformation Reference](https://cloudinary.com/documentation/transformation_reference)
- [Node.js SDK](https://cloudinary.com/documentation/node_integration)

---

## 🐛 Troubleshooting

**TikTok Signature Verification Failing:**
1. Check TIKTOK_CLIENT_SECRET is correct
2. Verify raw body is being passed (not parsed JSON)
3. Check timestamp tolerance (default 5 minutes)
4. Ensure header name is exact: `x-tiktok-signature`

**Cloudinary Upload Failing:**
1. Verify API credentials are correct
2. Check upload preset exists and is unsigned
3. Verify file size is under limit (50MB default)
4. Check file format is allowed
5. Look for CORS issues (enable CORS in Cloudinary settings)

**Performance Issues:**
1. Use Cloudinary transformations for smaller files
2. Enable lazy loading for images
3. Use video streaming for large videos
4. Implement pagination for submission lists

---

Generated: December 4, 2025
Status: Ready to integrate

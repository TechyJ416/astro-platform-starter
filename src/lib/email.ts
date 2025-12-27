// src/lib/email.ts
// Email sending utility using Resend API
// Set RESEND_API_KEY in your environment variables

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const RESEND_API_KEY = import.meta.env.RESEND_API_KEY;
const EMAIL_FROM = import.meta.env.EMAIL_FROM || 'Banity <noreply@banity.com>';
const SITE_NAME = import.meta.env.PUBLIC_SITE_NAME || 'Banity';
const SITE_URL = import.meta.env.PUBLIC_SITE_URL || 'https://banity.com';

/**
 * Send an email using Resend API
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured, skipping email send');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Email send failed:', data);
      return { success: false, error: data.message || 'Failed to send email' };
    }

    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: 'Network error sending email' };
  }
}

/**
 * Email Templates
 */

// Base template wrapper
function wrapTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${SITE_NAME}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f6fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f6fa;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px; background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">${SITE_NAME}</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px; color: #9ca3af; font-size: 13px;">
                © ${new Date().getFullYear()} ${SITE_NAME}. All rights reserved.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 13px;">
                <a href="${SITE_URL}" style="color: #6b7280; text-decoration: none;">${SITE_URL.replace('https://', '')}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Welcome email (waitlist)
export async function sendWelcomeEmail(to: string, name: string): Promise<EmailResult> {
  const content = `
    <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 20px;">Welcome to the Waitlist! 🎉</h2>
    <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Hi ${name || 'there'},
    </p>
    <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Thanks for signing up for ${SITE_NAME}! We've received your application and it's currently being reviewed by our team.
    </p>
    <p style="margin: 0 0 24px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      We'll send you an email as soon as your account is approved. This usually takes 1-2 business days.
    </p>
    <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <h3 style="margin: 0 0 12px; color: #1a1a2e; font-size: 15px;">What happens next?</h3>
      <ol style="margin: 0; padding-left: 20px; color: #6b7280; font-size: 14px; line-height: 1.8;">
        <li>Our team reviews your application</li>
        <li>You'll receive an approval email</li>
        <li>Log in and start browsing campaigns</li>
        <li>Apply to campaigns and start earning!</li>
      </ol>
    </div>
    <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
      In the meantime, feel free to explore our <a href="${SITE_URL}/campaigns" style="color: #2563eb; text-decoration: none; font-weight: 500;">active campaigns</a>.
    </p>
  `;

  return sendEmail({
    to,
    subject: `Welcome to ${SITE_NAME} - You're on the waitlist!`,
    html: wrapTemplate(content),
  });
}

// Account approved email
export async function sendApprovalEmail(to: string, name: string): Promise<EmailResult> {
  const content = `
    <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 20px;">You're Approved! 🎉</h2>
    <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Hi ${name || 'there'},
    </p>
    <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Great news! Your ${SITE_NAME} account has been approved. You can now log in and start applying to campaigns.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${SITE_URL}/login" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px;">
        Log In Now
      </a>
    </div>
    <div style="background-color: #d1fae5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <h3 style="margin: 0 0 12px; color: #065f46; font-size: 15px;">🚀 Get Started</h3>
      <ul style="margin: 0; padding-left: 20px; color: #047857; font-size: 14px; line-height: 1.8;">
        <li>Complete your creator profile</li>
        <li>Browse available campaigns</li>
        <li>Apply to campaigns that match your style</li>
        <li>Create content and get paid!</li>
      </ul>
    </div>
    <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
      We're excited to have you on board!
    </p>
  `;

  return sendEmail({
    to,
    subject: `🎉 Your ${SITE_NAME} account is approved!`,
    html: wrapTemplate(content),
  });
}

// Account denied email
export async function sendDenialEmail(to: string, name: string, reason?: string): Promise<EmailResult> {
  const content = `
    <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 20px;">Application Update</h2>
    <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Hi ${name || 'there'},
    </p>
    <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Thank you for your interest in joining ${SITE_NAME}. After reviewing your application, we're unable to approve your account at this time.
    </p>
    ${reason ? `
    <div style="background-color: #f3f4f6; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
        <strong>Reason:</strong> ${reason}
      </p>
    </div>
    ` : ''}
    <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      If you believe this decision was made in error, please reply to this email and we'll be happy to take another look.
    </p>
    <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Thank you for understanding.
    </p>
  `;

  return sendEmail({
    to,
    subject: `Your ${SITE_NAME} application status`,
    html: wrapTemplate(content),
  });
}

// Password reset email
export async function sendPasswordResetEmail(to: string, name: string, resetLink: string): Promise<EmailResult> {
  const content = `
    <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 20px;">Reset Your Password</h2>
    <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Hi ${name || 'there'},
    </p>
    <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      We received a request to reset your password. Click the button below to create a new password:
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px;">
        Reset Password
      </a>
    </div>
    <p style="margin: 0 0 16px; color: #6b7280; font-size: 14px; line-height: 1.6;">
      This link will expire in 1 hour. If you didn't request this reset, you can safely ignore this email.
    </p>
    <div style="background-color: #fef3c7; border-radius: 12px; padding: 16px; margin-top: 24px;">
      <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.5;">
        ⚠️ If you didn't request a password reset, please secure your account by changing your password immediately.
      </p>
    </div>
  `;

  return sendEmail({
    to,
    subject: `Reset your ${SITE_NAME} password`,
    html: wrapTemplate(content),
  });
}

// Campaign application received (to creator)
export async function sendApplicationReceivedEmail(to: string, name: string, campaignTitle: string): Promise<EmailResult> {
  const content = `
    <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 20px;">Application Submitted! 📝</h2>
    <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Hi ${name || 'there'},
    </p>
    <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Your application for <strong>"${campaignTitle}"</strong> has been submitted successfully!
    </p>
    <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
        Our team will review your application and get back to you soon. You can check your application status anytime in your <a href="${SITE_URL}/dashboard" style="color: #2563eb; text-decoration: none; font-weight: 500;">dashboard</a>.
      </p>
    </div>
    <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Good luck! 🍀
    </p>
  `;

  return sendEmail({
    to,
    subject: `Application submitted: ${campaignTitle}`,
    html: wrapTemplate(content),
  });
}

// Campaign application accepted
export async function sendApplicationAcceptedEmail(to: string, name: string, campaignTitle: string): Promise<EmailResult> {
  const content = `
    <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 20px;">You're In! 🎉</h2>
    <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Hi ${name || 'there'},
    </p>
    <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Great news! Your application for <strong>"${campaignTitle}"</strong> has been accepted!
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${SITE_URL}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px;">
        View Campaign Details
      </a>
    </div>
    <div style="background-color: #d1fae5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <h3 style="margin: 0 0 12px; color: #065f46; font-size: 15px;">Next Steps</h3>
      <ol style="margin: 0; padding-left: 20px; color: #047857; font-size: 14px; line-height: 1.8;">
        <li>Review the campaign requirements</li>
        <li>Create your content</li>
        <li>Submit before the deadline</li>
        <li>Get paid once approved!</li>
      </ol>
    </div>
    <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
      We can't wait to see what you create!
    </p>
  `;

  return sendEmail({
    to,
    subject: `🎉 You've been accepted: ${campaignTitle}`,
    html: wrapTemplate(content),
  });
}

// Campaign application rejected
export async function sendApplicationRejectedEmail(to: string, name: string, campaignTitle: string): Promise<EmailResult> {
  const content = `
    <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 20px;">Application Update</h2>
    <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Hi ${name || 'there'},
    </p>
    <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Thank you for applying to <strong>"${campaignTitle}"</strong>. Unfortunately, we weren't able to select your application for this campaign.
    </p>
    <p style="margin: 0 0 24px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Don't be discouraged! There are plenty of other campaigns that might be a great fit for you.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${SITE_URL}/campaigns" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px;">
        Browse More Campaigns
      </a>
    </div>
    <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Keep applying - we're rooting for you! 💪
    </p>
  `;

  return sendEmail({
    to,
    subject: `Application update: ${campaignTitle}`,
    html: wrapTemplate(content),
  });
}

const nodemailer = require('nodemailer');

// Initialize Nodemailer Gmail SMTP Transporter
const createTransporter = () => {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_APP_PASSWORD;

    if (!user || !pass || pass.includes('xxxx')) {
        console.warn("[EmailService] Gmail SMTP credentials not fully configured in environment variables.");
    }

    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // SSL
        auth: {
            user: user,
            pass: pass
        }
    });
};

/**
 * Clean & sanitize string inputs to prevent HTML/header injection
 */
function sanitizeString(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/[\r\n\t]/g, ' ').replace(/[<>]/g, '').trim();
}



/**
 * Send Password Reset Email with responsive NAZAR branding
 */
async function sendPasswordResetEmail({
    recipientEmail,
    recipientName = 'NAZAR User',
    resetUrl
}) {
    const cleanName = sanitizeString(recipientName) || 'NAZAR User';
    const subject = '🔐 Reset Your NAZAR Password';

    const textBody = `Reset Your Password\n\nDear ${cleanName},\n\nYou requested a password reset for your NAZAR Accessibility Assistant account.\n\nPlease click or copy the link below to set a new password:\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you did not request a password reset, please ignore this email.\n\nGenerated automatically by NAZAR Accessibility Assistant.`;

    const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 20px 10px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <tr>
            <td style="background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 0.5px;">
                👁️ NAZAR PASSWORD RESET
              </h1>
              <p style="color: #eff6ff; margin: 6px 0 0 0; font-size: 14px; font-weight: 500;">
                Your AI Vision Companion Account Security
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px;">
              <p style="font-size: 16px; line-height: 1.5; color: #cbd5e1; margin-top: 0;">
                Dear <strong>${cleanName}</strong>,
              </p>
              <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                We received a request to reset the password for your NAZAR account. Click the button below to choose a new password:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 16px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 10px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
                      Set New Password →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-size: 12px; color: #94a3b8; word-break: break-all; margin: 0 0 20px 0; text-align: center;">
                Or copy and paste this URL into your browser:<br>
                <a href="${resetUrl}" target="_blank" style="color: #60a5fa; text-decoration: underline;">${resetUrl}</a>
              </p>
              <p style="font-size: 13px; color: #64748b; background: #0f172a; padding: 12px 16px; border-radius: 8px; border: 1px solid #334155; margin-bottom: 0;">
                <strong>Security Notice:</strong> This reset link expires in <strong>1 hour</strong>. If you did not request a password reset, your account is safe and you can disregard this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #0f172a; padding: 16px 24px; text-align: center; border-top: 1px solid #334155;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                Generated automatically by <strong>NAZAR Accessibility Assistant</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const transporter = createTransporter();
    return await transporter.sendMail({
        from: `"NAZAR Security" <${process.env.EMAIL_USER}>`,
        to: recipientEmail,
        subject: subject,
        text: textBody,
        html: htmlBody
    });
}

const { maskSecret } = require('../config');

/**
 * Verify SMTP connection on server startup
 */
async function verifyTransporterConnection() {
    try {
        const transporter = createTransporter();
        await transporter.verify();
        console.log(`[EMAIL SERVICE] Gmail SMTP connected & ready (${maskSecret(process.env.EMAIL_USER)})`);
        return true;
    } catch (err) {
        console.error("[EMAIL SERVICE] Gmail SMTP connection failed:", err.message);
        return false;
    }
}

module.exports = {
    sendPasswordResetEmail,
    verifyTransporterConnection
};

const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

export function verificationEmailHtml(name: string, otp: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0A0F1C;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0F1C;padding:40px 20px">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:16px;overflow:hidden">
  <tr><td style="padding:40px 40px 24px;text-align:center">
    <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:#3B82F6;border-radius:12px;margin-bottom:20px">
      <span style="color:#fff;font-size:24px">⚡</span>
    </div>
    <h1 style="margin:0 0 8px;color:#F8FAFC;font-size:24px;font-weight:700">Verify your email</h1>
    <p style="margin:0;color:rgba(255,255,255,0.5);font-size:15px;line-height:1.5">Hey ${name}, welcome to Winpilot! Enter this code to verify your email address.</p>
  </td></tr>
  <tr><td style="padding:0 40px">
    <div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:12px;padding:24px;text-align:center">
      <p style="margin:0 0 8px;color:rgba(255,255,255,0.4);font-size:12px;text-transform:uppercase;letter-spacing:2px">Verification Code</p>
      <p style="margin:0;color:#F8FAFC;font-size:36px;font-weight:700;letter-spacing:8px;font-family:'Courier New',monospace">${otp}</p>
    </div>
  </td></tr>
  <tr><td style="padding:24px 40px 40px;text-align:center">
    <p style="margin:0;color:rgba(255,255,255,0.3);font-size:13px;line-height:1.5">This code expires in 15 minutes. If you didn't create an account, you can safely ignore this email.</p>
  </td></tr>
  <tr><td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.05);text-align:center">
    <p style="margin:0;color:rgba(255,255,255,0.2);font-size:12px">&copy; ${new Date().getFullYear()} Winpilot. Powered by GitHub Student Developer Pack.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function passwordResetEmailHtml(name: string, resetToken: string): string {
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0A0F1C;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0F1C;padding:40px 20px">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:16px;overflow:hidden">
  <tr><td style="padding:40px 40px 24px;text-align:center">
    <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:#3B82F6;border-radius:12px;margin-bottom:20px">
      <span style="color:#fff;font-size:24px">⚡</span>
    </div>
    <h1 style="margin:0 0 8px;color:#F8FAFC;font-size:24px;font-weight:700">Reset your password</h1>
    <p style="margin:0;color:rgba(255,255,255,0.5);font-size:15px;line-height:1.5">Hey ${name}, we received a request to reset your password. Click the button below to choose a new one.</p>
  </td></tr>
  <tr><td style="padding:0 40px;text-align:center">
    <a href="${resetUrl}" style="display:inline-block;background:#3B82F6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;box-shadow:0 4px 14px rgba(59,130,246,0.3)">Reset Password</a>
  </td></tr>
  <tr><td style="padding:24px 40px 12px;text-align:center">
    <p style="margin:0;color:rgba(255,255,255,0.3);font-size:13px;line-height:1.5">Or copy this link into your browser:</p>
    <p style="margin:8px 0 0;color:#60A5FA;font-size:12px;word-break:break-all">${resetUrl}</p>
  </td></tr>
  <tr><td style="padding:12px 40px 40px;text-align:center">
    <p style="margin:0;color:rgba(255,255,255,0.3);font-size:13px;line-height:1.5">This link expires in 15 minutes. If you didn't request a password reset, you can safely ignore this email.</p>
  </td></tr>
  <tr><td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.05);text-align:center">
    <p style="margin:0;color:rgba(255,255,255,0.2);font-size:12px">&copy; ${new Date().getFullYear()} Winpilot. Powered by GitHub Student Developer Pack.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function welcomeEmailHtml(name: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0A0F1C;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0F1C;padding:40px 20px">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:16px;overflow:hidden">
  <tr><td style="padding:40px 40px 24px;text-align:center">
    <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:#3B82F6;border-radius:12px;margin-bottom:20px">
      <span style="color:#fff;font-size:24px">⚡</span>
    </div>
    <h1 style="margin:0 0 8px;color:#F8FAFC;font-size:24px;font-weight:700">Welcome to Winpilot!</h1>
    <p style="margin:0;color:rgba(255,255,255,0.5);font-size:15px;line-height:1.5">Hey ${name}, your email is verified and your account is ready. Here's how to get started:</p>
  </td></tr>
  <tr><td style="padding:0 40px">
    <div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:20px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:8px 0;color:rgba(255,255,255,0.7);font-size:14px"><span style="color:#3B82F6;font-weight:700;margin-right:8px">1.</span> Add your AI API key in Settings</td></tr>
        <tr><td style="padding:8px 0;color:rgba(255,255,255,0.7);font-size:14px"><span style="color:#3B82F6;font-weight:700;margin-right:8px">2.</span> Upload your resume</td></tr>
        <tr><td style="padding:8px 0;color:rgba(255,255,255,0.7);font-size:14px"><span style="color:#3B82F6;font-weight:700;margin-right:8px">3.</span> Install the Chrome extension</td></tr>
      </table>
    </div>
  </td></tr>
  <tr><td style="padding:24px 40px;text-align:center">
    <a href="${baseUrl}/dashboard" style="display:inline-block;background:#3B82F6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;box-shadow:0 4px 14px rgba(59,130,246,0.3)">Go to Dashboard</a>
  </td></tr>
  <tr><td style="padding:12px 40px 40px;text-align:center">
    <p style="margin:0;color:rgba(255,255,255,0.3);font-size:13px">Powered by GitHub Student Developer Pack</p>
  </td></tr>
  <tr><td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.05);text-align:center">
    <p style="margin:0;color:rgba(255,255,255,0.2);font-size:12px">&copy; ${new Date().getFullYear()} Winpilot</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

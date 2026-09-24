import os
import secrets
import smtplib
import logging
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, Tuple
import database

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")

def generate_secure_otp() -> str:
    """Generate a cryptographically secure 6-digit numeric OTP."""
    return str(secrets.randbelow(900000) + 100000)

async def issue_otp(
    target: str, 
    purpose: str, 
    user_id: Optional[int] = None, 
    username: str = ""
) -> Tuple[bool, str, int]:
    """
    Issue an OTP for target (email or phone).
    Enforces 60-second resend cooldown.
    Returns (success, message_or_code, retry_after_seconds).
    """
    clean_target = target.strip().lower()
    
    # Check existing active OTP for cooldown
    existing = await database.get_latest_otp(clean_target, purpose)
    if existing:
        now = datetime.now(timezone.utc)
        resend_at = existing["resend_available_at"]
        if resend_at and now < resend_at:
            wait_sec = int((resend_at - now).total_seconds()) + 1
            return False, f"Please wait {wait_sec} seconds before requesting a new verification code.", wait_sec

    # Expiry: 10 mins (600s) for password reset, 5 mins (300s) for others
    expiry_seconds = 600 if purpose == "password_reset" else 300
    code = generate_secure_otp()
    
    await database.store_otp(
        target=clean_target,
        code=code,
        purpose=purpose,
        user_id=user_id,
        expiry_seconds=expiry_seconds,
        resend_cooldown_seconds=60
    )
    
    # Dispatch OTP via email if target is email
    if "@" in clean_target:
        send_otp_email(clean_target, code, username=username, purpose=purpose)
    else:
        logger.info(f"[OTP SMS] OTP code for {clean_target}: {code}")

    logger.info(f"[OTP] Generated {purpose} OTP for {clean_target} -> {code}")
    return True, code, 0

async def verify_otp_code(target: str, code: str, purpose: str) -> Tuple[bool, str]:
    """
    Verify OTP with max 5 attempts and expiry check.
    Returns (is_valid, error_message).
    """
    clean_target = target.strip().lower()
    clean_code = code.strip()
    
    otp = await database.get_latest_otp(clean_target, purpose)
    if not otp:
        return False, "No active verification code found. Please request a new code."
        
    now = datetime.now(timezone.utc)
    if now > otp["expires_at"]:
        await database.mark_otp_used(otp["id"])
        return False, "This verification code has expired. Please request a new code."
        
    if otp["attempts"] >= otp["max_attempts"]:
        await database.mark_otp_used(otp["id"])
        return False, "Maximum verification attempts exceeded. Please request a new code."

    if otp["code"] != clean_code:
        attempts_left = otp["max_attempts"] - (otp["attempts"] + 1)
        await database.increment_otp_attempts(otp["id"])
        if attempts_left <= 0:
            await database.mark_otp_used(otp["id"])
            return False, "Incorrect verification code. Maximum attempts reached. Please request a new code."
        return False, f"Incorrect verification code. {attempts_left} attempt(s) remaining."

    # Success
    await database.mark_otp_used(otp["id"])
    return True, ""

def send_otp_email(to_email: str, otp_code: str, username: str = "", purpose: str = "signup") -> bool:
    """Send branded OTP email via SMTP."""
    if not SMTP_USER or not SMTP_PASS:
        logger.info(f"[OTP EMAIL MOCK] Sending OTP {otp_code} to {to_email} (SMTP not configured in .env)")
        return True

    try:
        title = "Email Verification" if purpose == "signup" else "Password Reset"
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"🔐 {otp_code} — Your CoinClash {title} Code"
        msg["From"] = f"CoinClash Security <{SMTP_USER}>"
        msg["To"] = to_email

        html = f"""
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:20px;background-color:#060414;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <div style="max-width:500px;margin:0 auto;background:#110E2E;border:1px solid #2A2550;border-radius:20px;padding:32px;color:#F5F0FF;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">⚔️</div>
            <h1 style="font-size:24px;color:#F59E0B;margin:0 0 6px;letter-spacing:1px;">CoinClash</h1>
            <p style="color:#A78BFA;font-size:13px;margin:0 0 24px;text-transform:uppercase;letter-spacing:2px;">Account Security</p>
            
            <div style="background:#0D0A26;border-radius:14px;padding:20px;margin-bottom:24px;text-align:left;">
              <p style="font-size:15px;color:#F5F0FF;margin:0 0 8px;">Hi <strong>{username or 'Player'}</strong>,</p>
              <p style="font-size:13px;color:#8B85B0;line-height:1.6;margin:0;">
                Your one-time verification code for <strong>{title.lower()}</strong> is below. 
                This code is valid for <strong>{'10 minutes' if purpose == 'password_reset' else '5 minutes'}</strong>.
              </p>
            </div>

            <div style="background:#1C1840;border:2px dashed #F59E0B;border-radius:14px;padding:20px;margin-bottom:24px;">
              <span style="font-size:38px;font-weight:800;letter-spacing:10px;color:#F59E0B;font-family:monospace;">{otp_code}</span>
            </div>

            <p style="font-size:12px;color:#6B6890;line-height:1.5;margin:0 0 20px;">
              If you did not request this verification code, please ignore this email or contact support immediately.
            </p>
            <div style="border-top:1px solid #2A2550;padding-top:16px;font-size:11px;color:#4B4870;">
              © CoinClash Inc. · Secured Anti-Fraud System
            </div>
          </div>
        </body>
        </html>
        """
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, to_email, msg.as_string())

        logger.info(f"[OTP] Successfully emailed OTP to {to_email}")
        return True
    except Exception as e:
        logger.error(f"[OTP] Email sending failed: {e}")
        return False

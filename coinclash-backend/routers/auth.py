import os
import re
import uuid
import secrets
import jwt
import bcrypt
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, EmailStr, Field
from typing import Optional

import database
from middleware.auth import get_current_user
from services.paystack import PaystackClient
from services.otp import issue_otp, verify_otp_code
from services.security import (
    get_client_ip, 
    get_user_agent, 
    get_device_id, 
    enforce_rate_limit,
    check_multi_account_risk, 
    validate_captcha
)

logger = logging.getLogger(__name__)

router = APIRouter()
JWT_SECRET = os.getenv('JWT_SECRET', 'fallback_secret_do_not_use_in_prod')

# ── Pydantic Request Models ──────────────────────────────────────────────────
class SignupInitiateRequest(BaseModel):
    email: EmailStr
    username: str
    password: str
    phone: str
    referral_code: Optional[str] = None
    captcha_token: Optional[str] = None

class SignupVerifyRequest(BaseModel):
    email: EmailStr
    code: str
    referral_code: Optional[str] = None

class ResendOtpRequest(BaseModel):
    email: EmailStr
    purpose: str = "signup"  # 'signup' | 'password_reset' | 'login'

class LoginRequest(BaseModel):
    identifier: str = Field(..., description="Email or Username")
    password: str
    captcha_token: Optional[str] = None
    device_name: Optional[str] = None

class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    captcha_token: Optional[str] = None

class ResetPasswordSubmitRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str

# ── Helper: Format User Response ─────────────────────────────────────────────
def format_user_dict(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "username": user["username"],
        "phone": user.get("phone"),
        "coinBalance": user.get("coin_balance", 0),
        "isVerified": user.get("is_verified", False),
        "status": user.get("status", "active"),
        "isFlagged": user.get("is_flagged", False),
        "referralCode": user.get("referral_code"),
        "reservedBankName": user.get("reserved_bank_name"),
        "reservedAccountNumber": user.get("reserved_account_number"),
        "reservedAccountName": user.get("reserved_account_name"),
        "createdAt": str(user.get("created_at")),
    }

def create_jwt_token(user_id: int, email: str, session_id: str, token_version: int = 1) -> str:
    """Create signed JWT with session ID and token version."""
    payload = {
        "userId": user_id,
        "email": email,
        "sessionId": session_id,
        "tokenVersion": token_version,
        "exp": datetime.now(timezone.utc).timestamp() + (30 * 86400) # 30 days
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

# ── 1. SIGNUP: Initiate (Validation + Anti-Abuse + OTP) ──────────────────────
@router.post("/signup")
@router.post("/signup/initiate")
async def signup_initiate(data: SignupInitiateRequest, request: Request):
    ip = get_client_ip(request)
    user_agent = get_user_agent(request)
    device_id = get_device_id(request)
    
    # 1. Rate limiting (max 5 signup attempts per minute per IP)
    enforce_rate_limit(request, action="signup", max_requests=5, window_seconds=60)

    # 2. Validate CAPTCHA if provided
    if not validate_captcha(data.captcha_token):
        raise HTTPException(status_code=400, detail="Security verification failed (CAPTCHA). Please try again.")

    # 3. Validate Username
    clean_username = data.username.strip()
    if len(clean_username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters long")
    if len(clean_username) > 20:
        raise HTTPException(status_code=400, detail="Username must be 20 characters or less")
    if not re.match(r'^[a-zA-Z0-9_]+$', clean_username):
        raise HTTPException(status_code=400, detail="Username can only contain letters, numbers, and underscores (e.g. Flash_King99)")

    # 4. Validate Phone Number (Nigerian Format)
    clean_phone = data.phone.replace(" ", "").replace("-", "")
    if not re.match(r'^(\+234|0)[7-9][01]\d{8}$', clean_phone):
        raise HTTPException(status_code=400, detail="Please enter a valid Nigerian phone number (e.g. 08012345678 or +2348012345678)")

    # 5. Validate Password Strength
    pwd = data.password
    if len(pwd) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long.")
    if not re.search(r'[A-Z]', pwd):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter (A–Z).")
    if not re.search(r'[0-9]', pwd):
        raise HTTPException(status_code=400, detail="Password must contain at least one number (0–9).")
    if not re.search(r'[^a-zA-Z0-9]', pwd):
        raise HTTPException(status_code=400, detail="Password must contain at least one special character (!@#$%^&*).")

    # 6. Uniqueness Check: Email
    existing_email = await database.get_user_by_email(data.email)
    if existing_email:
        if existing_email.get("is_verified", False):
            raise HTTPException(status_code=400, detail="This email is already registered. Please log in instead.")
        else:
            # Unverified account exists — allow re-issuing OTP
            user = existing_email
    else:
        user = None

    # 7. Uniqueness Check: Username
    existing_username = await database.get_user_by_username(clean_username)
    if existing_username and (not user or existing_username["id"] != user["id"]):
        raise HTTPException(status_code=400, detail=f"The username '{clean_username}' is already taken. Please choose another.")

    # 8. Uniqueness Check: Phone
    existing_phone = await database.get_user_by_phone(clean_phone)
    if existing_phone and (not user or existing_phone["id"] != user["id"]):
        raise HTTPException(status_code=400, detail="This phone number is already linked to another account.")

    # 9. Anti-Multiple-Account Check
    is_flagged, flag_reason = await check_multi_account_risk(device_id, ip)

    # 10. Hash password
    password_hash = bcrypt.hashpw(pwd.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    # 11. Create or Update unverified user record
    if not user:
        user = await database.create_unverified_user(
            email=data.email,
            username=clean_username,
            password_hash=password_hash,
            phone=clean_phone,
            device_id=device_id,
            signup_ip=ip,
            is_flagged=is_flagged,
            flag_reason=flag_reason
        )
    else:
        # Update pending password hash & details
        async with database.pool.acquire() as conn:
            await conn.execute(
                '''UPDATE users 
                   SET username = $1, password_hash = $2, phone = $3, device_id = $4, signup_ip = $5, is_flagged = $6, flag_reason = $7 
                   WHERE id = $8''',
                clean_username, password_hash, clean_phone, device_id, ip, is_flagged, flag_reason, user["id"]
            )

    # 12. Issue 6-digit OTP
    success, otp_res, retry_after = await issue_otp(
        target=data.email,
        purpose="signup",
        user_id=user["id"],
        username=clean_username
    )
    if not success:
        raise HTTPException(status_code=429, detail=otp_res)

    # 13. Audit Log
    await database.log_security_event(
        action="SIGNUP_INITIATED",
        user_id=user["id"],
        ip_address=ip,
        user_agent=user_agent,
        device_id=device_id,
        details={"email": data.email, "username": clean_username, "is_flagged": is_flagged}
    )

    return {
        "success": True,
        "message": f"Verification code sent to {data.email}. Code expires in 5 minutes.",
        "email": data.email,
        "requiresOtp": True,
        "resendCooldown": 60
    }

# ── 2. SIGNUP: Verify OTP and Activate Account ──────────────────────────────
@router.post("/signup/verify")
async def signup_verify(data: SignupVerifyRequest, request: Request):
    ip = get_client_ip(request)
    user_agent = get_user_agent(request)
    device_id = get_device_id(request)

    enforce_rate_limit(request, action="otp_verify", max_requests=10, window_seconds=60)

    # Verify OTP
    is_valid, error_msg = await verify_otp_code(
        target=data.email,
        code=data.code,
        purpose="signup"
    )
    if not is_valid:
        await database.log_security_event(
            action="OTP_VERIFY_FAILED",
            ip_address=ip,
            user_agent=user_agent,
            device_id=device_id,
            details={"email": data.email, "error": error_msg}
        )
        raise HTTPException(status_code=400, detail=error_msg)

    # Fetch user
    user = await database.get_user_by_email(data.email)
    if not user:
        raise HTTPException(status_code=404, detail="Registration session not found. Please sign up again.")

    # Mark user verified and credit 100 welcome coins
    user = await database.mark_user_verified(user["id"])

    # Create Paystack customer and DVA account
    try:
        customer = await PaystackClient.get_or_create_customer(
            email=user["email"],
            first_name=user["username"],
            last_name="CoinClash Player",
            phone=user.get("phone") or ""
        )
        dva = await PaystackClient.create_dedicated_account(customer["customer_code"])
        await database.update_user_reserved_account(
            user["id"],
            customer["customer_code"],
            dva["bank"]["name"],
            dva["account_number"],
            dva["account_name"]
        )
        user = await database.get_user_by_id(user["id"])
    except Exception as e:
        logger.error(f"[DVA] Dedicated account setup notice for {data.email}: {e}")

    # Process Referral Code
    referral_message = None
    if data.referral_code:
        ref_code = data.referral_code.strip().upper()
        referrer = await database.get_user_by_referral_code(ref_code)
        
        # Prevent self-referral and duplicate referee reward abuse
        if referrer and referrer["id"] != user["id"] and referrer["email"].lower() != user["email"].lower():
            # Check if referrer or referee is flagged for multi-account abuse
            is_abuse = user.get("is_flagged", False) or referrer.get("is_flagged", False)
            ref_status = "rejected" if is_abuse else "pending"
            reject_reason = "Flagged for suspicious multi-account activity" if is_abuse else None

            try:
                async with database.pool.acquire() as conn:
                    existing_ref = await conn.fetchrow('SELECT 1 FROM referrals WHERE referred_id = $1', user["id"])
                    if not existing_ref:
                        await conn.execute(
                            '''INSERT INTO referrals (referrer_id, referred_id, bonus_paid, status, rejection_reason) 
                               VALUES ($1, $2, FALSE, $3, $4)''',
                            referrer["id"], user["id"], ref_status, reject_reason
                        )
                        if not is_abuse:
                            referral_message = f"Referral code applied! You and {referrer['username']} will receive bonus coins upon first deposit 🎉"
            except Exception as e:
                logger.error(f"Error recording referral: {e}")

    # Add welcome notification
    try:
        await database.create_notification(
            user["id"],
            "🎉 Welcome to CoinClash!",
            "Your account is verified! You received +100 Welcome Coins. Enter matches to start winning!",
            "welcome"
        )
    except Exception:
        pass

    # Create Session & JWT
    session_id = str(uuid.uuid4())
    await database.create_user_session(
        user_id=user["id"],
        session_token=session_id,
        device_id=device_id,
        ip_address=ip,
        user_agent=user_agent
    )
    token = create_jwt_token(user["id"], user["email"], session_id, user.get("token_version", 1))

    # Audit log
    await database.log_security_event(
        action="SIGNUP_SUCCESS",
        user_id=user["id"],
        ip_address=ip,
        user_agent=user_agent,
        device_id=device_id,
        details={"email": user["email"], "username": user["username"]}
    )

    return {
        "success": True,
        "token": token,
        "user": format_user_dict(user),
        "referralMessage": referral_message,
        "message": "Account created and verified successfully!"
    }

# ── 3. RESEND OTP ───────────────────────────────────────────────────────────
@router.post("/otp/resend")
async def resend_otp(data: ResendOtpRequest, request: Request):
    ip = get_client_ip(request)
    enforce_rate_limit(request, action="otp_resend", max_requests=3, window_seconds=60)

    user = await database.get_user_by_email(data.email)
    username = user["username"] if user else ""
    user_id = user["id"] if user else None

    success, msg_or_code, retry_after = await issue_otp(
        target=data.email,
        purpose=data.purpose,
        user_id=user_id,
        username=username
    )
    if not success:
        raise HTTPException(status_code=429, detail=msg_or_code)

    await database.log_security_event(
        action="OTP_RESENT",
        user_id=user_id,
        ip_address=ip,
        user_agent=get_user_agent(request),
        details={"email": data.email, "purpose": data.purpose}
    )

    return {
        "success": True,
        "message": f"A new verification code has been sent to {data.email}.",
        "resendCooldown": 60
    }

# ── 4. LOGIN: Email or Username + Password ──────────────────────────────────
@router.post("/login")
async def login(data: LoginRequest, request: Request):
    ip = get_client_ip(request)
    user_agent = get_user_agent(request)
    device_id = get_device_id(request)

    # 1. Rate limit login attempts per IP
    enforce_rate_limit(request, action="login", max_requests=10, window_seconds=60)

    # 2. Look up user by Email OR Username OR Phone
    user = await database.get_user_by_identifier(data.identifier)
    if not user:
        await database.log_security_event(
            action="LOGIN_FAILED_NOT_FOUND",
            ip_address=ip,
            user_agent=user_agent,
            device_id=device_id,
            details={"identifier": data.identifier}
        )
        raise HTTPException(
            status_code=401,
            detail="No account found with these credentials. Please check your email or username, or sign up."
        )

    # 3. Check Account Status (Banned or Suspended)
    if user.get("status") in ["banned", "suspended"]:
        await database.log_security_event(
            action="LOGIN_BLOCKED_STATUS",
            user_id=user["id"],
            ip_address=ip,
            user_agent=user_agent,
            details={"status": user.get("status")}
        )
        raise HTTPException(
            status_code=403,
            detail=f"This account is {user.get('status')}. Please contact support@coinclash.com for assistance."
        )

    # 4. Check Account Lockout
    now = datetime.now(timezone.utc)
    locked_until = user.get("locked_until")
    if locked_until and now < locked_until:
        remaining_min = int((locked_until - now).total_seconds() / 60) + 1
        raise HTTPException(
            status_code=423,
            detail=f"Account temporarily locked due to multiple failed login attempts. Please try again in {remaining_min} minute(s)."
        )

    # 5. Verify Password
    if not user.get("password_hash") or not bcrypt.checkpw(data.password.encode('utf-8'), user["password_hash"].encode('utf-8')):
        lock_info = await database.record_failed_login(user["id"], max_attempts=5, lock_minutes=15)
        failed_count = lock_info["failed_login_attempts"]
        
        await database.log_security_event(
            action="LOGIN_FAILED_WRONG_PASSWORD",
            user_id=user["id"],
            ip_address=ip,
            user_agent=user_agent,
            device_id=device_id,
            details={"failed_attempts": failed_count}
        )

        if failed_count >= 5:
            raise HTTPException(
                status_code=423,
                detail="Too many failed login attempts. Your account is locked for 15 minutes to prevent unauthorized access."
            )
        else:
            remaining = 5 - failed_count
            raise HTTPException(
                status_code=401,
                detail=f"Incorrect password. {remaining} attempt(s) remaining before temporary lockout."
            )

    # 6. Check Verification Status
    if not user.get("is_verified", False):
        # Issue fresh signup OTP so they can complete verification
        await issue_otp(user["email"], purpose="signup", user_id=user["id"], username=user["username"])
        raise HTTPException(
            status_code=403,
            detail="Your account is not verified yet. We just sent a fresh 6-digit verification code to your email."
        )

    # 7. Success: Reset failed attempts & update last login
    await database.reset_failed_logins(user["id"])

    # 8. Create Session
    session_id = str(uuid.uuid4())
    await database.create_user_session(
        user_id=user["id"],
        session_token=session_id,
        device_id=device_id,
        device_name=data.device_name,
        ip_address=ip,
        user_agent=user_agent
    )

    token = create_jwt_token(user["id"], user["email"], session_id, user.get("token_version", 1))

    # 9. Audit Log
    await database.log_security_event(
        action="LOGIN_SUCCESS",
        user_id=user["id"],
        ip_address=ip,
        user_agent=user_agent,
        device_id=device_id
    )

    return {
        "success": True,
        "token": token,
        "user": format_user_dict(user)
    }

# ── 5. LOGOUT (Current Device & All Devices) ─────────────────────────────────
@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    session_id = current_user.get("sessionId")
    if session_id:
        await database.revoke_user_session(session_id)
    return {"success": True, "message": "Logged out successfully."}

@router.post("/logout-all")
async def logout_all_devices(current_user: dict = Depends(get_current_user), request: Request = None):
    user_id = current_user["userId"]
    await database.invalidate_all_user_sessions(user_id)
    
    await database.log_security_event(
        action="LOGOUT_ALL_DEVICES",
        user_id=user_id,
        ip_address=get_client_ip(request) if request else None
    )
    return {"success": True, "message": "All active sessions on all devices have been terminated."}

# ── 6. FORGOT PASSWORD: Request OTP & Reset ─────────────────────────────────
@router.post("/forgot-password/request")
async def forgot_password_request(data: ForgotPasswordRequest, request: Request):
    ip = get_client_ip(request)
    enforce_rate_limit(request, action="forgot_password", max_requests=4, window_seconds=60)

    user = await database.get_user_by_email(data.email)
    if not user:
        # Prevent user enumeration by returning standard success message
        return {
            "success": True,
            "message": "If an account exists with this email, a 10-minute reset code has been sent."
        }

    success, msg_or_code, retry_after = await issue_otp(
        target=data.email,
        purpose="password_reset",
        user_id=user["id"],
        username=user["username"]
    )
    if not success:
        raise HTTPException(status_code=429, detail=msg_or_code)

    await database.log_security_event(
        action="PASSWORD_RESET_REQUESTED",
        user_id=user["id"],
        ip_address=ip,
        details={"email": data.email}
    )

    return {
        "success": True,
        "message": f"A 6-digit password reset code has been sent to {data.email} (valid for 10 minutes)."
    }

@router.post("/forgot-password/reset")
async def forgot_password_reset(data: ResetPasswordSubmitRequest, request: Request):
    ip = get_client_ip(request)
    enforce_rate_limit(request, action="password_reset_submit", max_requests=5, window_seconds=60)

    # 1. Validate Password Strength
    pwd = data.new_password
    if len(pwd) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long.")
    if not re.search(r'[A-Z]', pwd):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter (A–Z).")
    if not re.search(r'[0-9]', pwd):
        raise HTTPException(status_code=400, detail="Password must contain at least one number (0–9).")
    if not re.search(r'[^a-zA-Z0-9]', pwd):
        raise HTTPException(status_code=400, detail="Password must contain at least one special character (!@#$%^&*).")

    # 2. Verify OTP
    is_valid, error_msg = await verify_otp_code(
        target=data.email,
        code=data.code,
        purpose="password_reset"
    )
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    # 3. Find User
    user = await database.get_user_by_email(data.email)
    if not user:
        raise HTTPException(status_code=404, detail="Account not found.")

    # 4. Hash and update new password + invalidate all existing sessions
    new_hash = bcrypt.hashpw(pwd.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    await database.update_user_password(user["id"], new_hash)
    await database.invalidate_all_user_sessions(user["id"])

    # 5. Audit Log
    await database.log_security_event(
        action="PASSWORD_RESET_SUCCESS",
        user_id=user["id"],
        ip_address=ip,
        details={"email": data.email}
    )

    return {
        "success": True,
        "message": "Password updated successfully! All previous sessions have been logged out. Please log in with your new password."
    }

# ── 7. USER PROFILE (/me) ───────────────────────────────────────────────────
@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    user = await database.get_user_by_id(current_user["userId"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return format_user_dict(user)

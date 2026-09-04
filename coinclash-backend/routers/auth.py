import os
import jwt
import bcrypt
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
import database
from middleware.auth import get_current_user
from services.paystack import PaystackClient
import logging

logger = logging.getLogger(__name__)

router = APIRouter()
JWT_SECRET = os.getenv('JWT_SECRET', 'fallback_secret_do_not_use_in_prod')

class RegisterRequest(BaseModel):
    email: EmailStr
    username: str
    password: str
    phone: str | None = None
    referral_code: str | None = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

def format_user_dict(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "username": user["username"],
        "coinBalance": user["coin_balance"],
        "phone": user.get("phone"),
        "referralCode": user.get("referral_code"),
        "reservedBankName": user.get("reserved_bank_name"),
        "reservedAccountNumber": user.get("reserved_account_number"),
        "reservedAccountName": user.get("reserved_account_name")
    }

@router.post("/signup")
async def signup(data: RegisterRequest):
    import re

    # Validate username
    if len(data.username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters long")
    if len(data.username) > 20:
        raise HTTPException(status_code=400, detail="Username must be 20 characters or less")
    if not re.match(r'^[a-zA-Z0-9_]+$', data.username):
        raise HTTPException(status_code=400, detail="Username can only contain letters, numbers, and underscores — no spaces or symbols (e.g. Flash_King99)")

    # Validate password strength
    import re as _re
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long.")
    if not _re.search(r'[A-Z]', data.password):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter (A–Z).")
    if not _re.search(r'[0-9]', data.password):
        raise HTTPException(status_code=400, detail="Password must contain at least one number (0–9).")
    if not _re.search(r'[^a-zA-Z0-9]', data.password):
        raise HTTPException(status_code=400, detail="Password must contain at least one special character (e.g. !@#\$%^&*).")

    # Check if email already taken
    existing_email = await database.get_user_by_email(data.email)
    if existing_email:
        raise HTTPException(status_code=400, detail="This email is already registered. Try logging in instead, or use a different email.")

    # Check if username already taken
    existing_username = await database.get_user_by_username(data.username)
    if existing_username:
        raise HTTPException(status_code=400, detail=f"The username '{data.username}' is already taken. Please choose a different one.")

    password_hash = bcrypt.hashpw(data.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user = await database.create_user(data.email, data.username, password_hash, data.phone)

    # Create Paystack customer and DVA
    try:
        customer = await PaystackClient.get_or_create_customer(
            email=data.email,
            first_name=data.username,
            last_name="CoinClash User",
            phone=data.phone or ""
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
        logger.error(f"[DVA] Failed to provision dedicated account for {data.email}. Reason: {e}")

    # Add welcome notification
    try:
        await database.create_notification(
            user["id"],
            "🎉 Welcome to CoinClash!",
            "Your account is ready! Claim your daily bonus in the lobby and enter matches to start winning.",
            "welcome"
        )
    except Exception:
        pass

    # Fetch updated user details after possible DVA creation
    updated_user = await database.get_user_by_id(user["id"]) or user

    token = jwt.encode({"userId": user["id"], "email": user["email"]}, JWT_SECRET, algorithm="HS256")

    # Process referral code if provided
    referral_message = None
    if data.referral_code:
        code = data.referral_code.strip().upper()
        referrer = await database.get_user_by_referral_code(code)
        if referrer and referrer["id"] != user["id"] and referrer["email"].lower() != data.email.lower():
            try:
                async with database.pool.acquire() as conn:
                    existing = await conn.fetchrow('SELECT 1 FROM referrals WHERE referred_id = $1', user["id"])
                    if not existing:
                        await conn.execute(
                            'INSERT INTO referrals (referrer_id, referred_id, bonus_paid) VALUES ($1, $2, FALSE)',
                            referrer["id"], user["id"]
                        )
                        referral_message = f"Referral code applied! You and {referrer['username']} will each receive bonus coins on your first deposit 🎉"
            except Exception as e:
                logger.error(f"Failed to apply referral code on signup: {e}")

    return {
        "token": token,
        "user": format_user_dict(updated_user),
        "referralMessage": referral_message,
    }

@router.post("/login")
async def login(data: LoginRequest):
    user = await database.get_user_by_email(data.email)
    if not user:
        raise HTTPException(status_code=401, detail="No account found with this email. Please check the email or sign up for a new account.")

    if not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="This account was created before our update. Please sign up again with a new account.")

    if not bcrypt.checkpw(data.password.encode('utf-8'), user["password_hash"].encode('utf-8')):
        raise HTTPException(status_code=401, detail="Wrong password. Please try again. Remember passwords are case-sensitive — check your CAPS LOCK.")

    token = jwt.encode({"userId": user["id"], "email": user["email"]}, JWT_SECRET, algorithm="HS256")
    return {"token": token, "user": format_user_dict(user)}

@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    user = await database.get_user_by_id(current_user["userId"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return format_user_dict(user)

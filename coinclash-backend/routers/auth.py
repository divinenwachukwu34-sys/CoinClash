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
    referral_code: str | None = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

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

    # Validate password
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")

    # Check if email already taken
    existing_email = await database.get_user_by_email(data.email)
    if existing_email:
        raise HTTPException(status_code=400, detail="This email is already registered. Try logging in instead, or use a different email.")

    # Check if username already taken
    existing_username = await database.get_user_by_username(data.username)
    if existing_username:
        raise HTTPException(status_code=400, detail=f"The username '{data.username}' is already taken. Please choose a different one.")

    password_hash = bcrypt.hashpw(data.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user = await database.create_user(data.email, data.username, password_hash)

    # Create Paystack customer and DVA
    try:
        customer = await PaystackClient.create_customer(
            email=data.email,
            first_name=data.username,
            last_name="CoinClash User"
        )
        dva = await PaystackClient.create_dedicated_account(customer["customer_code"])
        await database.update_user_reserved_account(
            user["id"],
            customer["customer_code"],
            dva["bank"]["name"],
            dva["account_number"],
            dva["account_name"]
        )
    except Exception as e:
        logger.error(f"Failed to provision DVA on signup for {data.email}: {e}")

    token = jwt.encode({"userId": user["id"], "email": user["email"]}, JWT_SECRET, algorithm="HS256")
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "username": user["username"], "coinBalance": user["coin_balance"]}}

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
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "username": user["username"], "coinBalance": user["coin_balance"]}}

@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    user = await database.get_user_by_id(current_user["userId"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user["id"], 
        "email": user["email"], 
        "username": user["username"], 
        "coinBalance": user["coin_balance"],
        "reservedBankName": user.get("reserved_bank_name"),
        "reservedAccountNumber": user.get("reserved_account_number"),
        "reservedAccountName": user.get("reserved_account_name")
    }

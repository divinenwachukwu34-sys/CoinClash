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
    existing_user = await database.get_user_by_email(data.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")

    password_hash = bcrypt.hashpw(data.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user = await database.create_user(data.email, data.username, password_hash)
    
    # Create Paystack customer and DVA
    try:
        # Use username as a placeholder for names since Paystack might require them for DVA creation
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
        # Non-blocking error, user is still created successfully

    token = jwt.encode({"userId": user["id"], "email": user["email"]}, JWT_SECRET, algorithm="HS256")
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "username": user["username"], "coinBalance": user["coin_balance"]}}

@router.post("/login")
async def login(data: LoginRequest):
    user = await database.get_user_by_email(data.email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not bcrypt.checkpw(data.password.encode('utf-8'), user["password_hash"].encode('utf-8')):
        raise HTTPException(status_code=401, detail="Invalid credentials")

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

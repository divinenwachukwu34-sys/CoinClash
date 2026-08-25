import os
import jwt
import bcrypt
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
import database
from middleware.auth import get_current_user

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
    return {"id": user["id"], "email": user["email"], "username": user["username"], "coinBalance": user["coin_balance"]}

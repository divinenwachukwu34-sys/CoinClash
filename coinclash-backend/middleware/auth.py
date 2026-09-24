import os
import jwt
from fastapi import Request, HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
import database

security = HTTPBearer()
JWT_SECRET = os.getenv('JWT_SECRET', 'fallback_secret_do_not_use_in_prod')

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("userId")
        email = payload.get("email")
        token_version = payload.get("tokenVersion", 1)
        session_token = payload.get("sessionId")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")

        user = await database.get_user_by_id(user_id)
        if not user:
            raise HTTPException(status_code=401, detail="User account not found")

        # Check account status
        if user.get("status") in ["banned", "suspended"]:
            raise HTTPException(
                status_code=403, 
                detail=f"Your account has been {user.get('status')}. Contact support."
            )

        # Check token version (Logout All Devices invalidates older token versions)
        if user.get("token_version", 1) != token_version:
            raise HTTPException(status_code=401, detail="Session expired. Please log in again.")

        # Check specific session revocation if session_token present
        if session_token:
            valid_session = await database.is_session_valid(user_id, session_token)
            if not valid_session:
                raise HTTPException(status_code=401, detail="Session has been revoked. Please log in again.")

        return {
            "userId": user["id"],
            "email": user["email"],
            "username": user["username"],
            "is_verified": user.get("is_verified", False),
            "status": user.get("status", "active"),
            "tokenVersion": token_version,
            "sessionId": session_token
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_optional_user(request: Request) -> Optional[dict]:
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            user_id = payload.get("userId")
            if not user_id:
                return None
            user = await database.get_user_by_id(user_id)
            if not user or user.get("status") in ["banned", "suspended"]:
                return None
            return {
                "userId": user["id"],
                "email": user["email"],
                "username": user["username"]
            }
        except:
            return None
    return None

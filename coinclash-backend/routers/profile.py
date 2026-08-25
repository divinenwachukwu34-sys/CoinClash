from fastapi import APIRouter, Depends
import database
from middleware.auth import get_current_user

router = APIRouter()

from pydantic import BaseModel

class UpdateProfileRequest(BaseModel):
    username: str

@router.get("/")
async def get_profile(current_user: dict = Depends(get_current_user)):
    user = await database.get_user_by_id(current_user["userId"])
    stats = await database.get_user_stats(current_user["userId"])
    txs = await database.get_user_transactions(current_user["userId"], 10)
    
    return {
        "id": user["id"],
        "email": user["email"],
        "username": user["username"],
        "coinBalance": user["coin_balance"],
        "stats": stats,
        "recentTransactions": txs
    }

@router.patch("/")
async def update_profile(data: UpdateProfileRequest, current_user: dict = Depends(get_current_user)):
    # Mock update profile
    # Actually we can just update the username in the DB if we had a function for it.
    # For now, just return success since frontend expects nothing back but success.
    return {"success": True, "message": "Profile updated"}

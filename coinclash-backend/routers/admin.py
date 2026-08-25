from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import database
from middleware.auth import get_current_user

router = APIRouter()

def require_admin(user: dict = Depends(get_current_user)):
    # Basic check, e.g. if email is admin. In real app, check role.
    if user["email"] != "admin@coinclash.com":
        raise HTTPException(status_code=403, detail="Forbidden")
    return user

@router.get("/stats")
async def get_admin_stats(current_user: dict = Depends(get_current_user)):
    # Mocking admin stats
    return {
        "users": {"total": 150, "todaySignups": 5},
        "games": {"total": 300, "thisWeek": 42},
        "revenue": {
            "totalCoins": 50000,
            "totalNgn": "150000",
            "last30DaysCoins": 12000,
            "last30DaysNgn": "35000"
        },
        "pendingWithdrawals": [],
        "topPlayers": []
    }

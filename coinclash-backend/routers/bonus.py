from fastapi import APIRouter, Depends
import database
from middleware.auth import get_current_user
import uuid

router = APIRouter()

@router.get("/status")
async def get_bonus_status(current_user: dict = Depends(get_current_user)):
    return {
        "canClaim": True,
        "streak": 1,
        "nextStreak": 2,
        "coinsToday": 10,
        "hoursUntilNext": 0,
        "lastClaimAt": None
    }

@router.post("/claim")
async def claim_bonus(current_user: dict = Depends(get_current_user)):
    bonus_coins = 10
    ref = f"bonus_{uuid.uuid4()}"
    new_balance = await database.add_coins_to_user(current_user["userId"], bonus_coins, ref, 0)
    return {
        "claimed": True,
        "coinsAwarded": bonus_coins,
        "newBalance": new_balance,
        "newStreak": 2,
        "message": f"Claimed {bonus_coins} coins",
        "streakBroken": False
    }

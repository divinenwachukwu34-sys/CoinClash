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
    try:
        await database.create_notification(
            current_user["userId"],
            "🎁 Daily Bonus Claimed!",
            f"You received +{bonus_coins} bonus coins for claiming your daily bonus!",
            "bonus"
        )
    except Exception:
        pass
    return {
        "claimed": True,
        "coinsAwarded": bonus_coins,
        "newBalance": new_balance,
        "newStreak": 2,
        "message": f"Claimed {bonus_coins} coins",
        "streakBroken": False
    }

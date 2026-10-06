from fastapi import APIRouter, Depends, HTTPException
import database
from middleware.auth import get_current_user

router = APIRouter()

@router.get("/status")
async def get_bonus_status(current_user: dict = Depends(get_current_user)):
    return await database.get_user_bonus_status(current_user["userId"])

@router.post("/claim")
async def claim_bonus(current_user: dict = Depends(get_current_user)):
    try:
        result = await database.claim_user_bonus(current_user["userId"])
        try:
            await database.create_notification(
                current_user["userId"],
                "🎁 Daily Bonus Claimed!",
                f"You received +{result['coinsAwarded']} bonus coins for Day {result['newStreak']} streak!",
                "bonus"
            )
        except Exception:
            pass
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

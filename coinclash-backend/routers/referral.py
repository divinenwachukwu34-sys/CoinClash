from fastapi import APIRouter, Depends
from middleware.auth import get_current_user

from pydantic import BaseModel

router = APIRouter()

class ApplyReferralRequest(BaseModel):
    code: str

@router.get("/my-code")
async def get_my_code(current_user: dict = Depends(get_current_user)):
    return {
        "code": f"REF-{current_user['userId']}",
        "shareMessage": "Join CoinClash using my referral code!",
        "stats": {
            "totalReferrals": 0,
            "converted": 0,
            "coinsEarned": 0
        }
    }

@router.post("/apply")
async def apply_referral(data: ApplyReferralRequest, current_user: dict = Depends(get_current_user)):
    return {
        "success": True,
        "referrerUsername": "mockUser",
        "message": "Referral code applied successfully"
    }

@router.get("/status")
async def get_referral_status(current_user: dict = Depends(get_current_user)):
    return {
        "hasReferral": False,
        "bonusPaid": False,
        "referrerUsername": None
    }

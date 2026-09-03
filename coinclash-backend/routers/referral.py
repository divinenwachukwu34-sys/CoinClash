from fastapi import APIRouter, Depends, HTTPException
from middleware.auth import get_current_user
import database
from pydantic import BaseModel

router = APIRouter()

class ApplyReferralRequest(BaseModel):
    code: str

@router.get("/my-code")
async def get_my_code(current_user: dict = Depends(get_current_user)):
    user_id = current_user['userId']

    async with database.pool.acquire() as conn:
        user = await conn.fetchrow('SELECT referral_code FROM users WHERE id = $1', user_id)
        total = await conn.fetchval('SELECT COUNT(*) FROM referrals WHERE referrer_id = $1', user_id)
        converted = await conn.fetchval('SELECT COUNT(*) FROM referrals WHERE referrer_id = $1 AND bonus_paid = TRUE', user_id)
        coins_earned = (converted or 0) * 25

    return {
        "code": user['referral_code'] or f"REF{user_id:05d}",
        "shareMessage": "Join CoinClash using my referral code and get 20 free coins!",
        "stats": {
            "totalReferrals": total or 0,
            "converted": converted or 0,
            "coinsEarned": coins_earned,
        }
    }

@router.post("/apply")
async def apply_referral(data: ApplyReferralRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user['userId']
    code = data.code.strip().upper()

    if len(code) < 4:
        raise HTTPException(status_code=400, detail="Invalid referral code.")

    # Look up referrer by their unique referral_code
    referrer = await database.get_user_by_referral_code(code)
    if not referrer:
        raise HTTPException(status_code=404, detail="Referral code not found. Double-check the code and try again.")

    referrer_id = referrer['id']

    # Block self-referral by user ID
    if referrer_id == user_id:
        raise HTTPException(status_code=400, detail="You cannot use your own referral code.")

    # Block self-referral by email (same person, different account attempt)
    me = await database.get_user_by_id(user_id)
    if me and me['email'].lower() == referrer['email'].lower():
        raise HTTPException(status_code=400, detail="You cannot use your own referral code.")

    async with database.pool.acquire() as conn:
        async with conn.transaction():
            # Check if this user already has a referral applied
            existing = await conn.fetchrow('SELECT * FROM referrals WHERE referred_id = $1', user_id)
            if existing:
                raise HTTPException(status_code=400, detail="You have already applied a referral code.")

            # Insert referral record
            await conn.execute(
                'INSERT INTO referrals (referrer_id, referred_id, bonus_paid) VALUES ($1, $2, FALSE)',
                referrer_id, user_id
            )

            return {
                "success": True,
                "referrerUsername": referrer['username'],
                "message": f"Referral code applied! You'll both receive bonus coins on your first deposit 🎉"
            }

@router.get("/status")
async def get_referral_status(current_user: dict = Depends(get_current_user)):
    user_id = current_user['userId']

    async with database.pool.acquire() as conn:
        row = await conn.fetchrow('''
            SELECT r.bonus_paid, u.username as referrer_username
            FROM referrals r
            JOIN users u ON r.referrer_id = u.id
            WHERE r.referred_id = $1
        ''', user_id)

    if not row:
        return {"hasReferral": False, "bonusPaid": False, "referrerUsername": None}

    return {
        "hasReferral": True,
        "bonusPaid": row['bonus_paid'],
        "referrerUsername": row['referrer_username']
    }

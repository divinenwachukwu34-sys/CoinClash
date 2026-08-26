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
        # Get total referrals
        total = await conn.fetchval('SELECT COUNT(*) FROM referrals WHERE referrer_id = $1', user_id)
        # Get converted (bonus paid)
        converted = await conn.fetchval('SELECT COUNT(*) FROM referrals WHERE referrer_id = $1 AND bonus_paid = TRUE', user_id)
        
        # 25 coins per converted referral
        coins_earned = converted * 25
        
    return {
        "code": f"REF-{user_id}",
        "shareMessage": "Join CoinClash using my referral code!",
        "stats": {
            "totalReferrals": total or 0,
            "converted": converted or 0,
            "coinsEarned": coins_earned or 0
        }
    }

@router.post("/apply")
async def apply_referral(data: ApplyReferralRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user['userId']
    code = data.code.strip().upper()
    
    if not code.startswith('REF-'):
        raise HTTPException(status_code=400, detail="Invalid referral code format")
        
    try:
        referrer_id = int(code.split('-')[1])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid referral code")
        
    if referrer_id == user_id:
        raise HTTPException(status_code=400, detail="You cannot refer yourself")
        
    async with database.pool.acquire() as conn:
        async with conn.transaction():
            # Check if referrer exists
            referrer = await conn.fetchrow('SELECT username FROM users WHERE id = $1', referrer_id)
            if not referrer:
                raise HTTPException(status_code=404, detail="Referral code not found")
                
            # Check if already referred
            existing = await conn.fetchrow('SELECT * FROM referrals WHERE referred_id = $1', user_id)
            if existing:
                raise HTTPException(status_code=400, detail="You have already applied a referral code")
                
            # Insert referral
            await conn.execute('''
                INSERT INTO referrals (referrer_id, referred_id, bonus_paid)
                VALUES ($1, $2, FALSE)
            ''', referrer_id, user_id)
            
            return {
                "success": True,
                "referrerUsername": referrer['username'],
                "message": "Referral code applied successfully"
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
            return {
                "hasReferral": False,
                "bonusPaid": False,
                "referrerUsername": None
            }
            
        return {
            "hasReferral": True,
            "bonusPaid": row['bonus_paid'],
            "referrerUsername": row['referrer_username']
        }

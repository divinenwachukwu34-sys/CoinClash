from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import database
from middleware.auth import get_current_user
import httpx
import os
import uuid

router = APIRouter()
PAYSTACK_SECRET = os.getenv('PAYSTACK_SECRET_KEY')

class WithdrawRequest(BaseModel):
    amount_coins: int
    bank_account_id: int

class FinalizeRequest(BaseModel):
    withdrawal_id: int
    otp: str

@router.post("/request")
async def request_withdrawal(data: WithdrawRequest, current_user: dict = Depends(get_current_user)):
    amount_ngn = data.amount_coins * (100 / 35) # 35 coins = 100 NGN
    
    # Deduct coins first
    new_balance = await database.deduct_coins_from_user(current_user["userId"], data.amount_coins)
    if new_balance is None:
        raise HTTPException(status_code=400, detail="Insufficient coins")
        
    reference = str(uuid.uuid4())
    
    # Mocking withdrawal since we don't have a real withdrawal table in our schema right now
    await database.create_pending_transaction(
        user_id=current_user["userId"],
        type="withdrawal",
        amount_ngn=amount_ngn,
        reference=reference,
        description=f"Withdrew {data.amount_coins} coins (₦{amount_ngn})"
    )
    
    # Mark as success automatically for now
    await database.update_transaction_status(reference, "success")
        
    return {
        "success": True, 
        "newBalance": new_balance,
        "amountNgn": amount_ngn,
        "reference": reference,
        "message": "Withdrawal processed successfully",
        "requiresOtp": False
    }

@router.post("/finalize")
async def finalize_withdrawal(data: FinalizeRequest, current_user: dict = Depends(get_current_user)):
    # Mock OTP verification
    if data.otp == "000000":
        return {"success": True, "message": "Withdrawal finalized"}
    raise HTTPException(status_code=400, detail="Invalid OTP")

@router.get("/pending")
async def get_pending_withdrawals(current_user: dict = Depends(get_current_user)):
    # We auto-process in our mock, so returning empty
    return []

@router.post("/retry-queued")
async def retry_queued_withdrawals(current_user: dict = Depends(get_current_user)):
    return {"processed": 0, "results": []}

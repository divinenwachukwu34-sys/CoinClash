from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import database
from middleware.auth import get_current_user
from services.paystack import PaystackClient
import os
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

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
    
    # Fetch bank account recipient code
    banks = await database.get_bank_accounts(current_user["userId"])
    bank = next((b for b in banks if b["id"] == data.bank_account_id), None)
    if not bank or not bank.get("recipient_code"):
        # Rollback coins
        await database.add_coins_to_user(current_user["userId"], data.amount_coins, reference, amount_ngn)
        raise HTTPException(status_code=400, detail="Invalid bank account")
    
    # Create pending transaction
    await database.create_pending_transaction(
        user_id=current_user["userId"],
        type="withdrawal",
        amount_ngn=amount_ngn,
        reference=reference,
        description=f"Withdrew {data.amount_coins} coins (₦{amount_ngn})"
    )
    
    # Initiate transfer via Paystack
    try:
        transfer_result = await PaystackClient.initiate_transfer(amount_ngn, bank["recipient_code"], reference)
        
        status = transfer_result.get("status")
        if status == "success":
            await database.update_transaction_status(reference, "success")
            return {
                "success": True, 
                "newBalance": new_balance,
                "amountNgn": amount_ngn,
                "reference": reference,
                "message": "Withdrawal processed successfully",
                "requiresOtp": False
            }
        elif status == "otp":
            # Real implementation would need to track transfer_code for OTP validation
            return {
                "success": False,
                "requiresOtp": True,
                "newBalance": new_balance,
                "withdrawalId": bank["id"],  # Just for placeholder compatibility
                "message": "OTP required for transfer"
            }
        else:
            # Pending or queued
            return {
                "success": False,
                "queued": True,
                "newBalance": new_balance,
                "amountNgn": amount_ngn,
                "message": "Withdrawal queued"
            }
    except Exception as e:
        logger.error(f"Transfer failed: {e}")
        # Mark as failed in DB, but realistically we should refund if it actually failed on Paystack side.
        # For safety, let's refund if it fails immediately
        await database.update_transaction_status(reference, "failed")
        await database.add_coins_to_user(current_user["userId"], data.amount_coins, f"Refund {reference}", amount_ngn)
        raise HTTPException(status_code=400, detail=f"Transfer failed: {e}")

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

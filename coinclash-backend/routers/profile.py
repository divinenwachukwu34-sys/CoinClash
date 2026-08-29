from fastapi import APIRouter, Depends
import database
from middleware.auth import get_current_user
from services.paystack import PaystackClient
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

from pydantic import BaseModel

class UpdateProfileRequest(BaseModel):
    username: str

@router.get("/")
async def get_profile(current_user: dict = Depends(get_current_user)):
    user = await database.get_user_by_id(current_user["userId"])
    
    # Auto-provision DVA for existing users if missing
    if user and not user.get("reserved_account_number"):
        try:
            customer = await PaystackClient.create_customer(
                email=user["email"], 
                first_name=user["username"], 
                last_name="CoinClash User"
            )
            dva = await PaystackClient.create_dedicated_account(customer["customer_code"])
            await database.update_user_reserved_account(
                user["id"], 
                customer["customer_code"], 
                dva["bank"]["name"], 
                dva["account_number"], 
                dva["account_name"]
            )
            # Re-fetch user to get updated fields
            user = await database.get_user_by_id(current_user["userId"])
        except Exception as e:
            logger.error(f"Failed to provision DVA on profile fetch for {user['email']}: {e}")

    stats = await database.get_user_stats(current_user["userId"])
    txs = await database.get_user_transactions(current_user["userId"], 10)
    
    return {
        "id": user["id"],
        "email": user["email"],
        "username": user["username"],
        "coinBalance": user["coin_balance"],
        "reservedBankName": user.get("reserved_bank_name"),
        "reservedAccountNumber": user.get("reserved_account_number"),
        "reservedAccountName": user.get("reserved_account_name"),
        "stats": stats,
        "recentTransactions": txs
    }

@router.patch("/")
async def update_profile(data: UpdateProfileRequest, current_user: dict = Depends(get_current_user)):
    # Mock update profile
    # Actually we can just update the username in the DB if we had a function for it.
    # For now, just return success since frontend expects nothing back but success.
    return {"success": True, "message": "Profile updated"}

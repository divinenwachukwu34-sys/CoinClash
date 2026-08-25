import os
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
import database
from middleware.auth import get_current_user
import httpx

router = APIRouter()
PAYSTACK_SECRET = os.getenv('PAYSTACK_SECRET_KEY')

class DepositRequest(BaseModel):
    amount_ngn: float

class VerifyRequest(BaseModel):
    reference: str

@router.post("/initialize")
async def init_deposit(data: DepositRequest, current_user: dict = Depends(get_current_user)):
    user = await database.get_user_by_id(current_user["userId"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    amount_kobo = int(data.amount_ngn * 100)
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.paystack.co/transaction/initialize",
            headers={"Authorization": f"Bearer {PAYSTACK_SECRET}"},
            json={"email": user["email"], "amount": amount_kobo}
        )
        resp_data = response.json()
        if not resp_data.get("status"):
            raise HTTPException(status_code=400, detail="Failed to init payment")
            
        reference = resp_data["data"]["reference"]
        await database.create_pending_transaction(
            user_id=user["id"],
            type="deposit",
            amount_ngn=data.amount_ngn,
            reference=reference,
            description=f"Initiated deposit of ₦{data.amount_ngn}"
        )
        # frontend expects authorization_url, reference, coins
        return {
            "authorization_url": resp_data["data"]["authorization_url"],
            "reference": reference,
            "coins": int(data.amount_ngn * (35 / 100))
        }

@router.post("/verify")
async def verify_payment(data: VerifyRequest, current_user: dict = Depends(get_current_user)):
    # Simple mock verify that checks our DB
    tx = await database.get_transaction_by_ref(data.reference)
    if not tx or tx["user_id"] != current_user["userId"]:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    if tx["status"] == "success":
        # Already verified
        user = await database.get_user_by_id(current_user["userId"])
        return {"coins": int(tx["amount_ngn"] * (35 / 100)), "newBalance": user["coin_balance"]}
        
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.paystack.co/transaction/verify/{data.reference}",
            headers={"Authorization": f"Bearer {PAYSTACK_SECRET}"}
        )
        resp_data = response.json()
        
    if resp_data.get("status") and resp_data["data"]["status"] == "success":
        amount_ngn = resp_data["data"]["amount"] / 100.0
        coins = int(amount_ngn * (35 / 100))
        await database.add_coins_to_user(tx["user_id"], coins, data.reference, amount_ngn)
        await database.update_transaction_status(data.reference, "success")
        
        user = await database.get_user_by_id(current_user["userId"])
        return {"coins": coins, "newBalance": user["coin_balance"]}
    else:
        raise HTTPException(status_code=400, detail="Payment verification failed")

@router.get("/tiers")
async def get_tiers():
    return [
        {"amount_ngn": 1000, "coins": 350, "bonus": 0, "total": 350},
        {"amount_ngn": 2000, "coins": 700, "bonus": 50, "total": 750},
        {"amount_ngn": 5000, "coins": 1750, "bonus": 200, "total": 1950},
        {"amount_ngn": 10000, "coins": 3500, "bonus": 500, "total": 4000}
    ]

@router.post("/webhook")
async def paystack_webhook(request: Request):
    data = await request.json()
    if data.get("event") == "charge.success":
        reference = data["data"]["reference"]
        amount_kobo = data["data"]["amount"]
        amount_ngn = amount_kobo / 100.0
        tx = await database.get_transaction_by_ref(reference)
        if tx and tx["status"] == "pending":
            coins = int(amount_ngn * (35 / 100))
            await database.add_coins_to_user(tx["user_id"], coins, reference, amount_ngn)
            await database.update_transaction_status(reference, "success")
    return {"status": "success"}

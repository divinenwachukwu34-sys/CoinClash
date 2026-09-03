import os
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
import database
from middleware.auth import get_current_user
from services.paystack import PaystackClient
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
            error_msg = resp_data.get("message", "Unknown error")
            raise HTTPException(status_code=400, detail=f"Failed to init payment: {error_msg}")
            
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

@router.post("/reserved-account")
async def create_reserved_account(current_user: dict = Depends(get_current_user)):
    user = await database.get_user_by_id(current_user["userId"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.get("reserved_account_number"):
        return {
            "bankName": user["reserved_bank_name"],
            "accountNumber": user["reserved_account_number"],
            "accountName": user["reserved_account_name"]
        }
        
    try:
        customer = await PaystackClient.create_customer(
            email=user["email"],
            first_name=user["username"],
            last_name="CoinClash User",
            phone=user.get("phone") or ""
        )
        dva = await PaystackClient.create_dedicated_account(customer["customer_code"])
        await database.update_user_reserved_account(
            user["id"], 
            customer["customer_code"], 
            dva["bank"]["name"], 
            dva["account_number"], 
            dva["account_name"]
        )
        return {
            "bankName": dva["bank"]["name"],
            "accountNumber": dva["account_number"],
            "accountName": dva["account_name"]
        }
    except Exception as e:
        print(f"[DVA ERROR] {str(e)}")
        raise HTTPException(status_code=400, detail=f"Failed to create reserved account: {str(e)}")

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
        
        # Check for referral bonus
        async with database.pool.acquire() as conn:
            ref = await conn.fetchrow('SELECT * FROM referrals WHERE referred_id = $1 AND bonus_paid = FALSE', tx["user_id"])
            if ref:
                # Pay 25 to referrer, 20 to referred
                referrer_id = ref['referrer_id']
                referred_id = ref['referred_id']
                
                await conn.execute('UPDATE users SET coin_balance = coin_balance + 25 WHERE id = $1', referrer_id)
                await conn.execute("INSERT INTO transactions (user_id, type, amount_coins, description) VALUES ($1, 'bonus', 25, 'Referral Bonus (Friend Deposited)')", referrer_id)
                
                await conn.execute('UPDATE users SET coin_balance = coin_balance + 20 WHERE id = $1', referred_id)
                await conn.execute("INSERT INTO transactions (user_id, type, amount_coins, description) VALUES ($1, 'bonus', 20, 'Referral Welcome Bonus')", referred_id)
                
                await conn.execute('UPDATE referrals SET bonus_paid = TRUE WHERE id = $1', ref['id'])

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
        payload = data["data"]
        reference = payload["reference"]
        amount_kobo = payload["amount"]
        amount_ngn = amount_kobo / 100.0
        coins = int(amount_ngn * (35 / 100))
        
        # Check if it was a direct transfer to DVA
        if payload.get("channel") == "dedicated_nuban":
            # Find user by email
            email = payload.get("customer", {}).get("email")
            user = await database.get_user_by_email(email) if email else None
            if user:
                # Add coins and create a deposit transaction directly
                await database.add_coins_to_user(user["id"], coins, reference, amount_ngn)
                # Note: No referral bonus for DVA transfers right now unless we want to add it.
                return {"status": "success"}
        
        # Otherwise, standard web checkout flow
        tx = await database.get_transaction_by_ref(reference)
        if tx and tx["status"] == "pending":
            await database.add_coins_to_user(tx["user_id"], coins, reference, amount_ngn)
            await database.update_transaction_status(reference, "success")
            
            # Check for referral bonus
            async with database.pool.acquire() as conn:
                ref = await conn.fetchrow('SELECT * FROM referrals WHERE referred_id = $1 AND bonus_paid = FALSE', tx["user_id"])
                if ref:
                    referrer_id = ref['referrer_id']
                    referred_id = ref['referred_id']
                    await conn.execute('UPDATE users SET coin_balance = coin_balance + 25 WHERE id = $1', referrer_id)
                    await conn.execute("INSERT INTO transactions (user_id, type, amount_coins, description) VALUES ($1, 'bonus', 25, 'Referral Bonus (Friend Deposited)')", referrer_id)
                    await conn.execute('UPDATE users SET coin_balance = coin_balance + 20 WHERE id = $1', referred_id)
                    await conn.execute("INSERT INTO transactions (user_id, type, amount_coins, description) VALUES ($1, 'bonus', 20, 'Referral Welcome Bonus')", referred_id)
                    await conn.execute('UPDATE referrals SET bonus_paid = TRUE WHERE id = $1', ref['id'])

    return {"status": "success"}

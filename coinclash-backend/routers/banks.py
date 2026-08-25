import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import database
from middleware.auth import get_current_user

router = APIRouter()
PAYSTACK_SECRET = os.getenv('PAYSTACK_SECRET_KEY')

class ResolveRequest(BaseModel):
    account_number: str
    bank_code: str

class AddBankRequest(BaseModel):
    bank_code: str
    bank_name: str
    account_number: str
    account_name: str

@router.get("/list")
async def list_banks(current_user: dict = Depends(get_current_user)):
    # Mock some popular Nigerian banks
    return [
        {"name": "Access Bank", "code": "044"},
        {"name": "Guaranty Trust Bank", "code": "058"},
        {"name": "United Bank for Africa", "code": "033"},
        {"name": "Zenith Bank", "code": "057"},
        {"name": "First Bank of Nigeria", "code": "011"}
    ]

@router.post("/resolve")
async def resolve_account(data: ResolveRequest, current_user: dict = Depends(get_current_user)):
    if PAYSTACK_SECRET:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.paystack.co/bank/resolve?account_number={data.account_number}&bank_code={data.bank_code}",
                headers={"Authorization": f"Bearer {PAYSTACK_SECRET}"}
            )
            resp_data = response.json()
            if resp_data.get("status"):
                return {
                    "account_name": resp_data["data"]["account_name"],
                    "account_number": resp_data["data"]["account_number"]
                }
    
    # Fallback mock if Paystack fails or no key
    if len(data.account_number) == 10:
        return {"account_name": "JOHN DOE", "account_number": data.account_number}
    raise HTTPException(status_code=400, detail="Could not resolve account name")

@router.post("/add")
async def add_bank(data: AddBankRequest, current_user: dict = Depends(get_current_user)):
    bank = await database.add_bank_account(
        user_id=current_user["userId"],
        bank_code=data.bank_code,
        bank_name=data.bank_name,
        account_number=data.account_number,
        account_name=data.account_name,
        recipient_code=f"RCP_{data.account_number}" # Mock recipient code
    )
    return bank

@router.get("/mine")
async def get_my_banks(current_user: dict = Depends(get_current_user)):
    banks = await database.get_bank_accounts(current_user["userId"])
    return banks

@router.delete("/{id}")
async def delete_bank(id: int, current_user: dict = Depends(get_current_user)):
    await database.delete_bank_account(id, current_user["userId"])
    return {"status": "success"}

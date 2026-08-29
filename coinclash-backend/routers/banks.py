import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import database
from middleware.auth import get_current_user
from services.paystack import PaystackClient
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

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
    try:
        banks = await PaystackClient.get_banks()
        return banks
    except Exception as e:
        logger.error(f"Failed to fetch banks: {e}")
        return []

@router.post("/resolve")
async def resolve_account(data: ResolveRequest, current_user: dict = Depends(get_current_user)):
    try:
        result = await PaystackClient.resolve_account(data.account_number, data.bank_code)
        return {
            "account_name": result["account_name"],
            "account_number": result["account_number"]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/add")
async def add_bank(data: AddBankRequest, current_user: dict = Depends(get_current_user)):
    try:
        recipient = await PaystackClient.create_transfer_recipient(
            name=data.account_name,
            account_number=data.account_number,
            bank_code=data.bank_code
        )
        recipient_code = recipient["recipient_code"]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to setup transfer recipient: {e}")

    bank = await database.add_bank_account(
        user_id=current_user["userId"],
        bank_code=data.bank_code,
        bank_name=data.bank_name,
        account_number=data.account_number,
        account_name=data.account_name,
        recipient_code=recipient_code
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

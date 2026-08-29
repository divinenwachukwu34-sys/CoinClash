from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import database
from middleware.auth import get_current_user

router = APIRouter()

class GiftRequest(BaseModel):
    recipient_username: str
    amount_coins: int

@router.post("/")
async def gift_coins(data: GiftRequest, current_user: dict = Depends(get_current_user)):
    if data.amount_coins <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")
        
    sender = await database.get_user_by_id(current_user["userId"])
    if not sender:
        raise HTTPException(status_code=404, detail="Sender not found")
        
    if sender["username"].lower() == data.recipient_username.lower():
        raise HTTPException(status_code=400, detail="Cannot gift coins to yourself")
        
    if sender["coin_balance"] < data.amount_coins:
        raise HTTPException(status_code=400, detail="Insufficient coins")
        
    recipient = await database.get_user_by_username(data.recipient_username)
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
        
    async with database.pool.acquire() as conn:
        async with conn.transaction():
            # Deduct from sender
            row = await conn.fetchrow(
                'UPDATE users SET coin_balance = coin_balance - $1 WHERE id = $2 AND coin_balance >= $1 RETURNING coin_balance',
                data.amount_coins, sender["id"]
            )
            if not row:
                raise HTTPException(status_code=400, detail="Insufficient coins")
            new_balance = row["coin_balance"]
            
            # Add to recipient
            await conn.execute(
                'UPDATE users SET coin_balance = coin_balance + $1 WHERE id = $2',
                data.amount_coins, recipient["id"]
            )
            
            # Record transactions
            await conn.execute(
                '''INSERT INTO transactions (user_id, type, amount_coins, description, status)
                   VALUES ($1, 'gift_sent', $2, $3, 'success')''',
                sender["id"], -data.amount_coins, f"Gifted to {recipient['username']}"
            )
            
            await conn.execute(
                '''INSERT INTO transactions (user_id, type, amount_coins, description, status)
                   VALUES ($1, 'gift_received', $2, $3, 'success')''',
                recipient["id"], data.amount_coins, f"Gift from {sender['username']}"
            )
            
    return {
        "success": True,
        "message": f"Successfully gifted {data.amount_coins} coins to {recipient['username']}",
        "newBalance": new_balance
    }

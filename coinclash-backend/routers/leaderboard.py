from fastapi import APIRouter, Depends
import database
from middleware.auth import get_current_user

router = APIRouter()

@router.get("/")
async def get_leaderboard(type: str = "weekly", current_user: dict = Depends(get_current_user)):
    async with database.pool.acquire() as conn:
        # Get users ordered by coin balance for simplicity right now
        rows = await conn.fetch('SELECT id, username, coin_balance FROM users ORDER BY coin_balance DESC LIMIT 10')
        
        board = []
        my_rank = None
        for i, row in enumerate(rows):
            rank = i + 1
            is_me = row['id'] == current_user['userId']
            if is_me:
                my_rank = rank
                
            board.append({
                "rank": rank,
                "userId": row['id'],
                "username": row['username'],
                "wins": 0, # Mocked stats
                "losses": 0,
                "totalGames": 0,
                "netCoins": row['coin_balance'],
                "loginStreak": 1,
                "isMe": is_me
            })
            
        return {
            "type": type,
            "board": board,
            "myRank": my_rank,
            "poolAmount": 50000
        }

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import database
from middleware.auth import get_current_user

router = APIRouter()

class GameResultRequest(BaseModel):
    gameType: str
    stake: int
    won: bool
    playerScore: int
    opponentScore: int
    prize: int

@router.post("/save")
async def submit_game_result(data: GameResultRequest, current_user: dict = Depends(get_current_user)):
    net_coins = data.prize - data.stake if data.won else -data.stake
    
    result = await database.apply_game_result(
        user_id=current_user["userId"],
        net_coins=net_coins,
        stake=data.stake,
        won=data.won,
        prize=data.prize,
        game_type=data.gameType,
        player_score=data.playerScore,
        opponent_score=data.opponentScore
    )
    return {"newBalance": result["newBalance"]}

@router.get("/history")
async def get_history(current_user: dict = Depends(get_current_user)):
    history = await database.get_game_history(current_user["userId"])
    return history

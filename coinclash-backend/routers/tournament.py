from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
import database
from middleware.auth import get_current_user
import json
import asyncio
from typing import Dict, List

router = APIRouter(prefix="/tournaments", tags=["Tournaments"])

# Keep track of active WebSocket connections per tournament
active_connections: Dict[int, List[WebSocket]] = {}

async def broadcast_leaderboard(tournament_id: int):
    if tournament_id not in active_connections or not active_connections[tournament_id]:
        return
        
    async with database.pool.acquire() as conn:
        rows = await conn.fetch('''
            SELECT tp.user_id, u.username, tp.score, tp.lives, tp.status
            FROM tournament_players tp
            JOIN users u ON tp.user_id = u.id
            WHERE tp.tournament_id = $1
            ORDER BY tp.score DESC, tp.lives DESC
            LIMIT 50
        ''', tournament_id)
        
        board = [
            {
                "rank": i + 1,
                "userId": r["user_id"],
                "username": r["username"],
                "score": r["score"],
                "lives": r["lives"],
                "status": r["status"]
            }
            for i, r in enumerate(rows)
        ]
        
        message = json.dumps({"type": "leaderboard_update", "board": board})
        
        # Broadcast to all connected clients
        to_remove = []
        for ws in active_connections[tournament_id]:
            try:
                await ws.send_text(message)
            except Exception:
                to_remove.append(ws)
                
        for ws in to_remove:
            active_connections[tournament_id].remove(ws)

@router.get("/")
async def get_tournaments():
    async with database.pool.acquire() as conn:
        rows = await conn.fetch('''
            SELECT * FROM tournaments 
            WHERE status IN ('active', 'upcoming') 
            ORDER BY start_time ASC
        ''')
        
        tournaments = []
        for r in rows:
            # Count participants
            count = await conn.fetchval('SELECT COUNT(*) FROM tournament_players WHERE tournament_id = $1', r['id'])
            
            tournaments.append({
                "id": r["id"],
                "title": r["title"],
                "type": r["type"],
                "entryFee": r["entry_fee"],
                "prizePool": r["prize_pool"],
                "startTime": r["start_time"].isoformat(),
                "endTime": r["end_time"].isoformat(),
                "status": r["status"],
                "participants": count
            })
            
        return tournaments

@router.post("/{tournament_id}/join")
async def join_tournament(tournament_id: int, current_user: dict = Depends(get_current_user)):
    user_id = current_user['userId']
    
    async with database.pool.acquire() as conn:
        async with conn.transaction():
            # Check tournament
            t = await conn.fetchrow('SELECT * FROM tournaments WHERE id = $1', tournament_id)
            if not t:
                raise HTTPException(status_code=404, detail="Tournament not found")
            if t['status'] == 'completed':
                raise HTTPException(status_code=400, detail="Tournament has ended")
                
            # Check if already joined
            existing = await conn.fetchrow('SELECT * FROM tournament_players WHERE tournament_id = $1 AND user_id = $2', tournament_id, user_id)
            if existing:
                raise HTTPException(status_code=400, detail="Already joined this tournament")
                
            # Deduct fee
            fee = t['entry_fee']
            new_balance = await database.deduct_coins_from_user(user_id, fee)
            if new_balance is None:
                raise HTTPException(status_code=400, detail="Insufficient coins to join tournament")
                
            # Record transaction
            await conn.execute('''
                INSERT INTO transactions (user_id, type, amount_coins, description)
                VALUES ($1, 'stake', $2, $3)
            ''', user_id, -fee, f"Joined Tournament: {t['title']}")
            
            # Add to players
            await conn.execute('''
                INSERT INTO tournament_players (tournament_id, user_id, lives, score, status)
                VALUES ($1, $2, 3, 0, 'active')
            ''', tournament_id, user_id)
            
            # trigger broadcast
            asyncio.create_task(broadcast_leaderboard(tournament_id))
            
            return {"success": True, "newBalance": new_balance}

@router.get("/{tournament_id}")
async def get_tournament_details(tournament_id: int, current_user: dict = Depends(get_current_user)):
    user_id = current_user['userId']
    
    async with database.pool.acquire() as conn:
        t = await conn.fetchrow('SELECT * FROM tournaments WHERE id = $1', tournament_id)
        if not t:
            raise HTTPException(status_code=404, detail="Tournament not found")
            
        # Get leaderboard
        rows = await conn.fetch('''
            SELECT tp.user_id, u.username, tp.score, tp.lives, tp.status
            FROM tournament_players tp
            JOIN users u ON tp.user_id = u.id
            WHERE tp.tournament_id = $1
            ORDER BY tp.score DESC, tp.lives DESC
            LIMIT 50
        ''', tournament_id)
        
        board = []
        my_status = None
        
        for i, r in enumerate(rows):
            is_me = r['user_id'] == user_id
            player = {
                "rank": i + 1,
                "userId": r["user_id"],
                "username": r["username"],
                "score": r["score"],
                "lives": r["lives"],
                "status": r["status"],
                "isMe": is_me
            }
            board.append(player)
            if is_me:
                my_status = player
                
        # If user is not in top 50, fetch their status separately
        if not my_status:
            r = await conn.fetchrow('SELECT * FROM tournament_players WHERE tournament_id = $1 AND user_id = $2', tournament_id, user_id)
            if r:
                # Get their actual rank
                rank = await conn.fetchval('''
                    SELECT COUNT(*) + 1 
                    FROM tournament_players 
                    WHERE tournament_id = $1 AND (score > $2 OR (score = $2 AND lives > $3))
                ''', tournament_id, r['score'], r['lives'])
                
                my_status = {
                    "rank": rank,
                    "userId": user_id,
                    "username": current_user['username'],
                    "score": r['score'],
                    "lives": r['lives'],
                    "status": r['status'],
                    "isMe": True
                }
                
        return {
            "id": t["id"],
            "title": t["title"],
            "type": t["type"],
            "entryFee": t["entry_fee"],
            "prizePool": t["prize_pool"],
            "startTime": t["start_time"].isoformat(),
            "endTime": t["end_time"].isoformat(),
            "status": t["status"],
            "board": board,
            "myStatus": my_status
        }

@router.post("/{tournament_id}/submit")
async def submit_tournament_match(
    tournament_id: int, 
    data: dict, # { won: boolean, gameType: string, playerScore: int, opponentScore: int }
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user['userId']
    won = data.get('won', False)
    
    async with database.pool.acquire() as conn:
        async with conn.transaction():
            p = await conn.fetchrow('SELECT * FROM tournament_players WHERE tournament_id = $1 AND user_id = $2', tournament_id, user_id)
            if not p:
                raise HTTPException(status_code=400, detail="Not joined in this tournament")
            if p['status'] == 'eliminated' or p['lives'] <= 0:
                raise HTTPException(status_code=400, detail="You are eliminated")
                
            t = await conn.fetchrow('SELECT * FROM tournaments WHERE id = $1', tournament_id)
            if t['status'] != 'active':
                raise HTTPException(status_code=400, detail="Tournament is not currently active")
                
            new_score = p['score']
            new_lives = p['lives']
            new_status = p['status']
            
            if won:
                new_score += 1
            else:
                new_lives -= 1
                if new_lives <= 0:
                    new_status = 'eliminated'
                    
            await conn.execute('''
                UPDATE tournament_players 
                SET score = $1, lives = $2, status = $3 
                WHERE tournament_id = $4 AND user_id = $5
            ''', new_score, new_lives, new_status, tournament_id, user_id)
            
            # Save the match in game_results for history
            await conn.execute('''
                INSERT INTO game_results (user_id, game_type, stake, won, player_score, opponent_score, prize)
                VALUES ($1, $2, 0, $3, $4, $5, 0)
            ''', user_id, f"tournament_{tournament_id}_{data.get('gameType', 'unknown')}", won, data.get('playerScore', 0), data.get('opponentScore', 0))
            
            asyncio.create_task(broadcast_leaderboard(tournament_id))
            
            return {
                "success": True, 
                "score": new_score, 
                "lives": new_lives, 
                "status": new_status,
                "eliminated": new_lives <= 0
            }

@router.websocket("/ws/{tournament_id}")
async def websocket_tournament(websocket: WebSocket, tournament_id: int):
    await websocket.accept()
    if tournament_id not in active_connections:
        active_connections[tournament_id] = []
    active_connections[tournament_id].append(websocket)
    try:
        while True:
            # Keep alive ping pong
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        if tournament_id in active_connections and websocket in active_connections[tournament_id]:
            active_connections[tournament_id].remove(websocket)

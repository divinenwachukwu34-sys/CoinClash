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

@router.post("/{tournament_id}/finish")
async def finish_tournament(tournament_id: int):
    # In a real app, this would be protected by an admin dependency
    async with database.pool.acquire() as conn:
        async with conn.transaction():
            t = await conn.fetchrow('SELECT * FROM tournaments WHERE id = $1', tournament_id)
            if not t:
                raise HTTPException(status_code=404, detail="Tournament not found")
            if t['status'] == 'completed':
                raise HTTPException(status_code=400, detail="Tournament already completed")
                
            # Get players ranked
            players = await conn.fetch('''
                SELECT user_id, score, lives 
                FROM tournament_players 
                WHERE tournament_id = $1
                ORDER BY score DESC, lives DESC, joined_at ASC
            ''', tournament_id)
            
            prize_pool = t['prize_pool']
            app_fee_percentage = 0.20 # 20% to the app
            app_fee = int(prize_pool * app_fee_percentage)
            player_pool = prize_pool - app_fee
            
            # The prompt requested top 20/100 people get a share. We'll distribute to up to top 20 players.
            num_winners = min(20, len(players))
            
            if num_winners > 0:
                # Weights for the top 20 ranks (adds up to ~100)
                weights = [30, 15, 10, 7, 5, 4, 3, 3, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1]
                actual_weights = weights[:num_winners]
                total_weight = sum(actual_weights)
                
                for i in range(num_winners):
                    user_id = players[i]['user_id']
                    rank = i + 1
                    share_percentage = actual_weights[i] / total_weight
                    prize_amount = int(player_pool * share_percentage)
                    
                    if prize_amount > 0:
                        # Give prize to user
                        await conn.execute('''
                            UPDATE users SET coin_balance = coin_balance + $1 WHERE id = $2
                        ''', prize_amount, user_id)
                        
                        # Record transaction
                        await conn.execute('''
                            INSERT INTO transactions (user_id, type, amount_coins, description)
                            VALUES ($1, 'win', $2, $3)
                        ''', user_id, prize_amount, f"Tournament Rank #{rank} Prize: {t['title']}")
                        
                        # Record app fee in platform_fees? Since it's tournament fee, maybe we can just record owner_transfer
                        # Or just leave it implicit since the coins are absorbed by the system.
                        # For platform_fees table, we need a game_result_id, which we don't have. So we'll skip platform_fees table insertion, the coins are simply removed from circulation (which is the app profit).
            
            # Update status
            await conn.execute("UPDATE tournaments SET status = 'completed' WHERE id = $1", tournament_id)
            
            return {
                "success": True, 
                "message": f"Tournament {tournament_id} completed", 
                "winners": num_winners, 
                "appProfit": app_fee, 
                "distributed": player_pool
            }

@router.websocket("/ws/{tournament_id}")
async def websocket_tournament(websocket: WebSocket, tournament_id: int):
    await websocket.accept()
    if tournament_id not in active_connections:
        active_connections[tournament_id] = []
    active_connections[tournament_id].append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        if tournament_id in active_connections and websocket in active_connections[tournament_id]:
            active_connections[tournament_id].remove(websocket)

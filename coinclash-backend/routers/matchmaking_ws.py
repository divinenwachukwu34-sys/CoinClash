import json
import logging
import jwt
import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from services.matchmaking import hub
import database

logger = logging.getLogger(__name__)
router = APIRouter()
JWT_SECRET = os.getenv('JWT_SECRET', 'coinclash_super_secret_jwt_key_2024_divine')

def decode_token(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except Exception:
        return None

@router.websocket("/ws/match")
@router.websocket("/api/ws/match")
async def websocket_matchmaking_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
    game: str = Query(...),
    stake: int = Query(0)
):
    user_payload = decode_token(token)
    if not user_payload:
        await websocket.close(code=4001, reason="Unauthorized token")
        return

    user_id = user_payload.get("userId")
    username = user_payload.get("username", f"Player_{user_id}")

    await websocket.accept()

    try:
        # 1. Join matchmaking queue or get matched room
        room = await hub.add_player(game_type=game, stake=stake, user_id=user_id, username=username, ws=websocket)

        if not room:
            # Player is waiting in queue
            await websocket.send_json({
                "event": "QUEUED",
                "game": game,
                "stake": stake,
                "message": "Searching for a live opponent..."
            })
        else:
            # Matched with an opponent! Notify both players
            p1_id = list(room.players.keys())[0]
            p2_id = list(room.players.keys())[1]
            p1_name = room.players[p1_id]["username"]
            p2_name = room.players[p2_id]["username"]

            # Send MATCH_FOUND to player 1
            if p1_id in room.sockets:
                try:
                    await room.sockets[p1_id].send_json({
                        "event": "MATCH_FOUND",
                        "roomId": room.room_id,
                        "opponentId": p2_id,
                        "opponentUsername": p2_name,
                        "game": game,
                        "stake": stake
                    })
                except Exception:
                    pass

            # Send MATCH_FOUND to player 2
            if p2_id in room.sockets:
                try:
                    await room.sockets[p2_id].send_json({
                        "event": "MATCH_FOUND",
                        "roomId": room.room_id,
                        "opponentId": p1_id,
                        "opponentUsername": p1_name,
                        "game": game,
                        "stake": stake
                    })
                except Exception:
                    pass

        # 2. Main socket listening loop
        while True:
            raw_data = await websocket.receive_text()
            data = json.loads(raw_data)
            event_type = data.get("event")

            if event_type == "GAME_PROGRESS":
                # Real-time progress broadcast to opponent in room
                room_id = data.get("roomId")
                room = await hub.get_room(room_id)
                if room:
                    other_uid = next((uid for uid in room.players.keys() if uid != user_id), None)
                    if other_uid and other_uid in room.sockets:
                        try:
                            await room.sockets[other_uid].send_json({
                                "event": "OPPONENT_PROGRESS",
                                "progress": data.get("progress", 0),
                                "score": data.get("score", 0),
                                "timeMs": data.get("timeMs", 0)
                            })
                        except Exception:
                            pass

            elif event_type == "GAME_SUBMIT":
                # Final score submission
                room_id = data.get("roomId")
                score_data = {
                    "score": data.get("score", 0),
                    "timeMs": data.get("timeMs", 0),
                    "accuracy": data.get("accuracy", "0/0")
                }
                resolution = await hub.record_score(room_id, user_id, score_data)
                
                if resolution:
                    winner_id = resolution["winner_id"]
                    loser_id = resolution["loser_id"]
                    prize = resolution["prize"]
                    stake_amount = resolution["stake"]

                    # Settle coins in database if stake > 0
                    if stake_amount > 0:
                        try:
                            net_win = prize - stake_amount
                            await database.apply_game_result(
                                user_id=winner_id,
                                net_coins=net_win,
                                stake=stake_amount,
                                won=True,
                                prize=prize,
                                game_type=game,
                                player_score=resolution["scores"][winner_id]["score"],
                                opponent_score=resolution["scores"][loser_id]["score"]
                            )
                            await database.apply_game_result(
                                user_id=loser_id,
                                net_coins=-stake_amount,
                                stake=stake_amount,
                                won=False,
                                prize=0,
                                game_type=game,
                                player_score=resolution["scores"][loser_id]["score"],
                                opponent_score=resolution["scores"][winner_id]["score"]
                            )
                        except Exception as e:
                            logger.error(f"Error persisting game results: {e}")

                    # Broadcast GAME_OVER to both players
                    for uid in [winner_id, loser_id]:
                        room = await hub.get_room(room_id)
                        if room and uid in room.sockets:
                            is_winner = (uid == winner_id)
                            opp_uid = loser_id if is_winner else winner_id
                            try:
                                await room.sockets[uid].send_json({
                                    "event": "GAME_OVER",
                                    "won": is_winner,
                                    "prize": prize if is_winner else 0,
                                    "stake": stake_amount,
                                    "playerScore": resolution["scores"][uid]["score"],
                                    "opponentScore": resolution["scores"][opp_uid]["score"],
                                    "playerTimeMs": resolution["scores"][uid]["timeMs"],
                                    "opponentTimeMs": resolution["scores"][opp_uid]["timeMs"],
                                    "playerAcc": resolution["scores"][uid]["accuracy"],
                                    "aiAcc": resolution["scores"][opp_uid]["accuracy"]
                                })
                            except Exception:
                                pass

            elif event_type == "LEAVE_QUEUE":
                await hub.remove_player(user_id, game, stake)
                await websocket.send_json({"event": "LEFT_QUEUE"})
                break

    except WebSocketDisconnect:
        await hub.remove_player(user_id, game, stake)
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        await hub.remove_player(user_id, game, stake)

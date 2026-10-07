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
    user_record = await database.get_user_by_id(user_id)
    username = (user_record.get("username") if user_record else None) or user_payload.get("username") or f"Player_{user_id}"
    avatar = (user_record.get("avatar") if user_record else None) or "avatar_1"

    await websocket.accept()

    try:
        logger.info(f"[WS MATCHMAKING] User {username} (ID: {user_id}) joined queue for {game} @ {stake} coins")
        # 1. Join matchmaking queue or get matched room
        room = await hub.add_player(game_type=game, stake=stake, user_id=user_id, username=username, avatar=avatar, ws=websocket)

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
            p1_player = room.players[p1_id]
            p2_player = room.players[p2_id]

            # Send MATCH_FOUND to player 1
            if p1_id in room.sockets:
                try:
                    await room.sockets[p1_id].send_json({
                        "event": "MATCH_FOUND",
                        "roomId": room.room_id,
                        "opponentId": p2_id,
                        "opponentUsername": p2_player.get("username", f"Player_{p2_id}"),
                        "opponentAvatar": p2_player.get("avatar", "avatar_1"),
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
                        "opponentUsername": p1_player.get("username", f"Player_{p1_id}"),
                        "opponentAvatar": p1_player.get("avatar", "avatar_1"),
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

            if event_type == "GAME_START":
                room_id = data.get("roomId")
                room_obj = await hub.get_room(room_id)
                if room_obj:
                    room_obj.started_players.add(user_id)
                    logger.info(f"[WS MATCHMAKING] User {user_id} started game in room {room_id}. Total started: {len(room_obj.started_players)}")
                    if len(room_obj.started_players) >= 2 and not room_obj.game_begun:
                        room_obj.game_begun = True
                        await room_obj.broadcast({
                            "event": "GAME_BEGIN",
                            "roomId": room_obj.room_id
                        })

            elif event_type == "GAME_PROGRESS":
                room_id = data.get("roomId")
                room_obj = await hub.get_room(room_id)
                if room_obj:
                    other_uid = next((uid for uid in room_obj.players.keys() if uid != user_id), None)
                    if other_uid and other_uid in room_obj.sockets:
                        try:
                            await room_obj.sockets[other_uid].send_json({
                                "event": "OPPONENT_PROGRESS",
                                "progress": data.get("progress", 0),
                                "score": data.get("score", 0),
                                "timeMs": data.get("timeMs", 0)
                            })
                        except Exception:
                            pass

            elif event_type == "GAME_SUBMIT":
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
                    is_draw = resolution.get("is_draw", False) or resolution.get("cancelled", False)

                    room_obj = await hub.get_room(room_id)
                    all_uids = list(room_obj.players.keys()) if room_obj else []

                    # Settle coins in database if stake > 0 and winner is determined
                    if resolution.get("is_fresh", False):
                        resolution["is_fresh"] = False
                        if stake_amount > 0 and winner_id and loser_id and not is_draw:
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
                    for uid in all_uids:
                        if room_obj and uid in room_obj.sockets:
                            is_winner = (uid == winner_id) if winner_id else False
                            opp_uid = next((u for u in all_uids if u != uid), uid)
                            p_score = resolution["scores"].get(uid, {}).get("score", 0)
                            o_score = resolution["scores"].get(opp_uid, {}).get("score", 0)
                            p_time = resolution["scores"].get(uid, {}).get("timeMs", 0)
                            o_time = resolution["scores"].get(opp_uid, {}).get("timeMs", 0)
                            p_acc = resolution["scores"].get(uid, {}).get("accuracy", "0/0")
                            o_acc = resolution["scores"].get(opp_uid, {}).get("accuracy", "0/0")

                            try:
                                await room_obj.sockets[uid].send_json({
                                    "event": "GAME_OVER",
                                    "won": is_winner,
                                    "isDraw": is_draw,
                                    "cancelled": resolution.get("cancelled", False),
                                    "reason": resolution.get("reason", ""),
                                    "prize": prize if is_winner else 0,
                                    "stake": stake_amount,
                                    "playerScore": p_score,
                                    "opponentScore": o_score,
                                    "playerTimeMs": p_time,
                                    "opponentTimeMs": o_time,
                                    "playerAcc": p_acc,
                                    "aiAcc": o_acc
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

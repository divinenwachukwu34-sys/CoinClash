import json
import asyncio
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
    stake: int = Query(0),
):
    user_payload = decode_token(token)
    if not user_payload:
        await websocket.close(code=4001, reason="Unauthorized token")
        return

    user_id = user_payload.get("userId")
    user_record = await database.get_user_by_id(user_id)
    username = (
        (user_record.get("username") if user_record else None)
        or user_payload.get("username")
        or f"Player_{user_id}"
    )
    avatar = (user_record.get("avatar") if user_record else None) or "avatar_1"

    await websocket.accept()
    logger.info(
        f"[WS] {username} (ID={user_id}) connected for {game} @ {stake} coins"
    )

    room = None

    try:
        # ── 1. Join queue or reconnect to existing room ───────────────────────
        room = await hub.add_player(
            game_type=game, stake=stake,
            user_id=user_id, username=username, avatar=avatar,
            ws=websocket,
        )

        if not room:
            # Still waiting
            await websocket.send_json({
                "event": "QUEUED",
                "game": game,
                "stake": stake,
                "message": "Searching for a live opponent...",
            })
        else:
            # ── 2. Both players matched — send identical MATCH_FOUND to both ─
            p1 = room.players[room.player1_id]
            p2 = room.players[room.player2_id]

            # Build ONE canonical MATCH_FOUND template
            match_found_base = {
                "event": "MATCH_FOUND",
                "roomId": room.room_id,
                "game": game,
                "stake": stake,
                "player1Id": room.player1_id,
                "player1Username": p1.get("username", f"Player_{room.player1_id}"),
                "player1Avatar": p1.get("avatar", "avatar_1"),
                "player2Id": room.player2_id,
                "player2Username": p2.get("username", f"Player_{room.player2_id}"),
                "player2Avatar": p2.get("avatar", "avatar_1"),
                # Server-side display phase duration so both clients know exactly
                # how long to show the opponent screen before sending GAME_START
                "displaySeconds": 4,
            }

            # Each player also gets a convenience "opponentId / opponentUsername"
            # so the client does not need to inspect player1/player2 order.
            for uid, opp_uid in [
                (room.player1_id, room.player2_id),
                (room.player2_id, room.player1_id),
            ]:
                if uid not in room.sockets:
                    continue
                opp = room.players[opp_uid]
                payload = {
                    **match_found_base,
                    "opponentId": opp_uid,
                    "opponentUsername": opp.get("username", f"Player_{opp_uid}"),
                    "opponentAvatar": opp.get("avatar", "avatar_1"),
                }
                try:
                    await room.sockets[uid].send_json(payload)
                except Exception as e:
                    logger.warning(f"[WS] MATCH_FOUND to {uid} failed: {e}")

        # ── 3. Main receive loop ───────────────────────────────────────────────
        while True:
            raw_data = await websocket.receive_text()
            data = json.loads(raw_data)
            event_type = data.get("event")

            # ── GAME_START: sent by client when opponent screen is done ────────
            if event_type == "GAME_START":
                room_id = data.get("roomId")
                room_obj = await hub.get_room(room_id)
                if not room_obj:
                    continue

                already_started = user_id in room_obj.started_players
                if not already_started:
                    room_obj.started_players.add(user_id)
                    logger.info(
                        f"[WS] {user_id} sent GAME_START in room {room_id} "
                        f"(started: {len(room_obj.started_players)}/2)"
                    )

                if (
                    len(room_obj.started_players) >= 2
                    and not room_obj.game_begun
                ):
                    room_obj.game_begun = True
                    room_obj.game_started_at = __import__('time').time()
                    await room_obj.broadcast({
                        "event": "GAME_BEGIN",
                        "roomId": room_obj.room_id,
                        # Include server timestamp so clients can sync clocks
                        "serverTimestamp": int(room_obj.game_started_at * 1000),
                    })
                    logger.info(
                        f"[WS] GAME_BEGIN broadcast for room {room_id}"
                    )

            # ── GAME_PROGRESS: relay progress update to opponent only ──────────
            elif event_type == "GAME_PROGRESS":
                room_id = data.get("roomId")
                room_obj = await hub.get_room(room_id)
                if not room_obj:
                    continue
                other_uid = next(
                    (uid for uid in room_obj.players if uid != user_id), None
                )
                if other_uid and other_uid in room_obj.sockets:
                    try:
                        await room_obj.sockets[other_uid].send_json({
                            "event": "OPPONENT_PROGRESS",
                            "progress": data.get("progress", 0),
                            "score": data.get("score", 0),
                            "timeMs": data.get("timeMs", 0),
                        })
                    except Exception:
                        pass

            # ── GAME_SUBMIT: final score from this player ─────────────────────
            elif event_type == "GAME_SUBMIT":
                room_id = data.get("roomId")
                score_data = {
                    "score": data.get("score", 0),
                    "timeMs": data.get("timeMs", 0),
                    "accuracy": data.get("accuracy", "0/0"),
                }

                # record_score() handles resolution AND broadcasts GAME_OVER
                # inside its own lock. The caller must NOT broadcast again.
                resolution = await hub.record_score(room_id, user_id, score_data)

                if resolution and resolution.get("is_fresh"):
                    # Mark as consumed so duplicate submissions don't re-pay
                    resolution["is_fresh"] = False

                    winner_id = resolution["winner_id"]
                    loser_id = resolution["loser_id"]
                    prize = resolution["prize"]
                    stake_amount = resolution["stake"]
                    is_draw = (
                        resolution.get("is_draw", False)
                        or resolution.get("cancelled", False)
                    )

                    # ── Persist payout in database (exactly once) ─────────────
                    if stake_amount > 0:
                        try:
                            if winner_id and loser_id and not is_draw:
                                net_win = prize - stake_amount
                                await database.apply_game_result(
                                    user_id=winner_id,
                                    net_coins=net_win,
                                    stake=stake_amount,
                                    won=True,
                                    prize=prize,
                                    game_type=game,
                                    player_score=resolution["scores"].get(
                                        winner_id, {}
                                    ).get("score", 0),
                                    opponent_score=resolution["scores"].get(
                                        loser_id, {}
                                    ).get("score", 0),
                                )
                                await database.apply_game_result(
                                    user_id=loser_id,
                                    net_coins=-stake_amount,
                                    stake=stake_amount,
                                    won=False,
                                    prize=0,
                                    game_type=game,
                                    player_score=resolution["scores"].get(
                                        loser_id, {}
                                    ).get("score", 0),
                                    opponent_score=resolution["scores"].get(
                                        winner_id, {}
                                    ).get("score", 0),
                                )
                            elif is_draw:
                                # Refund both players their stake
                                room_obj = await hub.get_room(room_id)
                                if room_obj:
                                    for uid in room_obj.players:
                                        await database.apply_game_result(
                                            user_id=uid,
                                            net_coins=0,  # no gain, no loss
                                            stake=stake_amount,
                                            won=False,
                                            prize=0,
                                            game_type=game,
                                            player_score=resolution["scores"].get(
                                                uid, {}
                                            ).get("score", 0),
                                            opponent_score=0,
                                        )
                        except Exception as e:
                            logger.error(
                                f"[WS] Error persisting game results for room "
                                f"{room_id}: {e}"
                            )

            # ── LEAVE_QUEUE ───────────────────────────────────────────────────
            elif event_type == "LEAVE_QUEUE":
                await hub.remove_player(user_id, game, stake)
                await websocket.send_json({"event": "LEFT_QUEUE"})
                break

    except WebSocketDisconnect:
        logger.info(f"[WS] {username} (ID={user_id}) disconnected")
        await hub.remove_player(user_id, game, stake)
    except Exception as e:
        logger.error(f"[WS] Unhandled error for user {user_id}: {e}", exc_info=True)
        await hub.remove_player(user_id, game, stake)

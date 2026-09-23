import asyncio
import uuid
import time
import logging
from typing import Dict, List, Optional
from fastapi import WebSocket

logger = logging.getLogger(__name__)

class MatchRoom:
    def __init__(self, room_id: str, game_type: str, stake: int, player1: dict, player2: dict):
        self.room_id = room_id
        self.game_type = game_type
        self.stake = stake
        self.players = {
            player1["user_id"]: player1,
            player2["user_id"]: player2
        }
        self.sockets: Dict[int, WebSocket] = {
            player1["user_id"]: player1["ws"],
            player2["user_id"]: player2["ws"]
        }
        self.scores: Dict[int, dict] = {}
        self.created_at = time.time()
        self.finished = False

    async def broadcast(self, message: dict):
        for uid, ws in list(self.sockets.items()):
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"Error broadcasting to user {uid}: {e}")

class MatchmakingHub:
    def __init__(self):
        # (game_type, stake) -> list of waiting player dicts: {user_id, username, ws, joined_at}
        self.queues: Dict[str, List[dict]] = {}
        self.active_rooms: Dict[str, MatchRoom] = {}
        self.user_to_room: Dict[int, str] = {}
        self.lock = asyncio.Lock()

    def _queue_key(self, game_type: str, stake: int) -> str:
        return f"{game_type}:{stake}"

    async def add_player(self, game_type: str, stake: int, user_id: int, username: str, ws: WebSocket) -> Optional[MatchRoom]:
        key = self._queue_key(game_type, stake)
        player_entry = {
            "user_id": user_id,
            "username": username,
            "ws": ws,
            "game_type": game_type,
            "stake": stake,
            "joined_at": time.time()
        }

        async with self.lock:
            # Check if user already in a room or queue
            if user_id in self.user_to_room:
                old_room_id = self.user_to_room[user_id]
                if old_room_id in self.active_rooms:
                    room = self.active_rooms[old_room_id]
                    room.sockets[user_id] = ws
                    return room

            if key not in self.queues:
                self.queues[key] = []

            # Remove any stale entry for same user
            self.queues[key] = [p for p in self.queues[key] if p["user_id"] != user_id]

            # Try to pair with existing waiting player
            if len(self.queues[key]) > 0:
                opponent = self.queues[key].pop(0)
                room_id = str(uuid.uuid4())
                room = MatchRoom(room_id, game_type, stake, opponent, player_entry)
                self.active_rooms[room_id] = room
                self.user_to_room[opponent["user_id"]] = room_id
                self.user_to_room[user_id] = room_id
                return room
            else:
                self.queues[key].append(player_entry)
                return None

    async def remove_player(self, user_id: int, game_type: Optional[str] = None, stake: Optional[int] = None):
        async with self.lock:
            # Remove from all queues
            for key in list(self.queues.keys()):
                self.queues[key] = [p for p in self.queues[key] if p["user_id"] != user_id]

            # If in active room, handle forfeit / notify opponent
            if user_id in self.user_to_room:
                room_id = self.user_to_room.pop(user_id, None)
                if room_id and room_id in self.active_rooms:
                    room = self.active_rooms[room_id]
                    if not room.finished:
                        # Notify other player of forfeit/disconnect
                        other_uid = next((uid for uid in room.players.keys() if uid != user_id), None)
                        if other_uid and other_uid in room.sockets:
                            try:
                                await room.sockets[other_uid].send_json({
                                    "event": "OPPONENT_DISCONNECTED",
                                    "message": "Opponent disconnected. You won by default!",
                                    "won": True
                                })
                            except Exception:
                                pass
                    # Clean up room if both gone or finished
                    room.sockets.pop(user_id, None)
                    if not room.sockets:
                        self.active_rooms.pop(room_id, None)

    async def get_room(self, room_id: str) -> Optional[MatchRoom]:
        return self.active_rooms.get(room_id)

    async def record_score(self, room_id: str, user_id: int, score_data: dict) -> Optional[dict]:
        async with self.lock:
            room = self.active_rooms.get(room_id)
            if not room:
                return None
            room.scores[user_id] = score_data

            # If both players submitted scores, resolve match
            if len(room.scores) >= 2 and not room.finished:
                room.finished = True
                uids = list(room.players.keys())
                u1, u2 = uids[0], uids[1]
                s1, s2 = room.scores[u1], room.scores[u2]

                # Scoring resolution:
                # Comparison priority: higher score/accuracy -> lower time
                val1 = s1.get("score", 0)
                val2 = s2.get("score", 0)
                time1 = s1.get("timeMs", 999999)
                time2 = s2.get("timeMs", 999999)

                if val1 > val2:
                    winner_id = u1
                elif val2 > val1:
                    winner_id = u2
                else:
                    winner_id = u1 if time1 <= time2 else u2

                loser_id = u2 if winner_id == u1 else u1
                prize = (room.stake * 2 - 5) if room.stake > 0 else 0

                resolution = {
                    "winner_id": winner_id,
                    "loser_id": loser_id,
                    "prize": prize,
                    "stake": room.stake,
                    "scores": room.scores
                }
                return resolution
            return None

hub = MatchmakingHub()

import asyncio
import uuid
import time
import logging
from typing import Dict, List, Optional, Set
from fastapi import WebSocket

logger = logging.getLogger(__name__)

# How long to hold the opponent-display screen before starting game (seconds)
MATCH_DISPLAY_SECONDS = 4


class MatchRoom:
    """
    Authoritative state for one in-progress match between two real players.

    Lifecycle:
        created → (display_phase, 4s) → started_players gathers GAME_START →
        game_begun → scores gather GAME_SUBMIT → resolved (immutable)

    The resolution object is the canonical record. Once set it never changes.
    The GAME_OVER broadcast fires exactly once, inside the lock, from inside
    record_score(). The caller must NOT attempt to broadcast after record_score returns.
    """

    def __init__(self, room_id: str, game_type: str, stake: int,
                 player1: dict, player2: dict):
        self.room_id = room_id
        self.game_type = game_type
        self.stake = stake

        # Ordered list so p1/p2 identity is stable regardless of dict ordering
        self.player1_id: int = player1["user_id"]
        self.player2_id: int = player2["user_id"]

        self.players: Dict[int, dict] = {
            player1["user_id"]: player1,
            player2["user_id"]: player2,
        }
        self.sockets: Dict[int, WebSocket] = {
            player1["user_id"]: player1["ws"],
            player2["user_id"]: player2["ws"],
        }

        # Scores keyed by user_id
        self.scores: Dict[int, dict] = {}

        # GAME_START handshake tracking
        self.started_players: Set[int] = set()
        self.game_begun: bool = False

        # Resolution is set exactly once and never mutated afterwards
        self.finished: bool = False
        self.resolution: Optional[dict] = None

        # Timestamps
        self.created_at: float = time.time()
        self.display_phase_ends_at: float = time.time() + MATCH_DISPLAY_SECONDS
        self.game_started_at: Optional[float] = None

    async def broadcast(self, message: dict):
        """Send a message to both connected sockets. Ignores send errors."""
        for uid, ws in list(self.sockets.items()):
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"[MatchRoom] Broadcast to {uid} failed: {e}")

    async def send_to(self, uid: int, message: dict):
        """Send a message to a single player. Ignores send errors."""
        ws = self.sockets.get(uid)
        if ws:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"[MatchRoom] Send to {uid} failed: {e}")

    def canonical_game_over(self) -> dict:
        """
        Build the ONE authoritative GAME_OVER payload.
        Contains absolute IDs (player1_id / player2_id) so BOTH clients receive
        IDENTICAL data. Each client derives its own 'won' / 'playerScore' by
        comparing its own user_id against player1_id.
        """
        res = self.resolution
        s1 = self.scores.get(self.player1_id, {})
        s2 = self.scores.get(self.player2_id, {})
        return {
            "event": "GAME_OVER",
            # Canonical identity fields
            "player1Id":    self.player1_id,
            "player2Id":    self.player2_id,
            "winnerId":     res["winner_id"],
            "loserId":      res["loser_id"],
            # Canonical score fields
            "player1Score": s1.get("score", 0),
            "player1TimeMs": s1.get("timeMs", 0),
            "player1Acc":   s1.get("accuracy", "0/0"),
            "player2Score": s2.get("score", 0),
            "player2TimeMs": s2.get("timeMs", 0),
            "player2Acc":   s2.get("accuracy", "0/0"),
            # Match metadata
            "roomId":       self.room_id,
            "stake":        self.stake,
            "prize":        res["prize"],
            "isDraw":       res.get("is_draw", False),
            "cancelled":    res.get("cancelled", False),
            "reason":       res.get("reason", ""),
        }


class MatchmakingHub:
    """
    Global in-memory matchmaking coordinator.

    Queue key format: "{game_type}:{mode}:{stake}"
    mode = "practice" (stake == 0) or "real_money" (stake > 0)

    Practice and real-money queues are ALWAYS separate.
    Different stakes are ALWAYS separate.
    """

    def __init__(self):
        self.queues: Dict[str, List[dict]] = {}
        self.active_rooms: Dict[str, MatchRoom] = {}
        self.user_to_room: Dict[int, str] = {}
        self.lock = asyncio.Lock()

    # ── Queue helpers ──────────────────────────────────────────────────────────

    def _queue_key(self, game_type: str, stake: int) -> str:
        mode = "practice" if stake == 0 else "real_money"
        return f"{game_type}:{mode}:{stake}"

    # ── Player entry ───────────────────────────────────────────────────────────

    async def add_player(
        self, game_type: str, stake: int,
        user_id: int, username: str, avatar: str, ws: WebSocket
    ) -> Optional[MatchRoom]:
        """
        Add a player to the queue or reconnect them to their existing room.

        Returns the MatchRoom if the player was immediately matched,
        or None if they are now waiting in queue.
        """
        key = self._queue_key(game_type, stake)
        player_entry = {
            "user_id": user_id,
            "username": username,
            "avatar": avatar,
            "ws": ws,
            "game_type": game_type,
            "stake": stake,
            "joined_at": time.time(),
        }

        async with self.lock:
            # Reconnect: player already in an active room
            if user_id in self.user_to_room:
                room_id = self.user_to_room[user_id]
                room = self.active_rooms.get(room_id)
                if room:
                    room.sockets[user_id] = ws
                    logger.info(f"[HUB] User {user_id} reconnected to room {room_id}")
                    return room

            if key not in self.queues:
                self.queues[key] = []

            # Remove any stale entry for this user in this queue
            self.queues[key] = [
                p for p in self.queues[key] if p["user_id"] != user_id
            ]

            # Try to pair with a different waiting player
            opponent_idx = next(
                (i for i, p in enumerate(self.queues[key])
                 if p["user_id"] != user_id),
                None
            )

            if opponent_idx is not None:
                opponent = self.queues[key].pop(opponent_idx)
                room_id = str(uuid.uuid4())
                room = MatchRoom(room_id, game_type, stake, opponent, player_entry)
                self.active_rooms[room_id] = room
                self.user_to_room[opponent["user_id"]] = room_id
                self.user_to_room[user_id] = room_id
                logger.info(
                    f"[HUB] Matched {opponent['username']} vs {username} "
                    f"in room {room_id} ({game_type}, stake={stake})"
                )
                return room
            else:
                self.queues[key].append(player_entry)
                logger.info(
                    f"[HUB] {username} queued for {game_type} @ {stake} coins"
                )
                return None

    # ── Player removal / disconnect ────────────────────────────────────────────

    async def remove_player(
        self, user_id: int,
        game_type: Optional[str] = None,
        stake: Optional[int] = None
    ):
        """
        Remove a player from the queue or handle their mid-game disconnect.

        Disconnect rules:
        - During display phase or countdown (game_begun=False): opponent wins by default.
        - During gameplay (game_begun=True): opponent wins by default.
        - If room already finished: no action.
        - If both players disconnect: room is cleaned up silently.
        """
        async with self.lock:
            # Remove from all queues
            for key in list(self.queues.keys()):
                self.queues[key] = [
                    p for p in self.queues[key] if p["user_id"] != user_id
                ]

            room_id = self.user_to_room.pop(user_id, None)
            if not room_id:
                return

            room = self.active_rooms.get(room_id)
            if not room:
                return

            room.sockets.pop(user_id, None)

            if room.finished:
                # Room already resolved — clean up if empty
                if not room.sockets:
                    self.active_rooms.pop(room_id, None)
                return

            # Find the surviving opponent
            other_uid = next(
                (uid for uid in room.players if uid != user_id), None
            )

            if other_uid and other_uid in room.sockets:
                # Mark the room finished with a disconnect resolution
                room.finished = True

                # Build disconnect resolution
                prize = (room.stake * 2 - 5) if room.stake > 0 else 0
                room.resolution = {
                    "winner_id": other_uid,
                    "loser_id": user_id,
                    "cancelled": False,
                    "is_draw": False,
                    "reason": "OPPONENT_DISCONNECTED",
                    "prize": prize,
                    "stake": room.stake,
                    "scores": room.scores,
                    "is_fresh": True,
                }
                # Update scores so canonical_game_over() can fill them
                if user_id not in room.scores:
                    room.scores[user_id] = {"score": 0, "timeMs": 999999, "accuracy": "0/0"}

                try:
                    await room.sockets[other_uid].send_json({
                        "event": "OPPONENT_DISCONNECTED",
                        "message": "Opponent disconnected. You won by default!",
                        "won": True,
                        # Canonical fields so frontend doesn't have to guess
                        "player1Id":   room.player1_id,
                        "player2Id":   room.player2_id,
                        "winnerId":    other_uid,
                        "loserId":     user_id,
                        "prize":       prize,
                        "stake":       room.stake,
                        "isDraw":      False,
                        "cancelled":   False,
                        "reason":      "OPPONENT_DISCONNECTED",
                    })
                except Exception:
                    pass
            else:
                # Both players gone — clean up the room
                self.active_rooms.pop(room_id, None)

            # Remove surviving player's room mapping only if room is done
            if room.finished and other_uid:
                self.user_to_room.pop(other_uid, None)
            if not room.sockets:
                self.active_rooms.pop(room_id, None)

    # ── Room lookup ────────────────────────────────────────────────────────────

    async def get_room(self, room_id: str) -> Optional[MatchRoom]:
        return self.active_rooms.get(room_id)

    # ── Score submission & resolution ──────────────────────────────────────────

    async def record_score(
        self, room_id: str, user_id: int, score_data: dict
    ) -> Optional[dict]:
        """
        Record a player's final score.

        If both players have now submitted, compute the authoritative result,
        broadcast GAME_OVER to both sockets INSIDE the lock, and return the
        resolution dict.

        Broadcasting inside the lock prevents the double-broadcast race where two
        concurrent GAME_SUBMIT handlers both see `resolution is not None` and
        each sends GAME_OVER to all players.

        Returns the resolution dict if resolution happened, else None.
        """
        async with self.lock:
            room = self.active_rooms.get(room_id)
            if not room:
                return None

            # Already resolved — idempotent: return existing result, do NOT rebro adcast
            if room.finished and room.resolution:
                return room.resolution

            # Store this player's score
            room.scores[user_id] = score_data

            # Wait until both players have submitted
            if len(room.scores) < 2:
                return None

            # ── Both scores in: resolve authoritatively ───────────────────────
            room.finished = True

            u1 = room.player1_id
            u2 = room.player2_id
            s1 = room.scores.get(u1, {"score": 0, "timeMs": 999999})
            s2 = room.scores.get(u2, {"score": 0, "timeMs": 999999})

            started1 = u1 in room.started_players
            started2 = u2 in room.started_players

            val1 = s1.get("score", 0)
            val2 = s2.get("score", 0)
            time1 = s1.get("timeMs", 999999)
            time2 = s2.get("timeMs", 999999)

            # ── Scenario 1: Neither player sent GAME_START ────────────────────
            if not started1 and not started2:
                resolution = {
                    "winner_id": None,
                    "loser_id": None,
                    "cancelled": True,
                    "is_draw": False,
                    "reason": "NEITHER_PLAYER_STARTED",
                    "prize": 0,
                    "stake": room.stake,
                    "scores": room.scores,
                    "is_fresh": True,
                }

            # ── Scenario 2: Only P1 started ───────────────────────────────────
            elif started1 and not started2:
                prize = (room.stake * 2 - 5) if room.stake > 0 else 0
                resolution = {
                    "winner_id": u1,
                    "loser_id": u2,
                    "cancelled": False,
                    "is_draw": False,
                    "reason": "OPPONENT_NEVER_STARTED",
                    "prize": prize,
                    "stake": room.stake,
                    "scores": room.scores,
                    "is_fresh": True,
                }

            # ── Scenario 3: Only P2 started ───────────────────────────────────
            elif started2 and not started1:
                prize = (room.stake * 2 - 5) if room.stake > 0 else 0
                resolution = {
                    "winner_id": u2,
                    "loser_id": u1,
                    "cancelled": False,
                    "is_draw": False,
                    "reason": "OPPONENT_NEVER_STARTED",
                    "prize": prize,
                    "stake": room.stake,
                    "scores": room.scores,
                    "is_fresh": True,
                }

            # ── Scenarios 4 & 5: Both started ─────────────────────────────────
            else:
                if val1 > val2:
                    winner_id, loser_id, is_draw = u1, u2, False
                elif val2 > val1:
                    winner_id, loser_id, is_draw = u2, u1, False
                else:
                    # Equal scores
                    if val1 > 0:
                        # Both scored > 0: lower timeMs wins
                        if time1 < time2:
                            winner_id, loser_id, is_draw = u1, u2, False
                        elif time2 < time1:
                            winner_id, loser_id, is_draw = u2, u1, False
                        else:
                            winner_id, loser_id, is_draw = None, None, True
                    else:
                        # Both started and both legitimately 0 → DRAW/VOID
                        winner_id, loser_id, is_draw = None, None, True

                prize = (
                    (room.stake * 2 - 5)
                    if (winner_id is not None and room.stake > 0)
                    else 0
                )
                resolution = {
                    "winner_id": winner_id,
                    "loser_id": loser_id,
                    "cancelled": is_draw,
                    "is_draw": is_draw,
                    "reason": "DRAW_ZERO_SCORE" if is_draw else "GAME_FINISHED",
                    "prize": prize,
                    "stake": room.stake,
                    "scores": room.scores,
                    "is_fresh": True,
                }

            room.resolution = resolution

            # ── Broadcast GAME_OVER INSIDE the lock ───────────────────────────
            # This is the ONLY place GAME_OVER is sent. Broadcasting inside the
            # lock means only one handler can reach this line per room.
            canonical = room.canonical_game_over()
            for uid, ws in list(room.sockets.items()):
                try:
                    await ws.send_json(canonical)
                except Exception as e:
                    logger.warning(
                        f"[HUB] GAME_OVER delivery to {uid} failed: {e}"
                    )

            return resolution


# Singleton hub shared across the whole process
hub = MatchmakingHub()

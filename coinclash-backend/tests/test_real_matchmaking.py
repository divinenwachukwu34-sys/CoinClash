import sys
import os
import asyncio
import jwt
import json

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from main import app
from services.matchmaking import MatchmakingHub, MatchRoom
from routers.matchmaking_ws import JWT_SECRET

def generate_test_jwt(user_id: int, username: str) -> str:
    payload = {
        "userId": user_id,
        "username": username,
        "email": f"user{user_id}@example.com"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

class MockWebSocket:
    def __init__(self):
        self.sent_messages = []
    async def send_json(self, data):
        self.sent_messages.append(data)

def test_matchmaking_hub_unit():
    """Verify MatchmakingHub prevents self-matching and pairs distinct users accurately."""
    hub = MatchmakingHub()
    ws1 = MockWebSocket()
    ws2 = MockWebSocket()

    loop = asyncio.new_event_loop()

    # User 1 joins queue
    room1 = loop.run_until_complete(hub.add_player("tap_race", 100, 101, "Player_101", "avatar_1", ws1))
    assert room1 is None, "First player should be placed in queue"
    assert len(hub.queues["tap_race:100"]) == 1

    # User 1 attempts duplicate join (same user_id)
    room1_dup = loop.run_until_complete(hub.add_player("tap_race", 100, 101, "Player_101", "avatar_1", ws1))
    assert room1_dup is None, "Same user should not match with self"
    assert len(hub.queues["tap_race:100"]) == 1, "Duplicate join should replace stale queue entry, keeping queue size 1"

    # User 2 joins queue
    room2 = loop.run_until_complete(hub.add_player("tap_race", 100, 102, "Player_102", "avatar_2", ws2))
    assert room2 is not None, "Distinct second user should trigger a match"
    assert 101 in room2.players and 102 in room2.players, "Room must contain both user 101 and user 102"
    assert room2.players[101]["username"] == "Player_101"
    assert room2.players[102]["username"] == "Player_102"

    loop.close()
    print("[PASS] test_matchmaking_hub_unit")

def test_websocket_real_user_matchmaking():
    """Verify WebSocket endpoint handles authentication, real user matchmaking, profile exchange, and progress broadcasting."""
    client = TestClient(app)

    token_a = generate_test_jwt(201, "User_Alpha")
    token_b = generate_test_jwt(202, "User_Beta")

    # Connect User A
    with client.websocket_connect(f"/api/ws/match?token={token_a}&game=math_duel&stake=50") as ws_a:
        msg_a1 = ws_a.receive_json()
        assert msg_a1["event"] == "QUEUED", f"Expected QUEUED, got {msg_a1}"

        # Connect User B
        with client.websocket_connect(f"/api/ws/match?token={token_b}&game=math_duel&stake=50") as ws_b:
            msg_a2 = ws_a.receive_json()
            msg_b1 = ws_b.receive_json()

            assert msg_a2["event"] == "MATCH_FOUND", f"User A expected MATCH_FOUND, got {msg_a2}"
            assert msg_b1["event"] == "MATCH_FOUND", f"User B expected MATCH_FOUND, got {msg_b1}"

            # Validate identical room ID
            assert msg_a2["roomId"] == msg_b1["roomId"], "Both players must receive identical roomId"

            # Validate real user profile exchange
            assert msg_a2["opponentId"] == 202, f"User A should see opponentId 202, got {msg_a2['opponentId']}"
            assert msg_a2["opponentUsername"] == "User_Beta", f"User A should see opponentUsername 'User_Beta', got {msg_a2['opponentUsername']}"

            assert msg_b1["opponentId"] == 201, f"User B should see opponentId 201, got {msg_b1['opponentId']}"
            assert msg_b1["opponentUsername"] == "User_Alpha", f"User B should see opponentUsername 'User_Alpha', got {msg_b1['opponentUsername']}"

            # Test real-time progress broadcast from A -> B
            ws_a.send_json({
                "event": "GAME_PROGRESS",
                "roomId": msg_a2["roomId"],
                "progress": 75,
                "score": 40,
                "timeMs": 1200
            })
            msg_b_prog = ws_b.receive_json()
            assert msg_b_prog["event"] == "OPPONENT_PROGRESS"
            assert msg_b_prog["progress"] == 75
            assert msg_b_prog["score"] == 40

        # User B disconnected when leaving context block -> User A should get OPPONENT_DISCONNECTED notification
        msg_a_disconn = ws_a.receive_json()
        assert msg_a_disconn["event"] == "OPPONENT_DISCONNECTED"
        assert msg_a_disconn["won"] is True

    print("[PASS] test_websocket_real_user_matchmaking")

def test_websocket_game_over_score_resolution():
    """Verify GAME_SUBMIT resolves match results accurately based on scores."""
    client = TestClient(app)

    token_c = generate_test_jwt(301, "User_Charlie")
    token_d = generate_test_jwt(302, "User_Delta")

    with client.websocket_connect(f"/api/ws/match?token={token_c}&game=tap_race&stake=100") as ws_c:
        ws_c.receive_json() # QUEUED
        with client.websocket_connect(f"/api/ws/match?token={token_d}&game=tap_race&stake=100") as ws_d:
            msg_c_match = ws_c.receive_json() # MATCH_FOUND
            msg_d_match = ws_d.receive_json() # MATCH_FOUND

            room_id = msg_c_match["roomId"]

            # User C submits lower score
            ws_c.send_json({
                "event": "GAME_SUBMIT",
                "roomId": room_id,
                "score": 50,
                "timeMs": 3000,
                "accuracy": "5/10"
            })

            # User D submits higher score
            ws_d.send_json({
                "event": "GAME_SUBMIT",
                "roomId": room_id,
                "score": 85,
                "timeMs": 2800,
                "accuracy": "8/10"
            })

            msg_c_over = ws_c.receive_json()
            msg_d_over = ws_d.receive_json()

            assert msg_c_over["event"] == "GAME_OVER"
            assert msg_c_over["won"] is False
            assert msg_c_over["playerScore"] == 50
            assert msg_c_over["opponentScore"] == 85

            assert msg_d_over["event"] == "GAME_OVER"
            assert msg_d_over["won"] is True
            assert msg_d_over["playerScore"] == 85
            assert msg_d_over["opponentScore"] == 50

    print("[PASS] test_websocket_game_over_score_resolution")

if __name__ == "__main__":
    test_matchmaking_hub_unit()
    test_websocket_real_user_matchmaking()
    test_websocket_game_over_score_resolution()
    print("ALL MATCHMAKING TESTS PASSED SUCCESSFULLY!")

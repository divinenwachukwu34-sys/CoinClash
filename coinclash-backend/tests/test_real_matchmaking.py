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

ALL_GAMES = [
    'color-match',
    'math-duel',
    'aim-rush',
    'swipe-duel',
    'memory-flash',
    'word-scramble',
    'trivia',
    'number-catch',
    'play'
]

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
    room1 = loop.run_until_complete(hub.add_player("play", 100, 101, "Player_101", "avatar_1", ws1))
    assert room1 is None, "First player should be placed in queue"
    assert len(hub.queues["play:real_money:100"]) == 1

    # User 1 attempts duplicate join (same user_id)
    room1_dup = loop.run_until_complete(hub.add_player("play", 100, 101, "Player_101", "avatar_1", ws1))
    assert room1_dup is None, "Same user should not match with self"
    assert len(hub.queues["play:real_money:100"]) == 1, "Duplicate join should replace stale queue entry"

    # User 2 joins queue
    room2 = loop.run_until_complete(hub.add_player("play", 100, 102, "Player_102", "avatar_2", ws2))
    assert room2 is not None, "Distinct second user should trigger a match"
    assert 101 in room2.players and 102 in room2.players, "Room must contain both user 101 and user 102"
    assert room2.players[101]["username"] == "Player_101"
    assert room2.players[102]["username"] == "Player_102"

    loop.close()
    print("[PASS] test_matchmaking_hub_unit")

def test_queue_separation_practice_vs_real_money():
    """Verify Practice (stake 0) and Real Money (stake > 0) players NEVER cross-match."""
    hub = MatchmakingHub()
    ws1 = MockWebSocket()
    ws2 = MockWebSocket()

    loop = asyncio.new_event_loop()

    # User 1 joins practice queue (stake 0)
    room1 = loop.run_until_complete(hub.add_player("math-duel", 0, 301, "PracticeUser", "avatar_1", ws1))
    assert room1 is None

    # User 2 joins real money queue (stake 50) for the same game
    room2 = loop.run_until_complete(hub.add_player("math-duel", 50, 302, "RealUser", "avatar_2", ws2))
    assert room2 is None, "Practice player and Real Money player MUST NOT match"

    assert "math-duel:practice:0" in hub.queues
    assert "math-duel:real_money:50" in hub.queues

    loop.close()
    print("[PASS] test_queue_separation_practice_vs_real_money")

def test_all_games_real_user_matchmaking():
    """Verify live real-user matchmaking works across ALL 9 multiplayer games."""
    client = TestClient(app)

    for idx, game_id in enumerate(ALL_GAMES):
        uid1 = 700 + idx * 2
        uid2 = 701 + idx * 2
        t1 = generate_test_jwt(uid1, f"User_{game_id}_1")
        t2 = generate_test_jwt(uid2, f"User_{game_id}_2")

        with client.websocket_connect(f"/api/ws/match?token={t1}&game={game_id}&stake=20") as ws1:
            q1 = ws1.receive_json()
            assert q1["event"] == "QUEUED"

            with client.websocket_connect(f"/api/ws/match?token={t2}&game={game_id}&stake=20") as ws2:
                m1 = ws1.receive_json()
                m2 = ws2.receive_json()

                assert m1["event"] == "MATCH_FOUND", f"Game {game_id}: P1 expected MATCH_FOUND, got {m1}"
                assert m2["event"] == "MATCH_FOUND", f"Game {game_id}: P2 expected MATCH_FOUND, got {m2}"
                assert m1["roomId"] == m2["roomId"], f"Game {game_id}: roomId mismatch"
                assert m1["opponentId"] == uid2, f"Game {game_id}: opponentId mismatch"
                assert m2["opponentId"] == uid1, f"Game {game_id}: opponentId mismatch"

    print(f"[PASS] test_all_games_real_user_matchmaking (all {len(ALL_GAMES)} games verified)")

def test_websocket_real_user_matchmaking():
    """Verify WebSocket endpoint handles authentication, real user matchmaking, profile exchange, and progress broadcasting."""
    client = TestClient(app)

    token_a = generate_test_jwt(201, "User_Alpha")
    token_b = generate_test_jwt(202, "User_Beta")

    # Connect User A
    with client.websocket_connect(f"/api/ws/match?token={token_a}&game=math-duel&stake=50") as ws_a:
        msg_a1 = ws_a.receive_json()
        assert msg_a1["event"] == "QUEUED", f"Expected QUEUED, got {msg_a1}"

        # Connect User B
        with client.websocket_connect(f"/api/ws/match?token={token_b}&game=math-duel&stake=50") as ws_b:
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

def test_tap_race_both_players_score_zero():
    """Verify 0-0 no-tap match (both players timeout with 0 score): exactly 1 winner and 1 loser determined, NEVER double loss."""
    client = TestClient(app)

    token_e1 = generate_test_jwt(401, "ZeroPlayer1")
    token_e2 = generate_test_jwt(402, "ZeroPlayer2")

    with client.websocket_connect(f"/api/ws/match?token={token_e1}&game=play&stake=50") as ws1:
        ws1.receive_json() # QUEUED
        with client.websocket_connect(f"/api/ws/match?token={token_e2}&game=play&stake=50") as ws2:
            m1 = ws1.receive_json()
            m2 = ws2.receive_json()
            room_id = m1["roomId"]

            # Both submit 0 taps / timeout score 0, 3500ms
            ws1.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 0, "timeMs": 3500, "accuracy": "0/1"})
            ws2.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 0, "timeMs": 3500, "accuracy": "0/1"})

            res1 = ws1.receive_json()
            res2 = ws2.receive_json()

            assert res1["event"] == "GAME_OVER"
            assert res2["event"] == "GAME_OVER"

            # Both receive identical scores: playerScore 0 vs opponentScore 0
            assert res1["playerScore"] == 0 and res1["opponentScore"] == 0
            assert res2["playerScore"] == 0 and res2["opponentScore"] == 0

            # Exactly one winner and one loser (res1["won"] != res2["won"])
            assert res1["won"] ^ res2["won"], f"Must not be double loss or double win! got P1 won={res1['won']}, P2 won={res2['won']}"

    print("[PASS] test_tap_race_both_players_score_zero")

def test_player1_wins_and_player2_wins():
    """Verify Player 1 wins when scoring higher, and Player 2 wins when scoring higher."""
    client = TestClient(app)

    # Test P1 Wins
    t1 = generate_test_jwt(501, "P1_Fast")
    t2 = generate_test_jwt(502, "P2_Slow")
    with client.websocket_connect(f"/api/ws/match?token={t1}&game=play&stake=10") as ws1:
        ws1.receive_json()
        with client.websocket_connect(f"/api/ws/match?token={t2}&game=play&stake=10") as ws2:
            m1 = ws1.receive_json()
            m2 = ws2.receive_json()
            room_id = m1["roomId"]

            ws1.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 100, "timeMs": 280, "accuracy": "1/1"})
            ws2.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 100, "timeMs": 450, "accuracy": "1/1"})

            r1 = ws1.receive_json()
            r2 = ws2.receive_json()

            assert r1["won"] is True, "Player 1 (280ms) should win against Player 2 (450ms)"
            assert r2["won"] is False
            assert r1["playerTimeMs"] == 280 and r1["opponentTimeMs"] == 450
            assert r2["playerTimeMs"] == 450 and r2["opponentTimeMs"] == 280

    # Test P2 Wins
    t3 = generate_test_jwt(503, "P3_Slow")
    t4 = generate_test_jwt(504, "P4_Fast")
    with client.websocket_connect(f"/api/ws/match?token={t3}&game=play&stake=10") as ws3:
        ws3.receive_json()
        with client.websocket_connect(f"/api/ws/match?token={t4}&game=play&stake=10") as ws4:
            m3 = ws3.receive_json()
            m4 = ws4.receive_json()
            room_id = m3["roomId"]

            ws3.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 100, "timeMs": 520, "accuracy": "1/1"})
            ws4.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 100, "timeMs": 310, "accuracy": "1/1"})

            r3 = ws3.receive_json()
            r4 = ws4.receive_json()

            assert r3["won"] is False
            assert r4["won"] is True, "Player 4 (310ms) should win against Player 3 (520ms)"
            assert r3["playerTimeMs"] == 520 and r3["opponentTimeMs"] == 310
            assert r4["playerTimeMs"] == 310 and r4["opponentTimeMs"] == 520

    print("[PASS] test_player1_wins_and_player2_wins")

def test_duplicate_and_simultaneous_score_submissions():
    """Verify duplicate score submissions for the same room return identical authoritative resolution without duplicate processing."""
    client = TestClient(app)

    t5 = generate_test_jwt(601, "DupUser1")
    t6 = generate_test_jwt(602, "DupUser2")

    with client.websocket_connect(f"/api/ws/match?token={t5}&game=math-duel&stake=20") as ws5:
        ws5.receive_json()
        with client.websocket_connect(f"/api/ws/match?token={t6}&game=math-duel&stake=20") as ws6:
            m5 = ws5.receive_json()
            m6 = ws6.receive_json()
            room_id = m5["roomId"]

            # Submit scores
            ws5.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 90, "timeMs": 2000, "accuracy": "9/10"})
            ws6.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 80, "timeMs": 2200, "accuracy": "8/10"})

            res5_a = ws5.receive_json()
            res6_a = ws6.receive_json()

            assert res5_a["won"] is True
            assert res6_a["won"] is False

            # Duplicate submission from user 5
            ws5.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 90, "timeMs": 2000, "accuracy": "9/10"})
            res5_b = ws5.receive_json()

            # Resolution must be identical
            assert res5_b["won"] == res5_a["won"]
            assert res5_b["playerScore"] == res5_a["playerScore"]
            assert res5_b["opponentScore"] == res5_a["opponentScore"]

    print("[PASS] test_duplicate_and_simultaneous_score_submissions")

if __name__ == "__main__":
    test_matchmaking_hub_unit()
    test_queue_separation_practice_vs_real_money()
    test_all_games_real_user_matchmaking()
    test_websocket_real_user_matchmaking()
    test_tap_race_both_players_score_zero()
    test_player1_wins_and_player2_wins()
    test_duplicate_and_simultaneous_score_submissions()
    print("ALL MULTIPLAYER MATCHMAKING & SCORING TESTS PASSED SUCCESSFULLY!")

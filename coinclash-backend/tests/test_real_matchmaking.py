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

def test_both_players_never_start():
    """Requirement 1 & 8: If neither player starts the game (neither sends GAME_START), match MUST cancel/void with winner_id=None."""
    client = TestClient(app)
    t1 = generate_test_jwt(801, "NeverStart1")
    t2 = generate_test_jwt(802, "NeverStart2")

    with client.websocket_connect(f"/api/ws/match?token={t1}&game=play&stake=50") as ws1:
        ws1.receive_json() # QUEUED
        with client.websocket_connect(f"/api/ws/match?token={t2}&game=play&stake=50") as ws2:
            m1 = ws1.receive_json() # MATCH_FOUND
            m2 = ws2.receive_json() # MATCH_FOUND
            room_id = m1["roomId"]

            # Neither player sends GAME_START. Both submit timeout 0 score.
            ws1.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 0, "timeMs": 3500, "accuracy": "0/1"})
            ws2.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 0, "timeMs": 3500, "accuracy": "0/1"})

            res1 = ws1.receive_json()
            res2 = ws2.receive_json()

            assert res1["event"] == "GAME_OVER"
            assert res2["event"] == "GAME_OVER"
            assert res1["won"] is False and res2["won"] is False, "Neither player should win if neither started"
            assert res1["isDraw"] is True or res1["cancelled"] is True, "Must be flagged as draw/cancelled"
            assert res1["reason"] == "NEITHER_PLAYER_STARTED"
            assert res1["prize"] == 0 and res2["prize"] == 0, "No winner prize for unstarted match"

    print("[PASS] test_both_players_never_start")

def test_player1_starts_player2_never_starts():
    """Requirement 2 & 8: If Player 1 sends GAME_START and Player 2 never starts, Player 1 wins by forfeit/default."""
    client = TestClient(app)
    t1 = generate_test_jwt(811, "P1_Started")
    t2 = generate_test_jwt(812, "P2_NeverStarted")

    with client.websocket_connect(f"/api/ws/match?token={t1}&game=play&stake=50") as ws1:
        ws1.receive_json()
        with client.websocket_connect(f"/api/ws/match?token={t2}&game=play&stake=50") as ws2:
            m1 = ws1.receive_json()
            m2 = ws2.receive_json()
            room_id = m1["roomId"]

            # Only Player 1 sends GAME_START
            ws1.send_json({"event": "GAME_START", "roomId": room_id})

            # Both submit scores (P1 played, P2 timed out without starting)
            ws1.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 100, "timeMs": 300, "accuracy": "1/1"})
            ws2.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 0, "timeMs": 3500, "accuracy": "0/1"})

            res1 = ws1.receive_json()
            res2 = ws2.receive_json()

            assert res1["won"] is True, "Player 1 who started must win by default against unstarted Player 2"
            assert res2["won"] is False
            assert res1["reason"] == "OPPONENT_NEVER_STARTED"
            assert res1["prize"] == 95, "P1 receives winner prize"

    print("[PASS] test_player1_starts_player2_never_starts")

def test_player2_starts_player1_never_starts():
    """Requirement 2 & 8: If Player 2 sends GAME_START and Player 1 never starts, Player 2 wins by forfeit/default."""
    client = TestClient(app)
    t1 = generate_test_jwt(821, "P1_NeverStarted")
    t2 = generate_test_jwt(822, "P2_Started")

    with client.websocket_connect(f"/api/ws/match?token={t1}&game=play&stake=50") as ws1:
        ws1.receive_json()
        with client.websocket_connect(f"/api/ws/match?token={t2}&game=play&stake=50") as ws2:
            m1 = ws1.receive_json()
            m2 = ws2.receive_json()
            room_id = m1["roomId"]

            # Only Player 2 sends GAME_START
            ws2.send_json({"event": "GAME_START", "roomId": room_id})

            # Both submit scores
            ws1.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 0, "timeMs": 3500, "accuracy": "0/1"})
            ws2.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 100, "timeMs": 400, "accuracy": "1/1"})

            res1 = ws1.receive_json()
            res2 = ws2.receive_json()

            assert res1["won"] is False
            assert res2["won"] is True, "Player 2 who started must win by default against unstarted Player 1"
            assert res2["reason"] == "OPPONENT_NEVER_STARTED"
            assert res2["prize"] == 95

    print("[PASS] test_player2_starts_player1_never_starts")

def test_both_start_and_both_score_zero():
    """Requirement 3 & 8: If BOTH players send GAME_START and both finish with 0 taps, match is a DRAW/VOID result with winner_id=None."""
    client = TestClient(app)
    t1 = generate_test_jwt(831, "ZeroPlayer1")
    t2 = generate_test_jwt(832, "ZeroPlayer2")

    with client.websocket_connect(f"/api/ws/match?token={t1}&game=play&stake=50") as ws1:
        ws1.receive_json()
        with client.websocket_connect(f"/api/ws/match?token={t2}&game=play&stake=50") as ws2:
            m1 = ws1.receive_json()
            m2 = ws2.receive_json()
            room_id = m1["roomId"]

            # BOTH players send GAME_START
            ws1.send_json({"event": "GAME_START", "roomId": room_id})
            ws2.send_json({"event": "GAME_START", "roomId": room_id})

            beg1 = ws1.receive_json()
            beg2 = ws2.receive_json()
            assert beg1["event"] == "GAME_BEGIN" and beg2["event"] == "GAME_BEGIN"

            # Both submit 0 taps / timeout score 0
            ws1.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 0, "timeMs": 3500, "accuracy": "0/1"})
            ws2.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 0, "timeMs": 3500, "accuracy": "0/1"})

            res1 = ws1.receive_json()
            res2 = ws2.receive_json()

            assert res1["event"] == "GAME_OVER" and res2["event"] == "GAME_OVER"
            assert res1["won"] is False and res2["won"] is False, "Neither player wins a 0-0 draw match"
            assert res1["isDraw"] is True and res2["isDraw"] is True, "Must be flagged as a Draw"
            assert res1["prize"] == 0 and res2["prize"] == 0, "No winner prize awarded on a 0-0 draw"
            assert res1["reason"] == "DRAW_ZERO_SCORE"

    print("[PASS] test_both_start_and_both_score_zero")

def test_both_start_and_one_scores_greater_than_zero():
    """Requirement 4 & 8: If both players send GAME_START and Player 1 scores >0 while Player 2 scores 0, Player 1 MUST win."""
    client = TestClient(app)
    t1 = generate_test_jwt(841, "ScoredPlayer")
    t2 = generate_test_jwt(842, "ZeroScorePlayer")

    with client.websocket_connect(f"/api/ws/match?token={t1}&game=play&stake=20") as ws1:
        ws1.receive_json()
        with client.websocket_connect(f"/api/ws/match?token={t2}&game=play&stake=20") as ws2:
            m1 = ws1.receive_json()
            m2 = ws2.receive_json()
            room_id = m1["roomId"]

            ws1.send_json({"event": "GAME_START", "roomId": room_id})
            ws2.send_json({"event": "GAME_START", "roomId": room_id})

            beg1 = ws1.receive_json() # GAME_BEGIN
            beg2 = ws2.receive_json() # GAME_BEGIN
            assert beg1["event"] == "GAME_BEGIN" and beg2["event"] == "GAME_BEGIN"

            # P1 scores 100, P2 scores 0
            ws1.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 100, "timeMs": 280, "accuracy": "1/1"})
            ws2.send_json({"event": "GAME_SUBMIT", "roomId": room_id, "score": 0, "timeMs": 3500, "accuracy": "0/1"})

            res1 = ws1.receive_json()
            res2 = ws2.receive_json()

            assert res1["event"] == "GAME_OVER" and res2["event"] == "GAME_OVER"
            assert res1["won"] is True, "Player with score > 0 must win against score 0"
            assert res2["won"] is False
            assert res1["prize"] == 35

    print("[PASS] test_both_start_and_one_scores_greater_than_zero")

def test_disconnect_before_start():
    """Requirement 8: Disconnect before game starts (in queue or countdown) grants remaining player a default win or removes queue entry."""
    client = TestClient(app)
    t1 = generate_test_jwt(851, "DiscUser1")
    t2 = generate_test_jwt(852, "DiscUser2")

    with client.websocket_connect(f"/api/ws/match?token={t1}&game=math-duel&stake=10") as ws1:
        ws1.receive_json() # QUEUED
        with client.websocket_connect(f"/api/ws/match?token={t2}&game=math-duel&stake=10") as ws2:
            ws1.receive_json() # MATCH_FOUND
            ws2.receive_json() # MATCH_FOUND

        # ws2 disconnects before GAME_START
        m_disc = ws1.receive_json()
        assert m_disc["event"] == "OPPONENT_DISCONNECTED"
        assert m_disc["won"] is True

    print("[PASS] test_disconnect_before_start")

def test_disconnect_during_gameplay():
    """Requirement 8: Disconnect during active gameplay (after GAME_START) grants active player an immediate OPPONENT_DISCONNECTED default win."""
    client = TestClient(app)
    t1 = generate_test_jwt(861, "ActiveUser")
    t2 = generate_test_jwt(862, "QuittingUser")

    with client.websocket_connect(f"/api/ws/match?token={t1}&game=math-duel&stake=10") as ws1:
        ws1.receive_json()
        with client.websocket_connect(f"/api/ws/match?token={t2}&game=math-duel&stake=10") as ws2:
            m1 = ws1.receive_json()
            m2 = ws2.receive_json()
            room_id = m1["roomId"]

            ws1.send_json({"event": "GAME_START", "roomId": room_id})
            ws2.send_json({"event": "GAME_START", "roomId": room_id})

            beg1 = ws1.receive_json() # GAME_BEGIN
            beg2 = ws2.receive_json() # GAME_BEGIN
            assert beg1["event"] == "GAME_BEGIN" and beg2["event"] == "GAME_BEGIN"

        # ws2 disconnects mid-game
        m_disc = ws1.receive_json()
        assert m_disc["event"] == "OPPONENT_DISCONNECTED"
        assert m_disc["won"] is True

    print("[PASS] test_disconnect_during_gameplay")

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

if __name__ == "__main__":
    test_both_players_never_start()
    test_player1_starts_player2_never_starts()
    test_player2_starts_player1_never_starts()
    test_both_start_and_both_score_zero()
    test_both_start_and_one_scores_greater_than_zero()
    test_disconnect_before_start()
    test_disconnect_during_gameplay()
    test_matchmaking_hub_unit()
    test_queue_separation_practice_vs_real_money()
    test_all_games_real_user_matchmaking()
    print("ALL MULTIPLAYER SCENARIOS & SCORING TESTS PASSED SUCCESSFULLY!")

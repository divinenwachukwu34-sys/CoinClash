"""
CoinClash — Dedicated Admin Account & Authorization Test Suite

Tests cover:
  1. Password policy enforcement (length, uppercase, digit, special char).
  2. create_admin safety:
     - New admin creation succeeds with role='admin', is_admin=True.
     - Existing email rejection (existing player account cannot be converted).
     - Existing username rejection (cannot mutate an existing user on username collision).
  3. API-level authorization:
     - Normal player (standard email) receives 403 Forbidden on all admin endpoints.
     - Personal player account (divinenwachukwu34@gmail.com) is strictly non-admin (receives 403 Forbidden).
     - Dedicated admin account (role='admin', is_admin=True) receives 200 OK on admin endpoints.
"""

import os
import sys
import asyncio
import jwt

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["TESTING"] = "1"

from fastapi.testclient import TestClient
from main import app
from routers.matchmaking_ws import JWT_SECRET
from create_admin import validate_password_strength, create_dedicated_admin


def generate_test_jwt(user_id: int, email: str, username: str) -> str:
    payload = {
        "userId": user_id,
        "email": email,
        "username": username,
        "tokenVersion": 1,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def test_password_policy_enforcement():
    """Verify password validation strictly matches CoinClash signup policy."""
    # Too short (<8 chars)
    ok, err = validate_password_strength("Short1!")
    assert not ok, "Expected failure for password < 8 characters"
    assert "at least 8 characters" in err

    # Missing uppercase
    ok, err = validate_password_strength("lowercase123!@#")
    assert not ok, "Expected failure for missing uppercase"
    assert "uppercase letter" in err

    # Missing number
    ok, err = validate_password_strength("NoNumberHere!@#")
    assert not ok, "Expected failure for missing number"
    assert "number" in err

    # Missing special character
    ok, err = validate_password_strength("NoSpecialChar123")
    assert not ok, "Expected failure for missing special char"
    assert "special character" in err

    # Strong compliant password
    ok, err = validate_password_strength("SuperSecretAdmin#2026")
    assert ok, f"Expected success for valid password, got: {err}"
    assert err == ""
    print("[PASS] 1. Password policy enforcement verified")


def test_create_admin_safety_with_mock_conn():
    """Verify create_admin safety invariants: email collision, username collision, clean creation."""
    class MockConn:
        def __init__(self):
            # Pre-populated existing player database
            self.users = [
                {"id": 1, "email": "divinenwachukwu34@gmail.com", "username": "DivinePlayer", "role": "user", "is_admin": False},
                {"id": 2, "email": "regularplayer@coinclash.app", "username": "ExistingUser", "role": "user", "is_admin": False},
            ]
            self.executed_queries = []

        async def execute(self, query, *args):
            self.executed_queries.append((query, args))
            return "OK"

        async def fetchrow(self, query, *args):
            self.executed_queries.append((query, args))
            # Email check
            if "WHERE LOWER(email) = $1" in query:
                email = args[0].lower()
                for u in self.users:
                    if u["email"].lower() == email:
                        return u
                return None
            # Username check
            if "WHERE LOWER(username) = $1" in query:
                uname = args[0].lower()
                for u in self.users:
                    if u["username"].lower() == uname:
                        return u
                return None
            # Insert check
            if "INSERT INTO users" in query:
                new_id = len(self.users) + 1
                row = {
                    "id": new_id,
                    "email": args[0],
                    "username": args[1],
                    "role": "admin",
                    "is_admin": True,
                    "is_verified": True,
                    "status": "active",
                    "created_at": "2026-10-08T12:00:00Z"
                }
                self.users.append(row)
                return row
            return None

    mock_conn = MockConn()

    # Scenario A: Attempt to create admin with already registered player email
    raised_email_err = False
    try:
        asyncio.run(create_dedicated_admin(
            email="divinenwachukwu34@gmail.com",
            username="new_admin_user",
            password="ValidAdminPass#1",
            conn=mock_conn
        ))
    except ValueError as e:
        raised_email_err = True
        assert "already registered" in str(e)
        assert "Existing player accounts cannot be converted to admin" in str(e)
    assert raised_email_err, "Expected ValueError on registered email"
    print("[PASS] 2a. Existing email collision rejected (player account protected)")

    # Scenario B: Attempt to create admin with already registered username
    raised_uname_err = False
    try:
        asyncio.run(create_dedicated_admin(
            email="brand_new_admin@coinclash.app",
            username="ExistingUser",
            password="ValidAdminPass#1",
            conn=mock_conn
        ))
    except ValueError as e:
        raised_uname_err = True
        assert "already taken by account ID=2" in str(e)
    assert raised_uname_err, "Expected ValueError on registered username"
    print("[PASS] 2b. Existing username collision rejected (unrelated account protected)")

    # Scenario C: Clean creation with unique email and username
    created = asyncio.run(create_dedicated_admin(
        email="dedicated_admin@coinclash.internal",
        username="unique_admin",
        password="ValidAdminPass#1",
        conn=mock_conn
    ))
    assert created["email"] == "dedicated_admin@coinclash.internal"
    assert created["username"] == "unique_admin"
    assert created["role"] == "admin"
    assert created["is_admin"] is True
    print("[PASS] 2c. Dedicated admin created cleanly with role='admin' and is_admin=True")


def test_api_admin_authorization():
    """Verify HTTP endpoint authorization for normal users, personal account, and dedicated admin."""
    client = TestClient(app)

    # 1. Standard player
    u_normal_jwt = generate_test_jwt(101, "player@coinclash.app", "Player101")
    h_normal = {"Authorization": f"Bearer {u_normal_jwt}"}

    # 2. Personal Gmail account (registered as normal player)
    u_personal_jwt = generate_test_jwt(102, "divinenwachukwu34@gmail.com", "DivinePersonal")
    h_personal = {"Authorization": f"Bearer {u_personal_jwt}"}

    # 3. Dedicated admin account (user_id=9999 has role='admin', is_admin=True)
    u_admin_jwt = generate_test_jwt(9999, "admin@coinclash.internal", "AdminUser")
    h_admin = {"Authorization": f"Bearer {u_admin_jwt}"}

    # Verify normal player gets 403 Forbidden
    r1 = client.get("/api/admin/support/tickets", headers=h_normal)
    assert r1.status_code == 403, f"Normal player must get 403, got {r1.status_code}"

    r2 = client.get("/api/admin/support/faqs", headers=h_normal)
    assert r2.status_code == 403, f"Normal player must get 403 on admin FAQs, got {r2.status_code}"

    # Verify personal player account is NOT an admin (403 Forbidden)
    r3 = client.get("/api/admin/support/tickets", headers=h_personal)
    assert r3.status_code == 403, f"Personal player account must get 403, got {r3.status_code}"

    r4 = client.get("/api/admin/support/faqs", headers=h_personal)
    assert r4.status_code == 403, f"Personal player account must get 403 on admin FAQs, got {r4.status_code}"
    print("[PASS] 3a. Normal and personal player accounts strictly denied admin access (403 Forbidden)")

    # Verify dedicated admin gets 200 OK
    r_admin_tickets = client.get("/api/admin/support/tickets", headers=h_admin)
    assert r_admin_tickets.status_code == 200, f"Dedicated admin must get 200, got {r_admin_tickets.status_code}"

    r_admin_faqs = client.get("/api/admin/support/faqs", headers=h_admin)
    assert r_admin_faqs.status_code == 200, f"Dedicated admin must get 200 on FAQs, got {r_admin_faqs.status_code}"
    print("[PASS] 3b. Dedicated admin account authorized successfully (200 OK)")


if __name__ == "__main__":
    test_password_policy_enforcement()
    test_create_admin_safety_with_mock_conn()
    test_api_admin_authorization()
    print("\nALL ADMIN AUTHORIZATION & CREATION TESTS PASSED SUCCESSFULLY!")

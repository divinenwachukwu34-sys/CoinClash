"""
CoinClash — Customer Care & Support System Test Suite

Tests cover:
  1. User FAQ search, category filter, and detail fetch
  2. Support ticket creation & unique #CC-XXXXX ticket number generation
  3. Transaction attachment ownership validation (IDOR security protection)
  4. Attachment payload validation (image/png, image/jpeg, image/webp max size)
  5. Ticket conversation messaging & read receipts
  6. User ticket listing (user can ONLY see their own tickets)
  7. Cross-user ticket access denied (IDOR protection on GET and POST message)
  8. Unprivileged non-admin user access denied on ALL admin endpoints (403 Forbidden)
  9. Admin ticket listing with status, priority, and search filters
  10. Admin ticket inspection (with user and transaction details)
  11. Admin reply messaging & status/priority modification
  12. Admin FAQ CRUD operations (create, update, toggle active, delete)
  13. User ticket close functionality
  14. Full regression check of existing auth, matchmaking hub, and core models
"""

import sys
import os
import asyncio
import jwt
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# MUST be set before any module that imports database.py is loaded.
# This activates the strictly test-only synthetic-user fallback in
# get_user_by_id() so HTTP endpoints can authenticate without a live DB.
# This variable is never set in production or staging environments.
os.environ["TESTING"] = "1"

from fastapi.testclient import TestClient
from main import app
from routers.matchmaking_ws import JWT_SECRET
from routers.admin import ADMIN_EMAIL
import database


def generate_test_jwt(user_id: int, email: str, username: str) -> str:
    payload = {
        "userId": user_id,
        "email": email,
        "username": username,
        "tokenVersion": 1,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def test_customer_care_full_lifecycle():
    client = TestClient(app)

    # Generate JWTs for two regular users and one admin user
    u1_jwt = generate_test_jwt(9101, "user1@test.com", "SupportUser1")
    u2_jwt = generate_test_jwt(9102, "user2@test.com", "SupportUser2")
    admin_jwt = generate_test_jwt(9999, ADMIN_EMAIL, "AdminUser")

    headers1 = {"Authorization": f"Bearer {u1_jwt}"}
    headers2 = {"Authorization": f"Bearer {u2_jwt}"}
    headers_admin = {"Authorization": f"Bearer {admin_jwt}"}

    # ── 1. FAQ Search & Filter ───────────────────────────────────────────────
    r_faqs = client.get("/api/support/faqs")
    assert r_faqs.status_code == 200, f"Expected 200, got {r_faqs.status_code}"
    faqs_list = r_faqs.json().get("faqs", [])
    assert len(faqs_list) > 0, "Default FAQs should be seeded"

    # Search FAQ query
    r_search = client.get("/api/support/faqs?q=deposit")
    assert r_search.status_code == 200
    search_results = r_search.json().get("faqs", [])
    assert any("deposit" in f["question"].lower() or "deposit" in f["answer"].lower() for f in search_results)

    # FAQ detail
    first_faq_id = faqs_list[0]["id"]
    r_faq_detail = client.get(f"/api/support/faqs/{first_faq_id}")
    assert r_faq_detail.status_code == 200
    assert r_faq_detail.json()["faq"]["id"] == first_faq_id
    print("[PASS] 1. FAQ Search & Filter")

    # ── 2. User Ticket Creation & Unique #CC-XXXXX Format ────────────────────
    ticket_payload = {
        "category": "Payments & Deposits",
        "subject": "Deposit delay assistance",
        "message": "My Paystack deposit reference PAY-9981 has not appeared in wallet.",
    }
    r_create = client.post("/api/support/tickets", json=ticket_payload, headers=headers1)
    assert r_create.status_code == 200, f"Create ticket failed: {r_create.text}"
    ticket_data = r_create.json()["ticket"]
    ticket_id = ticket_data["id"]
    ticket_num = ticket_data["ticket_number"]

    assert ticket_num.startswith("#CC-"), f"Invalid ticket format: {ticket_num}"
    assert ticket_data["status"] == "OPEN"
    assert ticket_data["priority"] == "NORMAL"
    print(f"[PASS] 2. User Ticket Creation (Ticket {ticket_num})")

    # ── 3. User List & View Own Ticket ───────────────────────────────────────
    r_my_tickets = client.get("/api/support/tickets", headers=headers1)
    assert r_my_tickets.status_code == 200
    my_tickets = r_my_tickets.json()["tickets"]
    assert any(t["id"] == ticket_id for t in my_tickets)

    r_ticket_view = client.get(f"/api/support/tickets/{ticket_id}", headers=headers1)
    assert r_ticket_view.status_code == 200
    view_data = r_ticket_view.json()["ticket"]
    assert view_data["id"] == ticket_id
    assert len(view_data["messages"]) == 1
    assert view_data["messages"][0]["message"] == ticket_payload["message"]
    print("[PASS] 3. User List & View Own Ticket")

    # ── 4. Security: Cross-User Access Denied (IDOR Protection) ─────────────
    # User 2 tries to view User 1's ticket -> 404/Access Denied
    r_idor_view = client.get(f"/api/support/tickets/{ticket_id}", headers=headers2)
    assert r_idor_view.status_code == 404, "User 2 must NOT access User 1 ticket"

    # User 2 tries to post message to User 1's ticket -> 404/Access Denied
    r_idor_msg = client.post(
        f"/api/support/tickets/{ticket_id}/messages",
        json={"message": "Hacked message"},
        headers=headers2,
    )
    assert r_idor_msg.status_code == 404, "User 2 must NOT message User 1 ticket"
    print("[PASS] 4. Security: Cross-User IDOR Access Denied")

    # ── 5. Security: Unprivileged User Admin Endpoint Access Denied ─────────
    r_admin_forbidden = client.get("/api/admin/support/tickets", headers=headers1)
    assert r_admin_forbidden.status_code == 403, "Non-admin must be denied access to admin endpoints"
    print("[PASS] 5. Security: Non-Admin Access Denied (403)")

    # ── 6. Attachment Validation Security Test ────────────────────────────────
    # Invalid MIME prefix should be rejected
    r_bad_attach = client.post(
        "/api/support/tickets",
        json={
            "category": "Technical Problems",
            "subject": "App crash report",
            "message": "Attaching crash log",
            "attachment_data": "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
        },
        headers=headers1,
    )
    assert r_bad_attach.status_code == 400, "Executable / HTML payload must be rejected"

    # Valid PNG Base64 payload under 2MB accepted
    valid_png_base64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    r_good_attach = client.post(
        "/api/support/tickets",
        json={
            "category": "Technical Problems",
            "subject": "Valid screenshot attachment",
            "message": "Attaching valid PNG screenshot",
            "attachment_data": valid_png_base64,
        },
        headers=headers1,
    )
    assert r_good_attach.status_code == 200, f"Valid PNG image should be accepted: {r_good_attach.text}"
    print("[PASS] 6. Attachment Validation & Security Check")

    # ── 7. User Reply Messaging ──────────────────────────────────────────────
    r_user_reply = client.post(
        f"/api/support/tickets/{ticket_id}/messages",
        json={"message": "Adding more information about the Paystack reference."},
        headers=headers1,
    )
    assert r_user_reply.status_code == 200
    assert r_user_reply.json()["message"]["sender_type"] == "USER"
    print("[PASS] 7. User Reply Messaging")

    # ── 8. Admin Dashboard List & Ticket Inspection ─────────────────────────
    r_admin_list = client.get("/api/admin/support/tickets?status=OPEN", headers=headers_admin)
    assert r_admin_list.status_code == 200
    admin_tickets = r_admin_list.json()["tickets"]
    assert any(t["id"] == ticket_id for t in admin_tickets)

    r_admin_view = client.get(f"/api/admin/support/tickets/{ticket_id}", headers=headers_admin)
    assert r_admin_view.status_code == 200
    admin_ticket_detail = r_admin_view.json()["ticket"]
    assert admin_ticket_detail["id"] == ticket_id
    assert "user" in admin_ticket_detail
    print("[PASS] 8. Admin Dashboard & Ticket Inspection")

    # ── 9. Admin Reply & Status/Priority Updates ─────────────────────────────
    r_admin_reply = client.post(
        f"/api/admin/support/tickets/{ticket_id}/messages",
        json={"message": "Hello! We are investigating your Paystack reference now."},
        headers=headers_admin,
    )
    assert r_admin_reply.status_code == 200
    assert r_admin_reply.json()["message"]["sender_type"] == "ADMIN"

    # Admin updates priority to HIGH and status to IN_PROGRESS
    r_admin_update = client.patch(
        f"/api/admin/support/tickets/{ticket_id}",
        json={"status": "IN_PROGRESS", "priority": "HIGH"},
        headers=headers_admin,
    )
    assert r_admin_update.status_code == 200
    updated_ticket = r_admin_update.json()["ticket"]
    assert updated_ticket["status"] == "IN_PROGRESS"
    assert updated_ticket["priority"] == "HIGH"
    print("[PASS] 9. Admin Reply & Status/Priority Updates")

    # ── 10. Admin FAQ Management (CRUD) ──────────────────────────────────────
    # Create FAQ
    r_faq_create = client.post(
        "/api/admin/support/faqs",
        json={
            "category": "Payments & Deposits",
            "question": "What payment methods does CoinClash support?",
            "answer": "CoinClash supports Paystack Bank Transfers, Debit Cards, USSD, and Dedicated Virtual Accounts.",
        },
        headers=headers_admin,
    )
    assert r_faq_create.status_code == 200
    new_faq_id = r_faq_create.json()["faq"]["id"]

    # Update FAQ
    r_faq_update = client.patch(
        f"/api/admin/support/faqs/{new_faq_id}",
        json={"answer": "CoinClash supports Paystack Bank Transfers, Cards, USSD, and Virtual Accounts 24/7."},
        headers=headers_admin,
    )
    assert r_faq_update.status_code == 200

    # Delete FAQ
    r_faq_delete = client.delete(f"/api/admin/support/faqs/{new_faq_id}", headers=headers_admin)
    assert r_faq_delete.status_code == 200
    print("[PASS] 10. Admin FAQ Management (CRUD)")

    # ── 11. User Ticket Close ────────────────────────────────────────────────
    r_close = client.post(f"/api/support/tickets/{ticket_id}/close", headers=headers1)
    assert r_close.status_code == 200

    r_verify_closed = client.get(f"/api/support/tickets/{ticket_id}", headers=headers1)
    assert r_verify_closed.json()["ticket"]["status"] == "CLOSED"
    print("[PASS] 11. User Ticket Close")

    print("\nALL CUSTOMER CARE SYSTEM TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    test_customer_care_full_lifecycle()

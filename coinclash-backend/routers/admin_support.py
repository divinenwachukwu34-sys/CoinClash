from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from middleware.auth import get_current_user
from routers.admin import require_admin
import database

router = APIRouter()

# ── Admin Ticket Management Endpoints ──────────────────────────────────────────

@router.get("/tickets")
async def admin_list_tickets(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    admin: dict = Depends(require_admin)
):
    """Admin ticket dashboard list with multi-filtering."""
    try:
        res = await database.get_admin_support_tickets(
            status=status, priority=priority, category=category,
            search=search, limit=limit, offset=offset
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tickets/{ticket_id}")
async def admin_get_ticket(
    ticket_id: int,
    admin: dict = Depends(require_admin)
):
    """Admin ticket detail: returns full ticket, conversation, user info, and transaction info."""
    ticket = await database.get_ticket_details(ticket_id=ticket_id, user_id=None)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found.")
    return {"ticket": ticket}

@router.post("/tickets/{ticket_id}/messages")
async def admin_send_message(
    ticket_id: int,
    payload: dict,
    admin: dict = Depends(require_admin)
):
    """Admin reply message."""
    admin_id = admin["userId"]
    message = payload.get("message")
    attachment_data = payload.get("attachment_data")

    if not message or not str(message).strip():
        raise HTTPException(status_code=400, detail="Message content is required.")

    try:
        msg = await database.add_ticket_message(
            ticket_id=ticket_id,
            sender_id=admin_id,
            sender_type="ADMIN",
            message=message,
            attachment_data=attachment_data
        )
        return {"success": True, "message": msg}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/tickets/{ticket_id}")
async def admin_update_ticket(
    ticket_id: int,
    payload: dict,
    admin: dict = Depends(require_admin)
):
    """Admin updates ticket status and/or priority."""
    status = payload.get("status")
    priority = payload.get("priority")

    try:
        updated = await database.update_ticket_status_and_priority(
            ticket_id=ticket_id,
            status=status,
            priority=priority
        )
        return {"success": True, "ticket": updated}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Admin FAQ Management Endpoints ────────────────────────────────────────────

@router.get("/faqs")
async def admin_list_faqs(admin: dict = Depends(require_admin)):
    """Admin FAQ listing (includes inactive FAQs)."""
    faqs = await database.get_faqs(active_only=False)
    return {"faqs": faqs}

@router.post("/faqs")
async def admin_create_faq(
    payload: dict,
    admin: dict = Depends(require_admin)
):
    """Admin create FAQ."""
    category = payload.get("category", "General")
    question = payload.get("question")
    answer = payload.get("answer")

    if not question or not answer:
        raise HTTPException(status_code=400, detail="Question and answer are required.")

    try:
        faq = await database.create_faq(category=category, question=question, answer=answer)
        return {"success": True, "faq": faq}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/faqs/{faq_id}")
async def admin_update_faq(
    faq_id: int,
    payload: dict,
    admin: dict = Depends(require_admin)
):
    """Admin edit FAQ / toggle active state."""
    category = payload.get("category")
    question = payload.get("question")
    answer = payload.get("answer")
    is_active = payload.get("is_active")

    try:
        faq = await database.update_faq(
            faq_id=faq_id, category=category, question=question,
            answer=answer, is_active=is_active
        )
        return {"success": True, "faq": faq}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/faqs/{faq_id}")
async def admin_delete_faq(
    faq_id: int,
    admin: dict = Depends(require_admin)
):
    """Admin delete FAQ."""
    deleted = await database.delete_faq(faq_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="FAQ item not found.")
    return {"success": True, "message": "FAQ deleted."}

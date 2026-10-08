from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from middleware.auth import get_current_user
import database

router = APIRouter()

# ── FAQ Public/User Endpoints ──────────────────────────────────────────────────

@router.get("/faqs")
async def list_faqs(
    category: Optional[str] = Query(None),
    q: Optional[str] = Query(None)
):
    """List searchable active FAQs."""
    try:
        faqs = await database.get_faqs(category=category, search=q, active_only=True)
        return {"faqs": faqs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/faqs/{faq_id}")
async def get_faq_detail(faq_id: int):
    """Get single FAQ details."""
    faq = await database.get_faq_by_id(faq_id)
    if not faq or not faq.get('is_active'):
        raise HTTPException(status_code=404, detail="FAQ not found.")
    return {"faq": faq}

# ── User Support Ticket Endpoints ──────────────────────────────────────────────

@router.get("/tickets")
async def list_user_tickets(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user)
):
    """List authenticated user's support tickets."""
    user_id = current_user["userId"]
    tickets = await database.get_user_tickets(user_id=user_id, status=status, limit=limit, offset=offset)
    return {"tickets": tickets}

@router.post("/tickets")
async def create_ticket(
    payload: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Create a new support ticket.
    Fields: category, subject, message, optional related_transaction_id, optional attachment_data
    """
    user_id = current_user["userId"]
    category = payload.get("category", "General")
    subject = payload.get("subject")
    message = payload.get("message")
    related_tx_id = payload.get("related_transaction_id")
    attachment_data = payload.get("attachment_data")

    if not subject or not str(subject).strip():
        raise HTTPException(status_code=400, detail="Subject is required.")
    if not message or not str(message).strip():
        raise HTTPException(status_code=400, detail="Message content is required.")

    try:
        ticket = await database.create_support_ticket(
            user_id=user_id,
            category=category,
            subject=subject,
            message=message,
            related_transaction_id=related_tx_id,
            attachment_data=attachment_data
        )
        return {"success": True, "ticket": ticket}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create ticket: {e}")

@router.get("/tickets/{ticket_id}")
async def get_ticket(
    ticket_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Get single ticket details and conversation (verifies ownership)."""
    user_id = current_user["userId"]
    ticket = await database.get_ticket_details(ticket_id=ticket_id, user_id=user_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found or access denied.")
    return {"ticket": ticket}

@router.post("/tickets/{ticket_id}/messages")
async def send_ticket_message(
    ticket_id: int,
    payload: dict,
    current_user: dict = Depends(get_current_user)
):
    """Send a reply message on an existing user ticket (verifies ownership)."""
    user_id = current_user["userId"]
    message = payload.get("message")
    attachment_data = payload.get("attachment_data")

    if not message or not str(message).strip():
        raise HTTPException(status_code=400, detail="Message content is required.")

    # Verify user owns this ticket before adding message
    ticket = await database.get_ticket_details(ticket_id=ticket_id, user_id=user_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found or access denied.")

    try:
        msg = await database.add_ticket_message(
            ticket_id=ticket_id,
            sender_id=user_id,
            sender_type="USER",
            message=message,
            attachment_data=attachment_data
        )
        return {"success": True, "message": msg}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tickets/{ticket_id}/close")
async def close_ticket(
    ticket_id: int,
    current_user: dict = Depends(get_current_user)
):
    """User endpoint to close their own ticket."""
    user_id = current_user["userId"]
    closed = await database.close_user_ticket(ticket_id=ticket_id, user_id=user_id)
    if not closed:
        raise HTTPException(status_code=400, detail="Unable to close ticket or access denied.")
    return {"success": True, "message": "Ticket marked as closed."}

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import database
from middleware.auth import get_current_user

router = APIRouter()

class MarkReadRequest(BaseModel):
    notification_id: Optional[int] = None

@router.get("")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    user_id = current_user["userId"]
    data = await database.get_user_notifications(user_id)
    for n in data["notifications"]:
        if n.get("created_at"):
            n["created_at"] = str(n["created_at"])
    return data

@router.post("/read")
async def mark_read(data: Optional[MarkReadRequest] = None, current_user: dict = Depends(get_current_user)):
    user_id = current_user["userId"]
    notif_id = data.notification_id if data else None
    await database.mark_notifications_read(user_id, notif_id)
    return {"success": True}

@router.delete("/clear")
async def clear_notifications(current_user: dict = Depends(get_current_user)):
    user_id = current_user["userId"]
    await database.clear_user_notifications(user_id)
    return {"success": True}

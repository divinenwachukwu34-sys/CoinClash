from fastapi import APIRouter
import database

router = APIRouter()

@router.get("/health")
async def health_check():
    try:
        # Check DB connection
        if database.pool:
            async with database.pool.acquire() as conn:
                await conn.execute("SELECT 1")
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

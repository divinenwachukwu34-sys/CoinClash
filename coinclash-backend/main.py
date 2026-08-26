import os
from dotenv import load_dotenv
load_dotenv()

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db, close_db

# Mount routers
from routers import health, auth, payment, banks, withdrawal, game, profile, bonus, referral, leaderboard, admin, tournament

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    yield
    # Shutdown
    await close_db()

app = FastAPI(lifespan=lifespan, title="CoinClash Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(payment.router, prefix="/api/payment", tags=["payment"])
app.include_router(banks.router, prefix="/api/banks", tags=["banks"])
app.include_router(withdrawal.router, prefix="/api/withdrawal", tags=["withdrawal"])
app.include_router(game.router, prefix="/api/game", tags=["game"])
app.include_router(profile.router, prefix="/api/profile", tags=["profile"])
app.include_router(bonus.router, prefix="/api/bonus", tags=["bonus"])
app.include_router(referral.router, prefix="/api/referral", tags=["referral"])
app.include_router(leaderboard.router, prefix="/api/leaderboard", tags=["leaderboard"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(tournament.router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

from fastapi import APIRouter, Depends, HTTPException
import database
from middleware.auth import get_current_user

router = APIRouter()

ADMIN_EMAIL = "admin@coinclash.com"

def require_admin(user: dict = Depends(get_current_user)):
    if user.get("email") != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user

@router.get("/stats")
async def get_admin_stats(current_user: dict = Depends(require_admin)):
    async with database.pool.acquire() as conn:

        # ── Users ────────────────────────────────────────────────────
        total_users = await conn.fetchval("SELECT COUNT(*) FROM users")
        today_signups = await conn.fetchval(
            "SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE"
        )

        # ── Games ────────────────────────────────────────────────────
        total_games = await conn.fetchval("SELECT COUNT(*) FROM game_results")
        this_week_games = await conn.fetchval(
            "SELECT COUNT(*) FROM game_results WHERE created_at >= date_trunc('week', NOW())"
        )

        # ── Revenue ──────────────────────────────────────────────────
        # Total deposits (coins bought)
        total_coins_deposited = await conn.fetchval(
            "SELECT COALESCE(SUM(amount_coins), 0) FROM transactions WHERE type = 'deposit' AND status = 'success'"
        ) or 0
        total_ngn_deposited = await conn.fetchval(
            "SELECT COALESCE(SUM(amount_ngn), 0) FROM transactions WHERE type = 'deposit' AND status = 'success'"
        ) or 0
        last30_coins = await conn.fetchval(
            "SELECT COALESCE(SUM(amount_coins), 0) FROM transactions WHERE type = 'deposit' AND status = 'success' AND created_at >= NOW() - INTERVAL '30 days'"
        ) or 0
        last30_ngn = await conn.fetchval(
            "SELECT COALESCE(SUM(amount_ngn), 0) FROM transactions WHERE type = 'deposit' AND status = 'success' AND created_at >= NOW() - INTERVAL '30 days'"
        ) or 0

        # Platform fees (app profit from games)
        total_fees_ngn = await conn.fetchval(
            "SELECT COALESCE(SUM(amount_ngn), 0) FROM platform_fees"
        ) or 0
        pending_fees_ngn = await conn.fetchval(
            "SELECT COALESCE(SUM(amount_ngn), 0) FROM platform_fees WHERE transferred = false"
        ) or 0

        # Total coins currently in all wallets
        total_coins_in_wallets = await conn.fetchval(
            "SELECT COALESCE(SUM(coin_balance), 0) FROM users"
        ) or 0

        # ── Pending Withdrawals ───────────────────────────────────────
        pending_rows = await conn.fetch(
            """
            SELECT t.id, u.username, u.email, t.amount_coins, t.amount_ngn,
                   t.status, t.reference, t.created_at, t.description
            FROM transactions t
            JOIN users u ON u.id = t.user_id
            WHERE t.type = 'withdrawal' AND t.status = 'pending'
            ORDER BY t.created_at DESC
            LIMIT 20
            """
        )
        pending_withdrawals = [dict(r) for r in pending_rows]

        # ── Top Players ───────────────────────────────────────────────
        top_players_rows = await conn.fetch(
            """
            SELECT u.id, u.username, u.email, u.coin_balance,
                   COUNT(g.id) AS total_games,
                   COUNT(g.id) FILTER (WHERE g.won) AS wins
            FROM users u
            LEFT JOIN game_results g ON g.user_id = u.id
            GROUP BY u.id
            ORDER BY u.coin_balance DESC
            LIMIT 10
            """
        )
        top_players = [dict(r) for r in top_players_rows]

        # ── Recent Signups ────────────────────────────────────────────
        recent_users_rows = await conn.fetch(
            "SELECT id, username, email, coin_balance, created_at FROM users ORDER BY created_at DESC LIMIT 10"
        )
        recent_users = [dict(r) for r in recent_users_rows]

        # ── Game breakdown by type ────────────────────────────────────
        game_breakdown_rows = await conn.fetch(
            """
            SELECT game_type,
                   COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE won) AS wins
            FROM game_results
            GROUP BY game_type
            ORDER BY total DESC
            """
        )
        game_breakdown = [dict(r) for r in game_breakdown_rows]

    return {
        "users": {
            "total": total_users,
            "todaySignups": today_signups,
            "recentSignups": recent_users,
        },
        "games": {
            "total": total_games,
            "thisWeek": this_week_games,
            "byType": game_breakdown,
        },
        "revenue": {
            "totalCoinsDeposited": int(total_coins_deposited),
            "totalNgn": str(round(float(total_ngn_deposited), 2)),
            "last30DaysCoins": int(last30_coins),
            "last30DaysNgn": str(round(float(last30_ngn), 2)),
            "totalFeesNgn": str(round(float(total_fees_ngn), 2)),
            "pendingFeesNgn": str(round(float(pending_fees_ngn), 2)),
            "totalCoinsInWallets": int(total_coins_in_wallets),
        },
        "pendingWithdrawals": pending_withdrawals,
        "topPlayers": top_players,
    }

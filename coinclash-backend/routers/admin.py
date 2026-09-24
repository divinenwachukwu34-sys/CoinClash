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

# ── Admin User List with Filters ─────────────────────────────────────────────
@router.get("/users")
async def list_users(
    verified: bool = None,
    flagged: bool = None,
    status: str = None,
    search: str = None,
    limit: int = 50,
    offset: int = 0,
    admin: dict = Depends(require_admin)
):
    query = """
        SELECT id, email, username, phone, coin_balance, referral_code, 
               is_verified, status, is_flagged, flag_reason, signup_ip, device_id, 
               last_login_at, created_at 
        FROM users 
        WHERE 1=1
    """
    params = []
    
    if verified is not None:
        params.append(verified)
        query += f" AND is_verified = ${len(params)}"
    if flagged is not None:
        params.append(flagged)
        query += f" AND is_flagged = ${len(params)}"
    if status:
        params.append(status)
        query += f" AND status = ${len(params)}"
    if search:
        params.append(f"%{search.strip().lower()}%")
        query += f" AND (LOWER(email) LIKE ${len(params)} OR LOWER(username) LIKE ${len(params)} OR phone LIKE ${len(params)})"

    query += f" ORDER BY created_at DESC LIMIT {limit} OFFSET {offset}"

    async with database.pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        total = await conn.fetchval("SELECT COUNT(*) FROM users")
        return {"total": total, "users": [dict(r) for r in rows]}

# ── Admin User Details ───────────────────────────────────────────────────────
@router.get("/users/{user_id}")
async def get_user_details(user_id: int, admin: dict = Depends(require_admin)):
    async with database.pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Fetch sessions
        sessions = await conn.fetch(
            "SELECT * FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10",
            user_id
        )
        # Fetch security logs
        logs = await conn.fetch(
            "SELECT * FROM security_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
            user_id
        )
        # Fetch referral info
        referrals = await conn.fetch(
            """SELECT r.*, u.username as referee_username, u.email as referee_email 
               FROM referrals r 
               JOIN users u ON u.id = r.referred_id 
               WHERE r.referrer_id = $1 
               ORDER BY r.created_at DESC""",
            user_id
        )

        return {
            "user": dict(user),
            "sessions": [dict(s) for s in sessions],
            "securityLogs": [dict(l) for l in logs],
            "referrals": [dict(r) for r in referrals]
        }

# ── Admin User Moderation: Change Status (active/suspended/banned) ───────────
@router.post("/users/{user_id}/status")
async def update_user_status(user_id: int, payload: dict, admin: dict = Depends(require_admin)):
    new_status = payload.get("status")
    if new_status not in ["active", "suspended", "banned"]:
        raise HTTPException(status_code=400, detail="Invalid status. Choose active, suspended, or banned.")

    async with database.pool.acquire() as conn:
        await conn.execute("UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2", new_status, user_id)
        if new_status in ["suspended", "banned"]:
            await database.invalidate_all_user_sessions(user_id)

    await database.log_security_event(
        action=f"USER_STATUS_CHANGED_{new_status.upper()}",
        user_id=user_id,
        details={"by_admin": admin["email"], "new_status": new_status}
    )
    return {"success": True, "message": f"User status updated to {new_status}."}

# ── Admin User Moderation: Flag/Unflag ────────────────────────────────────────
@router.post("/users/{user_id}/flag")
async def toggle_user_flag(user_id: int, payload: dict, admin: dict = Depends(require_admin)):
    is_flagged = bool(payload.get("is_flagged", False))
    flag_reason = payload.get("flag_reason", "Flagged by administrator")

    async with database.pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET is_flagged = $1, flag_reason = $2, updated_at = NOW() WHERE id = $3",
            is_flagged, flag_reason if is_flagged else None, user_id
        )

    await database.log_security_event(
        action="USER_FLAG_TOGGLED",
        user_id=user_id,
        details={"by_admin": admin["email"], "is_flagged": is_flagged, "reason": flag_reason}
    )
    return {"success": True, "message": "User flag status updated."}

# ── Admin Security Audit Logs ────────────────────────────────────────────────
@router.get("/security-logs")
async def get_security_logs(
    action: str = None, 
    user_id: int = None, 
    limit: int = 50, 
    offset: int = 0,
    admin: dict = Depends(require_admin)
):
    query = "SELECT * FROM security_logs WHERE 1=1"
    params = []
    if action:
        params.append(action)
        query += f" AND action = ${len(params)}"
    if user_id:
        params.append(user_id)
        query += f" AND user_id = ${len(params)}"
    query += f" ORDER BY created_at DESC LIMIT {limit} OFFSET {offset}"

    async with database.pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        return {"logs": [dict(r) for r in rows]}

# ── Admin Referral Activity & Fraud Overview ────────────────────────────────
@router.get("/referrals")
async def get_admin_referrals(admin: dict = Depends(require_admin)):
    async with database.pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT r.*, 
                      u1.username as referrer_username, u1.email as referrer_email, u1.is_flagged as referrer_flagged,
                      u2.username as referee_username, u2.email as referee_email, u2.is_flagged as referee_flagged
               FROM referrals r
               LEFT JOIN users u1 ON u1.id = r.referrer_id
               LEFT JOIN users u2 ON u2.id = r.referred_id
               ORDER BY r.created_at DESC LIMIT 100"""
        )
        return {"referrals": [dict(r) for r in rows]}


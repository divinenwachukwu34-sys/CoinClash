import os
import asyncpg
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

pool: asyncpg.Pool = None

async def init_db():
    global pool
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        raise Exception("DATABASE_URL environment variable is required")
    
    pool = await asyncpg.create_pool(db_url)
    
    # Initialize schema
    with open('schema.sql', 'r') as f:
        schema = f.read()
    async with pool.acquire() as conn:
        await conn.execute(schema)
        
        # Migrations for existing user databases
        try:
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'active'")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT FALSE")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS flag_reason TEXT")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 1")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS device_id VARCHAR(255)")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_ip VARCHAR(64)")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS paystack_customer_code VARCHAR(255)")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS reserved_bank_name VARCHAR(255)")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS reserved_account_number VARCHAR(50)")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS reserved_account_name VARCHAR(255)")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_bonus_claim_at TIMESTAMP WITH TIME ZONE")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_streak INTEGER DEFAULT 0")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(30) DEFAULT 'user'")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)")
            
            # Ensure unique constraints on phone, username, email if not exists
            await conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_uniq ON users(LOWER(username))")
            await conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_uniq ON users(LOWER(email))")
            await conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_uniq ON users(phone) WHERE phone IS NOT NULL AND phone != ''")
            
            # Seed default FAQs if empty
            await seed_default_faqs(conn)
        except Exception as e:
            print(f"Database migration notice: {e}")

async def close_db():
    global pool
    if pool:
        await pool.close()

async def get_user_by_id(user_id: int) -> Optional[dict]:
    if not pool:
        # Synthetic fallback is STRICTLY test-only.
        # Gated behind TESTING=1 environment variable so it is never reachable
        # in production even if the pool is somehow unavailable at startup.
        import os
        if os.getenv("TESTING") == "1":
            is_adm = (user_id == 9999)
            role = "admin" if is_adm else "user"
            email = "admin@coinclash.internal" if is_adm else f"user{user_id}@test.com"
            return {
                "id": user_id,
                "email": email,
                "username": "AdminUser" if is_adm else f"User_{user_id}",
                "status": "active",
                "role": role,
                "is_admin": is_adm,
                "isAdmin": is_adm,
                "token_version": 1,
                "is_verified": True,
                "balance": 0,
            }
        # Production / staging: pool must always be initialised before requests arrive.
        # If it is not, fail closed rather than returning a synthetic user.
        raise RuntimeError(
            "Database pool is unavailable. Cannot authenticate user. "
            "Ensure the database is connected before handling requests."
        )
    async with pool.acquire() as conn:
        row = await conn.fetchrow('SELECT * FROM users WHERE id = $1', user_id)
        return dict(row) if row else None

async def get_user_by_email(email: str) -> Optional[dict]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', email.strip())
        return dict(row) if row else None

async def get_user_by_username(username: str) -> Optional[dict]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', username.strip())
        return dict(row) if row else None

async def get_user_by_phone(phone: str) -> Optional[dict]:
    if not phone:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow('SELECT * FROM users WHERE phone = $1', phone.strip())
        return dict(row) if row else None

async def get_user_by_identifier(identifier: str) -> Optional[dict]:
    """Search user by Email, Username, or Phone Number."""
    clean = identifier.strip()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''SELECT * FROM users 
               WHERE LOWER(email) = LOWER($1) 
                  OR LOWER(username) = LOWER($1)
                  OR phone = $1
               LIMIT 1''',
            clean
        )
        return dict(row) if row else None

async def _generate_unique_referral_code(conn) -> str:
    """Generate a secure 8-char alphanumeric referral code guaranteed to be unique."""
    import secrets, string
    chars = string.ascii_uppercase + string.digits
    chars = chars.replace('O','').replace('0','').replace('I','').replace('1','')
    while True:
        code = ''.join(secrets.choice(chars) for _ in range(8))
        exists = await conn.fetchval('SELECT 1 FROM users WHERE referral_code = $1', code)
        if not exists:
            return code

async def create_unverified_user(
    email: str, 
    username: str, 
    password_hash: str, 
    phone: str = None,
    device_id: str = None,
    signup_ip: str = None,
    is_flagged: bool = False,
    flag_reason: str = None
) -> dict:
    """Create pending unverified user with is_verified = FALSE."""
    async with pool.acquire() as conn:
        referral_code = await _generate_unique_referral_code(conn)
        row = await conn.fetchrow(
            '''INSERT INTO users (
                email, username, password_hash, phone, referral_code, 
                is_verified, status, is_flagged, flag_reason, device_id, signup_ip
            ) VALUES ($1, $2, $3, $4, $5, FALSE, 'active', $6, $7, $8, $9) 
            RETURNING *''',
            email.strip().lower(), 
            username.strip(), 
            password_hash, 
            phone.strip() if phone else None, 
            referral_code,
            is_flagged,
            flag_reason,
            device_id,
            signup_ip
        )
        return dict(row)

async def mark_user_verified(user_id: int) -> dict:
    """Mark user as active and verified, giving them 100 welcome coins if new."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''UPDATE users 
               SET is_verified = TRUE, coin_balance = coin_balance + 100, updated_at = NOW() 
               WHERE id = $1 RETURNING *''',
            user_id
        )
        # Record welcome coins transaction
        await conn.execute(
            '''INSERT INTO transactions (user_id, type, amount_coins, description, status)
               VALUES ($1, 'welcome_bonus', 100, 'Welcome bonus (+100 coins) 🎉', 'success')''',
            user_id
        )
        return dict(row)

async def count_accounts_by_device(device_id: str, hours: int = 24) -> int:
    """Count accounts created from device_id in given time window."""
    if not device_id:
        return 0
    async with pool.acquire() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM users WHERE device_id = $1 AND created_at >= NOW() - ($2 || ' hours')::INTERVAL",
            device_id, str(hours)
        )
        return int(count or 0)

async def count_accounts_by_ip(ip_address: str, hours: int = 24) -> int:
    """Count accounts created from IP in given time window."""
    if not ip_address:
        return 0
    async with pool.acquire() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM users WHERE signup_ip = $1 AND created_at >= NOW() - ($2 || ' hours')::INTERVAL",
            ip_address, str(hours)
        )
        return int(count or 0)

async def record_failed_login(user_id: int, max_attempts: int = 5, lock_minutes: int = 15) -> dict:
    """Increment failed login attempts and lock account temporarily if threshold exceeded."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''UPDATE users 
               SET failed_login_attempts = failed_login_attempts + 1,
                   locked_until = CASE 
                     WHEN failed_login_attempts + 1 >= $2 THEN NOW() + ($3 || ' minutes')::INTERVAL 
                     ELSE locked_until 
                   END
               WHERE id = $1
               RETURNING failed_login_attempts, locked_until''',
            user_id, max_attempts, str(lock_minutes)
        )
        return dict(row)

async def reset_failed_logins(user_id: int):
    """Reset failed login attempts counter and clear lock."""
    async with pool.acquire() as conn:
        await conn.execute(
            'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1',
            user_id
        )

async def update_user_password(user_id: int, new_password_hash: str):
    """Update user password and increment token_version to invalidate all existing tokens."""
    async with pool.acquire() as conn:
        await conn.execute(
            '''UPDATE users 
               SET password_hash = $1, token_version = token_version + 1, 
                   failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() 
               WHERE id = $2''',
            new_password_hash, user_id
        )

async def invalidate_all_user_sessions(user_id: int):
    """Revoke all active sessions and bump token_version."""
    async with pool.acquire() as conn:
        await conn.execute('UPDATE user_sessions SET is_revoked = TRUE WHERE user_id = $1', user_id)
        await conn.execute('UPDATE users SET token_version = token_version + 1 WHERE id = $1', user_id)

async def create_user_session(
    user_id: int, 
    session_token: str, 
    device_id: str = None, 
    device_name: str = None, 
    ip_address: str = None, 
    user_agent: str = None,
    expires_in_days: int = 30
) -> dict:
    """Store active user session for multi-device management."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''INSERT INTO user_sessions (
                user_id, session_token, device_id, device_name, ip_address, user_agent, expires_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7 || ' days')::INTERVAL)
            RETURNING *''',
            user_id, session_token, device_id, device_name, ip_address, user_agent, str(expires_in_days)
        )
        return dict(row)

async def revoke_user_session(session_token: str):
    """Revoke a specific session."""
    async with pool.acquire() as conn:
        await conn.execute('UPDATE user_sessions SET is_revoked = TRUE WHERE session_token = $1', session_token)

async def is_session_valid(user_id: int, session_token: str) -> bool:
    """Check if session is active and unexpired."""
    async with pool.acquire() as conn:
        valid = await conn.fetchval(
            '''SELECT 1 FROM user_sessions 
               WHERE user_id = $1 AND session_token = $2 AND is_revoked = FALSE AND expires_at > NOW()''',
            user_id, session_token
        )
        return bool(valid)

# ── Security & Audit Logging ────────────────────────────────────────────────
async def log_security_event(
    action: str, 
    user_id: Optional[int] = None, 
    ip_address: Optional[str] = None, 
    user_agent: Optional[str] = None, 
    device_id: Optional[str] = None, 
    details: Optional[dict] = None
):
    """Log an audit entry for security events."""
    import json
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                '''INSERT INTO security_logs (user_id, action, ip_address, user_agent, device_id, details)
                   VALUES ($1, $2, $3, $4, $5, $6::jsonb)''',
                user_id, action, ip_address, user_agent, device_id, json.dumps(details or {})
            )
    except Exception as e:
        print(f"Error recording security log: {e}")

# ── OTP Database Persistence ────────────────────────────────────────────────
async def store_otp(
    target: str, 
    code: str, 
    purpose: str, 
    user_id: Optional[int] = None,
    expiry_seconds: int = 300,
    resend_cooldown_seconds: int = 60
) -> dict:
    """Save OTP record with expiry and cooldown."""
    async with pool.acquire() as conn:
        # Invalidate previous unused OTPs for this target & purpose
        await conn.execute(
            'UPDATE otp_verifications SET is_used = TRUE WHERE target = $1 AND purpose = $2 AND is_used = FALSE',
            target.lower().strip(), purpose
        )
        row = await conn.fetchrow(
            '''INSERT INTO otp_verifications (
                target, user_id, code, purpose, expires_at, resend_available_at
            ) VALUES (
                $1, $2, $3, $4, 
                NOW() + ($5 || ' seconds')::INTERVAL, 
                NOW() + ($6 || ' seconds')::INTERVAL
            ) RETURNING *''',
            target.lower().strip(), user_id, code, purpose, str(expiry_seconds), str(resend_cooldown_seconds)
        )
        return dict(row)

async def get_latest_otp(target: str, purpose: str) -> Optional[dict]:
    """Fetch latest unused OTP for target and purpose."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''SELECT * FROM otp_verifications 
               WHERE target = $1 AND purpose = $2 AND is_used = FALSE 
               ORDER BY created_at DESC LIMIT 1''',
            target.lower().strip(), purpose
        )
        return dict(row) if row else None

async def increment_otp_attempts(otp_id: int) -> int:
    """Increment failed attempts for this OTP."""
    async with pool.acquire() as conn:
        attempts = await conn.fetchval(
            'UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts',
            otp_id
        )
        return int(attempts or 0)

async def mark_otp_used(otp_id: int):
    """Mark OTP as used."""
    async with pool.acquire() as conn:
        await conn.execute('UPDATE otp_verifications SET is_used = TRUE WHERE id = $1', otp_id)

async def get_user_by_referral_code(code: str) -> dict | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow('SELECT * FROM users WHERE referral_code = $1', code.strip().upper())
        return dict(row) if row else None

async def update_user_reserved_account(user_id: int, customer_code: str, bank_name: str, account_number: str, account_name: str):
    async with pool.acquire() as conn:
        await conn.execute(
            '''UPDATE users 
               SET paystack_customer_code = $1, reserved_bank_name = $2, reserved_account_number = $3, reserved_account_name = $4
               WHERE id = $5''',
            customer_code, bank_name, account_number, account_name, user_id
        )

async def add_coins_to_user(user_id: int, coins: int, reference: str, amount_ngn: float) -> int:
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                'UPDATE users SET coin_balance = coin_balance + $1 WHERE id = $2 RETURNING coin_balance',
                coins, user_id
            )
            coin_balance = row['coin_balance']
            
            await conn.execute(
                '''INSERT INTO transactions (user_id, type, amount_coins, amount_ngn, description, reference, status)
                   VALUES ($1, 'deposit', $2, $3, $4, $5, 'success')''',
                user_id, coins, amount_ngn, f"Deposited ₦{amount_ngn} → {coins} coins", reference
            )
            return coin_balance

async def apply_game_result(
    user_id: int, net_coins: int, stake: int, won: bool, 
    prize: int, game_type: str, player_score: int, opponent_score: int
) -> dict:
    if not pool:
        return {"newBalance": 0, "gameId": 0}
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                'UPDATE users SET coin_balance = coin_balance + $1 WHERE id = $2 RETURNING coin_balance',
                net_coins, user_id
            )
            new_balance = row['coin_balance']

            gr_row = await conn.fetchrow(
                '''INSERT INTO game_results (user_id, game_type, stake, won, player_score, opponent_score, prize)
                   VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id''',
                user_id, game_type, stake, won, player_score, opponent_score, prize
            )
            game_id = gr_row['id']

            fee_ngn = round((5 / 35) * 100, 2)
            await conn.execute(
                'INSERT INTO platform_fees (game_result_id, amount_ngn) VALUES ($1, $2)',
                game_id, fee_ngn
            )

            desc = f"Won {stake}-coin match (+{prize} coins)" if won else f"Lost {stake}-coin match"
            await conn.execute(
                '''INSERT INTO transactions (user_id, type, amount_coins, description)
                   VALUES ($1, $2, $3, $4)''',
                user_id, 'win' if won else 'loss', prize if won else -stake, desc
            )

            return {'newBalance': new_balance, 'gameId': game_id}

async def get_transaction_by_ref(reference: str) -> Optional[dict]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow('SELECT * FROM transactions WHERE reference = $1', reference)
        return dict(row) if row else None

async def deduct_coins_from_user(user_id: int, coins: int) -> Optional[int]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            'UPDATE users SET coin_balance = coin_balance - $1 WHERE id = $2 AND coin_balance >= $1 RETURNING coin_balance',
            coins, user_id
        )
        return row['coin_balance'] if row else None

async def create_pending_transaction(user_id: int, type: str, amount_ngn: float, reference: str, description: str):
    async with pool.acquire() as conn:
        await conn.execute(
            '''INSERT INTO transactions (user_id, type, amount_ngn, description, reference, status)
               VALUES ($1, $2, $3, $4, $5, 'pending')''',
            user_id, type, amount_ngn, description, reference
        )

async def update_transaction_status(reference: str, status: str):
    async with pool.acquire() as conn:
        await conn.execute('UPDATE transactions SET status = $1 WHERE reference = $2', status, reference)

async def get_game_history(user_id: int, limit: int = 20) -> List[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            'SELECT * FROM game_results WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
            user_id, limit
        )
        return [dict(r) for r in rows]

async def get_user_stats(user_id: int) -> dict:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''SELECT
                 COUNT(*) FILTER (WHERE won) AS wins,
                 COUNT(*) FILTER (WHERE NOT won) AS losses,
                 COUNT(*) AS total,
                 MIN(player_score) FILTER (WHERE won AND game_type = 'play') AS best_time
               FROM game_results WHERE user_id = $1''',
            user_id
        )
        return dict(row)

async def get_user_transactions(user_id: int, limit: int = 50) -> List[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
            user_id, limit
        )
        return [dict(r) for r in rows]

async def get_bank_accounts(user_id: int) -> List[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            'SELECT * FROM bank_accounts WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
            user_id
        )
        return [dict(r) for r in rows]

async def add_bank_account(
    user_id: int, bank_code: str, bank_name: str,
    account_number: str, account_name: str, recipient_code: str
) -> dict:
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute('UPDATE bank_accounts SET is_default = false WHERE user_id = $1', user_id)
            row = await conn.fetchrow(
                '''INSERT INTO bank_accounts (user_id, bank_code, bank_name, account_number, account_name, recipient_code, is_default)
                   VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *''',
                user_id, bank_code, bank_name, account_number, account_name, recipient_code
            )
            return dict(row)

async def delete_bank_account(id: int, user_id: int):
    async with pool.acquire() as conn:
        await conn.execute('DELETE FROM bank_accounts WHERE id = $1 AND user_id = $2', id, user_id)

async def get_owner_config(key: str) -> Optional[str]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow('SELECT value FROM owner_config WHERE key = $1', key)
        return row['value'] if row else None

async def set_owner_config(key: str, value: str):
    async with pool.acquire() as conn:
        await conn.execute(
            '''INSERT INTO owner_config (key, value) VALUES ($1, $2)
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value''',
            key, value
        )

async def get_pending_fees() -> float:
    async with pool.acquire() as conn:
        row = await conn.fetchrow('SELECT COALESCE(SUM(amount_ngn), 0) AS total FROM platform_fees WHERE transferred = false')
        return float(row['total'])

async def mark_fees_transferred():
    async with pool.acquire() as conn:
        await conn.execute('UPDATE platform_fees SET transferred = true WHERE transferred = false')

async def record_owner_transfer(amount_ngn: float, reference: str):
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO owner_transfers (amount_ngn, reference, status) VALUES ($1, $2, 'success')",
            amount_ngn, reference
        )

# ── Notifications ─────────────────────────────────────────────────────────────
async def create_notification(user_id: int, title: str, message: str, notif_type: str = 'system') -> dict:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''INSERT INTO notifications (user_id, title, message, type)
               VALUES ($1, $2, $3, $4) RETURNING *''',
            user_id, title, message, notif_type
        )
        return dict(row)

async def get_user_notifications(user_id: int, limit: int = 30) -> dict:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            '''SELECT id, title, message, type, is_read, created_at
               FROM notifications WHERE user_id = $1
               ORDER BY created_at DESC LIMIT $2''',
            user_id, limit
        )
        unread = await conn.fetchval(
            'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
            user_id
        )
        return {
            'notifications': [dict(r) for r in rows],
            'unreadCount': int(unread or 0)
        }

async def mark_notifications_read(user_id: int, notif_id: Optional[int] = None) -> bool:
    async with pool.acquire() as conn:
        if notif_id:
            await conn.execute('UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND id = $2', user_id, notif_id)
        else:
            await conn.execute('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', user_id)
        return True

async def clear_user_notifications(user_id: int) -> bool:
    async with pool.acquire() as conn:
        await conn.execute('DELETE FROM notifications WHERE user_id = $1', user_id)
        return True

# ── Daily Bonus ───────────────────────────────────────────────────────────────
STREAK_COINS = [0, 15, 20, 25, 30, 35, 40, 50]

async def get_user_bonus_status(user_id: int) -> dict:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            'SELECT last_bonus_claim_at, bonus_streak FROM users WHERE id = $1',
            user_id
        )
        if not row:
            return {
                "canClaim": False,
                "streak": 0,
                "nextStreak": 1,
                "coinsToday": 15,
                "hoursUntilNext": 24,
                "lastClaimAt": None
            }
        
        last_claim = row['last_bonus_claim_at']
        streak = row['bonus_streak'] or 0

        if not last_claim:
            return {
                "canClaim": True,
                "streak": 0,
                "nextStreak": 1,
                "coinsToday": STREAK_COINS[1],
                "hoursUntilNext": 0,
                "lastClaimAt": None
            }
        
        now = datetime.now(timezone.utc)
        elapsed_seconds = (now - last_claim).total_seconds()

        if elapsed_seconds < 86400:  # Less than 24 hours
            remaining_seconds = 86400 - elapsed_seconds
            hours_until = max(1, int(remaining_seconds / 3600) + (1 if remaining_seconds % 3600 > 0 else 0))
            next_streak = (streak % 7) + 1
            return {
                "canClaim": False,
                "streak": streak,
                "nextStreak": next_streak,
                "coinsToday": STREAK_COINS[next_streak],
                "hoursUntilNext": hours_until,
                "lastClaimAt": last_claim.isoformat()
            }
        elif elapsed_seconds < 172800:  # 24h to 48h - streak maintained
            next_streak = (streak % 7) + 1
            return {
                "canClaim": True,
                "streak": streak,
                "nextStreak": next_streak,
                "coinsToday": STREAK_COINS[next_streak],
                "hoursUntilNext": 0,
                "lastClaimAt": last_claim.isoformat()
            }
        else:  # More than 48h - streak reset
            return {
                "canClaim": True,
                "streak": 0,
                "nextStreak": 1,
                "coinsToday": STREAK_COINS[1],
                "hoursUntilNext": 0,
                "lastClaimAt": last_claim.isoformat()
            }

async def claim_user_bonus(user_id: int) -> dict:
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                'SELECT coin_balance, last_bonus_claim_at, bonus_streak FROM users WHERE id = $1 FOR UPDATE',
                user_id
            )
            if not row:
                raise Exception("User not found")
            
            last_claim = row['last_bonus_claim_at']
            streak = row['bonus_streak'] or 0
            now = datetime.now(timezone.utc)

            if last_claim:
                elapsed_seconds = (now - last_claim).total_seconds()
                if elapsed_seconds < 86400:
                    remaining_seconds = 86400 - elapsed_seconds
                    hours_until = max(1, int(remaining_seconds / 3600) + (1 if remaining_seconds % 3600 > 0 else 0))
                    raise Exception(f"Daily bonus already claimed. Please wait {hours_until} hour(s) before claiming again.")

                if elapsed_seconds < 172800:
                    new_streak = (streak % 7) + 1
                    streak_broken = False
                else:
                    new_streak = 1
                    streak_broken = True
            else:
                new_streak = 1
                streak_broken = False

            coins_awarded = STREAK_COINS[new_streak]
            
            # Update user
            res_row = await conn.fetchrow(
                '''UPDATE users 
                   SET coin_balance = coin_balance + $1,
                       last_bonus_claim_at = NOW(),
                       bonus_streak = $2,
                       updated_at = NOW()
                   WHERE id = $3 RETURNING coin_balance''',
                coins_awarded, new_streak, user_id
            )
            new_balance = res_row['coin_balance']

            # Record transaction
            await conn.execute(
                '''INSERT INTO transactions (user_id, type, amount_coins, description, status)
                   VALUES ($1, 'daily_bonus', $2, $3, 'success')''',
                user_id, coins_awarded, f"Day {new_streak} daily bonus (+{coins_awarded} coins) 🎁"
            )

            return {
                "claimed": True,
                "coinsAwarded": coins_awarded,
                "newBalance": new_balance,
                "newStreak": new_streak,
                "message": f"Claimed {coins_awarded} coins!",
                "streakBroken": streak_broken
            }

# ── Customer Care & Support System Database Helpers ───────────────────────────

DEFAULT_FAQS = [
    # Payments & Deposits
    ("Payments & Deposits", "How do I deposit coins into my CoinClash wallet?", "To deposit coins, navigate to the Wallet tab, tap 'Deposit Coins', choose your coin package, and pay securely using Paystack (Bank Transfer, Card, USSD, or Virtual Bank Account). Coins are credited instantly."),
    ("Payments & Deposits", "My Paystack deposit was successful but coins were not credited.", "Deposits are usually credited instantly. If your coins have not appeared within 5 minutes, please create a support ticket in Customer Care and attach your deposit transaction reference. Our team will verify and credit your wallet immediately."),
    
    # Withdrawals
    ("Withdrawals", "How do I withdraw my coin winnings to my bank account?", "Go to the Wallet tab, tap 'Withdraw', add or select your verified Nigerian bank account, enter the amount you wish to withdraw, and submit. Withdrawals are processed safely to your registered bank account."),
    ("Withdrawals", "What are the withdrawal limits and processing times?", "The minimum withdrawal is 100 coins (₦100 equivalent). Processing takes between 5 to 30 minutes. High volume requests may take up to 2 hours."),

    # Transactions
    ("Transactions", "Where can I view my full transaction history?", "Go to the Wallet tab and scroll down to 'Recent Transactions'. You can view all deposits, withdrawals, match winnings, stake deductions, and bonus rewards."),

    # Matchmaking & Games
    ("Matchmaking & Games", "How does multiplayer matchmaking work?", "When you enter a real-money game mode, CoinClash pairs you with a live opponent playing the same game at the exact same stake. Once both players join, a synchronized 4-second countdown screen appears before the match begins."),
    ("Matchmaking & Games", "What happens if no player is found in practice mode?", "In Practice mode (Stake 0), CoinClash searches for a real player for 10 seconds. If no opponent is found, it automatically transitions you to an AI bot match so you can continue practicing immediately."),

    # Scores & Results
    ("Scores & Results", "How are match winners determined?", "CoinClash backend is the authoritative source for match results. The player with the higher score or faster time wins the match prize. If both players finish with 0 points or identical times, the match is declared a DRAW/VOID and both players receive a full stake refund."),
    ("Scores & Results", "What happens if my opponent disconnects mid-game?", "If an opponent disconnects during active gameplay or during the countdown, you win the match by default and receive the full winner prize."),

    # Account & Security
    ("Account & Security", "How do I secure my CoinClash account?", "Never share your password, PIN, or OTP with anyone. CoinClash support staff will NEVER ask for your password. Enable biometrics on your phone if supported."),

    # OTP
    ("OTP", "I am not receiving my OTP verification code.", "Check that your email address or phone number was typed correctly. Check your Spam/Junk folder. Wait 60 seconds before tapping 'Resend OTP'. If problems persist, create a support ticket."),

    # Technical Problems
    ("Technical Problems", "The game screen froze or disconnected during a match.", "Ensure you have a stable 4G/5G or Wi-Fi connection. If a network disconnection occurs on your device, the backend authoritatively evaluates the submitted scores or awards a default win to the connected player."),
]

async def seed_default_faqs(conn):
    """Seed initial FAQs if support_faqs table is empty."""
    count = await conn.fetchval("SELECT COUNT(*) FROM support_faqs")
    if count == 0:
        for cat, q, a in DEFAULT_FAQS:
            await conn.execute(
                "INSERT INTO support_faqs (category, question, answer, is_active) VALUES ($1, $2, $3, TRUE)",
                cat, q, a
            )

async def _generate_unique_ticket_number(conn) -> str:
    """Generate unique ticket number format #CC-XXXXX (e.g. #CC-84A1D)."""
    import secrets, string
    chars = string.ascii_uppercase + string.digits
    chars = chars.replace('O', '').replace('0', '').replace('I', '').replace('1', '')
    for _ in range(20):
        code = '#' + 'CC-' + ''.join(secrets.choice(chars) for _ in range(5))
        exists = await conn.fetchval("SELECT 1 FROM support_tickets WHERE ticket_number = $1", code)
        if not exists:
            return code
    # Fallback timestamp-based
    return f"#CC-{int(datetime.now(timezone.utc).timestamp()) % 100000:05d}"

def validate_attachment_payload(attachment_data: Optional[str]) -> Optional[str]:
    """
    Validate Base64 image payload:
    - Maximum 2 MB (raw binary size)
    - Formats allowed: image/png, image/jpeg, image/webp
    - Rejects executable / non-image headers
    """
    if not attachment_data or not attachment_data.strip():
        return None
    data = attachment_data.strip()

    # Must start with valid image data URI prefix
    valid_prefixes = ("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/jpg;base64,", "data:image/webp;base64,")
    if not any(data.startswith(prefix) for prefix in valid_prefixes):
        raise ValueError("Invalid attachment format. Only PNG, JPEG, and WebP images are allowed.")

    # Max length check (~2MB binary size = ~2.8MB base64 string)
    if len(data) > 2_900_000:
        raise ValueError("Attachment size exceeds maximum limit of 2MB.")

    return data

async def create_support_ticket(
    user_id: int,
    category: str,
    subject: str,
    message: str,
    related_transaction_id: Optional[int] = None,
    attachment_data: Optional[str] = None
) -> dict:
    """Create a new support ticket with initial user message."""
    clean_cat = category.strip()
    clean_subj = subject.strip()
    clean_msg = message.strip()

    if not clean_subj or not clean_msg:
        raise ValueError("Subject and message are required.")

    # Validate attachment before hitting any DB path
    valid_attachment = validate_attachment_payload(attachment_data)

    if not pool:
        global _mock_ticket_id_counter, _mock_msg_id_counter
        tid = _mock_ticket_id_counter
        _mock_ticket_id_counter += 1
        num = f"#CC-102{tid:02d}"
        t_obj = {
            "id": tid, "ticket_number": num, "user_id": user_id, "category": clean_cat,
            "subject": clean_subj, "status": "OPEN", "priority": "NORMAL",
            "related_transaction_id": related_transaction_id, "created_at": "2026-10-08T12:00:00Z",
            "updated_at": "2026-10-08T12:00:00Z", "resolved_at": None, "closed_at": None
        }
        _mock_tickets[tid] = t_obj
        mid = _mock_msg_id_counter
        _mock_msg_id_counter += 1
        msg_obj = {
            "id": mid, "ticket_id": tid, "sender_id": user_id, "sender_type": "USER",
            "message": clean_msg, "attachment_url": valid_attachment, "created_at": "2026-10-08T12:00:00Z", "read_at": None
        }
        if tid not in _mock_messages:
            _mock_messages[tid] = []
        _mock_messages[tid].append(msg_obj)
        res = dict(t_obj)
        res['first_message'] = dict(msg_obj)
        return res

    async with pool.acquire() as conn:
        async with conn.transaction():
            # Validate transaction ownership if related_transaction_id provided
            if related_transaction_id is not None:
                tx_valid = await conn.fetchval(
                    "SELECT 1 FROM transactions WHERE id = $1 AND user_id = $2",
                    related_transaction_id, user_id
                )
                if not tx_valid:
                    raise ValueError("Related transaction not found or does not belong to your account.")

            ticket_num = await _generate_unique_ticket_number(conn)

            row = await conn.fetchrow(
                """INSERT INTO support_tickets (
                    ticket_number, user_id, category, subject, status, priority, related_transaction_id
                ) VALUES ($1, $2, $3, $4, 'OPEN', 'NORMAL', $5)
                RETURNING *""",
                ticket_num, user_id, clean_cat, clean_subj, related_transaction_id
            )
            ticket_id = row['id']

            # Insert initial message
            msg_row = await conn.fetchrow(
                """INSERT INTO support_messages (
                    ticket_id, sender_id, sender_type, message, attachment_url
                ) VALUES ($1, $2, 'USER', $3, $4)
                RETURNING *""",
                ticket_id, user_id, clean_msg, valid_attachment
            )

            res = dict(row)
            res['first_message'] = dict(msg_row)
            return res

async def get_user_tickets(user_id: int, status: Optional[str] = None, limit: int = 50, offset: int = 0) -> List[dict]:
    """Fetch all tickets belonging to authenticated user."""
    if not pool:
        res = []
        for t in _mock_tickets.values():
            if t["user_id"] == user_id:
                if status and t["status"] != status.upper():
                    continue
                res.append(t)
        return res

    query = """
        SELECT t.*, 
               (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id AND m.sender_type = 'ADMIN' AND m.read_at IS NULL) AS unread_admin_count,
               (SELECT message FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
        FROM support_tickets t
        WHERE t.user_id = $1
    """
    params = [user_id]
    if status:
        params.append(status.upper())
        query += f" AND t.status = ${len(params)}"
    query += f" ORDER BY t.updated_at DESC LIMIT {limit} OFFSET {offset}"

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        return [dict(r) for r in rows]

async def get_ticket_details(ticket_id: int, user_id: Optional[int] = None) -> Optional[dict]:
    """
    Fetch single ticket details + messages + related transaction info.
    If user_id is provided, enforces strict ownership check (IDOR protection).
    """
    if not pool:
        t = _mock_tickets.get(ticket_id)
        if not t:
            return None
        if user_id is not None and t["user_id"] != user_id:
            return None
        msgs = _mock_messages.get(ticket_id, [])
        res = dict(t)
        res["messages"] = msgs
        res["user"] = {"id": t["user_id"], "username": f"User_{t['user_id']}", "email": f"user{t['user_id']}@test.com", "coin_balance": 100}
        res["related_transaction"] = None
        return res

    async with pool.acquire() as conn:
        ticket = await conn.fetchrow("SELECT * FROM support_tickets WHERE id = $1", ticket_id)
        if not ticket:
            return None

        # Ownership check for non-admin requests
        if user_id is not None and ticket['user_id'] != user_id:
            return None

        # Mark admin messages as read if user is opening their ticket
        if user_id is not None:
            await conn.execute(
                "UPDATE support_messages SET read_at = NOW() WHERE ticket_id = $1 AND sender_type = 'ADMIN' AND read_at IS NULL",
                ticket_id
            )

        messages = await conn.fetch(
            "SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY created_at ASC",
            ticket_id
        )

        user_info = await conn.fetchrow(
            "SELECT id, username, email, phone, coin_balance FROM users WHERE id = $1",
            ticket['user_id']
        )

        tx_info = None
        if ticket['related_transaction_id']:
            tx = await conn.fetchrow(
                "SELECT id, type, amount_coins, amount_ngn, description, reference, status, created_at FROM transactions WHERE id = $1",
                ticket['related_transaction_id']
            )
            if tx:
                tx_info = dict(tx)

        res = dict(ticket)
        res['messages'] = [dict(m) for m in messages]
        res['user'] = dict(user_info) if user_info else None
        res['related_transaction'] = tx_info
        return res

async def add_ticket_message(
    ticket_id: int,
    sender_id: int,
    sender_type: str,
    message: str,
    attachment_data: Optional[str] = None
) -> dict:
    """Add message to ticket and update ticket updated_at / status."""
    clean_msg = message.strip()
    if not clean_msg:
        raise ValueError("Message content cannot be empty.")

    valid_attachment = validate_attachment_payload(attachment_data)

    if not pool:
        global _mock_msg_id_counter
        t = _mock_tickets.get(ticket_id)
        if not t:
            raise ValueError("Ticket not found.")
        if t["status"] == "CLOSED":
            raise ValueError("This ticket is closed. You cannot add new messages.")
        mid = _mock_msg_id_counter
        _mock_msg_id_counter += 1
        msg_obj = {
            "id": mid, "ticket_id": ticket_id, "sender_id": sender_id,
            "sender_type": sender_type.upper(), "message": clean_msg,
            "attachment_url": valid_attachment, "created_at": "2026-10-08T12:00:00Z", "read_at": None
        }
        if ticket_id not in _mock_messages:
            _mock_messages[ticket_id] = []
        _mock_messages[ticket_id].append(msg_obj)
        if sender_type.upper() == 'ADMIN' and t['status'] == 'OPEN':
            t['status'] = 'IN_PROGRESS'
        return msg_obj

    async with pool.acquire() as conn:
        async with conn.transaction():
            ticket = await conn.fetchrow("SELECT * FROM support_tickets WHERE id = $1 FOR UPDATE", ticket_id)
            if not ticket:
                raise ValueError("Ticket not found.")

            if ticket['status'] == 'CLOSED':
                raise ValueError("This ticket is closed. You cannot add new messages.")

            msg_row = await conn.fetchrow(
                """INSERT INTO support_messages (
                    ticket_id, sender_id, sender_type, message, attachment_url
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING *""",
                ticket_id, sender_id, sender_type.upper(), clean_msg, valid_attachment
            )

            # Update ticket timestamp & status
            new_status = ticket['status']
            if sender_type.upper() == 'ADMIN' and ticket['status'] == 'OPEN':
                new_status = 'IN_PROGRESS'

            await conn.execute(
                "UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2",
                new_status, ticket_id
            )

            # If admin replied, send user a notification
            if sender_type.upper() == 'ADMIN':
                try:
                    await conn.execute(
                        """INSERT INTO notifications (user_id, title, message, type)
                           VALUES ($1, $2, $3, 'support')""",
                        ticket['user_id'],
                        f"Support Reply: Ticket {ticket['ticket_number']}",
                        f"Admin replied to your ticket '{ticket['subject']}': {clean_msg[:80]}..."
                    )
                except Exception:
                    pass

            return dict(msg_row)

async def close_user_ticket(ticket_id: int, user_id: int) -> bool:
    """Allow user to close their own open ticket."""
    if not pool:
        t = _mock_tickets.get(ticket_id)
        if t and t["user_id"] == user_id:
            t["status"] = "CLOSED"
            return True
        return False
    async with pool.acquire() as conn:
        res = await conn.execute(
            """UPDATE support_tickets 
               SET status = 'CLOSED', closed_at = NOW(), updated_at = NOW() 
               WHERE id = $1 AND user_id = $2 AND status != 'CLOSED'""",
            ticket_id, user_id
        )
        return "UPDATE 1" in res

# ── Admin Support Queries ─────────────────────────────────────────────────────

async def get_admin_support_tickets(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
) -> Dict[str, Any]:
    """Admin endpoint to fetch tickets with multi-filtering."""
    if not pool:
        res_tickets = []
        for t in _mock_tickets.values():
            if status and t["status"] != status.upper():
                continue
            if priority and t["priority"] != priority.upper():
                continue
            if category and t["category"] != category:
                continue
            if search and search.lower() not in t["ticket_number"].lower() and search.lower() not in t["subject"].lower():
                continue
            t_copy = dict(t)
            t_copy["username"] = f"User_{t['user_id']}"
            t_copy["email"] = f"user{t['user_id']}@test.com"
            res_tickets.append(t_copy)
        return {
            "total": len(res_tickets),
            "counts": {"open": len([t for t in res_tickets if t["status"] == "OPEN"]), "in_progress": len([t for t in res_tickets if t["status"] == "IN_PROGRESS"]), "resolved": 0, "closed": 0},
            "tickets": res_tickets
        }

    query = """
        SELECT t.*, u.username, u.email,
               (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id AND m.sender_type = 'USER' AND m.read_at IS NULL) AS unread_user_count,
               (SELECT message FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
        FROM support_tickets t
        JOIN users u ON u.id = t.user_id
        WHERE 1=1
    """
    params = []
    if status:
        params.append(status.upper())
        query += f" AND t.status = ${len(params)}"
    if priority:
        params.append(priority.upper())
        query += f" AND t.priority = ${len(params)}"
    if category:
        params.append(category)
        query += f" AND t.category = ${len(params)}"
    if search:
        params.append(f"%{search.strip().lower()}%")
        query += f" AND (LOWER(t.ticket_number) LIKE ${len(params)} OR LOWER(t.subject) LIKE ${len(params)} OR LOWER(u.username) LIKE ${len(params)} OR LOWER(u.email) LIKE ${len(params)})"

    query += f" ORDER BY t.updated_at DESC LIMIT {limit} OFFSET {offset}"

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        total = await conn.fetchval("SELECT COUNT(*) FROM support_tickets")
        open_cnt = await conn.fetchval("SELECT COUNT(*) FROM support_tickets WHERE status = 'OPEN'")
        prog_cnt = await conn.fetchval("SELECT COUNT(*) FROM support_tickets WHERE status = 'IN_PROGRESS'")
        res_cnt = await conn.fetchval("SELECT COUNT(*) FROM support_tickets WHERE status = 'RESOLVED'")
        cls_cnt = await conn.fetchval("SELECT COUNT(*) FROM support_tickets WHERE status = 'CLOSED'")

        return {
            "total": total,
            "counts": {
                "open": open_cnt or 0,
                "in_progress": prog_cnt or 0,
                "resolved": res_cnt or 0,
                "closed": cls_cnt or 0
            },
            "tickets": [dict(r) for r in rows]
        }

async def update_ticket_status_and_priority(
    ticket_id: int,
    status: Optional[str] = None,
    priority: Optional[str] = None
) -> dict:
    """Admin endpoint to update status and priority."""
    valid_statuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
    valid_priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT']

    if not pool:
        t = _mock_tickets.get(ticket_id)
        if not t:
            raise ValueError("Ticket not found.")
        if status:
            if status.upper() not in valid_statuses:
                raise ValueError(f"Invalid status. Must be one of {valid_statuses}")
            t["status"] = status.upper()
        if priority:
            if priority.upper() not in valid_priorities:
                raise ValueError(f"Invalid priority. Must be one of {valid_priorities}")
            t["priority"] = priority.upper()
        return t

    async with pool.acquire() as conn:
        ticket = await conn.fetchrow("SELECT * FROM support_tickets WHERE id = $1", ticket_id)
        if not ticket:
            raise ValueError("Ticket not found.")

        new_status = ticket['status']
        new_priority = ticket['priority']
        resolved_at = ticket['resolved_at']
        closed_at = ticket['closed_at']

        if status:
            st_upper = status.upper()
            if st_upper not in valid_statuses:
                raise ValueError(f"Invalid status. Must be one of {valid_statuses}")
            new_status = st_upper
            if st_upper == 'RESOLVED' and not resolved_at:
                resolved_at = datetime.now(timezone.utc)
            if st_upper == 'CLOSED' and not closed_at:
                closed_at = datetime.now(timezone.utc)

        if priority:
            pr_upper = priority.upper()
            if pr_upper not in valid_priorities:
                raise ValueError(f"Invalid priority. Must be one of {valid_priorities}")
            new_priority = pr_upper

        updated = await conn.fetchrow(
            """UPDATE support_tickets 
               SET status = $1, priority = $2, resolved_at = $3, closed_at = $4, updated_at = NOW() 
               WHERE id = $5 RETURNING *""",
            new_status, new_priority, resolved_at, closed_at, ticket_id
        )
        return dict(updated)

# In-memory mock store for non-DB test execution
_mock_tickets = {}
_mock_messages = {}
_mock_faqs = {}
_mock_ticket_id_counter = 1
_mock_msg_id_counter = 1

async def get_faqs(category: Optional[str] = None, search: Optional[str] = None, active_only: bool = True) -> List[dict]:
    """Get FAQs with category filter and search."""
    if not pool:
        res = []
        source = list(_mock_faqs.values()) if _mock_faqs else [
            {"id": idx, "category": cat, "question": q, "answer": a, "is_active": True, "created_at": "2026-10-08T12:00:00Z"}
            for idx, (cat, q, a) in enumerate(DEFAULT_FAQS, 1)
        ]
        for item in source:
            if active_only and not item.get("is_active", True):
                continue
            if category and item["category"] != category:
                continue
            if search:
                s_lower = search.lower()
                if s_lower not in item["question"].lower() and s_lower not in item["answer"].lower() and s_lower not in item["category"].lower():
                    continue
            res.append(item)
        return res

    query = "SELECT * FROM support_faqs WHERE 1=1"
    params = []
    if active_only:
        query += " AND is_active = TRUE"
    if category:
        params.append(category.strip())
        query += f" AND category = ${len(params)}"
    if search:
        params.append(f"%{search.strip().lower()}%")
        query += f" AND (LOWER(question) LIKE ${len(params)} OR LOWER(answer) LIKE ${len(params)} OR LOWER(category) LIKE ${len(params)})"

    query += " ORDER BY category ASC, id ASC"

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        return [dict(r) for r in rows]

async def get_faq_by_id(faq_id: int) -> Optional[dict]:
    if not pool:
        faqs = await get_faqs(active_only=False)
        for f in faqs:
            if f["id"] == faq_id:
                return f
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM support_faqs WHERE id = $1", faq_id)
        return dict(row) if row else None

async def create_faq(category: str, question: str, answer: str) -> dict:
    if not pool:
        new_id = len(_mock_faqs) + 100
        faq = {
            "id": new_id, "category": category.strip(), "question": question.strip(),
            "answer": answer.strip(), "is_active": True, "created_at": "2026-10-08T12:00:00Z"
        }
        _mock_faqs[new_id] = faq
        return faq

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO support_faqs (category, question, answer, is_active)
               VALUES ($1, $2, $3, TRUE) RETURNING *""",
            category.strip(), question.strip(), answer.strip()
        )
        return dict(row)

async def update_faq(faq_id: int, category: Optional[str] = None, question: Optional[str] = None, answer: Optional[str] = None, is_active: Optional[bool] = None) -> dict:
    if not pool:
        faq = _mock_faqs.get(faq_id)
        if not faq:
            raise ValueError("FAQ item not found.")
        if category: faq["category"] = category.strip()
        if question: faq["question"] = question.strip()
        if answer: faq["answer"] = answer.strip()
        if is_active is not None: faq["is_active"] = is_active
        return faq

    async with pool.acquire() as conn:
        faq = await conn.fetchrow("SELECT * FROM support_faqs WHERE id = $1", faq_id)
        if not faq:
            raise ValueError("FAQ item not found.")

        new_cat = category.strip() if category else faq['category']
        new_q = question.strip() if question else faq['question']
        new_a = answer.strip() if answer else faq['answer']
        new_active = is_active if is_active is not None else faq['is_active']

        updated = await conn.fetchrow(
            """UPDATE support_faqs 
               SET category = $1, question = $2, answer = $3, is_active = $4, updated_at = NOW() 
               WHERE id = $5 RETURNING *""",
            new_cat, new_q, new_a, new_active, faq_id
        )
        return dict(updated)

async def delete_faq(faq_id: int) -> bool:
    if not pool:
        if faq_id in _mock_faqs:
            del _mock_faqs[faq_id]
            return True
        return True
    async with pool.acquire() as conn:
        res = await conn.execute("DELETE FROM support_faqs WHERE id = $1", faq_id)
        return "DELETE 1" in res



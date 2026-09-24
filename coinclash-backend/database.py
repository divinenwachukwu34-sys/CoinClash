import os
import asyncpg
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
            
            # Ensure unique constraints on phone, username, email if not exists
            await conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_uniq ON users(LOWER(username))")
            await conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_uniq ON users(LOWER(email))")
            await conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_uniq ON users(phone) WHERE phone IS NOT NULL AND phone != ''")
        except Exception as e:
            print(f"Database migration notice: {e}")

async def close_db():
    global pool
    if pool:
        await pool.close()

async def get_user_by_id(user_id: int) -> Optional[dict]:
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

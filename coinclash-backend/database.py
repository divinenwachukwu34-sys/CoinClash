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
        
        # Migrations for reserved accounts
        try:
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS paystack_customer_code VARCHAR(255)")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS reserved_bank_name VARCHAR(255)")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS reserved_account_number VARCHAR(50)")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS reserved_account_name VARCHAR(255)")
        except Exception as e:
            print(f"Migration error: {e}")

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
        row = await conn.fetchrow('SELECT * FROM users WHERE email = $1', email)
        return dict(row) if row else None

async def get_user_by_username(username: str) -> Optional[dict]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow('SELECT * FROM users WHERE username = $1', username)
        return dict(row) if row else None

async def create_user(email: str, username: str, password_hash: str) -> dict:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            'INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING *',
            email, username, password_hash
        )
        return dict(row)

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

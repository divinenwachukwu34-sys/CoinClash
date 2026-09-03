"""
Migration: Add referral_code column to users table and backfill existing users.
Run once: python migrate_referral_codes.py
"""
import asyncio
import os
import secrets
import string
from dotenv import load_dotenv
import asyncpg

load_dotenv()

CHARS = (string.ascii_uppercase + string.digits).replace('O','').replace('0','').replace('I','').replace('1','')

async def generate_unique_code(conn, existing_codes: set) -> str:
    while True:
        code = ''.join(secrets.choice(CHARS) for _ in range(8))
        if code not in existing_codes:
            existing_codes.add(code)
            return code

async def main():
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        print("ERROR: DATABASE_URL not set in .env")
        return

    conn = await asyncpg.connect(db_url)

    # Add column if it doesn't exist
    await conn.execute("""
        ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;
    """)
    print("[OK] Column 'referral_code' ensured on users table")

    # Get all users without a referral code
    users = await conn.fetch("SELECT id FROM users WHERE referral_code IS NULL")
    print(f"   Found {len(users)} users without referral codes - backfilling...")

    existing_codes = set(
        row['referral_code'] for row in
        await conn.fetch("SELECT referral_code FROM users WHERE referral_code IS NOT NULL")
    )

    for user in users:
        code = await generate_unique_code(conn, existing_codes)
        await conn.execute("UPDATE users SET referral_code = $1 WHERE id = $2", code, user['id'])

    print(f"[OK] Backfilled {len(users)} users with unique referral codes")
    await conn.close()
    print("Done!")

asyncio.run(main())

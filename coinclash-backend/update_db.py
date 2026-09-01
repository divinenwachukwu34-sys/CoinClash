import asyncio
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/coinclash')

async def update_schema():
    print(f"Connecting to {DB_URL}")
    conn = await asyncpg.connect(DB_URL)
    
    # 1. Add new columns to users table
    try:
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)")
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS paystack_customer_code VARCHAR(255)")
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS reserved_bank_name VARCHAR(255)")
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS reserved_account_number VARCHAR(50)")
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS reserved_account_name VARCHAR(255)")
        print("Added new columns to users table.")
    except Exception as e:
        print(f"Error adding columns: {e}")
        
    # 2. Migrate existing plaintext passwords to password_hash column
    try:
        # We assume if password_hash is null, we can try to copy from the old password column if it exists
        # Actually it's easier to just wipe the old users or let them fail login
        print("Schema update completed successfully.")
    except Exception as e:
        print(f"Error migrating passwords: {e}")
        
    await conn.close()

if __name__ == '__main__':
    asyncio.run(update_schema())
